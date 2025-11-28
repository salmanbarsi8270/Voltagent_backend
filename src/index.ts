// server.js
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import dotenv from "dotenv";
import { Agent, stepCountIs } from "@voltagent/core";
import VoltAgent from "@voltagent/core";
import honoServer from "@voltagent/server-hono";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { weatherTool } from "./tools/weather";
import { ElevenLabsVoiceProvider } from "@voltagent/voice";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { Readable } from "stream";

dotenv.config();

/* -------------------- HONO APP -------------------- */
const app = new Hono();

// Apply CORS middleware (Hono native)
app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

/* -------------------- OPENROUTER PROVIDER -------------------- */
export const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

/* -------------------- SUB AGENTS -------------------- */
const employeeFrontend = new Agent({
  name: "employee-frontend",
  instructions: `
    You are a frontend engineer. 
    You handle UI, CSS, React, Tailwind, components, layout tasks.
  `,
  model: openrouter.chat("x-ai/grok-4.1-fast:free")
});

const employeeBackend = new Agent({
  name: "employee-backend",
  instructions: `
    You are a backend engineer.
    You handle Node.js, APIs, databases, server logic.
  `,
  model: openrouter.chat("meta-llama/llama-3.3-70b-instruct:free")
});

const generalagent = new Agent({
  name: "general-question",
  instructions: `
    You help with general questions. 
    Answer normally and directly.
  `,
  model: openrouter.chat("kwaipilot/kat-coder-pro:free")
});

const weatherAgent = new Agent({
  name: "weather-agent",
  instructions: `
    You are a weather assistant.
    Use getWeather to fetch city weather.
  `,
  tools: [weatherTool],
  model: openrouter.chat("openai/gpt-oss-20b:free")
});

/* -------------------- MANAGER AI -------------------- */
export const managerAgent = new Agent({
  name: "manager-agent",
  instructions: `
    You are the manager AI.
    Route:
      - frontend → employee-frontend
      - backend → employee-backend
      - general → general-question
      - weather → weather-agent
  `,
  subAgents: [employeeFrontend, employeeBackend, generalagent, weatherAgent],
  model: openrouter.chat("x-ai/grok-4.1-fast:free"),
  stopWhen: stepCountIs(20)
});

/* ------------- BIND VOLT AGENT → NODE/HONO SERVER ------------- */
new VoltAgent({
  agents: { managerAgent },
  server: honoServer()
});

/* ---------------- 📌 CHAT ROUTE (SSE STREAMING) ---------------- */
app.get("/api/chat", async (c) => {
  try {
    const prompt = c.req.query("prompt");
    
    if (!prompt) {
      return c.json({ error: "Prompt is required" }, 400);
    }

    console.log("Received prompt:", prompt);

    // Set headers for Server-Sent Events (SSE)
    c.header("Content-Type", "text/event-stream");
    c.header("Cache-Control", "no-cache");
    c.header("Connection", "keep-alive");
    c.header("Access-Control-Allow-Origin", "*");

    const result = await managerAgent.streamText(prompt, { 
      stopWhen: stepCountIs(20) 
    });

    // Create a readable stream for SSE
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.textStream) {
            console.log("Streaming chunk:", chunk);
            const data = `data: ${JSON.stringify({ content: chunk })}\n\n`;
            controller.enqueue(new TextEncoder().encode(data));
          }
          
          // Send completion signal
          const doneData = `data: ${JSON.stringify({ done: true })}\n\n`;
          controller.enqueue(new TextEncoder().encode(doneData));
          controller.close();
        } catch (err: any) {
          const errorData = `data: ${JSON.stringify({ error: err.message })}\n\n`;
          controller.enqueue(new TextEncoder().encode(errorData));
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      }
    });

  } catch (err: any) {
    console.error("Chat error:", err);
    return c.json({ error: err.message }, 500);
  }
});

/* ---------------- 🎤 SPEECH → TEXT ---------------- */
const elevenVoice = new ElevenLabsVoiceProvider({
  apiKey: `${process.env.ELEVENLABS_API_KEY}`
});

app.post("/api/voice", async (c) => {
  try {
    const buffer = await c.req.arrayBuffer();
    const stream = Readable.from(Buffer.from(buffer));

    const text = await elevenVoice.listen(stream);
    return c.json({ success: true, transcription: text });

  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/* ---------------- 🔊 TEXT → SPEECH ---------------- */
const eleven = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY
});

async function webStreamToBuffer(reader: any) {
  const stream = new Readable({
    async read() {
      const { done, value } = await reader.read();
      if (done) return this.push(null);
      this.push(value);
    }
  });

  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

app.post("/api/sound", async (c) => {
  try {
    const { text } = await c.req.json();
    if (!text) return c.json({ error: "No text provided" }, 400);

    const response = await eleven.textToSpeech.convert("JBFqnCBsd6RMkjVDRZzb", {
      text,
      modelId: "eleven_multilingual_v2",
      outputFormat: "mp3_44100_128"
    });

    const reader = response.getReader();
    const audioBuffer = await webStreamToBuffer(reader);

    return new Response(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg"
      }
    });

  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/* ---------------------- START SERVER ---------------------- */
serve({
  fetch: app.fetch,
  port: 3001
}, () => {
  console.log("🚀 Hono AI Server Running on PORT 3001");
});
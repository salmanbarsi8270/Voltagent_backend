// server.js
import { VoltAgent, Agent, stepCountIs } from "@voltagent/core";
import { honoServer } from "@voltagent/server-hono"; // Fixed import
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { weatherTool } from "./tools/weather";
import { ElevenLabsVoiceProvider } from "@voltagent/voice";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { Readable } from "stream";
import dotenv from "dotenv";
 
dotenv.config();
 
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
 
/* ---------------- 🔊 TEXT → SPEECH SETUP ---------------- */
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
 
/* ---------------- 🎤 SPEECH → TEXT SETUP ---------------- */
const elevenVoice = new ElevenLabsVoiceProvider({
  apiKey: `sk_30b1313a431e4adee9513d521a5dcb1e19dd735f40c15325`
});
 
/* ------------- SINGLE HONO SERVER WITH ALL ROUTES ------------- */
const voltAgent = new VoltAgent({
  agents: { managerAgent },
  server: honoServer({
    port: 3001, // Use your preferred port
    configureApp: (app) => {
      /* ---------------- 📌 CHAT ROUTE (SSE STREAMING) ---------------- */
      app.get("/api/chat", async (c) => {
        const prompt = c.req.query("prompt");
        if (!prompt) {
          return c.json({ error: "Prompt is required" }, 400);
        }
 
        console.log("Received prompt:", prompt);
 
        // Create SSE stream
        const stream = new ReadableStream({
          async start(controller) {
            try {
              const result = await managerAgent.streamText(prompt, {
                stopWhen: stepCountIs(20)
              });
 
              for await (const chunk of result.textStream) {
                console.log("Streaming chunk:", chunk);
                controller.enqueue(`data: ${JSON.stringify({ content: chunk })}\n\n`);
              }
 
              controller.enqueue(`data: ${JSON.stringify({ done: true })}\n\n`);
              controller.close();
            } catch (err: any) {
              console.error("Chat error:", err);
              controller.enqueue(`data: ${JSON.stringify({ error: err.message })}\n\n`);
              controller.close();
            }
          }
        });
 
        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*"
          }
        });
      });
 
      /* ---------------- 🎤 SPEECH → TEXT ---------------- */
      app.post("/api/voice", async (c) => {
        try {
          const body = await c.req.arrayBuffer();
          console.log("body", body)
          const stream = Readable.from(Buffer.from(body));
          console.log("audio stream", stream)
          const text = await elevenVoice.listen(stream);
          console.log("text", text)
          return c.json({ success: true, transcription: text });
        } catch (err: any) {
          return c.json({ error: err.message }, 500);
        }
      });
 
      /* ---------------- 🔊 TEXT → SPEECH ---------------- */
      app.post("/api/sound", async (c) => {
        try {
          const { text } = await c.req.json();
          console.log("sound text", text)
          if (!text) return c.json({ error: "No text provided" }, 400);
 
          const response = await eleven.textToSpeech.convert("JBFqnCBsd6RMkjVDRZzb", {
            text,
            modelId: "eleven_multilingual_v2",
            outputFormat: "mp3_44100_128"
          });
          console.log("sound response", response)
 
          const reader = response.getReader();
          console.log("sound reader", reader)
          const audioBuffer = await webStreamToBuffer(reader);
          console.log("sound audioBuffer", audioBuffer)
 
          return new Response(audioBuffer, {
            headers: {
              "Content-Type": "audio/mpeg"
            }
          });
 
        } catch (err: any) {
          return c.json({ error: err.message }, 500);
        }
      });
 
      // Optional: Health check route
      app.get("/health", (c) => c.json({ status: "ok", server: "hono" }));
    }
  })
});
 
console.log("🚀 Single Hono Server Running on PORT 3001");
console.log("📚 Swagger UI available at http://localhost:3001/swagger");
console.log("🤖 Agent endpoints available at http://localhost:3001/agents");
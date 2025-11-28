// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Agent, stepCountIs } from "@voltagent/core";
import VoltAgent from "@voltagent/core";
import honoServer from "@voltagent/server-hono";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { weatherTool } from "./tools/weather";
import { ElevenLabsVoiceProvider } from "@voltagent/voice";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { Readable } from "stream";
import { serve } from "@hono/node-server";

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());

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
app.get("/api/chat", async (req, res) => {
  try {
    const prompt = req.query.prompt as string;
    
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    console.log("Received prompt:", prompt);

    // Set headers for Server-Sent Events (SSE)
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");

    const result = await managerAgent.streamText(prompt, { 
      stopWhen: stepCountIs(20) 
    });

    // Stream each chunk
    for await (const chunk of result.textStream) {
      console.log("Streaming chunk:", chunk);
      res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
    }

    // Send completion signal
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();

  } catch (err: any) {
    console.error("Chat error:", err);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

/* ---------------- 🎤 SPEECH → TEXT ---------------- */
const elevenVoice = new ElevenLabsVoiceProvider({
  apiKey: `${process.env.ELEVENLABS_API_KEY}`
});

app.post("/api/voice", async (req, res) => {
  try {
    const chunks: any[] = [];
    
    req.on('data', chunk => chunks.push(chunk));
    
    req.on('end', async () => {
      const buffer = Buffer.concat(chunks);
      const stream = Readable.from(buffer);

      const text = await elevenVoice.listen(stream);
      res.json({ success: true, transcription: text });
    });

  } catch (err: any) {
    res.status(500).json({ error: err.message });
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

app.post("/api/sound", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "No text provided" });

    const response = await eleven.textToSpeech.convert("JBFqnCBsd6RMkjVDRZzb", {
      text,
      modelId: "eleven_multilingual_v2",
      outputFormat: "mp3_44100_128"
    });

    const reader = response.getReader();
    const audioBuffer = await webStreamToBuffer(reader);

    res.setHeader("Content-Type", "audio/mpeg");
    res.send(audioBuffer);

  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ---------------------- START SERVER ---------------------- */
app.listen(3001, () => console.log("🚀 Node AI Server Running on PORT 3001"));

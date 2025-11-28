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

/* -------------------- ROOT & HEALTH ROUTES -------------------- */
app.get("/", (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>AI Chat Server</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
          }
          .container {
            max-width: 900px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            overflow: hidden;
          }
          .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px 30px;
            text-align: center;
          }
          .header h1 { font-size: 2.5em; margin-bottom: 10px; }
          .header p { font-size: 1.1em; opacity: 0.9; }
          .content { padding: 40px 30px; }
          .status {
            background: #d4edda;
            color: #155724;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 30px;
            text-align: center;
            font-weight: bold;
            font-size: 1.1em;
          }
          .endpoint {
            background: #f8f9fa;
            padding: 20px;
            margin: 15px 0;
            border-left: 4px solid #667eea;
            border-radius: 8px;
            transition: transform 0.2s, box-shadow 0.2s;
          }
          .endpoint:hover {
            transform: translateX(5px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
          }
          .method {
            display: inline-block;
            padding: 6px 12px;
            border-radius: 6px;
            font-weight: bold;
            margin-right: 10px;
            font-size: 0.9em;
          }
          .get { background: #61affe; color: white; }
          .post { background: #49cc90; color: white; }
          code {
            background: #e9ecef;
            padding: 4px 8px;
            border-radius: 4px;
            font-family: 'Courier New', monospace;
            font-size: 0.95em;
          }
          .endpoint p {
            margin: 10px 0 0 0;
            color: #666;
          }
          .endpoint a {
            display: inline-block;
            margin-top: 10px;
            color: #667eea;
            text-decoration: none;
            font-weight: 600;
            transition: color 0.2s;
          }
          .endpoint a:hover {
            color: #764ba2;
            text-decoration: underline;
          }
          .section-title {
            font-size: 1.5em;
            color: #333;
            margin: 30px 0 15px 0;
            padding-bottom: 10px;
            border-bottom: 2px solid #667eea;
          }
          .cta-button {
            display: block;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 15px 30px;
            text-align: center;
            text-decoration: none;
            border-radius: 8px;
            font-weight: bold;
            font-size: 1.1em;
            margin: 30px 0;
            transition: transform 0.2s;
          }
          .cta-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 25px rgba(102, 126, 234, 0.4);
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🤖 AI Chat Server</h1>
            <p>Multi-Agent AI System with Voice Capabilities</p>
          </div>
          
          <div class="content">
            <div class="status">✓ Server Status: Online & Ready</div>
            
            <a href="/ui" class="cta-button">🧪 Open Interactive Testing UI →</a>
            
            <h2 class="section-title">📡 API Endpoints</h2>
            
            <div class="endpoint">
              <span class="method get">GET</span>
              <code>/api/chat?prompt=your_message</code>
              <p>Stream AI chat responses using Server-Sent Events (SSE)</p>
              <a href="/api/chat?prompt=hello" target="_blank">Try it now →</a>
            </div>
            
            <div class="endpoint">
              <span class="method post">POST</span>
              <code>/api/voice</code>
              <p>Convert speech to text (upload audio file)</p>
            </div>
            
            <div class="endpoint">
              <span class="method post">POST</span>
              <code>/api/sound</code>
              <p>Convert text to speech (returns MP3 audio)</p>
            </div>
            
            <div class="endpoint">
              <span class="method get">GET</span>
              <code>/health</code>
              <p>Server health check and status information</p>
              <a href="/health" target="_blank">Check health →</a>
            </div>
            
            <h2 class="section-title">🤖 Available AI Agents</h2>
            <div class="endpoint">
              <strong>Manager Agent</strong> - Routes queries to specialized agents
              <p style="margin-top: 5px;">
                • Frontend Engineer (UI/React/Tailwind)<br>
                • Backend Engineer (Node.js/APIs/Databases)<br>
                • General Assistant (Q&A)<br>
                • Weather Agent (Weather queries)
              </p>
            </div>
            
            <h2 class="section-title">🚀 Quick Start</h2>
            <div class="endpoint">
              <strong>cURL Example:</strong>
              <pre style="background: #2d2d2d; color: #f8f8f2; padding: 15px; border-radius: 6px; overflow-x: auto; margin-top: 10px;"><code>curl "https://voltagent-backend.onrender.com/api/chat?prompt=hello"</code></pre>
            </div>
          </div>
        </div>
      </body>
    </html>
  `);
});

app.get("/health", (c) => {
  return c.json({ 
    status: "healthy", 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    port: process.env.PORT || 3001,
    environment: process.env.NODE_ENV || "production"
  });
});

app.get("/test", (c) => {
  return c.json({ 
    message: "Server is working! ✅",
    routes: ["/", "/ui", "/health", "/api/chat", "/api/voice", "/api/sound"]
  });
});

/* -------------------- INTERACTIVE UI ROUTE -------------------- */
app.get("/ui", (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>AI Chat Testing Interface</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
          }
          .container {
            max-width: 900px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            overflow: hidden;
          }
          .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
          }
          .header h1 { font-size: 2em; margin-bottom: 10px; }
          .content { padding: 30px; }
          .test-section {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
          }
          .test-section h2 {
            color: #333;
            margin-bottom: 15px;
            font-size: 1.3em;
          }
          input, textarea, button {
            width: 100%;
            padding: 12px;
            margin: 8px 0;
            border: 2px solid #e0e0e0;
            border-radius: 6px;
            font-size: 1em;
            font-family: inherit;
          }
          button {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            cursor: pointer;
            font-weight: bold;
            transition: transform 0.2s;
          }
          button:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
          }
          button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
          }
          .response {
            background: white;
            border: 2px solid #e0e0e0;
            border-radius: 6px;
            padding: 15px;
            margin-top: 15px;
            min-height: 100px;
            max-height: 300px;
            overflow-y: auto;
            white-space: pre-wrap;
            font-family: 'Courier New', monospace;
            font-size: 0.9em;
          }
          .loading {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 3px solid #f3f3f3;
            border-top: 3px solid #667eea;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-left: 10px;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          .error { color: #dc3545; }
          .success { color: #28a745; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🤖 AI Chat Testing Interface</h1>
            <p>Test your AI endpoints in real-time</p>
          </div>
          
          <div class="content">
            <!-- Chat Test -->
            <div class="test-section">
              <h2>💬 Chat Streaming Test</h2>
              <input type="text" id="chatPrompt" placeholder="Enter your message..." value="Hello, how are you?">
              <button onclick="testChat()" id="chatBtn">Send Message</button>
              <div class="response" id="chatResponse">Response will appear here...</div>
            </div>

            <!-- Text-to-Speech Test -->
            <div class="test-section">
              <h2>🔊 Text-to-Speech Test</h2>
              <textarea id="ttsText" rows="3" placeholder="Enter text to convert to speech...">Hello, this is a test of text to speech.</textarea>
              <button onclick="testTTS()" id="ttsBtn">Generate Speech</button>
              <div id="audioContainer"></div>
              <div class="response" id="ttsResponse">Audio player will appear here...</div>
            </div>

            <!-- Health Check -->
            <div class="test-section">
              <h2>❤️ Health Check</h2>
              <button onclick="testHealth()">Check Server Health</button>
              <div class="response" id="healthResponse">Health status will appear here...</div>
            </div>
          </div>
        </div>

        <script>
          async function testChat() {
            const prompt = document.getElementById('chatPrompt').value;
            const responseDiv = document.getElementById('chatResponse');
            const btn = document.getElementById('chatBtn');
            
            responseDiv.innerHTML = 'Connecting...<span class="loading"></span>';
            btn.disabled = true;
            
            try {
              const response = await fetch(\`/api/chat?prompt=\${encodeURIComponent(prompt)}\`);
              const reader = response.body.getReader();
              const decoder = new TextDecoder();
              
              responseDiv.innerHTML = '';
              
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value);
                const lines = chunk.split('\\n');
                
                for (const line of lines) {
                  if (line.startsWith('data: ')) {
                    try {
                      const data = JSON.parse(line.slice(6));
                      if (data.content) {
                        responseDiv.innerHTML += data.content;
                      }
                      if (data.done) {
                        responseDiv.innerHTML += '\\n\\n<span class="success">✓ Complete</span>';
                      }
                      if (data.error) {
                        responseDiv.innerHTML += \`\\n<span class="error">Error: \${data.error}</span>\`;
                      }
                    } catch (e) {
                      // Skip invalid JSON
                    }
                  }
                }
              }
            } catch (err) {
              responseDiv.innerHTML = \`<span class="error">Error: \${err.message}</span>\`;
            } finally {
              btn.disabled = false;
            }
          }

          async function testTTS() {
            const text = document.getElementById('ttsText').value;
            const responseDiv = document.getElementById('ttsResponse');
            const audioContainer = document.getElementById('audioContainer');
            const btn = document.getElementById('ttsBtn');
            
            responseDiv.innerHTML = 'Generating speech...<span class="loading"></span>';
            btn.disabled = true;
            
            try {
              const response = await fetch('/api/sound', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
              });
              
              if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to generate speech');
              }
              
              const audioBlob = await response.blob();
              const audioUrl = URL.createObjectURL(audioBlob);
              
              audioContainer.innerHTML = \`
                <audio controls style="width: 100%; margin-top: 10px;">
                  <source src="\${audioUrl}" type="audio/mpeg">
                  Your browser does not support the audio element.
                </audio>
              \`;
              responseDiv.innerHTML = '<span class="success">✓ Audio generated successfully!</span>';
            } catch (err) {
              responseDiv.innerHTML = \`<span class="error">Error: \${err.message}</span>\`;
            } finally {
              btn.disabled = false;
            }
          }

          async function testHealth() {
            const responseDiv = document.getElementById('healthResponse');
            
            try {
              const response = await fetch('/health');
              const data = await response.json();
              responseDiv.innerHTML = JSON.stringify(data, null, 2);
            } catch (err) {
              responseDiv.innerHTML = \`<span class="error">Error: \${err.message}</span>\`;
            }
          }
        </script>
      </body>
    </html>
  `);
});

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
// VoltAgent runs on its own port (3141) automatically
new VoltAgent({
  agents: { managerAgent },
  server: honoServer()
});

// Note: VoltAgent server runs independently on port 3141
// Access it at: http://localhost:3141/ui
// Your main API runs on the port below (3001 or Render's PORT)

/* ---------------- 📌 CHAT ROUTE (SSE STREAMING) ---------------- */
app.get("/api/chat", async (c) => {
  try {
    const prompt = c.req.query("prompt");
    
    if (!prompt) {
      return c.json({ error: "Prompt is required" }, 400);
    }

    console.log("Received prompt:", prompt);

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
          console.error("Streaming error:", err);
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
    console.error("Voice error:", err);
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
    console.error("TTS error:", err);
    return c.json({ error: err.message }, 500);
  }
});

/* ---------------------- START SERVER ---------------------- */
const PORT = process.env.PORT || 3001;
const HOST = '0.0.0.0';

serve({
  fetch: app.fetch,
  port: Number(PORT),
  hostname: HOST
}, (info) => {
  console.log(`🚀 Hono AI Server Running`);
  console.log(`📍 Host: ${HOST}:${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'production'}`);
  console.log(`📖 Docs: /`);
  console.log(`🧪 UI: /ui`);
  console.log(`❤️ Health: /health`);
});

import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import multer from "multer";
import Groq, { toFile } from "groq-sdk";

const app = express();

app.set("trust proxy", 1);

const PORT = process.env.PORT || 3000;
const GROQ_MODEL = "openai/gpt-oss-120b";

const groq = process.env.GROQ_API_KEY
  ? new Groq({
      apiKey: process.env.GROQ_API_KEY,
      timeout: 60000
    })
  : null;

const allowedOrigins = (process.env.ALLOWED_ORIGIN || "")
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);

app.use(helmet());

app.use(cors({
  origin(origin, callback) {
    if (
      !origin ||
      allowedOrigins.length === 0 ||
      allowedOrigins.includes(origin)
    ) {
      return callback(null, true);
    }

    callback(new Error("Origin not allowed"));
  }
}));

app.use(express.json({ limit: "1mb" }));

app.use("/api", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false
}));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024
  }
});

const SYSTEM_PROMPT = `
You are J.A.R.V.I.S., an advanced personal AI assistant.

Speak intelligently, calmly, naturally, and confidently.
Address the user respectfully.
Be helpful, observant, and precise.
Use concise answers unless more detail is needed.
Never claim to control a device or perform an action
unless a connected tool actually confirms it.
`;

app.get("/", (req, res) => {
  res.json({
    assistant: "J.A.R.V.I.S.",
    status: "online"
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "online",
    assistant: "J.A.R.V.I.S.",
    services: {
      groq: Boolean(groq),
      fishAudio: Boolean(process.env.FISH_AUDIO_API_KEY),
      voiceConfigured: Boolean(process.env.FISH_AUDIO_MODEL_ID)
    }
  });
});

// AI CHAT
app.post("/api/chat", async (req, res, next) => {
  try {
    if (!groq) {
      return res.status(503).json({
        error: "Groq API key is not configured."
      });
    }

    const { messages } = req.body;

    if (
      !Array.isArray(messages) ||
      messages.length === 0 ||
      messages.length > 40
    ) {
      return res.status(400).json({
        error: "Send between 1 and 40 messages."
      });
    }

    const validMessages = messages.map(message => {
      if (
        !message ||
        !["user", "assistant"].includes(message.role) ||
        typeof message.content !== "string" ||
        message.content.length > 12000
      ) {
        throw new Error("Invalid message format.");
      }

      return {
        role: message.role,
        content: message.content
      };
    });

    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT
        },
        ...validMessages
      ],
      temperature: 0.7,
      max_tokens: 1200
    });

    const reply =
      completion.choices[0]?.message?.content || "";

    res.json({ reply });

  } catch (error) {
    next(error);
  }
});

// FISH AUDIO TEXT TO SPEECH
app.post("/api/tts", async (req, res, next) => {
  try {
    const apiKey = process.env.FISH_AUDIO_API_KEY;
    const voiceId = process.env.FISH_AUDIO_MODEL_ID;

    if (!apiKey || !voiceId) {
      return res.status(503).json({
        error: "Fish Audio key or voice ID is missing."
      });
    }

    const { text } = req.body;

    if (
      typeof text !== "string" ||
      !text.trim() ||
      text.length > 4000
    ) {
      return res.status(400).json({
        error: "Text must contain 1–4000 characters."
      });
    }

    const response = await fetch(
      "https://api.fish.audio/v1/tts",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          model:
            process.env.FISH_AUDIO_TTS_MODEL ||
            "s2.1-pro-free"
        },
        body: JSON.stringify({
          text: text.trim(),
          reference_id: voiceId,
          format: "mp3"
        }),
        signal: AbortSignal.timeout(60000)
      }
    );

    if (!response.ok) {
      const details = await response.text();

      console.error(
        "Fish Audio error:",
        response.status,
        details
      );

      return res.status(502).json({
        error: "Fish Audio could not generate speech."
      });
    }

    const audio = Buffer.from(
      await response.arrayBuffer()
    );

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", audio.length);
    res.send(audio);

  } catch (error) {
    next(error);
  }
});

// SPEECH TO TEXT
app.post(
  "/api/transcribe",
  upload.single("audio"),
  async (req, res, next) => {
    try {
      if (!groq) {
        return res.status(503).json({
          error: "Groq API key is not configured."
        });
      }

      if (!req.file) {
        return res.status(400).json({
          error: "No audio file was uploaded."
        });
      }

      const file = await toFile(
        req.file.buffer,
        req.file.originalname || "recording.webm"
      );

      const result =
        await groq.audio.transcriptions.create({
          file,
          model:
            process.env.GROQ_STT_MODEL ||
            "whisper-large-v3-turbo"
        });

      res.json({
        transcript: result.text
      });

    } catch (error) {
      next(error);
    }
  }
);

// ERROR HANDLER
app.use((error, req, res, next) => {
  console.error(
    "Backend error:",
    error.message
  );

  if (res.headersSent) {
    return next(error);
  }

  res.status(error.status || 500).json({
    error: error.message || "Internal server error."
  });
});

app.listen(PORT, () => {
  console.log(
    `J.A.R.V.I.S. backend running on port ${PORT}`
  );
});


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
}));

// J.A.R.V.I.S. PERSONALITY
const SYSTEM_PROMPT = `
You are J.A.R.V.I.S., a highly capable personal AI assistant inspired by the composed, intelligent and perceptive manner of Tony Stark's JARVIS.

YOUR PERSONALITY:
- Speak naturally, intelligently, calmly and confidently.
- Sound like a real conversational assistant, not a generic chatbot.
- Be articulate, observant, thoughtful and occasionally witty.
- Be polite without sounding stiff or overly formal.
- Address the user respectfully. Use "sir" naturally and occasionally, not in every sentence.
- Understand context and use earlier messages to maintain a continuous conversation.
- Avoid repetitive greetings, robotic phrases and unnecessary explanations.
- Give direct answers, but explain thoroughly when the situation requires it.
- Adapt naturally to the user's conversational style while maintaining your composed personality.
- Never make every answer sound like a formal report.

YOUR IDENTITY:
- Your written name is always J.A.R.V.I.S.
- When speaking aloud, your name is pronounced "Jarvis", as one natural word.
- Never pronounce your name by spelling out each individual letter.
- You are an AI assistant. Never pretend to be human or claim experiences you do not have.

YOUR RESPONSIBILITIES:
- Help the user with questions, planning, ideas, learning and problem-solving.
- Be attentive to the user's instructions and preferences.
- Be honest when you do not know something.
- Never claim to control the phone, access private information or perform an action unless an actual connected capability confirms it.
- Never pretend an action succeeded when it did not.

Speak as J.A.R.V.I.S. would: composed, intelligent, natural and helpful.
`;

// HOME / STATUS
app.get("/", (req, res) => {
  res.json({
    assistant: "J.A.R.V.I.S.",
    status: "online"
  });
});

// HEALTH CHECK
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

    // Speak the name naturally, while preserving its written form.
    const spokenText = text.trim().replace(
      /J\.A\.R\.V\.I\.S\.?/gi,
      "Jarvis"
    );

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
          text: spokenText,
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

// START SERVER
app.listen(PORT, () => {
  console.log(
    `J.A.R.V.I.S. backend running on port ${PORT}`
  );
});

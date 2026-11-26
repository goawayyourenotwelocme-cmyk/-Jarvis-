
const API_URL = "https://jarvis-three-psi-82.vercel.app";

const statusText = document.getElementById("status");
const chatLog = document.getElementById("chat");
const activateButton = document.getElementById("activate");
const stopButton = document.getElementById("stop");
const textForm = document.getElementById("textForm");
const textInput = document.getElementById("textInput");

let recognition = null;
let listening = false;
let busy = false;

const conversation = [];

function setStatus(text) {
  statusText.textContent = text;
}

function addMessage(role, text) {
  const message = document.createElement("div");
  message.className = `message ${role}`;
  message.textContent = text;
  chatLog.appendChild(message);
  chatLog.scrollTop = chatLog.scrollHeight;
}

async function checkBackend() {
  try {
    const response = await fetch(`${API_URL}/api/health`);
    if (!response.ok) throw new Error("Backend unavailable");
    setStatus("SYSTEM ONLINE");
  } catch (error) {
    setStatus("BACKEND OFFLINE");
    addMessage("assistant", "I cannot reach my server right now.");
  }
}

async function speak(text) {
  try {
    const response = await fetch(`${API_URL}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });

    if (!response.ok) throw new Error("Voice service failed");

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);

    try {
      await audio.play();

      await new Promise((resolve, reject) => {
        audio.onended = resolve;
        audio.onerror = reject;
      });
    } finally {
      URL.revokeObjectURL(audioUrl);
    }
  } catch (error) {
    console.error("Voice error:", error);
  }
}

async function askJarvis(text) {
  text = text.trim();

  if (!text || busy) return;

  busy = true;

  addMessage("user", text);
  conversation.push({
    role: "user",
    content: text
  });

  setStatus("THINKING...");

  try {
    const recentMessages = conversation.slice(-12);

    const response = await fetch(`${API_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: recentMessages })
    });

    const data = await response.json();

    if (!response.ok || !data.reply) {
      throw new Error(data.error || "Chat request failed");
    }

    conversation.push({
      role: "assistant",
      content: data.reply
    });

    // Show the answer immediately.
    addMessage("assistant", data.reply);
    setStatus("SPEAKING...");

    // Speak the answer using your existing voice service.
    await speak(data.reply);

    setStatus(listening ? "LISTENING..." : "SYSTEM ONLINE");

  } catch (error) {
    console.error("Chat error:", error);
    addMessage(
      "assistant",
      "I'm having trouble connecting to my intelligence system."
    );
    setStatus("CONNECTION ERROR");
  } finally {
    busy = false;

    if (listening) {
      startListening();
    }
  }
}

// Text messaging
textForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const text = textInput.value.trim();

  if (!text || busy) return;

  textInput.value = "";
  await askJarvis(text);
});

// Voice recognition
function setupVoiceRecognition() {
  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    addMessage(
      "assistant",
      "Voice recognition is unavailable in this browser. You can still type to me."
    );
    return false;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onstart = () => {
    setStatus("LISTENING...");
  };

  recognition.onresult = async (event) => {
    const spokenText = event.results[0][0].transcript;
    await askJarvis(spokenText);
  };

  recognition.onerror = (event) => {
    console.error("Microphone error:", event.error);

    if (event.error === "not-allowed") {
      listening = false;
      setStatus("MICROPHONE BLOCKED");
      addMessage("assistant", "Please allow microphone access.");
    }
  };

  recognition.onend = () => {
    if (listening && !busy) {
      startListening();
    }
  };

  return true;
}

function startListening() {
  if (!recognition || !listening || busy) return;

  try {
    recognition.start();
  } catch (error) {
    console.log("Voice recognition is already active.");
  }
}

// Activate voice mode
activateButton.addEventListener("click", async () => {
  if (!recognition && !setupVoiceRecognition()) return;

  if (!listening) {
    listening = true;
    addMessage("assistant", "I'm listening, sir.");
    startListening();
  }
});

// Standby
stopButton.addEventListener("click", () => {
  listening = false;

  if (recognition) {
    recognition.stop();
  }

  setStatus("STANDBY");
  addMessage("assistant", "J.A.R.V.I.S. standing by.");
});

checkBackend();

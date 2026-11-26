const API_URL = "https://jarvis-three-psi-82.vercel.app";

const statusText = document.getElementById("status");
const messageText = document.getElementById("message");
const activateButton = document.getElementById("activate");
const stopButton = document.getElementById("stop");

let recognition;
let listening = false;
let busy = false;

const conversation = [];

function setStatus(text) {
  statusText.textContent = text;
}

function showMessage(text) {
  messageText.textContent = text;
}

async function checkBackend() {
  try {
    const response = await fetch(`${API_URL}/api/health`);
    if (!response.ok) throw new Error("Backend unavailable");
    setStatus("SYSTEM ONLINE");
    showMessage("J.A.R.V.I.S. systems initialized.");
  } catch (error) {
    setStatus("BACKEND OFFLINE");
    showMessage("Unable to connect to the J.A.R.V.I.S. server.");
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

    await new Promise((resolve, reject) => {
      audio.onended = resolve;
      audio.onerror = reject;
      audio.play().catch(reject);
    });

    URL.revokeObjectURL(audioUrl);
  } catch (error) {
    console.error("TTS error:", error);
    showMessage("Voice output unavailable.");
  }
}

async function askJarvis(text) {
  if (busy || !text.trim()) return;

  busy = true;
  showMessage(`You: ${text}`);
  setStatus("THINKING...");

  conversation.push({
    role: "user",
    content: text
  });

  try {
    const response = await fetch(`${API_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: conversation })
    });

    const data = await response.json();

    if (!response.ok || !data.reply) {
      throw new Error(data.error || "Chat request failed");
    }

    conversation.push({
      role: "assistant",
      content: data.reply
    });

    showMessage(`J.A.R.V.I.S.: ${data.reply}`);
    setStatus("SPEAKING...");

    await speak(data.reply);
    setStatus(listening ? "LISTENING..." : "SYSTEM ONLINE");

  } catch (error) {
    console.error(error);
    showMessage("I cannot reach my intelligence system right now.");
    setStatus("CONNECTION ERROR");
  }

  busy = false;
}

function setupVoiceRecognition() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    setStatus("VOICE INPUT UNSUPPORTED");
    showMessage("Please open J.A.R.V.I.S. in Chrome to try voice input.");
    return false;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onstart = () => {
    listening = true;
    setStatus("LISTENING...");
    showMessage("I'm listening, sir.");
  };

  recognition.onresult = async (event) => {
    const text = event.results[0][0].transcript;
    listening = false;
    await askJarvis(text);

    if (listening) startListening();
  };

  recognition.onerror = (event) => {
    console.error("Microphone error:", event.error);
    listening = false;
    setStatus("VOICE ERROR");
    showMessage("I couldn't hear you. Check microphone permission and try again.");
  };

  recognition.onend = () => {
    if (listening && !busy) {
      startListening();
    }
  };

  return true;
}

function startListening() {
  if (!recognition || busy) return;

  try {
    recognition.start();
  } catch (error) {
    console.log("Recognition is already starting.");
  }
}

activateButton.addEventListener("click", async () => {
  if (!recognition && !setupVoiceRecognition()) return;

  if (!listening) {
    await speak("Hey, sir.");
    startListening();
  }
});

stopButton.addEventListener("click", () => {
  listening = false;

  if (recognition) {
    recognition.stop();
  }

  setStatus("STANDBY");
  showMessage("J.A.R.V.I.S. standing by.");
});

checkBackend(); 
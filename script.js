
const API_URL = "https://jarvis-three-psi-82.vercel.app";

const statusText = document.getElementById("status");
const chat = document.getElementById("chat");
const activateButton = document.getElementById("activate");
const stopButton = document.getElementById("stop");
const textForm = document.getElementById("textForm");
const textInput = document.getElementById("textInput");

let recognition = null;
let voiceMode = false;
let busy = false;

const conversation = [];

function setStatus(text) {
  if (statusText) statusText.textContent = text;
}

function showMessage(text, sender = "assistant") {
  if (!chat) return;

  const message = document.createElement("div");
  message.className = `message ${sender}`;
  message.textContent = text;

  chat.appendChild(message);
  chat.scrollTop = chat.scrollHeight;
}

async function checkBackend() {
  setStatus("CONNECTING...");

  try {
    const response = await fetch(`${API_URL}/api/health`);

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    const data = await response.json();

    if (data.status !== "online") {
      throw new Error("Backend is not online");
    }

    setStatus("SYSTEM ONLINE");
    showMessage("J.A.R.V.I.S. systems initialized. Awaiting your command.");
  } catch (error) {
    console.error("Backend connection error:", error);
    setStatus("BACKEND OFFLINE");
    showMessage("Unable to connect to the J.A.R.V.I.S. server.");
  }
}

async function speak(text) {
  try {
    const response = await fetch(`${API_URL}/api/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text })
    });

    if (!response.ok) {
      throw new Error(`Voice service error: ${response.status}`);
    }

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
    console.error("Voice output error:", error);
    showMessage("My voice service is unavailable right now.");
  }
}

async function askJarvis(text) {
  if (busy || !text.trim()) return;

  busy = true;
  voiceMode && setStatus("THINKING...");

  showMessage(text, "user");

  conversation.push({
    role: "user",
    content: text
  });

  try {
    const response = await fetch(`${API_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messages: conversation
      })
    });

    const data = await response.json();

    if (!response.ok || !data.reply) {
      throw new Error(data.error || "Chat request failed");
    }

    conversation.push({
      role: "assistant",
      content: data.reply
    });

    showMessage(data.reply, "assistant");
    setStatus("SPEAKING...");

    await speak(data.reply);

    if (voiceMode) {
      setStatus("LISTENING...");
    } else {
      setStatus("SYSTEM ONLINE");
    }
  } catch (error) {
    console.error("Chat error:", error);
    showMessage("I cannot reach my intelligence system right now.");
    setStatus("CONNECTION ERROR");
  } finally {
    busy = false;

    if (voiceMode && recognition) {
      startListening();
    }
  }
}

function setupVoiceRecognition() {
  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    setStatus("VOICE INPUT UNSUPPORTED");
    showMessage("Please use Google Chrome for voice input.");
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
      voiceMode = false;
      setStatus("MICROPHONE BLOCKED");
      showMessage("Please allow microphone access in Chrome.");
    } else if (voiceMode) {
      setStatus("VOICE ERROR");
    }
  };

  recognition.onend = () => {
    if (voiceMode && !busy) {
      setTimeout(startListening, 500);
    }
  };

  return true;
}

function startListening() {
  if (!recognition || !voiceMode || busy) return;

  try {
    recognition.start();
  } catch (error) {
    console.log("Microphone is already starting.");
  }
}

if (activateButton) {
  activateButton.addEventListener("click", async () => {
    if (!recognition && !setupVoiceRecognition()) return;

    voiceMode = true;

    await speak("J.A.R.V.I.S. online. I'm listening, sir.");

    if (voiceMode) startListening();
  });
}

if (stopButton) {
  stopButton.addEventListener("click", () => {
    voiceMode = false;

    if (recognition) {
      recognition.stop();
    }

    setStatus("STANDBY");
    showMessage("J.A.R.V.I.S. standing by.");
  });
}

if (textForm) {
  textForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const text = textInput.value.trim();

    if (!text || busy) return;

    textInput.value = "";
    await askJarvis(text);
  });
}

checkBackend();

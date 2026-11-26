
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
let currentAudio = null;
let finishSpeech = null;

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
    if (!response.ok) throw new Error("Offline");
    setStatus("SYSTEM ONLINE");
  } catch {
    setStatus("BACKEND OFFLINE");
    addMessage("assistant", "I cannot reach my server right now.");
  }
}

function stopSpeech() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
  }

  if (finishSpeech) {
    finishSpeech();
  }
}

async function speak(text) {
  try {
    const response = await fetch(`${API_URL}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });

    if (!response.ok) throw new Error("Voice unavailable");

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);

    currentAudio = audio;

    await new Promise(resolve => {
      let finished = false;

      const finish = () => {
        if (finished) return;
        finished = true;

        audio.onended = null;
        audio.onerror = null;

        URL.revokeObjectURL(url);

        if (currentAudio === audio) currentAudio = null;
        if (finishSpeech === finish) finishSpeech = null;

        resolve();
      };

      finishSpeech = finish;
      audio.onended = finish;
      audio.onerror = finish;

      audio.play().catch(finish);
    });

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
    const response = await fetch(`${API_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: conversation.slice(-12)
      })
    });

    const data = await response.json();

    if (!response.ok || !data.reply) {
      throw new Error(data.error || "Chat failed");
    }

    conversation.push({
      role: "assistant",
      content: data.reply
    });

    addMessage("assistant", data.reply);
    setStatus("SPEAKING...");

    await speak(data.reply);

  } catch (error) {
    console.error(error);
    addMessage("assistant", "I'm having trouble connecting right now.");
    setStatus("CONNECTION ERROR");

  } finally {
    busy = false;

    if (listening) {
      startListening();
    } else {
      setStatus("SYSTEM ONLINE");
    }
  }
}

// Text input
textForm.addEventListener("submit", async event => {
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
      "Voice recognition is unavailable. You can still type to me."
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

  recognition.onresult = async event => {
    const spokenText = event.results[0][0].transcript;
    await askJarvis(spokenText);
  };

  recognition.onerror = event => {
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
    console.log("Recognition is already active.");
  }
}

// Activate or interrupt
activateButton.addEventListener("click", () => {
  if (!recognition && !setupVoiceRecognition()) return;

  if (busy && currentAudio) {
    stopSpeech();
    return;
  }

  if (!listening) {
    listening = true;
    addMessage("assistant", "I'm listening, sir.");
    startListening();
  }
});

// Standby
stopButton.addEventListener("click", () => {
  listening = false;
  stopSpeech();

  if (recognition) {
    recognition.stop();
  }

  setStatus("STANDBY");
  addMessage("assistant", "J.A.R.V.I.S. standing by.");
});

checkBackend();

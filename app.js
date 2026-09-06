/**
 * SLT Bridge - Main Application Orchestrator
 * Coordinates routing, text-to-speech, translation history, 
 * the GSL interactive dictionary, settings panels, and multi-user session syncing.
 */

import { GSLTranslator } from "./translator.js";
import { DICTIONARY_SHAPES } from "./gestures.js";

// Global Application State
const state = {
  activeSection: "dashboard",
  theme: "dark",
  history: [],
  translator: null,
  
  // Real-Time Session Variables
  role: "signer",        // "signer" or "viewer"
  name: "",              // Current User's Name
  sessionId: "",         // "LOCAL" or "SLT-XXXX"
  signerName: "",        // Name of the Signer (if viewer)
  pollIntervalId: null,  // Polling loop ID
  lastPolledText: "",    // Last sentence read from server
  
  // Translation Buffer Variables
  currentCommitedGesture: "",
  gestureStableCount: 0,
  lastStableGesture: "",
  requiredStabilityFrames: 25, // Frames to hold a gesture to commit it (~1s)
};

// ==========================================================================
// MEDICAL PHRASES DATA (SignTalk-GH Aligned)
// ==========================================================================
const MEDICAL_PHRASES = {
  general: [
    { eng: "Hello, I need to see a doctor.", gsl: "Hello + Me + Need + Doctor" },
    { eng: "I am deaf, I communicate with sign language or text.", gsl: "Me + Deaf + Communicate + Sign + Text" },
    { eng: "I have a scheduled appointment today.", gsl: "Me + Have + Meeting + Today" },
    { eng: "Thank you for your assistance.", gsl: "Thank You + Help" }
  ],
  symptoms: [
    { eng: "I feel pain in my chest.", gsl: "Me + Feel + Pain + Chest" },
    { eng: "I have a severe headache.", gsl: "Me + Have + Pain + Head" },
    { eng: "I feel very dizzy and weak.", gsl: "Me + Feel + Dizzy + Weak" },
    { eng: "I have been vomiting since morning.", gsl: "Me + Vomit + Since + Morning" },
    { eng: "I have a high fever.", gsl: "Me + Body + Hot + Fever" }
  ],
  pediatrics: [
    { eng: "My child is not feeling well.", gsl: "My + Child + Body + Not + Good" },
    { eng: "My baby has a severe stomach ache.", gsl: "Baby + Stomach + Pain + Bad" },
    { eng: "My child has a cough and a running nose.", gsl: "Child + Cough + Nose + Run" }
  ],
  pharmacy: [
    { eng: "I need to buy this medicine.", gsl: "Me + Need + Buy + Medicine" },
    { eng: "How many times a day should I take this dosage?", gsl: "How Many + Times + Day + Drink + Medicine" },
    { eng: "Are there any side effects to this drug?", gsl: "This + Medicine + Have + Bad + Action?" }
  ],
  emergency: [
    { eng: "Please call an ambulance immediately!", gsl: "Emergency + Call + Car + Hospital + Quick" },
    { eng: "I cannot breathe properly.", gsl: "Me + Breath + No + Good" },
    { eng: "There has been an accident. Help!", gsl: "Accident + Help + Quick" },
    { eng: "I am bleeding heavily.", gsl: "Me + Blood + Flow + Bad" }
  ]
};

// ==========================================================================
// GSL DICTIONARY DATA
// ==========================================================================
const DICTIONARY_ENTRIES = [
  // Letters (A - Z)
  { word: "A", category: "alphabet", desc: "Form a tight fist with your fingers wrapped around the palm. The thumb rests straight up against the outer side of the index finger.", jointsKey: "A" },
  { word: "B", category: "alphabet", desc: "Extend all four fingers straight up, holding them close together. Fold your thumb flat across the palm.", jointsKey: "B" },
  { word: "C", category: "alphabet", desc: "Curve your fingers and thumb to form a semi-circle, resembling the letter C shape.", jointsKey: "C" },
  { word: "D", category: "alphabet", desc: "Point your index finger straight up. Press the tips of your thumb, middle, ring, and pinky fingers together to form a loop.", jointsKey: "D" },
  { word: "E", category: "alphabet", desc: "Curl all four fingers down into the palm, tucking the thumb tip against the bottom of your curled fingertips.", jointsKey: "E" },
  { word: "F", category: "alphabet", desc: "Touch the tip of your index finger to the tip of your thumb. Keep the middle, ring, and pinky fingers extended straight up and spread out.", jointsKey: "F" },
  { word: "G", category: "alphabet", desc: "Extend your index finger straight out horizontally. Extend your thumb parallel above it, with remaining fingers folded.", jointsKey: "G" },
  { word: "H", category: "alphabet", desc: "Extend your index and middle fingers straight out horizontally together. Fold your ring finger, pinky, and thumb.", jointsKey: "H" },
  { word: "I", category: "alphabet", desc: "Fold all fingers down into a fist, extending only your pinky finger straight up.", jointsKey: "I" },
  { word: "J", category: "alphabet", desc: "Extend your pinky finger straight up, then trace a curving 'J' stroke in the air with your pinky tip.", jointsKey: "J" },
  { word: "K", category: "alphabet", desc: "Extend your index finger straight up, project your middle finger forward at an angle, and touch your thumb tip to the middle finger joint.", jointsKey: "K" },
  { word: "L", category: "alphabet", desc: "Extend your index finger straight up and your thumb straight out horizontally to form an L shape.", jointsKey: "L" },
  { word: "M", category: "alphabet", desc: "Tuck your thumb underneath your index, middle, and ring fingers, draped down into a fist shape.", jointsKey: "M" },
  { word: "N", category: "alphabet", desc: "Tuck your thumb underneath your index and middle fingers, draped down into a fist shape.", jointsKey: "N" },
  { word: "O", category: "alphabet", desc: "Curve all four fingers downward so their tips press together against your thumb tip, forming an 'O' circle.", jointsKey: "O" },
  { word: "P", category: "alphabet", desc: "Form the 'K' handshape, but tilt your hand downward so your index finger points straight down.", jointsKey: "P" },
  { word: "Q", category: "alphabet", desc: "Form the 'G' handshape, but tilt your hand downward so your index finger and thumb point straight down.", jointsKey: "Q" },
  { word: "R", category: "alphabet", desc: "Cross your middle finger over your index finger. Fold your ring finger, pinky, and thumb into your palm.", jointsKey: "R" },
  { word: "S", category: "alphabet", desc: "Form a tight fist and wrap your thumb firmly across the front of your folded index and middle fingers.", jointsKey: "S" },
  { word: "T", category: "alphabet", desc: "Tuck your thumb tip directly underneath your folded index finger, resting between index and middle knuckles.", jointsKey: "T" },
  { word: "U", category: "alphabet", desc: "Extend your index and middle fingers straight up, holding them tightly together. Fold your thumb, ring, and pinky fingers down.", jointsKey: "U" },
  { word: "V", category: "alphabet", desc: "Extend your index and middle fingers upward, spreading them apart in a V shape. Fold other fingers down.", jointsKey: "V" },
  { word: "W", category: "alphabet", desc: "Extend your index, middle, and ring fingers upward, spreading them apart. Fold your thumb and pinky down.", jointsKey: "W" },
  { word: "X", category: "alphabet", desc: "Bend your index finger into a hooked crook shape. Fold all other fingers and thumb tightly into a fist.", jointsKey: "X" },
  { word: "Y", category: "alphabet", desc: "Extend your thumb and pinky finger fully outward. Fold the index, middle, and ring fingers down into your palm.", jointsKey: "Y" },
  { word: "Z", category: "alphabet", desc: "Extend your index finger straight out and trace the 'Z' pattern in the air with your fingertip.", jointsKey: "Z" },

  
  // Conversational Words
  { word: "Hello", category: "conversational", desc: "Bring your flat hand, fingers together, near your forehead (like a salute) and sweep it slightly outward.", jointsKey: "Hello" },
  { word: "Yes", category: "conversational", desc: "Form a fist and nod it forward and backward, simulating a head nodding 'yes'.", jointsKey: "A" }, 
  { word: "No", category: "conversational", desc: "Extend your index and middle fingers together, then tap them down against your extended thumb tip.", jointsKey: "D" }, 
  { word: "Thank You", category: "conversational", desc: "Place the fingertips of your flat hand against your chin, then move your hand downward and outward toward the person.", jointsKey: "Hello" },
  { word: "I Love You", category: "conversational", desc: "Extend your thumb, index, and pinky fingers simultaneously. Fold the middle and ring fingers down.", jointsKey: "I Love You" },

  // Healthcare Words
  { word: "Doctor", category: "medical", desc: "Tap the index and middle fingers of your active hand against the wrist of your opposite hand, as if checking a pulse.", jointsKey: "Doctor" },
  { word: "Fever", category: "medical", desc: "Place the back of your flat hand against your forehead, as if feeling for a high body temperature.", jointsKey: "Fever" },
  { word: "Pain", category: "medical", desc: "Extend both index fingers. Bring them close together, pointing at each other, and twist them in opposite directions near the painful area.", jointsKey: "Pain" },
  { word: "Help", category: "medical", desc: "Place your closed fist (with thumb pointing straight up) on top of the flat palm of your opposite hand, then lift both hands upward.", jointsKey: "Help" },
  { word: "Medicine", category: "medical", desc: "Rest your opposite hand flat, palm up. Take the middle finger of your active hand and circular-rub it against the opposite palm.", jointsKey: "Medicine" }
];

// ==========================================================================
// APP INITIALIZATION
// ==========================================================================
document.addEventListener("DOMContentLoaded", () => {
  initRouting();
  initTTS();
  initLocalStorage();
  initHealthcareBoard();
  initDictionary();
  initSessionOverlay();
  initTranslatorPanel();
  initTheme();
});

// Theme management
function initTheme() {
  const toggleBtn = document.getElementById("theme-toggle");
  toggleBtn.addEventListener("click", () => {
    if (document.body.classList.contains("dark-theme")) {
      document.body.classList.remove("dark-theme");
      document.body.classList.add("light-theme");
      toggleBtn.querySelector("span").textContent = "dark_mode";
      state.theme = "light";
    } else {
      document.body.classList.remove("light-theme");
      document.body.classList.add("dark-theme");
      toggleBtn.querySelector("span").textContent = "light_mode";
      state.theme = "dark";
    }
  });
}

// ==========================================================================
// SESSION LOGIN SYSTEM (Flow Talk Aligned)
// ==========================================================================
function initSessionOverlay() {
  const overlay = document.getElementById("session-overlay");
  const mainApp = document.getElementById("main-app-container");
  const inputName = document.getElementById("login-name");
  
  const roleCardSigner = document.getElementById("role-card-signer");
  const roleCardViewer = document.getElementById("role-card-viewer");
  
  const btnCreateSession = document.getElementById("btn-create-session");
  const divider = document.querySelector(".session-divider");
  const joinGroup = document.querySelector(".join-existing-group");
  
  const inputSessionId = document.getElementById("login-session-id");
  const btnJoinSession = document.getElementById("btn-join-session");
  const btnSkipSession = document.getElementById("btn-skip-session");

  // Initial UI state matching default "signer" selection
  selectRole("signer");

  // Clicking roles
  roleCardSigner.addEventListener("click", () => selectRole("signer"));
  roleCardViewer.addEventListener("click", () => selectRole("viewer"));

  function selectRole(role) {
    state.role = role;
    if (role === "signer") {
      roleCardSigner.classList.add("active");
      roleCardViewer.classList.remove("active");
      btnCreateSession.classList.remove("hidden");
      divider.classList.remove("hidden");
      joinGroup.classList.add("hidden"); // Signer doesn't join, signer creates
    } else {
      roleCardSigner.classList.remove("active");
      roleCardViewer.classList.add("active");
      btnCreateSession.classList.add("hidden"); // Viewer doesn't create, viewer joins
      divider.classList.add("hidden");
      joinGroup.classList.remove("hidden");
    }
  }

  // CREATE SESSION (Signer)
  btnCreateSession.addEventListener("click", async () => {
    const name = inputName.value.trim();
    if (!name) {
      alert("Please enter your name to create a session.");
      return;
    }

    btnCreateSession.disabled = true;
    btnCreateSession.textContent = "Creating session...";

    try {
      const response = await fetch("/api/session/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      });
      const data = await response.json();

      if (data.success) {
        state.sessionId = data.sessionId;
        state.name = name;
        state.role = "signer";
        
        launchAppWorkspace();
      } else {
        alert("Server error: " + (data.error || "Could not create session"));
        btnCreateSession.disabled = false;
        btnCreateSession.innerHTML = `<span class="material-symbols-rounded">add_circle</span> Create New Session`;
      }
    } catch (err) {
      console.error(err);
      alert("Failed to connect to local server. Please check that server.js is running.");
      btnCreateSession.disabled = false;
      btnCreateSession.innerHTML = `<span class="material-symbols-rounded">add_circle</span> Create New Session`;
    }
  });

  // JOIN SESSION (Viewer)
  btnJoinSession.addEventListener("click", async () => {
    const name = inputName.value.trim();
    const code = inputSessionId.value.trim().toUpperCase();

    if (!name) {
      alert("Please enter your name to join.");
      return;
    }
    if (!code) {
      alert("Please enter a valid 8-character Session ID (e.g. SLT-1234).");
      return;
    }

    btnJoinSession.disabled = true;
    btnJoinSession.textContent = "Joining...";

    try {
      const response = await fetch("/api/session/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: code, name })
      });
      const data = await response.json();

      if (data.success) {
        state.sessionId = code;
        state.name = name;
        state.role = "viewer";
        state.signerName = data.signerName;

        launchAppWorkspace();
      } else {
        alert(data.error || "Failed to join session.");
        btnJoinSession.disabled = false;
        btnJoinSession.textContent = "Join";
      }
    } catch (err) {
      console.error(err);
      alert("Failed to connect to local server. Make sure server.js is running.");
      btnJoinSession.disabled = false;
      btnJoinSession.textContent = "Join";
    }
  });

  // SKIP SESSION (Offline Local Mode)
  btnSkipSession.addEventListener("click", () => {
    state.sessionId = "LOCAL";
    state.role = "signer";
    state.name = inputName.value.trim() || "Offline User";
    launchAppWorkspace();
  });

  // Launch workspace UI
  function launchAppWorkspace() {
    overlay.classList.add("hidden");
    mainApp.classList.remove("hidden");

    // Header updates
    const codeBadgeText = document.getElementById("session-code-text");
    codeBadgeText.textContent = state.sessionId;
    
    const roleBadge = document.getElementById("sidebar-role-badge");
    roleBadge.textContent = state.role === "signer" ? "Signer Mode" : "Viewer Mode";

    // Setup Workspace Panels
    const signerWS = document.getElementById("signer-workspace");
    const viewerWS = document.getElementById("viewer-workspace");

    if (state.role === "signer") {
      signerWS.classList.remove("hidden");
      viewerWS.classList.add("hidden");
    } else {
      signerWS.classList.add("hidden");
      viewerWS.classList.remove("hidden");
      
      // Start viewer sync polling
      startViewerPolling();
    }
  }
}

// ==========================================================================
// VIEWER SYNC & POLLING LOGIC
// ==========================================================================
function startViewerPolling() {
  const viewerLiveText = document.getElementById("viewer-live-text");
  const viewerSignerBanner = document.getElementById("viewer-signer-banner");
  
  const detailSessionCode = document.getElementById("viewer-session-id-display");
  const detailSignerName = document.getElementById("viewer-signer-name-display");
  const detailViewerBadge = document.getElementById("viewer-count-badge");
  
  const autoSpeakCheck = document.getElementById("setting-viewer-autospeak");
  const speakLastBtn = document.getElementById("btn-viewer-speak-last");
  const leaveSessionBtn = document.getElementById("btn-leave-session");

  // Populate static fields
  detailSessionCode.textContent = state.sessionId;
  detailSignerName.textContent = state.signerName;
  viewerSignerBanner.textContent = `${state.signerName.toUpperCase()} IS INTERPRETING`;

  // Reset poll variables
  state.lastPolledText = "";

  const pollFunction = async () => {
    try {
      const response = await fetch(`/api/session/status?id=${state.sessionId}`);
      const data = await response.json();

      if (data.success) {
        const currentText = data.currentText || "";
        
        // Update viewers badge count
        const count = data.viewers ? data.viewers.length : 1;
        detailViewerBadge.textContent = `${count} Connected`;

        // Update live subtitle screen
        if (currentText.trim() === "") {
          viewerLiveText.textContent = "Waiting for translation...";
        } else {
          viewerLiveText.textContent = `"${currentText}"`;
        }

        // Check if there is new text segment to log and speak
        if (currentText !== state.lastPolledText) {
          const oldText = state.lastPolledText;
          state.lastPolledText = currentText;

          // Find the newly appended segment
          let newSegment = currentText;
          if (oldText && currentText.toLowerCase().startsWith(oldText.toLowerCase())) {
            newSegment = currentText.substring(oldText.length).trim();
          }

          if (newSegment.trim() !== "") {
            // Log to visual scrollable transcript
            addTranscriptBubble(newSegment);

            // Auto Speech
            if (autoSpeakCheck.checked) {
              speakText(newSegment);
            }
          }
        }
      }
    } catch (err) {
      console.error("Error polling session status:", err);
      const indicator = document.getElementById("viewer-connection-status");
      indicator.className = "session-connection-indicator error";
      indicator.innerHTML = `<span class="dot"></span> Disconnected`;
    }
  };

  // Run initial poll and setup loop
  pollFunction();
  state.pollIntervalId = setInterval(pollFunction, 1500);

  // Play button
  speakLastBtn.onclick = () => speakText(state.lastPolledText);

  // Leave session resets state by reloading page
  leaveSessionBtn.onclick = () => {
    if (confirm("Are you sure you want to exit this interpretation session?")) {
      clearInterval(state.pollIntervalId);
      window.location.reload();
    }
  };
}

function addTranscriptBubble(text) {
  const container = document.getElementById("viewer-transcript-list");
  const placeholder = document.getElementById("empty-transcript-placeholder");
  
  if (placeholder) placeholder.remove();

  const bubble = document.createElement("div");
  bubble.className = "transcript-bubble";
  bubble.innerHTML = `
    <span class="text">${text}</span>
    <span class="time">${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
  `;

  container.prepend(bubble);
}

// Push local translations to server (Signer broadcast)
async function broadcastSignerTranslation(text) {
  if (state.sessionId === "LOCAL" || !state.sessionId) return;

  try {
    await fetch("/api/session/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: state.sessionId,
        text: text
      })
    });
  } catch (err) {
    console.error("Failed to broadcast translation update:", err);
  }
}

// ==========================================================================
// SECTION ROUTING
// ==========================================================================
function initRouting() {
  const navBtns = document.querySelectorAll(".nav-btn");
  const sections = document.querySelectorAll(".content-section");
  const sectionTitle = document.getElementById("section-title");
  const sectionSubtitle = document.getElementById("section-subtitle");

  const routeDetails = {
    "dashboard": { title: "Dashboard", subtitle: "Welcome to SLT Bridge, an accessibility tool for Ghanaian Sign Language." },
    "translator": { title: "Real-Time GSL Translator", subtitle: "Position your hand in front of the camera to translate GSL signs into text and speech." },
    "healthcare-board": { title: "Healthcare Board", subtitle: "Use pre-configured medical GSL phrases for quick consultation and clinical interactions." },
    "dictionary": { title: "GSL Dictionary & Reference Guide", subtitle: "Search and learn the handshapes for the GSL alphabet and healthcare gestures." },
    "history": { title: "Saved Translations", subtitle: "Review and play speech logs of your translated signs and phrases." },
    "settings": { title: "Settings & Options", subtitle: "Configure camera inputs, text-to-speech rates, and hand tracking visual parameters." }
  };

  navBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-target");
      
      // Stop translation camera if we leave the translator section
      if (state.activeSection === "translator" && target !== "translator") {
        if (state.translator) {
          state.translator.stop();
          document.getElementById("btn-start-camera").classList.remove("hidden");
          document.getElementById("btn-stop-camera").classList.add("hidden");
          document.getElementById("camera-placeholder").classList.remove("hidden");
        }
      }

      // Update active nav button
      navBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      // Update active section DOM
      sections.forEach(s => s.classList.remove("active"));
      document.getElementById(`sect-${target}`).classList.add("active");

      // Update headers
      const details = routeDetails[target] || { title: target, subtitle: "" };
      sectionTitle.textContent = details.title;
      sectionSubtitle.textContent = details.subtitle;

      state.activeSection = target;
    });
  });
}

// ==========================================================================
// TEXT-TO-SPEECH (TTS) SYSTEM
// ==========================================================================
let voicesList = [];

function initTTS() {
  const voiceSelect = document.getElementById("tts-voice-select");
  const speedSlider = document.getElementById("tts-speed");
  const speedVal = document.getElementById("tts-speed-value");
  const pitchSlider = document.getElementById("tts-pitch");
  const pitchVal = document.getElementById("tts-pitch-value");
  const testSpeechBtn = document.getElementById("btn-test-speech");

  // Load voices dynamically
  const loadVoices = () => {
    voicesList = window.speechSynthesis.getVoices();
    voiceSelect.innerHTML = "";
    
    voicesList.forEach((voice, index) => {
      const option = document.createElement("option");
      option.value = index;
      option.textContent = `${voice.name} (${voice.lang})`;
      
      if (voice.lang.includes("en-US") || voice.lang.includes("en-GB") || voice.lang.includes("en-GH")) {
        option.selected = true;
      }
      voiceSelect.appendChild(option);
    });
  };

  loadVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }

  // Update slider values
  speedSlider.addEventListener("input", (e) => {
    speedVal.textContent = `${e.target.value}x`;
  });

  pitchSlider.addEventListener("input", (e) => {
    pitchVal.textContent = e.target.value;
  });

  // Test Voice Synthesis
  testSpeechBtn.addEventListener("click", () => {
    speakText("Hello! Testing text-to-speech feedback for SLT Bridge translator.");
  });
}

export function speakText(text) {
  if (!text || text.trim() === "") return;

  // Cancel any active speech first
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  
  // Apply Settings
  const voiceIndex = document.getElementById("tts-voice-select").value;
  if (voicesList[voiceIndex]) {
    utterance.voice = voicesList[voiceIndex];
  }
  
  utterance.rate = parseFloat(document.getElementById("tts-speed").value) || 1.0;
  utterance.pitch = parseFloat(document.getElementById("tts-pitch").value) || 1.0;

  window.speechSynthesis.speak(utterance);
}

// ==========================================================================
// LOCAL STORAGE & HISTORY MANAGEMENT
// ==========================================================================
function initLocalStorage() {
  const clearBtn = document.getElementById("btn-clear-history-all");

  // Load history from LocalStorage
  const stored = localStorage.getItem("slt_bridge_history");
  if (stored) {
    state.history = JSON.parse(stored);
  }

  renderHistoryTable();

  clearBtn.addEventListener("click", () => {
    if (confirm("Are you sure you want to delete all translation logs?")) {
      state.history = [];
      localStorage.setItem("slt_bridge_history", JSON.stringify(state.history));
      renderHistoryTable();
    }
  });
}

function saveToHistory(text, mode) {
  if (!text || text.trim() === "") return;

  const item = {
    id: Date.now().toString(),
    text: text.trim(),
    mode: mode,
    timestamp: new Date().toLocaleString()
  };

  state.history.unshift(item); // Add to beginning of array
  localStorage.setItem("slt_bridge_history", JSON.stringify(state.history));
  renderHistoryTable();
}

function renderHistoryTable() {
  const container = document.getElementById("history-items-list");
  const noHistoryPlaceholder = document.getElementById("no-history-placeholder");
  
  // Clear existing items but preserve placeholder if list empty
  const itemRows = container.querySelectorAll(".history-item-row");
  itemRows.forEach(row => row.remove());

  if (state.history.length === 0) {
    noHistoryPlaceholder.classList.remove("hidden");
    return;
  }

  noHistoryPlaceholder.classList.add("hidden");

  state.history.forEach(item => {
    const row = document.createElement("div");
    row.className = "history-item-row";
    row.innerHTML = `
      <div class="col-text">${item.text}</div>
      <div class="col-mode">
        <span class="badge ${item.mode === "Healthcare" ? "badge-teal" : "badge-primary"}">${item.mode}</span>
      </div>
      <div class="col-date">${item.timestamp}</div>
      <div class="col-actions">
        <button class="history-action-btn play" title="Speak" data-id="${item.id}">
          <span class="material-symbols-rounded">volume_up</span>
        </button>
        <button class="history-action-btn delete" title="Delete" data-id="${item.id}">
          <span class="material-symbols-rounded">delete</span>
        </button>
      </div>
    `;

    // Add listeners
    row.querySelector(".play").addEventListener("click", () => speakText(item.text));
    row.querySelector(".delete").addEventListener("click", () => deleteHistoryItem(item.id));

    container.appendChild(row);
  });
}

function deleteHistoryItem(id) {
  state.history = state.history.filter(item => item.id !== id);
  localStorage.setItem("slt_bridge_history", JSON.stringify(state.history));
  renderHistoryTable();
}

// ==========================================================================
// HEALTHCARE PRESETS BOARD
// ==========================================================================
function initHealthcareBoard() {
  const categoryBtns = document.querySelectorAll(".med-cat-btn");
  const phraseTitle = document.getElementById("med-category-title");
  
  // Initial load
  loadMedicalPhrases("general");

  categoryBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      categoryBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      
      const cat = btn.getAttribute("data-category");
      phraseTitle.textContent = `${btn.textContent.trim()} Phrases`;
      loadMedicalPhrases(cat);
    });
  });
}

function loadMedicalPhrases(category) {
  const grid = document.getElementById("medical-phrases-grid");
  grid.innerHTML = "";

  const phrases = MEDICAL_PHRASES[category] || [];
  
  phrases.forEach(phrase => {
    const card = document.createElement("div");
    card.className = "phrase-card";
    card.innerHTML = `
      <div class="phrase-content">
        <p class="phrase-eng">"${phrase.eng}"</p>
        <p class="phrase-gsl">GSL: ${phrase.gsl}</p>
      </div>
      <div class="phrase-footer">
        <span class="badge badge-teal">Click to Speak</span>
        <span class="material-symbols-rounded">volume_up</span>
      </div>
    `;

    card.addEventListener("click", () => {
      speakText(phrase.eng);
      
      if (state.role === "signer") {
        const translatorText = document.getElementById("translated-sentence");
        translatorText.value = phrase.eng;
        
        // Auto broadcast if in a live session
        broadcastSignerTranslation(phrase.eng);
      }
    });

    grid.appendChild(card);
  });
}

// ==========================================================================
// GSL DICTIONARY & LEARN
// ==========================================================================
function initDictionary() {
  const searchInput = document.getElementById("dictionary-search-input");
  const filterTabs = document.querySelectorAll(".filter-tab");
  
  renderDictionary("all");

  // Search input filtering
  searchInput.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase();
    const activeTab = document.querySelector(".filter-tab.active").getAttribute("data-filter");
    renderDictionary(activeTab, query);
  });

  // Category filter tabs
  filterTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      filterTabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      
      const filter = tab.getAttribute("data-filter");
      renderDictionary(filter, searchInput.value.toLowerCase());
    });
  });
}

function renderDictionary(filter, query = "") {
  const grid = document.getElementById("dictionary-cards-grid");
  grid.innerHTML = "";

  const filtered = DICTIONARY_ENTRIES.filter(entry => {
    const matchesFilter = filter === "all" || entry.category === filter;
    const matchesQuery = entry.word.toLowerCase().includes(query) || entry.desc.toLowerCase().includes(query);
    return matchesFilter && matchesQuery;
  });

  filtered.forEach(entry => {
    const card = document.createElement("div");
    card.className = "dict-card";
    card.innerHTML = `
      <div class="dict-card-header">
        <span class="dict-category">${entry.category}</span>
        <span class="material-symbols-rounded dict-icon">visibility</span>
      </div>
      <div class="dict-title">${entry.word}</div>
      <div class="dict-instruction-summary">${entry.desc}</div>
    `;

    card.addEventListener("click", () => showDictionaryModal(entry));
    grid.appendChild(card);
  });
}

// Modal reference visuals
function showDictionaryModal(entry) {
  const modal = document.getElementById("dictionary-detail-modal");
  const title = document.getElementById("modal-sign-title");
  const cat = document.getElementById("modal-sign-category");
  const instruction = document.getElementById("modal-sign-instruction");
  const fingerList = document.getElementById("modal-finger-indicators-list");
  const speakBtn = document.getElementById("modal-btn-speak");

  title.textContent = `Sign for "${entry.word}"`;
  cat.textContent = entry.category.toUpperCase();
  cat.className = `badge ${entry.category === "medical" ? "badge-teal" : "badge-primary"}`;
  instruction.textContent = entry.desc;

  speakBtn.onclick = () => speakText(entry.word);

  fingerList.innerHTML = "";
  const shapesData = DICTIONARY_SHAPES[entry.jointsKey];
  
  if (shapesData) {
    let descriptors = [];
    if (entry.word === "A") descriptors = ["Thumb: Extended upright", "Index: Folded", "Middle: Folded", "Ring: Folded", "Pinky: Folded"];
    else if (entry.word === "B") descriptors = ["Thumb: Folded across palm", "Index: Extended straight", "Middle: Extended straight", "Ring: Extended straight", "Pinky: Extended straight"];
    else if (entry.word === "C") descriptors = ["Thumb: Curved", "Index: Curved", "Middle: Curved", "Ring: Curved", "Pinky: Curved"];
    else if (entry.word === "D") descriptors = ["Thumb: Closed to other fingers", "Index: Extended straight up", "Middle: Folded", "Ring: Folded", "Pinky: Folded"];
    else if (entry.word === "E") descriptors = ["Thumb: Tucked at bottom of fingertips", "Index: Curled", "Middle: Curled", "Ring: Curled", "Pinky: Curled"];
    else if (entry.word === "F") descriptors = ["Thumb: Touching index tip", "Index: Touching thumb tip", "Middle: Extended straight", "Ring: Extended straight", "Pinky: Extended straight"];
    else if (entry.word === "G") descriptors = ["Thumb: Extended parallel", "Index: Extended horizontal", "Middle: Folded", "Ring: Folded", "Pinky: Folded"];
    else if (entry.word === "H") descriptors = ["Thumb: Folded", "Index: Extended horizontal", "Middle: Extended horizontal", "Ring: Folded", "Pinky: Folded"];
    else if (entry.word === "I") descriptors = ["Thumb: Folded", "Index: Folded", "Middle: Folded", "Ring: Folded", "Pinky: Extended straight up"];
    else if (entry.word === "J") descriptors = ["Thumb: Folded", "Index: Folded", "Middle: Folded", "Ring: Folded", "Pinky: Extended with J motion"];
    else if (entry.word === "K") descriptors = ["Thumb: Touching middle joint", "Index: Extended up", "Middle: Angled forward", "Ring: Folded", "Pinky: Folded"];
    else if (entry.word === "L") descriptors = ["Thumb: Extended wide", "Index: Extended straight up", "Middle: Folded", "Ring: Folded", "Pinky: Folded"];
    else if (entry.word === "M") descriptors = ["Thumb: Tucked under 3 fingers", "Index: Draped", "Middle: Draped", "Ring: Draped", "Pinky: Folded"];
    else if (entry.word === "N") descriptors = ["Thumb: Tucked under 2 fingers", "Index: Draped", "Middle: Draped", "Ring: Folded", "Pinky: Folded"];
    else if (entry.word === "O") descriptors = ["Thumb: Touching fingertips", "Index: Curved to thumb", "Middle: Curved to thumb", "Ring: Curved to thumb", "Pinky: Curved to thumb"];
    else if (entry.word === "P") descriptors = ["Thumb: Touching middle joint", "Index: Extended pointing down", "Middle: Angled down", "Ring: Folded", "Pinky: Folded"];
    else if (entry.word === "Q") descriptors = ["Thumb: Extended pointing down", "Index: Extended pointing down", "Middle: Folded", "Ring: Folded", "Pinky: Folded"];
    else if (entry.word === "R") descriptors = ["Thumb: Folded", "Index: Extended crossed", "Middle: Extended crossed over index", "Ring: Folded", "Pinky: Folded"];
    else if (entry.word === "S") descriptors = ["Thumb: Wrapped across front", "Index: Folded into fist", "Middle: Folded into fist", "Ring: Folded into fist", "Pinky: Folded into fist"];
    else if (entry.word === "T") descriptors = ["Thumb: Tucked under index", "Index: Folded over thumb", "Middle: Folded", "Ring: Folded", "Pinky: Folded"];
    else if (entry.word === "U") descriptors = ["Thumb: Folded", "Index: Extended together", "Middle: Extended together", "Ring: Folded", "Pinky: Folded"];
    else if (entry.word === "V") descriptors = ["Thumb: Folded", "Index: Extended spread", "Middle: Extended spread", "Ring: Folded", "Pinky: Folded"];
    else if (entry.word === "W") descriptors = ["Thumb: Folded", "Index: Extended spread", "Middle: Extended spread", "Ring: Extended spread", "Pinky: Folded"];
    else if (entry.word === "X") descriptors = ["Thumb: Folded", "Index: Bent into hook crook", "Middle: Folded", "Ring: Folded", "Pinky: Folded"];
    else if (entry.word === "Y") descriptors = ["Thumb: Extended wide", "Index: Folded", "Middle: Folded", "Ring: Folded", "Pinky: Extended wide"];
    else if (entry.word === "Z") descriptors = ["Thumb: Folded", "Index: Extended tracing Z", "Middle: Folded", "Ring: Folded", "Pinky: Folded"];
    else if (entry.word === "I Love You") descriptors = ["Thumb: Extended", "Index: Extended", "Middle: Folded", "Ring: Folded", "Pinky: Extended"];
    else descriptors = ["All tracking nodes are monitored in real-time"];

    descriptors.forEach(desc => {
      const li = document.createElement("li");
      li.className = desc.includes("Extended") ? "active" : "";
      li.innerHTML = `
        <span class="material-symbols-rounded">
          ${desc.includes("Extended") ? "check_circle" : "radio_button_unchecked"}
        </span>
        <span>${desc}</span>
      `;
      fingerList.appendChild(li);
    });

    drawReferenceSkeleton(shapesData.joints);
  }

  modal.classList.remove("hidden");
}

function drawReferenceSkeleton(joints) {
  const canvas = document.getElementById("modal-reference-canvas");
  const ctx = canvas.getContext("2d");
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.strokeStyle = state.theme === "dark" ? "#6366f1" : "#4f46e5";
  ctx.shadowBlur = 6;
  ctx.shadowColor = ctx.strokeStyle;

  const bones = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [0, 9], [9, 10], [10, 11], [11, 12],
    [0, 13], [13, 14], [14, 15], [15, 16],
    [0, 17], [17, 18], [18, 19], [19, 20],
    [5, 9], [9, 13], [13, 17]
  ];

  bones.forEach(([from, to]) => {
    const p1 = joints[from];
    const p2 = joints[to];
    if (p1 && p2) {
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
  });

  joints.forEach((joint, idx) => {
    ctx.beginPath();
    ctx.arc(joint.x, joint.y, [4, 8, 12, 16, 20].includes(idx) ? 5 : 3.5, 0, 2 * Math.PI);
    ctx.fillStyle = [4, 8, 12, 16, 20].includes(idx) ? "#a855f7" : "#ffffff";
    ctx.fill();
  });

  ctx.restore();
}

// ==========================================================================
// REAL-TIME TRANSLATOR PANEL ORCHESTRATOR
// ==========================================================================
function initTranslatorPanel() {
  const btnStartCamera = document.getElementById("btn-start-camera");
  const btnStopCamera = document.getElementById("btn-stop-camera");
  const cameraPlaceholder = document.getElementById("camera-placeholder");
  const webcam = document.getElementById("webcam");
  const outputCanvas = document.getElementById("output_canvas");
  const hudOverlay = document.getElementById("gesture-hud");

  const voiceBtn = document.getElementById("btn-speak");
  const copyBtn = document.getElementById("btn-copy");
  const clearTextBtn = document.getElementById("btn-clear-sentence");
  const saveBtn = document.getElementById("btn-save-history");
  const sentenceTextarea = document.getElementById("translated-sentence");
  
  const currentGestureText = document.getElementById("current-gesture-text");
  const confidenceBar = document.getElementById("confidence-bar");
  
  const hModeToggle = document.getElementById("healthcare-mode-toggle");
  const modeBadge = document.getElementById("translator-mode-badge");

  // Instantiation options
  const config = {
    videoElement: webcam,
    canvasElement: outputCanvas,
    minConfidence: parseFloat(document.getElementById("min-confidence-slider").value) || 0.5,
    overlayColor: document.getElementById("overlay-color-select").value,
    facingMode: document.getElementById("camera-select").value,
    onStatus: (status, message) => {
      const indicator = document.getElementById("camera-status-indicator");
      if (indicator) {
        indicator.className = `status-indicator ${status}`;
        indicator.querySelector(".text").textContent = message;
      }
      
      const hudStatus = document.getElementById("hud-status");
      if (hudStatus) hudStatus.textContent = `Status: ${message}`;
    },
    onResult: (results) => {
      if (results.handDetected) {
        currentGestureText.textContent = `${results.gesture} (${Math.round(results.confidence * 100)}%)`;
        confidenceBar.style.width = `${results.confidence * 100}%`;
        
        const hudHand = document.getElementById("hud-hand");
        if (hudHand) hudHand.textContent = `Hand: ${results.handedness.toUpperCase()}`;

        // Stabilize and append prediction to sentence output
        if (results.gesture !== "Searching..." && results.gesture !== "No hand" && results.confidence > 0.8) {
          if (results.gesture === state.lastStableGesture) {
            state.gestureStableCount++;
            
            if (state.gestureStableCount === state.requiredStabilityFrames) {
              appendGestureToText(results.gesture);
            }
          } else {
            state.lastStableGesture = results.gesture;
            state.gestureStableCount = 0;
          }
        }
      } else {
        currentGestureText.textContent = "Waiting for Hand...";
        confidenceBar.style.width = "0%";
        
        const hudHand = document.getElementById("hud-hand");
        if (hudHand) hudHand.textContent = "Hand: NONE";
        
        state.lastStableGesture = "";
        state.gestureStableCount = 0;
      }
    }
  };

  // Instantiate GSL translator class
  state.translator = new GSLTranslator(config);

  // Bind settings listeners
  document.getElementById("min-confidence-slider").addEventListener("input", (e) => {
    document.getElementById("min-confidence-value").textContent = e.target.value;
    if (state.translator) {
      state.translator.minConfidence = parseFloat(e.target.value);
      state.translator.updateConfig();
    }
  });

  document.getElementById("camera-select").addEventListener("change", (e) => {
    if (state.translator) {
      state.translator.facingMode = e.target.value;
      if (state.translator.isActive) {
        state.translator.stop();
        state.translator.start();
      }
    }
  });

  document.getElementById("overlay-color-select").addEventListener("change", (e) => {
    if (state.translator) {
      state.translator.overlayColor = e.target.value;
    }
  });

  document.getElementById("setting-draw-skeleton").addEventListener("change", (e) => {
    if (state.translator) {
      state.translator.drawSkeletonEnabled = e.target.checked;
    }
  });

  document.getElementById("setting-show-hud").addEventListener("change", (e) => {
    if (state.translator) {
      state.translator.showHudEnabled = e.target.checked;
      if (e.target.checked) {
        hudOverlay.classList.remove("hidden");
      } else {
        hudOverlay.classList.add("hidden");
      }
    }
  });

  // Toggle Healthcare Mode
  hModeToggle.addEventListener("change", (e) => {
    const panels = document.querySelectorAll(".translator-output-panel, .translator-input-panel");
    if (e.target.checked) {
      state.translator.isHealthcareMode = true;
      modeBadge.textContent = "Healthcare Mode";
      modeBadge.className = "mode-badge medical";
      panels.forEach(p => p.classList.add("healthcare-theme"));
    } else {
      state.translator.isHealthcareMode = false;
      modeBadge.textContent = "Conversational Mode";
      modeBadge.className = "mode-badge";
      panels.forEach(p => p.classList.remove("healthcare-theme"));
    }
  });

  // Append committed prediction
  function appendGestureToText(gesture) {
    let currentVal = sentenceTextarea.value.trim();
    
    if (gesture.length === 1) {
      sentenceTextarea.value = currentVal + gesture;
    } else {
      sentenceTextarea.value = currentVal ? `${currentVal} ${gesture}` : gesture;
    }
    
    // Subtle flash border commit feedback
    sentenceTextarea.style.borderColor = state.translator.isHealthcareMode ? "#14b8a6" : "#a855f7";
    setTimeout(() => {
      sentenceTextarea.style.borderColor = "var(--surface-border)";
    }, 300);

    // Speak committed word
    speakText(gesture);

    // Broadcast translation to viewers
    broadcastSignerTranslation(sentenceTextarea.value);
  }

  // Camera Activation Events
  const triggerStartCamera = async () => {
    cameraPlaceholder.classList.add("hidden");
    btnStartCamera.classList.add("hidden");
    btnStopCamera.classList.remove("hidden");
    hudOverlay.classList.remove("hidden");
    
    try {
      await state.translator.start();
    } catch (err) {
      btnStartCamera.classList.remove("hidden");
      btnStopCamera.classList.add("hidden");
      cameraPlaceholder.classList.remove("hidden");
      hudOverlay.classList.add("hidden");
    }
  };

  btnStartCamera.addEventListener("click", triggerStartCamera);
  document.getElementById("camera-placeholder").querySelector(".btn").addEventListener("click", triggerStartCamera);

  btnStopCamera.addEventListener("click", () => {
    state.translator.stop();
    btnStartCamera.classList.remove("hidden");
    btnStopCamera.classList.add("hidden");
    cameraPlaceholder.classList.remove("hidden");
    hudOverlay.classList.add("hidden");
  });

  // Action Buttons
  voiceBtn.addEventListener("click", () => {
    speakText(sentenceTextarea.value);
  });

  copyBtn.addEventListener("click", () => {
    sentenceTextarea.select();
    navigator.clipboard.writeText(sentenceTextarea.value);
    
    const origIcon = copyBtn.querySelector("span").textContent;
    copyBtn.querySelector("span").textContent = "check";
    setTimeout(() => {
      copyBtn.querySelector("span").textContent = origIcon;
    }, 1500);
  });

  clearTextBtn.addEventListener("click", () => {
    sentenceTextarea.value = "";
    broadcastSignerTranslation("");
  });

  // Bind keyup to manual typing in text area to sync manually typed words!
  sentenceTextarea.addEventListener("keyup", (e) => {
    broadcastSignerTranslation(e.target.value);
  });

  saveBtn.addEventListener("click", () => {
    const text = sentenceTextarea.value.trim();
    if (text) {
      const mode = state.translator.isHealthcareMode ? "Healthcare" : "Conversational";
      saveToHistory(text, mode);
      
      const origText = saveBtn.innerHTML;
      saveBtn.innerHTML = `<span class="material-symbols-rounded">check</span> Saved`;
      setTimeout(() => {
        saveBtn.innerHTML = origText;
      }, 1500);
    }
  });
}

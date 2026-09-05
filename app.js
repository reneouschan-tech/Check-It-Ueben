const els = {
  stage1: document.querySelector("#stage1Count"),
  stage2: document.querySelector("#stage2Count"),
  stage3: document.querySelector("#stage3Count"),
  goalText: document.querySelector("#goalText"),
  progressBar: document.querySelector("#progressBar"),
  mode: document.querySelector("#modeSelect"),
  search: document.querySelector("#searchInput"),
  shuffle: document.querySelector("#shuffleToggle"),
  next: document.querySelector("#nextBtn"),
  reset: document.querySelector("#resetBtn"),
  mobileNextBtn: document.querySelector("#mobileNextBtn"),
  datasetInfo: document.querySelector("#datasetInfo"),
  meta: document.querySelector("#questionMeta"),
  title: document.querySelector("#questionTitle"),
  badge: document.querySelector("#stageBadge"),
  empty: document.querySelector("#emptyState"),
  area: document.querySelector("#questionArea"),
  questionImage: document.querySelector("#questionImage"),
  solutionImage: document.querySelector("#solutionImage"),
  options: document.querySelector("#optionList"),
  submit: document.querySelector("#submitBtn"),
  feedback: document.querySelector("#feedback"),
  solution: document.querySelector("#solutionDetails"),
  manual: document.querySelector("#manualCheck"),
  showSolution: document.querySelector("#showSolutionBtn"),
  manualRight: document.querySelector("#manualRightBtn"),
  manualWrong: document.querySelector("#manualWrongBtn"),
};

let dataset = null;
let progress = {};
let current = null;
let selected = new Set();
let answered = false;
let assetVersion = Date.now();
const answerImageCache = new Map();
const INITIAL_DATASET_URL = `data/questions.json?ts=${Date.now()}`;

window.addEventListener("error", (event) => {
  els.title.textContent = "Startfehler";
  els.meta.textContent = event.message || "Unbekannter Fehler";
});

function storageKey() {
  const source = dataset?.source || "custom";
  const count = dataset?.questions?.length || 0;
  return `ett-trainer:${source}:${count}`;
}

function freshProgress() {
  const next = {};
  for (const question of dataset.questions) {
    next[question.id] = { stage: 1, attempts: 0, correct: 0, wrong: 0 };
  }
  return next;
}

function loadProgress() {
  const raw = localStorage.getItem(storageKey());
  progress = raw ? JSON.parse(raw) : freshProgress();
  for (const question of dataset.questions) {
    progress[question.id] ||= { stage: 1, attempts: 0, correct: 0, wrong: 0 };
  }
}

function saveProgress() {
  localStorage.setItem(storageKey(), JSON.stringify(progress));
}

function getState(question) {
  return progress[question.id] || { stage: 1, attempts: 0, correct: 0, wrong: 0 };
}

function updateStats() {
  const counts = { 1: 0, 2: 0, 3: 0 };
  for (const question of dataset.questions) counts[getState(question).stage] += 1;
  const total = dataset.questions.length || 1;
  const done = counts[3];
  const pct = Math.round((done / total) * 100);
  els.stage1.textContent = counts[1];
  els.stage2.textContent = counts[2];
  els.stage3.textContent = counts[3];
  els.goalText.textContent = `${pct}%`;
  els.progressBar.style.width = `${pct}%`;
  els.datasetInfo.textContent = `${dataset.title || "Fragensatz"} - ${dataset.questions.length} Fragen`;
}

function filteredQuestions() {
  const term = els.search.value.trim().toLowerCase();
  return dataset.questions.filter((question) => {
    const state = getState(question);
    const text = `${question.id} ${question.question} ${question.type}`.toLowerCase();
    const matchesSearch = !term || text.includes(term);
    const mode = els.mode.value;
    const matchesMode =
      mode === "all" ||
      (mode === "due" && state.stage < 3) ||
      (mode === "first" && state.attempts === 0) ||
      (mode === "stage1" && state.stage === 1) ||
      (mode === "stage2" && state.stage === 2) ||
      (mode === "stage3" && state.stage === 3);
    return matchesSearch && matchesMode;
  });
}

function pickQuestion() {
  const pool = filteredQuestions();
  if (!pool.length) return null;
  if (els.shuffle.checked) return pool[Math.floor(Math.random() * pool.length)];
  if (!current) return pool[0];
  const index = pool.findIndex((question) => question.id === current.id);
  return pool[(index + 1 + pool.length) % pool.length];
}

function renderQuestion(question) {
  current = question;
  selected = new Set();
  answered = false;
  const state = getState(question);
  const hasOptions = question.options && question.options.length;

  els.empty.hidden = true;
  els.area.hidden = false;
  els.feedback.hidden = true;
  els.feedback.className = "feedback";
  els.solution.open = false;
  els.meta.textContent = `FrageID ${question.id} - Seite ${question.page} - ${question.type}`;
  els.title.textContent = question.question || "Frage aus der PDF";
  els.badge.textContent = `Stufe ${state.stage}`;
  els.questionImage.src = withVersion(question.questionImage);
  els.solutionImage.src = withVersion(question.solutionImage);
  els.submit.hidden = !hasOptions;
  els.submit.disabled = true;
  els.manual.hidden = hasOptions;
  els.options.innerHTML = "";

  if (!hasOptions) return;

  const multiple = !question.type.toLowerCase().includes("single");
  for (const option of question.options) {
    const button = document.createElement("div");
    button.className = "option";
    button.role = "button";
    button.tabIndex = 0;
    button.dataset.label = option.label;
    const letter = document.createElement("span");
    letter.className = "letter";
    letter.textContent = option.label;
    const content = document.createElement("span");
    content.className = "option-content";
    content.textContent = option.text || "";
    button.append(letter, content);
    button.addEventListener("click", () => {
      if (answered) return;
      if (multiple) {
        selected.has(option.label) ? selected.delete(option.label) : selected.add(option.label);
      } else {
        selected = new Set([option.label]);
      }
      renderSelection();
    });
    button.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      button.click();
    });
    els.options.appendChild(button);
  }
}

function withVersion(path) {
  return `${path}?v=${assetVersion}`;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function findContentBounds(image) {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || !canvas.width || !canvas.height) return null;
  ctx.drawImage(image, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a === 0) continue;
      if (r < 245 || g < 245 || b < 245) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0 || maxY < 0) return null;
  const pad = 16;
  const x = Math.max(0, minX - pad);
  const y = Math.max(0, minY - pad);
  const x2 = Math.min(width, maxX + pad + 1);
  const y2 = Math.min(height, maxY + pad + 1);
  return {
    x,
    y,
    width: Math.max(1, x2 - x),
    height: Math.max(1, y2 - y),
  };
}

async function setCroppedAnswerImage(imgEl, src) {
  try {
    if (!answerImageCache.has(src)) {
      answerImageCache.set(
        src,
        (async () => {
          const image = await loadImage(src);
          const bounds = findContentBounds(image);
          if (!bounds) return src;
          const canvas = document.createElement("canvas");
          canvas.width = bounds.width;
          canvas.height = bounds.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) return src;
          ctx.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
          return canvas.toDataURL("image/jpeg", 0.95);
        })().catch(() => src)
      );
    }
    const cropped = await answerImageCache.get(src);
    if (imgEl.isConnected && cropped) {
      imgEl.src = cropped;
    }
  } catch {
    // Keep the original image if cropping fails.
  }
}

function renderSelection() {
  for (const button of els.options.querySelectorAll(".option")) {
    button.classList.toggle("selected", selected.has(button.dataset.label));
  }
  els.submit.disabled = selected.size === 0;
}

function isCorrect(question) {
  const correct = new Set(question.options.filter((option) => option.correct).map((option) => option.label));
  return selected.size === correct.size && [...selected].every((label) => correct.has(label));
}

function applyResult(question, correct) {
  const state = getState(question);
  state.attempts += 1;
  if (correct) {
    state.correct += 1;
    if (state.stage === 1 || state.stage === 2) state.stage = 3;
    else state.stage = 3;
  } else {
    state.wrong += 1;
    if (state.stage === 1) {
      state.stage = 2;
    } else if (state.stage === 2) {
      state.stage = 1;
    } else {
      state.stage = 2;
    }
  }
  progress[question.id] = state;
  saveProgress();
  updateStats();
  els.badge.textContent = `Stufe ${state.stage}`;
}

function submitAnswer() {
  if (!current || answered) return;
  answered = true;
  const correct = isCorrect(current);
  applyResult(current, correct);

  const correctLabels = current.options.filter((option) => option.correct).map((option) => option.label).join(", ");
  for (const button of els.options.querySelectorAll(".option")) {
    const option = current.options.find((item) => item.label === button.dataset.label);
    button.classList.toggle("correct", option.correct);
    button.classList.toggle("wrong", selected.has(option.label) && !option.correct);
  }

  els.feedback.hidden = false;
  els.feedback.classList.add(correct ? "good" : "bad");
  els.feedback.textContent = correct
    ? "Richtig. Die Frage wurde entsprechend hochgestuft."
    : `Falsch. Richtig waere: ${correctLabels}. Die Frage ist jetzt in Stufe ${getState(current).stage}.`;
  els.submit.disabled = true;
}

function showEmpty() {
  const term = els.search.value.trim();
  const questions = dataset?.questions || [];
  const allInStage3 = questions.length > 0 && questions.every((question) => getState(question).stage === 3);
  const hasSearchTerm = term.length > 0;

  els.area.hidden = true;
  els.empty.hidden = false;
  els.meta.textContent = hasSearchTerm ? "Keine Suchtreffer" : "Keine passende Frage";
  els.title.textContent = hasSearchTerm
    ? "Keine Fragen gefunden"
    : allInStage3
      ? "Alles in Stufe 3."
      : "Runde abgeschlossen";
  els.badge.textContent = hasSearchTerm ? "Suche" : allInStage3 ? "Fertig" : "Leer";

  const emptyTitle = els.empty.querySelector("h2");
  const emptyText = els.empty.querySelector("p");
  if (emptyTitle && emptyText) {
    if (hasSearchTerm) {
      emptyTitle.textContent = "Keine Fragen gefunden";
      emptyText.textContent = "Zu deiner Suche gibt es keine Treffer. Probiere eine andere FrageID oder einen anderen Text.";
    } else if (allInStage3) {
      emptyTitle.textContent = "Alles in Stufe 3.";
      emptyText.textContent = "Du hast das Ziel erreicht. Du kannst weiter alle Fragen wiederholen oder den Fortschritt zuruecksetzen.";
    } else {
      emptyTitle.textContent = "Runde abgeschlossen";
      emptyText.textContent = "Es gibt in dieser Runde keine passende Frage.";
    }
  }
}

function nextQuestion() {
  const question = pickQuestion();
  question ? renderQuestion(question) : showEmpty();
}

async function loadDataset(data, freshAssets = false) {
  if (freshAssets) assetVersion = Date.now();
  dataset = data;
  loadProgress();
  updateStats();
  nextQuestion();
}

function setStandaloneMode() {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
  document.body.classList.toggle("standalone", standalone);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return Promise.resolve();
  return navigator.serviceWorker.register("sw.js").catch(() => {});
}

els.submit.addEventListener("click", submitAnswer);
els.next.addEventListener("click", nextQuestion);
els.mobileNextBtn?.addEventListener("click", nextQuestion);
els.mode.addEventListener("change", nextQuestion);
els.search.addEventListener("input", nextQuestion);
els.shuffle.addEventListener("change", nextQuestion);
els.showSolution.addEventListener("click", () => {
  els.solution.open = true;
});
els.manualRight.addEventListener("click", () => {
  if (!current || answered) return;
  answered = true;
  applyResult(current, true);
  els.feedback.hidden = false;
  els.feedback.className = "feedback good";
  els.feedback.textContent = "Als gewusst bewertet. Die Frage wurde entsprechend hochgestuft.";
});
els.manualWrong.addEventListener("click", () => {
  if (!current || answered) return;
  answered = true;
  applyResult(current, false);
  els.feedback.hidden = false;
  els.feedback.className = "feedback bad";
  els.feedback.textContent = `Als nicht gewusst bewertet. Die Frage ist jetzt in Stufe ${getState(current).stage}.`;
});
els.reset.addEventListener("click", () => {
  if (!dataset || !confirm("Fortschritt fuer diesen Fragensatz wirklich loeschen?")) return;
  progress = freshProgress();
  saveProgress();
  updateStats();
  nextQuestion();
});
async function clearServiceWorkerState() {
  if ("serviceWorker" in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    } catch {
      // Best effort only.
    }
  }

  if ("caches" in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    } catch {
      // Best effort only.
    }
  }
}

async function boot() {
  setStandaloneMode();
  await clearServiceWorkerState();

  try {
    const response = await fetch(INITIAL_DATASET_URL, { cache: "no-store" });
    const dataset = await response.json();
    await loadDataset(dataset);
  } catch (error) {
    els.title.textContent = "Fragen konnten nicht geladen werden";
    els.meta.textContent = location.protocol === "file:" ? "Bitte ueber http://localhost:8765/ oeffnen" : error.message;
  } finally {
    registerServiceWorker();
  }
}

boot();

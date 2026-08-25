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
  importBtn: document.querySelector("#importBtn"),
  import: document.querySelector("#importInput"),
  installBtn: document.querySelector("#installBtn"),
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
  codeDialog: document.querySelector("#codeDialog"),
  codeInput: document.querySelector("#codeInput"),
  codeError: document.querySelector("#codeError"),
  codeCancel: document.querySelector("#codeCancelBtn"),
  codeConfirm: document.querySelector("#codeConfirmBtn"),
};

const IMPORT_CODE = "checkit2026";

let dataset = null;
let progress = {};
let current = null;
let selected = new Set();
let answered = false;
let assetVersion = Date.now();
let deferredInstallPrompt = null;
let pendingCodeAction = null;
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
    button.innerHTML = `
      <span class="letter">${option.label}</span>
      <span class="option-content">
        ${option.image ? `<img src="${withVersion(option.image)}" alt="Antwort ${option.label}" />` : `<span>${option.text}</span>`}
      </span>
    `;
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
  els.area.hidden = true;
  els.empty.hidden = false;
  els.meta.textContent = "Keine passende Frage";
  els.title.textContent = "Runde abgeschlossen";
  els.badge.textContent = "Fertig";
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

async function importPdf(file) {
  if (location.protocol === "file:") {
    throw new Error("PDF-Import funktioniert nur ueber http://localhost:8765/. Bitte Check It ueber die Startdatei oder den lokalen Server oeffnen.");
  }
  const body = new FormData();
  body.append("pdf", file);
  els.importBtn.disabled = true;
  els.importBtn.textContent = "PDF wird umgewandelt...";
  try {
    const response = await fetch("/api/import-pdf", {
      method: "POST",
      body,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "PDF konnte nicht importiert werden.");
    await loadDataset(result.dataset, true);
    alert(`PDF importiert: ${result.count} Fragen geladen.`);
  } finally {
    els.importBtn.disabled = false;
    els.importBtn.textContent = "PDF/Fragensatz importieren (Codegeschuetzt)";
  }
}

async function handleImportedFile(file) {
  if (!file) return;
  if (file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf") {
    await importPdf(file);
    return;
  }
  const data = JSON.parse(await file.text());
  await loadDataset(data, true);
}

function openImportPicker() {
  if (typeof window.showOpenFilePicker === "function") {
    window
      .showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: "PDF oder JSON",
            accept: {
              "application/pdf": [".pdf"],
              "application/json": [".json"],
            },
          },
        ],
      })
      .then(([handle]) => handle.getFile())
      .then((file) => handleImportedFile(file))
      .catch((error) => {
        if (error?.name === "AbortError") return;
        els.import.value = "";
        els.import.click();
      });
    return;
  }

  els.import.value = "";
  els.import.click();
}

function openCodeDialog(onSuccess) {
  pendingCodeAction = onSuccess;
  if (!els.codeDialog) return;
  els.codeError.hidden = true;
  els.codeInput.value = "";
  els.codeDialog.hidden = false;
  window.setTimeout(() => els.codeInput.focus(), 0);
}

function closeCodeDialog() {
  pendingCodeAction = null;
  if (els.codeDialog) {
    els.codeDialog.hidden = true;
  }
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return Promise.resolve();
  return navigator.serviceWorker.register("sw.js").catch(() => {});
}

function setupInstallPrompt() {
  if (!els.installBtn) return;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
  });

  els.installBtn.addEventListener("click", async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      return;
    }

    alert(
      "Die App kann ueber das Browser-Menue installiert werden. In Chrome auf dem Handy: Menue oeffnen und 'App installieren' oder 'Zum Startbildschirm hinzufuegen' waehlen."
    );
  });
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
els.importBtn.addEventListener("click", () => {
  openCodeDialog(openImportPicker);
});
els.codeCancel?.addEventListener("click", closeCodeDialog);
els.codeConfirm?.addEventListener("click", () => {
  const code = els.codeInput.value.trim();
  if (code !== IMPORT_CODE) {
    els.codeError.hidden = false;
    els.codeInput.focus();
    return;
  }
  const action = pendingCodeAction;
  closeCodeDialog();
  action?.();
});
els.codeInput?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  els.codeConfirm.click();
});
els.codeDialog?.addEventListener("click", (event) => {
  if (event.target === els.codeDialog) closeCodeDialog();
});
els.import.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  try {
    await handleImportedFile(file);
  } catch (error) {
    alert(error.message);
  } finally {
    event.target.value = "";
  }
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
  setupInstallPrompt();
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

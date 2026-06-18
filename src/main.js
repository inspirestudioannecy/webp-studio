import { WorkerPool } from "./worker-pool.js";

const state = {
  items: [],
  isConverting: false,
  zipUrl: null,
  renameBarOpen: false,
  lastSignature: null,
  abort: false,
};

const elements = {
  dropZone: document.querySelector("#dropZone"),
  fileInput: document.querySelector("#fileInput"),
  folderInput: document.querySelector("#folderInput"),
  qualityBlock: document.querySelector("#qualityBlock"),
  qualityInput: document.querySelector("#qualityInput"),
  qualityValue: document.querySelector("#qualityValue"),
  losslessInput: document.querySelector("#losslessInput"),
  maxWidth: document.querySelector("#maxWidth"),
  maxHeight: document.querySelector("#maxHeight"),
  noUpscale: document.querySelector("#noUpscale"),
  convertButton: document.querySelector("#convertButton"),
  cancelButton: document.querySelector("#cancelButton"),
  zipButton: document.querySelector("#zipButton"),
  clearButton: document.querySelector("#clearButton"),
  totalCount: document.querySelector("#totalCount"),
  doneCount: document.querySelector("#doneCount"),
  gainValue: document.querySelector("#gainValue"),
  outputSize: document.querySelector("#outputSize"),
  progressWrap: document.querySelector("#progressWrap"),
  progressBar: document.querySelector("#progressBar"),
  progressLabel: document.querySelector("#progressLabel"),
  queueHint: document.querySelector("#queueHint"),
  emptyState: document.querySelector("#emptyState"),
  tableWrap: document.querySelector("#tableWrap"),
  queueBody: document.querySelector("#queueBody"),
  // comparateur
  compareModal: document.querySelector("#compareModal"),
  cmpTitle: document.querySelector("#cmpTitle"),
  cmpClose: document.querySelector("#cmpClose"),
  cmpViewport: document.querySelector("#cmpViewport"),
  cmpStage: document.querySelector("#cmpStage"),
  cmpBefore: document.querySelector("#cmpBefore"),
  cmpAfter: document.querySelector("#cmpAfter"),
  cmpBeforeWrap: document.querySelector("#cmpBeforeWrap"),
  cmpWipe: document.querySelector("#cmpWipe"),
  cmpZoom: document.querySelector("#cmpZoom"),
  cmpZoomVal: document.querySelector("#cmpZoomVal"),
  cmpFit: document.querySelector("#cmpFit"),
  cmp100: document.querySelector("#cmp100"),
  cmpMeta: document.querySelector("#cmpMeta"),
  cmpQuality: document.querySelector("#cmpQuality"),
  cmpQualityVal: document.querySelector("#cmpQualityVal"),
  cmpSpinner: document.querySelector("#cmpSpinner"),
};

const imageExtensions = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "avif",
  "svg",
  "bmp",
  "tif",
  "tiff",
  "heic",
  "heif",
]);

/* ---------- Thème Sombre/Clair ---------- */
const themeToggle = document.getElementById("themeToggle");
const sunIcon = themeToggle.querySelector(".sun-icon");
const moonIcon = themeToggle.querySelector(".moon-icon");

const getTheme = () => localStorage.getItem("theme") || "light";
const setTheme = (theme) => {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
  if (theme === "dark") {
    sunIcon.style.display = "block";
    moonIcon.style.display = "none";
  } else {
    sunIcon.style.display = "none";
    moonIcon.style.display = "block";
  }
};

themeToggle.addEventListener("click", () => {
  setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
});

setTheme(getTheme());

/* ---------- Support AVIF ---------- */
// L'encodage AVIF passe par le codec WASM @jsquash : il fonctionne dans tous les
// navigateurs modernes, indépendamment du support AVIF natif du <canvas>.
const avifSupportBadge = document.getElementById("avifSupportBadge");
const avifRadioLabel = document.getElementById("avifRadioLabel");

function checkAvifSupport() {
  const supportsWasm =
    typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined";
  if (supportsWasm) {
    avifSupportBadge.textContent = "supporté";
    avifSupportBadge.style.color = "var(--accent)";
    avifRadioLabel.title = "Encodage AVIF de qualité via codec intégré (WASM).";
    return;
  }
  // Très vieux navigateur sans worker : on tombe sur l'AVIF natif du canvas.
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  canvas.toBlob((blob) => {
    if (blob && blob.type === "image/avif") {
      avifSupportBadge.textContent = "supporté";
      avifSupportBadge.style.color = "var(--accent)";
    } else {
      avifSupportBadge.textContent = "non supporté";
      avifSupportBadge.style.color = "var(--red)";
      avifRadioLabel.querySelector("input").disabled = true;
      avifRadioLabel.title = "AVIF non supporté par ce navigateur.";
    }
  }, "image/avif");
}
checkAvifSupport();

/* ---------- décodeur HEIC ---------- */
// heic2any est bundlé (npm) : fonctionne hors-ligne, chargé à la demande.
// createImageBitmap ne sait pas lire le HEIC, on le pré-décode donc en PNG
// (sans perte) sur le thread principal avant de l'envoyer au worker.
let heicDecoder = null;

async function decodeHeic(file) {
  if (!heicDecoder) {
    const module = await import("heic2any");
    heicDecoder = module.default || module;
  }
  const decoded = await heicDecoder({
    blob: file,
    toType: "image/png",
  });
  return Array.isArray(decoded) ? decoded[0] : decoded;
}

/* ---------- réglages ---------- */

elements.qualityInput.addEventListener("input", () => {
  elements.qualityValue.textContent = elements.qualityInput.value;
});

elements.losslessInput.addEventListener("change", () => {
  elements.qualityBlock.classList.toggle(
    "is-off",
    elements.losslessInput.checked,
  );
});

function readSettings() {
  const maxW = parseInt(elements.maxWidth.value, 10);
  const maxH = parseInt(elements.maxHeight.value, 10);
  const formatInput = document.querySelector('input[name="outputFormat"]:checked');
  const concurrencyInput = document.getElementById("concurrencyInput");
  return {
    lossless: elements.losslessInput.checked,
    quality: Number(elements.qualityInput.value) / 100,
    maxWidth: Number.isFinite(maxW) && maxW > 0 ? maxW : null,
    maxHeight: Number.isFinite(maxH) && maxH > 0 ? maxH : null,
    noUpscale: elements.noUpscale.checked,
    format: formatInput ? formatInput.value : "image/webp",
    concurrency: concurrencyInput ? concurrencyInput.value : "auto",
  };
}

// « auto » = on s'adapte au nombre de cœurs logiques (borné pour rester sain).
function resolveConcurrency(value) {
  if (value === "auto" || value == null) {
    return Math.max(2, Math.min(navigator.hardwareConcurrency || 4, 8));
  }
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2;
}

// Signature des réglages globaux : si elle change entre deux conversions, on
// relance TOUT (les images déjà « done » sont remises en file).
function settingsSignature(settings) {
  return JSON.stringify([
    settings.lossless,
    settings.quality,
    settings.maxWidth,
    settings.maxHeight,
    settings.noUpscale,
    settings.format,
  ]);
}

/* ---------- presets de compression ---------- */

const PRESETS = {
  leger: {
    quality: 75,
    lossless: false,
    maxWidth: 1920,
    maxHeight: null,
    hint: "Léger — qualité 75, largeur max 1920 px. Idéal blog, vignettes, chargement rapide.",
  },
  standard: {
    quality: 85,
    lossless: false,
    maxWidth: 2560,
    maxHeight: null,
    hint: "Standard — qualité 85, largeur max 2560 px. Idéal pour la plupart des usages web.",
  },
  hq: {
    quality: 92,
    lossless: false,
    maxWidth: null,
    maxHeight: null,
    hint: "Haute qualité — qualité 92, dimensions d'origine. Visuels premium, portfolios.",
  },
  custom: {
    hint: "Personnalisé — ajuste la qualité et la taille à la main.",
  },
};

const presetsContainer = document.getElementById("presets");
const presetHint = document.getElementById("presetHint");
let applyingPreset = false;

function setActivePreset(key) {
  presetsContainer.querySelectorAll(".preset-chip").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.preset === key);
  });
  presetHint.textContent = (PRESETS[key] || PRESETS.custom).hint;
  try {
    localStorage.setItem("webp-preset", key);
  } catch {}
}

function applyPreset(key) {
  const preset = PRESETS[key];
  if (!preset) return;
  if (key !== "custom") {
    applyingPreset = true;
    elements.losslessInput.checked = !!preset.lossless;
    elements.qualityBlock.classList.toggle(
      "is-off",
      elements.losslessInput.checked,
    );
    elements.qualityInput.value = String(preset.quality);
    elements.qualityValue.textContent = String(preset.quality);
    elements.maxWidth.value =
      preset.maxWidth != null ? String(preset.maxWidth) : "";
    elements.maxHeight.value =
      preset.maxHeight != null ? String(preset.maxHeight) : "";
    applyingPreset = false;
  }
  setActivePreset(key);
}

presetsContainer.addEventListener("click", (event) => {
  const chip = event.target.closest(".preset-chip");
  if (chip) applyPreset(chip.dataset.preset);
});

// Modifier un réglage à la main bascule sur « Personnalisé ».
function markCustomIfManual() {
  if (!applyingPreset) setActivePreset("custom");
}

const resizePreset = document.getElementById("resizePreset");
const DIMENSION_PRESETS = {
  custom: {},
  original: { maxWidth: "", maxHeight: "" },
  "4k": { maxWidth: "3840", maxHeight: "2160" },
  "2k": { maxWidth: "2560", maxHeight: "1440" },
  "1080p": { maxWidth: "1920", maxHeight: "1080" },
  "720p": { maxWidth: "1280", maxHeight: "720" },
  mobile: { maxWidth: "750", maxHeight: "1334" },
  square: { maxWidth: "1080", maxHeight: "1080" }
};

resizePreset.addEventListener("change", () => {
  const val = resizePreset.value;
  if (val === "custom") return;
  const dims = DIMENSION_PRESETS[val];
  if (dims) {
    elements.maxWidth.value = dims.maxWidth;
    elements.maxHeight.value = dims.maxHeight;
    markCustomIfManual();
  }
});

[elements.qualityInput, elements.maxWidth, elements.maxHeight].forEach(
  (el) => el.addEventListener("input", () => {
    markCustomIfManual();
    if (el === elements.maxWidth || el === elements.maxHeight) {
      resizePreset.value = "custom";
    }
  }),
);
elements.losslessInput.addEventListener("change", markCustomIfManual);

// Restaure le dernier preset utilisé (par défaut : Standard).
(() => {
  let saved = null;
  try {
    saved = localStorage.getItem("webp-preset");
  } catch {}
  applyPreset(saved && PRESETS[saved] ? saved : "standard");
})();

// Persiste/restaure le format de sortie et la concurrence.
const concurrencyControl = document.getElementById("concurrencyInput");

function saveExtraSettings() {
  try {
    const fmt = document.querySelector('input[name="outputFormat"]:checked');
    if (fmt) localStorage.setItem("webp-format", fmt.value);
    if (concurrencyControl) localStorage.setItem("webp-concurrency", concurrencyControl.value);
  } catch {}
}

(() => {
  try {
    const fmt = localStorage.getItem("webp-format");
    if (fmt) {
      const radio = document.querySelector(
        `input[name="outputFormat"][value="${fmt}"]`,
      );
      if (radio && !radio.disabled) radio.checked = true;
    }
    const conc = localStorage.getItem("webp-concurrency");
    if (conc && concurrencyControl) {
      const option = concurrencyControl.querySelector(`option[value="${conc}"]`);
      if (option) concurrencyControl.value = conc;
    }
  } catch {}
})();

if (concurrencyControl) {
  concurrencyControl.addEventListener("change", saveExtraSettings);
}
document.querySelectorAll('input[name="outputFormat"]').forEach((radio) => {
  radio.addEventListener("change", saveExtraSettings);
});

/* ---------- renommage des fichiers de sortie ---------- */

function getExtension(name) {
  const match = /\.([a-z0-9]+)$/i.exec(name || "");
  return match ? match[1].toLowerCase() : "webp";
}

function sanitizeSegment(segment) {
  return segment
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ");
}

// Garantit l'unicité d'un nom de sortie en suffixant -2, -3, … si besoin.
function ensureUniqueName(name, ignoreId) {
  const taken = new Set(
    state.items
      .filter((item) => item.id !== ignoreId && item.outputName)
      .map((item) => item.outputName),
  );
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let index = 2;
  let candidate = `${base}-${index}${ext}`;
  while (taken.has(candidate)) {
    index += 1;
    candidate = `${base}-${index}${ext}`;
  }
  return candidate;
}

// Renommage individuel : nettoie la saisie, force la bonne extension,
// dédoublonne, puis rafraîchit la carte (sans reconvertir).
function commitRename(item, raw, inputEl) {
  let value = String(raw).replace(/\\/g, "/").trim();
  let ext = getExtension(item.outputName);
  const match = /\.(webp|avif)$/i.exec(value);
  if (match) {
    ext = match[1].toLowerCase();
    value = value.slice(0, -match[0].length);
  }
  const cleaned = value
    .split("/")
    .map(sanitizeSegment)
    .filter(Boolean)
    .join("/");
  const name = ensureUniqueName(`${cleaned || "image"}.${ext}`, item.id);
  item.outputName = name;
  item.customNameOverride = true; // Empêche l'écrasement par la trame automatique
  if (inputEl) inputEl.value = name;
  renderRow(item);
}

const renameClient = document.getElementById("renameClient");
const renamePattern = document.getElementById("renamePattern");

renameClient.addEventListener("input", applyGlobalPattern);
renamePattern.addEventListener("input", applyGlobalPattern);

document.querySelectorAll('input[name="outputFormat"]').forEach((radio) => {
  radio.addEventListener("change", applyGlobalPattern);
});

document.querySelectorAll(".rename-tag-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const variable = btn.dataset.var;
    const input = document.getElementById("renamePattern");
    if (!input) return;
    
    const startPos = input.selectionStart || 0;
    const endPos = input.selectionEnd || 0;
    const text = input.value;
    
    input.value = text.substring(0, startPos) + variable + text.substring(endPos);
    input.selectionStart = input.selectionEnd = startPos + variable.length;
    input.focus();
    
    applyGlobalPattern();
  });
});

/* ---------- entrées ---------- */

elements.fileInput.addEventListener("change", () => {
  addFiles(Array.from(elements.fileInput.files));
  elements.fileInput.value = "";
});

elements.folderInput.addEventListener("change", () => {
  addFiles(Array.from(elements.folderInput.files));
  elements.folderInput.value = "";
});

elements.convertButton.addEventListener("click", convertAll);
elements.cancelButton.addEventListener("click", () => {
  if (!state.isConverting) return;
  state.abort = true;
  elements.cancelButton.disabled = true;
  const label = elements.cancelButton.querySelector("span");
  if (label) label.textContent = "Annulation…";
});
elements.zipButton.addEventListener("click", downloadZip);
elements.clearButton.addEventListener("click", clearQueue);

const toggleRenameBarBtn = document.getElementById("toggleRenameBarBtn");
if (toggleRenameBarBtn) {
  toggleRenameBarBtn.addEventListener("click", () => {
    state.renameBarOpen = !state.renameBarOpen;
    render();
  });
}

elements.dropZone.addEventListener("click", (event) => {
  if (!event.target.closest(".folder-link") && event.target !== elements.folderInput) {
    elements.fileInput.click();
  }
});

let dragCounter = 0;
const globalDropOverlay = document.getElementById("globalDropOverlay");

window.addEventListener("dragenter", (event) => {
  event.preventDefault();
  dragCounter++;
  if (dragCounter === 1) {
    globalDropOverlay.hidden = false;
  }
});

window.addEventListener("dragover", (event) => {
  event.preventDefault();
});

window.addEventListener("dragleave", (event) => {
  dragCounter--;
  if (dragCounter === 0) {
    globalDropOverlay.hidden = true;
  }
});

window.addEventListener("drop", async (event) => {
  event.preventDefault();
  dragCounter = 0;
  globalDropOverlay.hidden = true;
  const files = await getDroppedFiles(event.dataTransfer);
  addFiles(files);
});

async function getDroppedFiles(dataTransfer) {
  const items = Array.from(dataTransfer.items || []);
  const entries = items
    .map((item) => item.webkitGetAsEntry && item.webkitGetAsEntry())
    .filter(Boolean);

  if (entries.length === 0) {
    return Array.from(dataTransfer.files || []);
  }

  const files = [];
  for (const entry of entries) {
    files.push(...(await readEntry(entry)));
  }
  return files;
}

async function readEntry(entry, prefix = "") {
  if (entry.isFile) {
    const file = await new Promise((resolve, reject) => {
      entry.file(resolve, reject);
    });
    file.relativePath = normalizePath(`${prefix}${file.name}`);
    return [file];
  }

  if (!entry.isDirectory) return [];

  const reader = entry.createReader();
  const batches = [];
  let batch = [];
  do {
    batch = await new Promise((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    batches.push(...batch);
  } while (batch.length > 0);

  const nested = [];
  for (const child of batches) {
    nested.push(...(await readEntry(child, `${prefix}${entry.name}/`)));
  }
  return nested;
}

function isHeicFile(file) {
  const extension = file.name.split(".").pop().toLowerCase();
  return extension === "heic" || extension === "heif";
}

function addFiles(files) {
  revokeZipUrl();

  const existing = new Set(
    state.items.map((item) => `${item.relativePath}:${item.file.size}`)
  );

  const additions = files
    .map((file) => ({
      id: crypto.randomUUID(),
      file,
      relativePath: normalizePath(
        file.relativePath || file.webkitRelativePath || file.name,
      ),
      status: "queued",
      outputName: "",
      outputBlob: null,
      outputUrl: "",
      previewUrl: "",
      srcWidth: 0,
      srcHeight: 0,
      outWidth: 0,
      outHeight: 0,
      codec: "",
      error: "",
      sujet: "",
      customNameOverride: false,
      isEditingName: false,
    }))
    .filter((item) => isImageFile(item.file) || isHeicFile(item.file))
    .filter((item) => {
      const key = `${item.relativePath}:${item.file.size}`;
      if (existing.has(key)) return false;
      existing.add(key);
      return true;
    });

  state.items.push(...additions);
  applyGlobalPattern();
  render();

  // Après un ajout (surtout en drag & drop sur écran étroit, où la file passe
  // sous la zone d'import), on amène la liste à l'écran pour montrer où les
  // images ont atterri.
  if (additions.length > 0) {
    elements.tableWrap?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function isImageFile(file) {
  const extension = file.name.split(".").pop().toLowerCase();
  return file.type.startsWith("image/") || imageExtensions.has(extension);
}

function removeFile(id) {
  const index = state.items.findIndex(item => item.id === id);
  if (index !== -1) {
    const item = state.items[index];
    if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    if (item.thumbUrl) URL.revokeObjectURL(item.thumbUrl);
    state.items.splice(index, 1);
    render();
  }
}

/* ---------- conversion ---------- */

// Pool de workers partagé (réutilisé entre la conversion par lot et la
// recompression interactive du comparateur). Recréé si la concurrence change.
let sharedPool = null;
let sharedPoolSize = 0;
const supportsWorkers =
  typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined";

function getPool(concurrency) {
  if (!supportsWorkers) return null;
  if (sharedPool && sharedPoolSize === concurrency) return sharedPool;
  if (sharedPool) sharedPool.terminate();
  sharedPool = new WorkerPool(concurrency);
  sharedPoolSize = concurrency;
  return sharedPool;
}

async function convertAll() {
  if (state.isConverting) return;

  const settings = readSettings();
  const signature = settingsSignature(settings);

  // Réglages globaux modifiés → on relance toutes les images.
  if (signature !== state.lastSignature) {
    for (const item of state.items) {
      if (item.status === "done") item.status = "queued";
    }
  }
  state.lastSignature = signature;

  const queue = state.items.filter((item) => item.status !== "done");
  if (queue.length === 0) {
    render();
    return;
  }

  state.isConverting = true;
  state.abort = false;
  revokeZipUrl();
  render();

  const concurrency = resolveConcurrency(settings.concurrency);
  let index = 0;

  const runner = async () => {
    while (index < queue.length && !state.abort) {
      const item = queue[index++];
      await convertItem(item, settings);
    }
  };

  const runners = [];
  for (let i = 0; i < Math.min(concurrency, queue.length); i++) {
    runners.push(runner());
  }
  await Promise.all(runners);

  state.isConverting = false;
  state.abort = false;
  render();
}

async function convertItem(item, settings) {
  if (state.abort) return;
  item.status = "running";
  item.error = "";
  renderRow(item);
  renderStats();

  try {
    const result = await convertOne(item.file, settings, item.crop);
    if (state.abort) {
      item.status = "queued";
      renderRow(item);
      return;
    }
    applyResult(item, result, settings);
    item.status = "done";
  } catch (error) {
    if (state.abort) {
      item.status = "queued";
    } else {
      item.status = "error";
      item.error =
        error && error.message ? error.message : "Erreur lors de la conversion.";
    }
  }

  renderRow(item);
  renderStats();
}

async function retryItem(item) {
  if (state.isConverting) return;
  state.isConverting = true;
  state.abort = false;
  render();
  await convertItem(item, readSettings());
  state.isConverting = false;
  render();
}

function applyResult(item, result, settings) {
  const ext = settings.format === "image/avif" ? "avif" : "webp";
  item.outputName = item.outputName.replace(/\.[^.]+$/, `.${ext}`);
  if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
  item.outputBlob = result.blob;
  item.outputUrl = URL.createObjectURL(result.blob);
  item.srcWidth = result.srcWidth;
  item.srcHeight = result.srcHeight;
  item.outWidth = result.outWidth;
  item.outHeight = result.outHeight;
  item.codec = result.codec;
  item.engine = result.engine;
}

// Convertit un fichier : HEIC pré-décodé sur le thread principal, puis envoi au
// worker (WASM). Repli sur le thread principal (canvas) si pas de worker, ou si
// le worker échoue (ex. SVG décodé par <img>).
async function convertOne(file, settings, crop) {
  let blob = file;
  if (isHeicFile(file)) {
    blob = await decodeHeic(file);
  }

  const pool = getPool(resolveConcurrency(settings.concurrency));
  if (pool) {
    try {
      const result = await pool.run({ blob, settings, crop: crop || null });
      return {
        blob: new Blob([result.buffer], { type: result.mime }),
        srcWidth: result.srcWidth,
        srcHeight: result.srcHeight,
        outWidth: result.outWidth,
        outHeight: result.outHeight,
        codec: result.codec,
        engine: result.engine,
      };
    } catch (error) {
      if (error && error.message === "Conversion annulée.") throw error;
      // Repli : couvre les formats que le worker ne sait pas décoder (SVG…).
      return convertOnMainThread(blob, settings, crop || null);
    }
  }

  return convertOnMainThread(blob, settings, crop || null);
}

// Chemin de repli (navigateurs sans Worker/OffscreenCanvas) : canvas DOM.
async function convertOnMainThread(blob, settings, crop) {
  const bitmap = await loadBitmap(blob);
  const srcWidth = bitmap.width;
  const srcHeight = bitmap.height;

  const region = computeRegion(crop, srcWidth, srcHeight);
  const { width, height } = targetDimensions(
    region.sw,
    region.sh,
    settings,
    crop,
  );

  const canvas = drawResized(
    bitmap,
    region.sx,
    region.sy,
    region.sw,
    region.sh,
    width,
    height,
  );
  if (typeof bitmap.close === "function") bitmap.close();

  const quality = settings.lossless ? 1 : settings.quality;
  const format = settings.format || "image/webp";

  const outBlob = await new Promise((resolve) => {
    canvas.toBlob(resolve, format, quality);
  });

  if (!outBlob || (outBlob.type !== "image/webp" && outBlob.type !== "image/avif")) {
    throw new Error(
      `Encodage en ${format.replace("image/", "").toUpperCase()} non supporté par ce navigateur.`,
    );
  }

  const codec = format === "image/webp" ? await sniffWebpCodec(outBlob) : "avif";

  return {
    blob: outBlob,
    srcWidth,
    srcHeight,
    outWidth: width,
    outHeight: height,
    codec,
    engine: "canvas",
  };
}

// Région source à extraire (recadrage manuel explicite ou centré automatique).
function computeRegion(crop, W, H) {
  if (!crop) return { sx: 0, sy: 0, sw: W, sh: H };

  if (crop.center && crop.aspect) {
    const ratio = W / H;
    let w;
    let h;
    if (crop.aspect >= ratio) {
      w = 1;
      h = ratio / crop.aspect;
    } else {
      h = 1;
      w = crop.aspect / ratio;
    }
    const sw = Math.max(1, Math.round(w * W));
    const sh = Math.max(1, Math.round(h * H));
    return { sx: Math.round((W - sw) / 2), sy: Math.round((H - sh) / 2), sw, sh };
  }

  if (crop.w > 0 && crop.h > 0) {
    return {
      sx: Math.round(crop.x * W),
      sy: Math.round(crop.y * H),
      sw: Math.max(1, Math.round(crop.w * W)),
      sh: Math.max(1, Math.round(crop.h * H)),
    };
  }

  return { sx: 0, sy: 0, sw: W, sh: H };
}

function targetDimensions(width, height, settings, crop) {
  if (crop && crop.outW && crop.outH) {
    return { width: crop.outW, height: crop.outH };
  }

  const ratios = [];
  if (settings.maxWidth) ratios.push(settings.maxWidth / width);
  if (settings.maxHeight) ratios.push(settings.maxHeight / height);

  let scale = ratios.length ? Math.min(...ratios) : 1;
  if (settings.noUpscale) scale = Math.min(scale, 1);
  if (!Number.isFinite(scale) || scale <= 0) scale = 1;

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

// Réduction par paliers (halving) pour garder de la netteté sur les grosses
// réductions. La région source (recadrage) est appliquée au premier drawImage.
function drawResized(source, sx, sy, sw, sh, targetWidth, targetHeight) {
  let current = source;
  let currentWidth = sw;
  let currentHeight = sh;
  let first = true;

  while (currentWidth > targetWidth * 2 && currentHeight > targetHeight * 2) {
    const nextWidth = Math.max(targetWidth, Math.floor(currentWidth / 2));
    const nextHeight = Math.max(targetHeight, Math.floor(currentHeight / 2));
    current = first
      ? paintStep(current, sx, sy, sw, sh, nextWidth, nextHeight)
      : paintStep(current, 0, 0, currentWidth, currentHeight, nextWidth, nextHeight);
    currentWidth = nextWidth;
    currentHeight = nextHeight;
    first = false;
  }

  return first
    ? paintStep(current, sx, sy, sw, sh, targetWidth, targetHeight)
    : paintStep(current, 0, 0, currentWidth, currentHeight, targetWidth, targetHeight);
}

function paintStep(source, sx, sy, sw, sh, dw, dh) {
  const canvas = document.createElement("canvas");
  canvas.width = dw;
  canvas.height = dh;
  const context = canvas.getContext("2d", { alpha: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, sx, sy, sw, sh, 0, 0, dw, dh);
  return canvas;
}

async function loadBitmap(file) {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
    } catch {
      return loadImageElement(file);
    }
  }
  return loadImageElement(file);
}

async function loadImageElement(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Lit l'en-tête RIFF/WEBP et le FourCC du 1er chunk (offset 12) :
// VP8L => lossless, VP8(espace) => lossy, VP8X => étendu (on scanne).
async function sniffWebpCodec(blob) {
  try {
    const header = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
    const tag = String.fromCharCode(
      header[12],
      header[13],
      header[14],
      header[15],
    );
    if (tag === "VP8L") return "lossless";
    if (tag === "VP8 ") return "lossy";
    if (tag === "VP8X") {
      const chunk = new Uint8Array(
        await blob.slice(0, 4096).arrayBuffer(),
      );
      let text = "";
      for (const byte of chunk) text += String.fromCharCode(byte);
      return text.includes("VP8L") ? "lossless" : "lossy";
    }
    return "";
  } catch {
    return "";
  }
}

function uniqueOutputName(relativePath, usedNames, format = "image/webp") {
  const normalized = normalizePath(relativePath);
  const parts = normalized.split("/");
  const fileName = parts.pop() || "image";
  const folder = parts.length ? `${parts.join("/")}/` : "";
  const base = fileName.replace(/\.[^.]+$/, "") || "image";
  const ext = format === "image/avif" ? "avif" : "webp";
  let candidate = `${folder}${base}.${ext}`;
  let index = 2;

  while (usedNames.has(candidate)) {
    candidate = `${folder}${base}-${index}.${ext}`;
    index += 1;
  }

  usedNames.add(candidate);
  return candidate;
}

function updateOutputNameFromPattern(item) {
  if (item.customNameOverride) return;
  
  const clientInput = document.getElementById("renameClient");
  const patternInput = document.getElementById("renamePattern");
  
  const client = clientInput ? clientInput.value.trim() : "inspire";
  const pattern = patternInput ? patternInput.value.trim() : "{client}_{sujet}_{index}";
  
  const indexInQueue = state.items.indexOf(item) + 1;
  const indexStr = String(indexInQueue).padStart(3, "0");
  
  const normalized = normalizePath(item.relativePath);
  const parts = normalized.split("/");
  const originalFileName = parts.pop() || "image";
  const originalBase = originalFileName.replace(/\.[^.]+$/, "") || "image";
  const folder = parts.length ? `${parts.join("/")}/` : "";
  
  const settings = readSettings();
  const ext = settings.format === "image/avif" ? "avif" : "webp";
  
  const sujet = item.sujet ? sanitizeSegment(item.sujet) : "";
  
  let name = pattern
    .replaceAll("{client}", client)
    .replaceAll("{sujet}", sujet)
    .replaceAll("{index}", indexStr)
    .replaceAll("{original}", originalBase);
    
  // Collapse consecutive separators and trim them from edges
  name = name
    .replace(/_{2,}/g, "_")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
    
  if (!name) name = "image";
  
  item.outputName = `${folder}${name}.${ext}`;
}

function enforceUniqueNames() {
  const used = new Set();
  state.items.forEach((item) => {
    if (!item.outputName) return;
    
    const parts = item.outputName.split("/");
    const filename = parts.pop();
    const folder = parts.length ? `${parts.join("/")}/` : "";
    
    const dot = filename.lastIndexOf(".");
    const base = dot > 0 ? filename.slice(0, dot) : filename;
    const ext = dot > 0 ? filename.slice(dot) : "";
    
    let candidate = item.outputName;
    let index = 2;
    
    while (used.has(candidate)) {
      candidate = `${folder}${base}-${index}${ext}`;
      index++;
    }
    
    used.add(candidate);
    item.outputName = candidate;
  });
}

function applyGlobalPattern() {
  state.items.forEach((item) => {
    updateOutputNameFromPattern(item);
  });
  enforceUniqueNames();
  renderRows();
}

/* ---------- comparateur avant/après ---------- */

const compare = {
  open: false,
  item: null,
  fitScale: 1,
  zoom: 1,
  panX: 0,
  panY: 0,
  dragging: false,
  lastX: 0,
  lastY: 0,
};

// Aperçu pleine résolution (HEIC décodé), partagé entre comparateur et recadrage.
async function ensurePreviewUrl(item) {
  if (item.previewUrl) return item.previewUrl;
  try {
    let blob = item.file;
    if (isHeicFile(item.file)) blob = await decodeHeic(item.file);
    item.previewUrl = URL.createObjectURL(blob);
  } catch {
    item.previewUrl = URL.createObjectURL(item.file);
  }
  return item.previewUrl;
}

async function openCompare(item) {
  if (!item || item.status !== "done") return;
  compare.item = item;
  compare.open = true;
  compare.lastFocus = document.activeElement;

  await ensurePreviewUrl(item);

  elements.cmpTitle.textContent = item.relativePath;
  elements.cmpAfter.src = item.outputUrl;
  elements.cmpBefore.src = item.previewUrl;
  elements.cmpMeta.innerHTML = compareMeta(item);

  const settings = readSettings();
  if (settings.lossless || item.codec === "lossless") {
    document.getElementById("cmpQualityControl").style.display = "none";
  } else {
    document.getElementById("cmpQualityControl").style.display = "flex";
    elements.cmpQuality.value = Math.round(settings.quality * 100);
    elements.cmpQualityVal.textContent = Math.round(settings.quality * 100);
  }

  elements.compareModal.hidden = false;
  setTimeout(() => elements.cmpClose.focus(), 20);

  elements.cmpAfter.onload = layoutCompare;
  if (elements.cmpAfter.complete) layoutCompare();
}

function layoutCompare() {
  const item = compare.item;
  if (!item) return;
  const naturalW = item.srcWidth || elements.cmpBefore.naturalWidth || 1;
  const naturalH = item.srcHeight || elements.cmpBefore.naturalHeight || 1;
  const vw = elements.cmpViewport.clientWidth || 1;
  const vh = elements.cmpViewport.clientHeight || 1;

  compare.naturalW = naturalW;
  compare.naturalH = naturalH;
  compare.fitScale = Math.min(vw / naturalW, vh / naturalH, 1);
  elements.cmpZoom.value = "100";
  compare.zoom = 1;
  compare.panX = 0;
  compare.panY = 0;
  applyCompare();
}

function applyCompare() {
  const naturalW = compare.naturalW || 1;
  const naturalH = compare.naturalH || 1;
  const scale = compare.fitScale * compare.zoom;
  const dispW = naturalW * scale;
  const dispH = naturalH * scale;

  // centre par défaut puis applique le pan, clampé
  const vw = elements.cmpViewport.clientWidth;
  const vh = elements.cmpViewport.clientHeight;
  const baseX = (vw - dispW) / 2;
  const baseY = (vh - dispH) / 2;

  const minX = Math.min(baseX, vw - dispW);
  const maxX = Math.max(baseX, 0);
  const minY = Math.min(baseY, vh - dispH);
  const maxY = Math.max(baseY, 0);
  compare.panX = clamp(compare.panX || baseX, minX, maxX);
  compare.panY = clamp(compare.panY || baseY, minY, maxY);

  elements.cmpStage.style.width = `${dispW}px`;
  elements.cmpStage.style.height = `${dispH}px`;
  elements.cmpStage.style.transform = `translate(${compare.panX}px, ${compare.panY}px)`;

  for (const img of [elements.cmpAfter, elements.cmpBefore]) {
    img.style.width = `${dispW}px`;
    img.style.height = `${dispH}px`;
  }

  const wipe = Number(elements.cmpWipe.value);
  elements.cmpBeforeWrap.style.width = `${(wipe / 100) * dispW}px`;

  elements.cmpZoomVal.textContent = `${Math.round(scale * 100)}%`;
}

function compareMeta(item) {
  const inSize = formatBytes(item.file.size);
  const outSize = formatBytes(item.outputBlob.size);
  const gain = percentGain(item.file.size, item.outputBlob.size);
  const codecLabel =
    item.codec === "lossless"
      ? "lossless (VP8L)"
      : item.codec === "lossy"
        ? "lossy (VP8)"
        : item.codec.toUpperCase();
  const inType = (item.file.type || "image").replace("image/", "").toUpperCase();
  const resized =
    item.srcWidth !== item.outWidth || item.srcHeight !== item.outHeight;
  return `
    <strong>Original</strong> : ${item.srcWidth}×${item.srcHeight} · ${inSize} · ${inType}
    &nbsp;→&nbsp;
    <strong>WebP Studio</strong> : ${item.outWidth}×${item.outHeight}${
      resized ? " (redimensionné)" : ""
    } · ${outSize} · ${codecLabel}
    &nbsp;·&nbsp; <strong>${gain >= 0 ? "−" : "+"}${Math.abs(gain)}%</strong>`;
}

function closeCompare() {
  compare.open = false;
  compare.item = null;
  elements.compareModal.hidden = true;
  elements.cmpAfter.removeAttribute("src");
  elements.cmpBefore.removeAttribute("src");
  if (compare.lastFocus && typeof compare.lastFocus.focus === "function") {
    compare.lastFocus.focus();
  }
}

elements.cmpClose.addEventListener("click", closeCompare);
elements.compareModal.addEventListener("click", (event) => {
  if (event.target === elements.compareModal) closeCompare();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && compare.open) closeCompare();
});

let cmpRecompressTimeout = null;

elements.cmpQuality.addEventListener("input", () => {
  const qVal = elements.cmpQuality.value;
  elements.cmpQualityVal.textContent = qVal;
  
  clearTimeout(cmpRecompressTimeout);
  cmpRecompressTimeout = setTimeout(async () => {
    const item = compare.item;
    if (!item || item.status !== "done") return;
    
    elements.cmpSpinner.hidden = false;
    
    try {
      const currentSettings = readSettings();
      const newSettings = {
        ...currentSettings,
        quality: Number(qVal) / 100
      };

      const result = await convertOne(item.file, newSettings, item.crop);
      applyResult(item, result, newSettings);

      elements.cmpAfter.src = item.outputUrl;
      elements.cmpMeta.innerHTML = compareMeta(item);
      
      applyCompare();
      renderRow(item);
      renderStats();
    } catch (err) {
      console.error(err);
    } finally {
      elements.cmpSpinner.hidden = true;
    }
  }, 150);
});

elements.cmpWipe.addEventListener("input", applyCompare);
elements.cmpZoom.addEventListener("input", () => {
  compare.zoom = Number(elements.cmpZoom.value) / 100;
  applyCompare();
});
elements.cmpFit.addEventListener("click", () => {
  elements.cmpZoom.value = "100";
  compare.zoom = 1;
  compare.panX = null;
  compare.panY = null;
  applyCompare();
});
elements.cmp100.addEventListener("click", () => {
  const target = compare.fitScale > 0 ? 100 / compare.fitScale : 100;
  const clamped = clamp(Math.round(target), 25, 400);
  elements.cmpZoom.value = String(clamped);
  compare.zoom = clamped / 100;
  compare.panX = null;
  compare.panY = null;
  applyCompare();
});

elements.cmpViewport.addEventListener("pointerdown", (event) => {
  compare.dragging = true;
  compare.lastX = event.clientX;
  compare.lastY = event.clientY;
  elements.cmpViewport.classList.add("panning");
  elements.cmpViewport.setPointerCapture(event.pointerId);
});
elements.cmpViewport.addEventListener("pointermove", (event) => {
  if (!compare.dragging) return;
  compare.panX = (compare.panX || 0) + (event.clientX - compare.lastX);
  compare.panY = (compare.panY || 0) + (event.clientY - compare.lastY);
  compare.lastX = event.clientX;
  compare.lastY = event.clientY;
  applyCompare();
});
["pointerup", "pointercancel", "pointerleave"].forEach((name) => {
  elements.cmpViewport.addEventListener(name, () => {
    compare.dragging = false;
    elements.cmpViewport.classList.remove("panning");
  });
});
window.addEventListener("resize", () => {
  if (compare.open) layoutCompare();
});

/* ---------- recadrage / formats réseaux sociaux ---------- */

const SOCIAL_PRESETS = {
  ig_post: { w: 1080, h: 1080 },
  ig_portrait: { w: 1080, h: 1350 },
  ig_story: { w: 1080, h: 1920 },
  fb_link: { w: 1200, h: 630 },
  li_post: { w: 1200, h: 627 },
  x_post: { w: 1600, h: 900 },
  yt_thumb: { w: 1280, h: 720 },
  pin: { w: 1000, h: 1500 },
};

const cropEls = {
  modal: document.getElementById("cropModal"),
  title: document.getElementById("cropTitle"),
  close: document.getElementById("cropClose"),
  viewport: document.getElementById("cropViewport"),
  image: document.getElementById("cropImage"),
  rect: document.getElementById("cropRect"),
  ratios: document.getElementById("cropRatios"),
  preset: document.getElementById("cropPreset"),
  reset: document.getElementById("cropReset"),
  applyAll: document.getElementById("cropApplyAll"),
  apply: document.getElementById("cropApply"),
};

const cropState = {
  open: false,
  item: null,
  ratio: null, // aspect de sortie en px (largeur/hauteur), null = libre
  preset: null, // {w,h} ou null
  imgBox: { left: 0, top: 0, width: 1, height: 1 },
  norm: { x: 0, y: 0, w: 1, h: 1 }, // rectangle normalisé (0..1 de l'image)
  drag: null,
  lastFocus: null,
};

async function openCrop(item) {
  cropState.item = item;
  cropState.open = true;
  cropState.lastFocus = document.activeElement;
  cropEls.title.textContent = `Recadrer — ${item.relativePath}`;

  // Source d'aperçu (HEIC décodé si besoin), partagée avec le comparateur.
  await ensurePreviewUrl(item);

  // Restaure les réglages de recadrage existants
  if (item.crop && item.crop.outW && item.crop.outH) {
    cropState.preset = { w: item.crop.outW, h: item.crop.outH };
    cropState.ratio = item.crop.outW / item.crop.outH;
  } else if (item.crop && item.crop.w > 0) {
    cropState.preset = null;
    cropState.ratio = null;
  } else {
    cropState.preset = null;
    cropState.ratio = null;
  }
  syncCropPresetSelect();
  syncCropRatioButtons();

  cropEls.modal.hidden = false;

  cropEls.image.onload = () => {
    computeCropImgBox();
    // norm initial : crop explicite existant, sinon plein cadre (ajusté au ratio)
    if (cropState.item.crop && cropState.item.crop.w > 0) {
      cropState.norm = {
        x: cropState.item.crop.x,
        y: cropState.item.crop.y,
        w: cropState.item.crop.w,
        h: cropState.item.crop.h,
      };
    } else if (cropState.ratio) {
      fitRatio(cropState.ratio);
    } else {
      cropState.norm = { x: 0, y: 0, w: 1, h: 1 };
    }
    layoutCropRect();
    cropEls.rect.hidden = false;
    updateApplyAllState();
  };
  cropEls.image.src = item.previewUrl;
  if (cropEls.image.complete && cropEls.image.naturalWidth) cropEls.image.onload();

  setTimeout(() => cropEls.close.focus(), 20);
}

function closeCrop() {
  cropState.open = false;
  cropState.item = null;
  cropState.drag = null;
  cropEls.modal.hidden = true;
  cropEls.image.removeAttribute("src");
  if (cropState.lastFocus && typeof cropState.lastFocus.focus === "function") {
    cropState.lastFocus.focus();
  }
}

function computeCropImgBox() {
  const vp = cropEls.viewport.getBoundingClientRect();
  const im = cropEls.image.getBoundingClientRect();
  cropState.imgBox = {
    left: im.left - vp.left,
    top: im.top - vp.top,
    width: im.width || 1,
    height: im.height || 1,
  };
}

// Place un rectangle de l'aspect demandé (px de sortie), centré et au max.
function fitRatio(aspect) {
  const r = cropState.imgBox.width / cropState.imgBox.height;
  const k = aspect / r; // wn/hn
  let wn;
  let hn;
  if (k >= 1) {
    wn = 1;
    hn = 1 / k;
  } else {
    hn = 1;
    wn = k;
  }
  cropState.norm = { x: (1 - wn) / 2, y: (1 - hn) / 2, w: wn, h: hn };
}

function layoutCropRect() {
  const box = cropState.imgBox;
  const n = cropState.norm;
  cropEls.rect.style.left = `${box.left + n.x * box.width}px`;
  cropEls.rect.style.top = `${box.top + n.y * box.height}px`;
  cropEls.rect.style.width = `${n.w * box.width}px`;
  cropEls.rect.style.height = `${n.h * box.height}px`;
}

function syncCropPresetSelect() {
  if (!cropState.preset) {
    cropEls.preset.value = "";
    return;
  }
  const match = Object.entries(SOCIAL_PRESETS).find(
    ([, dims]) => dims.w === cropState.preset.w && dims.h === cropState.preset.h,
  );
  cropEls.preset.value = match ? match[0] : "";
}

function syncCropRatioButtons() {
  const value = cropState.ratio == null ? "free" : String(cropState.ratio);
  cropEls.ratios.querySelectorAll(".crop-ratio-btn").forEach((btn) => {
    const active =
      btn.dataset.ratio === "free"
        ? cropState.ratio == null
        : Math.abs(Number(btn.dataset.ratio) - (cropState.ratio || -1)) < 0.001;
    btn.classList.toggle("active", active);
  });
}

function updateApplyAllState() {
  // Le recadrage de lot a besoin d'un ratio (impossible de centrer un crop libre).
  cropEls.applyAll.disabled = cropState.ratio == null;
  cropEls.applyAll.title = cropState.ratio == null
    ? "Choisis un ratio ou un format réseau pour l'appliquer au lot"
    : "Recadrage centré du même format sur toutes les images";
}

cropEls.ratios.addEventListener("click", (event) => {
  const btn = event.target.closest(".crop-ratio-btn");
  if (!btn) return;
  if (btn.dataset.ratio === "free") {
    cropState.ratio = null;
    cropState.preset = null;
  } else {
    cropState.ratio = Number(btn.dataset.ratio);
    cropState.preset = null;
    fitRatio(cropState.ratio);
    layoutCropRect();
  }
  syncCropPresetSelect();
  syncCropRatioButtons();
  updateApplyAllState();
});

cropEls.preset.addEventListener("change", () => {
  const preset = SOCIAL_PRESETS[cropEls.preset.value];
  if (preset) {
    cropState.preset = { ...preset };
    cropState.ratio = preset.w / preset.h;
    fitRatio(cropState.ratio);
    layoutCropRect();
  } else {
    cropState.preset = null;
    cropState.ratio = null;
  }
  syncCropRatioButtons();
  updateApplyAllState();
});

// Déplacement et redimensionnement du rectangle de recadrage.
cropEls.rect.addEventListener("pointerdown", (event) => {
  const handle = event.target.closest(".crop-handle");
  cropState.drag = {
    handle: handle ? handle.dataset.handle : "move",
    startX: event.clientX,
    startY: event.clientY,
    startNorm: { ...cropState.norm },
  };
  cropEls.rect.setPointerCapture(event.pointerId);
  event.preventDefault();
  event.stopPropagation();
});

cropEls.rect.addEventListener("pointermove", (event) => {
  if (!cropState.drag) return;
  const box = cropState.imgBox;
  const dxN = (event.clientX - cropState.drag.startX) / box.width;
  const dyN = (event.clientY - cropState.drag.startY) / box.height;
  if (cropState.drag.handle === "move") {
    moveCropRect(dxN, dyN);
  } else {
    resizeCropRect(cropState.drag.handle, dxN, dyN);
  }
  layoutCropRect();
});

["pointerup", "pointercancel"].forEach((name) => {
  cropEls.rect.addEventListener(name, () => {
    cropState.drag = null;
  });
});

function moveCropRect(dxN, dyN) {
  const s = cropState.drag.startNorm;
  let x = s.x + dxN;
  let y = s.y + dyN;
  x = clamp(x, 0, 1 - s.w);
  y = clamp(y, 0, 1 - s.h);
  cropState.norm = { x, y, w: s.w, h: s.h };
}

function resizeCropRect(handle, dxN, dyN) {
  const s = cropState.drag.startNorm;
  let left = s.x;
  let top = s.y;
  let right = s.x + s.w;
  let bottom = s.y + s.h;
  const min = 0.04;

  if (handle.includes("w")) left = clamp(s.x + dxN, 0, right - min);
  if (handle.includes("e")) right = clamp(right + dxN, left + min, 1);
  if (handle.includes("n")) top = clamp(s.y + dyN, 0, bottom - min);
  if (handle.includes("s")) bottom = clamp(bottom + dyN, top + min, 1);

  let w = right - left;
  let h = bottom - top;

  if (cropState.ratio) {
    const box = cropState.imgBox;
    const aspectN = cropState.ratio * (box.height / box.width); // wn/hn
    const horizontal = handle.includes("w") || handle.includes("e");
    if (horizontal) {
      h = w / aspectN;
      if (handle.includes("n")) top = bottom - h;
      else bottom = top + h;
    } else {
      w = h * aspectN;
      if (handle.includes("w")) left = right - w;
      else right = left + w;
    }
    // Si on déborde de l'image, on rétracte en gardant le ratio.
    if (left < 0 || right > 1 || top < 0 || bottom > 1) {
      return; // ignore ce mouvement plutôt que de casser le ratio
    }
  }

  cropState.norm = { x: left, y: top, w: right - left, h: bottom - top };
}

cropEls.close.addEventListener("click", closeCrop);
cropEls.modal.addEventListener("click", (event) => {
  if (event.target === cropEls.modal) closeCrop();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && cropState.open) closeCrop();
});
window.addEventListener("resize", () => {
  if (cropState.open) {
    computeCropImgBox();
    layoutCropRect();
  }
});

cropEls.apply.addEventListener("click", () => {
  const item = cropState.item;
  if (!item) return;
  const n = cropState.norm;
  const crop = {
    x: clamp(n.x, 0, 1),
    y: clamp(n.y, 0, 1),
    w: clamp(n.w, 0, 1),
    h: clamp(n.h, 0, 1),
  };
  if (cropState.preset) {
    crop.outW = cropState.preset.w;
    crop.outH = cropState.preset.h;
  }
  item.crop = crop;
  if (item.status === "done") item.status = "queued";
  closeCrop();
  render();
});

cropEls.applyAll.addEventListener("click", () => {
  if (cropState.ratio == null) return;
  const aspect = cropState.ratio;
  const outW = cropState.preset ? cropState.preset.w : null;
  const outH = cropState.preset ? cropState.preset.h : null;
  for (const item of state.items) {
    item.crop = { center: true, aspect, outW, outH };
    if (item.status === "done") item.status = "queued";
  }
  closeCrop();
  render();
});

cropEls.reset.addEventListener("click", () => {
  const item = cropState.item;
  if (item) {
    item.crop = null;
    if (item.status === "done") item.status = "queued";
  }
  closeCrop();
  render();
});

/* ---------- ZIP ---------- */

async function downloadZip() {
  const files = state.items
    .filter((item) => item.status === "done" && item.outputBlob)
    .map((item) => ({
      name: item.outputName,
      blob: item.outputBlob,
    }));

  if (files.length === 0) return;

  elements.zipButton.disabled = true;
  const btnText = elements.zipButton.querySelector("span");
  const prevText = btnText.textContent;
  btnText.textContent = "Création du ZIP…";

  const zipBlob = await createZip(files);
  const url = URL.createObjectURL(zipBlob);
  state.zipUrl = url;

  const settings = readSettings();
  const ext = settings.format === "image/avif" ? "avif" : "webp";

  const link = document.createElement("a");
  link.href = url;
  link.download = `webp-studio-${ext}-${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.append(link);
  link.click();
  link.remove();

  btnText.textContent = prevText;
  render();
}

async function createZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const data = new Uint8Array(await file.blob.arrayBuffer());
    const crc = crc32(data);
    const { dosTime, dosDate } = getDosDateTime(new Date());

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, dosTime, true);
    localView.setUint16(12, dosDate, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, dosTime, true);
    centralView.setUint16(14, dosDate, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint32(36, 0, true);
    centralView.setUint32(40, 0, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    localParts.push(localHeader, data);
    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const centralSize = centralParts.reduce(
    (sum, part) => sum + part.length,
    0,
  );
  const centralOffset = offset;
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, centralOffset, true);
  endView.setUint16(20, 0, true);

  return new Blob([...localParts, ...centralParts, end], {
    type: "application/zip",
  });
}

function getDosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    dosTime:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2),
    dosDate:
      ((year - 1980) << 9) |
      ((date.getMonth() + 1) << 5) |
      date.getDate(),
  };
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/* ---------- divers ---------- */

function clearQueue() {
  for (const item of state.items) {
    if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    if (item.thumbUrl) URL.revokeObjectURL(item.thumbUrl);
  }
  revokeZipUrl();
  state.items = [];
  render();
}

function revokeZipUrl() {
  if (state.zipUrl) {
    URL.revokeObjectURL(state.zipUrl);
    state.zipUrl = null;
  }
}

function render() {
  elements.emptyState.hidden = state.items.length > 0;
  elements.tableWrap.hidden = state.items.length === 0;
  // Reconversion autorisée : actif dès qu'il y a des images (changer un réglage
  // relancera tout ; sans changement et tout déjà fait, le clic est sans effet).
  elements.convertButton.disabled = state.isConverting || state.items.length === 0;
  elements.convertButton.style.display = state.isConverting ? "none" : "inline-flex";
  elements.cancelButton.style.display = state.isConverting ? "inline-flex" : "none";
  if (!state.isConverting) {
    elements.cancelButton.disabled = false;
    const label = elements.cancelButton.querySelector("span");
    if (label) label.textContent = "Annuler";
  }
  elements.zipButton.disabled =
    state.isConverting ||
    !state.items.some((item) => item.status === "done");
  elements.clearButton.disabled =
    state.isConverting || state.items.length === 0;
  elements.queueHint.textContent =
    state.items.length === 0
      ? "Aucune image dans la file."
      : `${state.items.length} fichier(s) prêt(s).`;

  renderProgress();

  const toggleRenameBtn = document.getElementById("toggleRenameBarBtn");
  const renameBar = document.getElementById("renameBar");
  if (toggleRenameBtn && renameBar) {
    if (state.items.length === 0 || state.isConverting) {
      toggleRenameBtn.style.display = "none";
      renameBar.hidden = true;
    } else {
      toggleRenameBtn.style.display = "inline-flex";
      renameBar.hidden = !state.renameBarOpen;
      toggleRenameBtn.classList.toggle("active", state.renameBarOpen);
    }
  }

  renderRows();
  renderStats();
}

function renderRows() {
  const existing = new Map(
    Array.from(elements.queueBody.children).map((card) => [
      card.dataset.id,
      card,
    ]),
  );

  for (const item of state.items) {
    if (!existing.has(item.id)) {
      const card = document.createElement("div");
      card.className = "image-card";
      card.dataset.id = item.id;
      card.innerHTML = `
        <div class="card-preview-container">
          <div class="card-preview-placeholder">🖼️</div>
          <img class="card-preview" alt="Aperçu" style="display:none;" />
          <div class="card-badges">
            <span class="card-status-badge"></span>
            <span class="card-codec-badge" style="display:none;"></span>
          </div>
        </div>
        <div class="card-info">
          <!-- Nom final avec bouton d'édition et badge de mode -->
          <div class="card-final-name-row">
            <div class="card-final-name-wrap" title="Double-cliquer pour renommer">
              <span class="card-final-name"></span>
              <button type="button" class="card-edit-btn" title="Renommer manuellement">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"/></svg>
              </button>
            </div>
            <span class="card-rename-mode-badge auto">Auto</span>
          </div>

          <!-- Zone d'édition manuelle masquée par défaut -->
          <div class="card-edit-input-group">
            <input class="card-name-input" type="text" placeholder="nom de sortie" title="Entrer le nouveau nom (sans extension)" />
            <button type="button" class="card-rename-ok-btn" title="Confirmer">✓</button>
            <button type="button" class="card-rename-reset-btn" title="Ré-appliquer la trame automatique">↺</button>
          </div>

          <!-- Nom d'origine (petit et discret) -->
          <div class="card-name" style="font-size: 0.68rem; color: var(--muted); margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="Chemin d'origine"></div>

          <!-- Sujet de l'image (s'affiche uniquement si la trame contient {sujet}) -->
          <div class="card-sujet-group">
            <div class="card-sujet-wrapper">
              <span class="card-sujet-label">Sujet:</span>
              <input class="card-sujet-input card-sujet-input-clean" type="text" placeholder="ex: portrait" title="Sujet inséré dans la trame" />
            </div>
          </div>

          <!-- Métadonnées et dimensions -->
          <div class="card-meta">
            <span class="size-before"></span>
            <span class="size-arrow" style="display:none;">→</span>
            <span class="size-after"></span>
            <span class="gain-badge" style="display:none;"></span>
          </div>
          <div class="card-dims"></div>

          <!-- État d'erreur visible + bouton réessayer -->
          <div class="card-error">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span class="card-error-msg"></span>
            <button type="button" class="card-retry-btn">Réessayer</button>
          </div>
        </div>
        <div class="card-actions">
          <button class="action-btn crop-btn" title="Recadrer / format réseaux sociaux">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>
          </button>
          <button class="action-btn cmp-btn" style="display:none;" title="Comparer l'original et le compressé">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            <span>Comparer</span>
          </button>
          <a class="action-btn dl-btn" style="display:none;" title="Télécharger cette image">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
          </a>
          <button class="action-btn del-btn" title="Retirer de la liste">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      `;
      elements.queueBody.append(card);
    }
    renderRow(item);
    existing.delete(item.id);
  }

  for (const card of existing.values()) {
    card.remove();
  }
}

// Affiche l'aperçu sur la carte (élément vivant, la carte a pu être re-rendue).
function applyThumbnail(item, url) {
  item.thumbUrl = url;
  const liveCard = elements.queueBody.querySelector(`[data-id="${item.id}"]`);
  if (!liveCard) return;
  const liveImg = liveCard.querySelector(".card-preview");
  const livePh = liveCard.querySelector(".card-preview-placeholder");
  liveImg.src = url;
  liveImg.style.display = "block";
  if (livePh) livePh.style.display = "none";
}

// Aperçu de carte. On tente une vignette légère (~256 px) via createImageBitmap
// (rapide, peu de mémoire). Si le format n'est pas décodable ainsi (SVG, logos
// vectoriels…), on retombe sur l'affichage direct du fichier dans <img>, qui
// gère nativement le SVG. Les HEIC gardent le placeholder (décodage en masse
// trop coûteux juste pour un aperçu).
async function ensureThumbnail(item, imgEl, placeholderEl) {
  if (item.thumbUrl) {
    imgEl.src = item.thumbUrl;
    imgEl.style.display = "block";
    if (placeholderEl) placeholderEl.style.display = "none";
    return;
  }
  if (item.thumbPending) return;
  item.thumbPending = true;
  try {
    const bitmap = await createImageBitmap(item.file);
    const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
    if (typeof bitmap.close === "function") bitmap.close();
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.8),
    );
    applyThumbnail(item, URL.createObjectURL(blob));
  } catch {
    // createImageBitmap ne gère pas ce format : on affiche le fichier tel quel.
    // Le SVG (et les autres formats lisibles par <img>) s'affiche correctement.
    if (!isHeicFile(item.file)) {
      applyThumbnail(item, URL.createObjectURL(item.file));
    }
    // HEIC : on garde le placeholder 🖼️ (pas de décodage de masse pour un aperçu).
  } finally {
    item.thumbPending = false;
  }
}

function renderRow(item) {
  const card = elements.queueBody.querySelector(`[data-id="${item.id}"]`);
  if (!card) return;

  const nameEl = card.querySelector(".card-name");
  nameEl.textContent = `Origine: ${item.relativePath}`;
  nameEl.title = `Origine: ${item.relativePath}`;

  card.querySelector(".size-before").textContent = formatBytes(item.file.size);
  const dimsEl = card.querySelector(".card-dims");
  dimsEl.textContent = item.srcWidth
    ? `${item.srcWidth}×${item.srcHeight}`
    : (item.file.type.replace("image/", "").toUpperCase() || "IMAGE");

  const imgEl = card.querySelector(".card-preview");
  const placeholderEl = card.querySelector(".card-preview-placeholder");
  if (!imgEl.src) {
    ensureThumbnail(item, imgEl, placeholderEl);
  }

  const statusEl = card.querySelector(".card-status-badge");
  statusEl.className = `card-status-badge ${item.status}`;
  statusEl.textContent = statusLabel(item.status);
  if (item.error) {
    statusEl.title = item.error;
  }

  // Erreur visible + bouton réessayer
  const errorEl = card.querySelector(".card-error");
  if (item.status === "error" && item.error) {
    errorEl.classList.add("visible");
    card.querySelector(".card-error-msg").textContent = item.error;
    const retryBtn = card.querySelector(".card-retry-btn");
    retryBtn.onclick = () => retryItem(item);
  } else {
    errorEl.classList.remove("visible");
  }

  // Bouton recadrer (toujours disponible) + repère « recadré »
  const cropBtn = card.querySelector(".crop-btn");
  cropBtn.onclick = () => openCrop(item);
  cropBtn.classList.toggle("active", !!item.crop);
  cropBtn.title = item.crop ? "Recadrage actif — modifier" : "Recadrer / format réseaux sociaux";

  const codecEl = card.querySelector(".card-codec-badge");
  if (item.codec) {
    codecEl.textContent = item.codec;
    codecEl.className = `card-codec-badge ${item.codec}`;
    codecEl.style.display = "inline-flex";
  } else {
    codecEl.style.display = "none";
  }

  const sizeAfterEl = card.querySelector(".size-after");
  const arrowEl = card.querySelector(".size-arrow");
  const gainEl = card.querySelector(".gain-badge");
  const cmpBtn = card.querySelector(".cmp-btn");
  const dlBtn = card.querySelector(".dl-btn");

  const finalNameEl = card.querySelector(".card-final-name");
  finalNameEl.textContent = item.outputName;
  finalNameEl.title = item.outputName;

  const finalNameRow = card.querySelector(".card-final-name-row");
  const editInputGroup = card.querySelector(".card-edit-input-group");
  const nameInput = card.querySelector(".card-name-input");
  const editBtn = card.querySelector(".card-edit-btn");
  const finalNameWrap = card.querySelector(".card-final-name-wrap");
  const okBtn = card.querySelector(".card-rename-ok-btn");
  const resetBtn = card.querySelector(".card-rename-reset-btn");
  const modeBadge = card.querySelector(".card-rename-mode-badge");

  if (item.isEditingName) {
    if (finalNameRow) finalNameRow.style.display = "none";
    if (editInputGroup) editInputGroup.style.display = "flex";
    if (nameInput) {
      if (document.activeElement !== nameInput) {
        const ext = getExtension(item.outputName);
        nameInput.value = item.outputName.endsWith("." + ext) ? item.outputName.slice(0, -(ext.length + 1)) : item.outputName;
      }
      setTimeout(() => nameInput.focus(), 10);
    }
  } else {
    if (finalNameRow) finalNameRow.style.display = "flex";
    if (editInputGroup) editInputGroup.style.display = "none";
  }

  const startEdit = () => {
    item.isEditingName = true;
    renderRow(item);
  };
  
  if (editBtn) editBtn.onclick = (e) => { e.stopPropagation(); startEdit(); };
  if (finalNameWrap) finalNameWrap.ondblclick = startEdit;

  const saveEdit = () => {
    if (nameInput) {
      commitRename(item, nameInput.value, nameInput);
    }
    item.isEditingName = false;
    renderRow(item);
  };

  if (okBtn) okBtn.onclick = (e) => { e.stopPropagation(); saveEdit(); };
  if (nameInput) {
    nameInput.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        saveEdit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        item.isEditingName = false;
        renderRow(item);
      }
    };
  }

  if (item.customNameOverride) {
    if (modeBadge) {
      modeBadge.textContent = "Manuel";
      modeBadge.className = "card-rename-mode-badge manual";
    }
    if (resetBtn) {
      resetBtn.style.display = "grid";
      resetBtn.onclick = (e) => {
        e.stopPropagation();
        item.customNameOverride = false;
        item.isEditingName = false;
        updateOutputNameFromPattern(item);
        enforceUniqueNames();
        applyGlobalPattern();
      };
    }
  } else {
    if (modeBadge) {
      modeBadge.textContent = "Auto";
      modeBadge.className = "card-rename-mode-badge auto";
    }
    if (resetBtn) {
      resetBtn.style.display = "none";
    }
  }

  // Handle conditional display of sujet-group based on pattern containing {sujet}
  const patternInput = document.getElementById("renamePattern");
  const pattern = patternInput ? patternInput.value : "";
  const hasSujet = pattern.includes("{sujet}");
  const sujetGroup = card.querySelector(".card-sujet-group");
  const sujetInput = card.querySelector(".card-sujet-input");

  if (sujetGroup) {
    sujetGroup.style.display = hasSujet ? "block" : "none";
  }

  if (sujetInput) {
    if (document.activeElement !== sujetInput) sujetInput.value = item.sujet || "";
    sujetInput.oninput = () => {
      item.sujet = sujetInput.value;
      updateOutputNameFromPattern(item);
      enforceUniqueNames();
      
      // Update outputName value on all cards to reflect index and deduplication changes
      state.items.forEach(other => {
        const otherCard = elements.queueBody.querySelector(`[data-id="${other.id}"]`);
        if (otherCard) {
          const otherFinalName = otherCard.querySelector(".card-final-name");
          if (otherFinalName && !other.isEditingName) {
            otherFinalName.textContent = other.outputName;
          }
          const otherBadge = otherCard.querySelector(".card-rename-mode-badge");
          if (otherBadge) {
            otherBadge.textContent = other.customNameOverride ? "Manuel" : "Auto";
            otherBadge.className = `card-rename-mode-badge ${other.customNameOverride ? "manual" : "auto"}`;
          }
        }
      });
    };
  }

  if (item.outputBlob) {
    sizeAfterEl.textContent = formatBytes(item.outputBlob.size);
    sizeAfterEl.style.display = "inline";
    arrowEl.style.display = "inline";

    const gain = percentGain(item.file.size, item.outputBlob.size);
    gainEl.textContent = `${gain >= 0 ? "−" : "+"}${Math.abs(gain)}%`;
    gainEl.className = `gain-badge ${gain >= 0 ? "good" : "bad"}`;
    gainEl.style.display = "inline-flex";

    cmpBtn.style.display = "inline-flex";
    cmpBtn.onclick = () => openCompare(item);

    dlBtn.style.display = "inline-flex";
    dlBtn.href = item.outputUrl;
    dlBtn.download = item.outputName;
  } else {
    sizeAfterEl.style.display = "none";
    arrowEl.style.display = "none";
    gainEl.style.display = "none";
    cmpBtn.style.display = "none";
    dlBtn.style.display = "none";
  }

  const delBtn = card.querySelector(".del-btn");
  delBtn.onclick = () => removeFile(item.id);
}

function renderStats() {
  const done = state.items.filter((item) => item.status === "done");
  const inputTotal = done.reduce((sum, item) => sum + item.file.size, 0);
  const outputTotal = done.reduce(
    (sum, item) => sum + (item.outputBlob ? item.outputBlob.size : 0),
    0,
  );
  const gain = percentGain(inputTotal, outputTotal);
  const savedBytes = Math.max(0, inputTotal - outputTotal);

  elements.totalCount.textContent = state.items.length;
  elements.doneCount.textContent = done.length;
  
  if (inputTotal && savedBytes > 0) {
    elements.gainValue.textContent = `${gain >= 0 ? "−" : "+"}${Math.abs(gain)}% (${formatBytes(savedBytes)})`;
    elements.gainValue.style.fontSize = "1.3rem";
  } else {
    elements.gainValue.textContent = inputTotal
      ? `${gain >= 0 ? "−" : "+"}${Math.abs(gain)}%`
      : "0%";
    elements.gainValue.style.fontSize = "";
  }
  
  elements.outputSize.textContent = formatBytes(outputTotal);
  renderProgress();
}

function renderProgress() {
  if (!state.isConverting) {
    elements.progressWrap.hidden = true;
    return;
  }
  const total = state.items.length || 1;
  const processed = state.items.filter(
    (item) => item.status === "done" || item.status === "error",
  ).length;
  const percent = Math.round((processed / total) * 100);
  elements.progressWrap.hidden = false;
  elements.progressBar.style.width = `${percent}%`;
  elements.progressLabel.textContent = `${processed}/${total} · ${percent} %`;
}

function percentGain(input, output) {
  if (!input) return 0;
  return Math.round((1 - output / input) * 100);
}

function statusLabel(status) {
  return {
    queued: "prêt",
    running: "conversion",
    done: "ok",
    error: "erreur",
  }[status];
}

function normalizePath(value) {
  return value
    .replaceAll("\\", "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

render();

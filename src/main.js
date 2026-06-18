const state = {
  items: [],
  isConverting: false,
  zipUrl: null,
  loadingHeic: false,
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
  zipButton: document.querySelector("#zipButton"),
  clearButton: document.querySelector("#clearButton"),
  totalCount: document.querySelector("#totalCount"),
  doneCount: document.querySelector("#doneCount"),
  gainValue: document.querySelector("#gainValue"),
  outputSize: document.querySelector("#outputSize"),
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
const avifSupportBadge = document.getElementById("avifSupportBadge");
const avifRadioLabel = document.getElementById("avifRadioLabel");
const avifRadioInput = avifRadioLabel.querySelector("input");

function checkAvifSupport() {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  canvas.toBlob((blob) => {
    const supported = blob && blob.type === "image/avif";
    if (supported) {
      avifSupportBadge.textContent = "supporté";
      avifSupportBadge.style.color = "var(--accent)";
    } else {
      avifSupportBadge.textContent = "non supporté";
      avifSupportBadge.style.color = "var(--red)";
      avifRadioInput.disabled = true;
      avifRadioLabel.title = "L'encodage AVIF n'est pas supporté par votre navigateur (requis: Chrome 121+).";
    }
  }, "image/avif");
}
checkAvifSupport();

/* ---------- décodeur HEIC ---------- */
async function loadHeic2Any() {
  if (window.heic2any) return window.heic2any;
  if (state.loadingHeic) {
    while (state.loadingHeic) {
      await new Promise(r => setTimeout(r, 100));
    }
    return window.heic2any;
  }
  state.loadingHeic = true;
  try {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js";
    document.head.appendChild(script);
    await new Promise((resolve, reject) => {
      script.onload = resolve;
      script.onerror = reject;
    });
  } catch (err) {
    console.error("Impossible de charger le décodeur HEIC.", err);
    throw new Error("Décodeur HEIC requis. Connectez-vous à internet pour le télécharger automatiquement.");
  } finally {
    state.loadingHeic = false;
  }
  return window.heic2any;
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
    concurrency: concurrencyInput ? parseInt(concurrencyInput.value, 10) : 2,
  };
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
elements.zipButton.addEventListener("click", downloadZip);
elements.clearButton.addEventListener("click", clearQueue);

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
    if (item.tempPreviewUrl) URL.revokeObjectURL(item.tempPreviewUrl);
    state.items.splice(index, 1);
    render();
  }
}

/* ---------- conversion ---------- */

async function convertAll() {
  if (state.isConverting) return;
  state.isConverting = true;
  revokeZipUrl();

  const settings = readSettings();
  const concurrency = settings.concurrency || 2;

  render();

  const queue = state.items.filter((item) => item.status !== "done");
  let activeCount = 0;
  let index = 0;

  const processNext = async () => {
    if (index >= queue.length) return;
    const item = queue[index++];
    activeCount++;

    item.status = "running";
    item.error = "";
    renderRow(item);
    renderStats();

    try {
      const result = await convertToWebP(item.file, settings);
      const ext = settings.format === "image/avif" ? "avif" : "webp";
      item.outputName = item.outputName.replace(/\.[^.]+$/, `.${ext}`);
      item.outputBlob = result.blob;
      item.outputUrl = URL.createObjectURL(result.blob);
      item.srcWidth = result.srcWidth;
      item.srcHeight = result.srcHeight;
      item.outWidth = result.outWidth;
      item.outHeight = result.outHeight;
      item.codec = result.codec;
      item.status = "done";
    } catch (error) {
      item.status = "error";
      item.error = error && error.message ? error.message : "Erreur lors de la conversion.";
    }

    renderRow(item);
    renderStats();
    activeCount--;

    await processNext();
  };

  const promises = [];
  for (let i = 0; i < Math.min(concurrency, queue.length); i++) {
    promises.push(processNext());
  }

  await Promise.all(promises);

  state.isConverting = false;
  render();
}

async function convertToWebP(file, settings) {
  let activeFile = file;

  // Si fichier HEIC
  if (isHeicFile(file)) {
    const heic2any = await loadHeic2Any();
    const decodedBlob = await heic2any({
      blob: file,
      toType: "image/jpeg",
      quality: 0.95
    });
    activeFile = Array.isArray(decodedBlob) ? decodedBlob[0] : decodedBlob;
  }

  const bitmap = await loadBitmap(activeFile);
  const srcWidth = bitmap.width;
  const srcHeight = bitmap.height;

  const { width, height } = targetDimensions(
    srcWidth,
    srcHeight,
    settings,
  );

  const canvas = drawResized(bitmap, width, height);
  if (typeof bitmap.close === "function") bitmap.close();

  const quality = settings.lossless ? 1 : settings.quality;
  const format = settings.format || "image/webp";

  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, format, quality);
  });

  if (!blob || (blob.type !== "image/webp" && blob.type !== "image/avif")) {
    throw new Error(`Encodage en ${format.replace("image/", "").toUpperCase()} non supporté par ce navigateur.`);
  }

  const codec = format === "image/webp" ? await sniffWebpCodec(blob) : "avif";

  return {
    blob,
    srcWidth,
    srcHeight,
    outWidth: width,
    outHeight: height,
    codec,
  };
}

function targetDimensions(width, height, settings) {
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

// Réduction par paliers (halving) pour garder de la netteté sur les
// grosses réductions, sinon un seul drawImage adoucit trop.
function drawResized(source, targetWidth, targetHeight) {
  let current = source;
  let currentWidth = source.width;
  let currentHeight = source.height;

  while (
    currentWidth > targetWidth * 2 &&
    currentHeight > targetHeight * 2
  ) {
    const nextWidth = Math.max(targetWidth, Math.floor(currentWidth / 2));
    const nextHeight = Math.max(
      targetHeight,
      Math.floor(currentHeight / 2),
    );
    current = paintStep(current, nextWidth, nextHeight);
    currentWidth = nextWidth;
    currentHeight = nextHeight;
  }

  return paintStep(current, targetWidth, targetHeight);
}

function paintStep(source, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, width, height);
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

function openCompare(item) {
  if (!item || item.status !== "done") return;
  compare.item = item;
  compare.open = true;

  if (!item.previewUrl) {
    item.previewUrl = URL.createObjectURL(item.file);
  }

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
      
      const result = await convertToWebP(item.file, newSettings);
      
      if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
      
      item.outputBlob = result.blob;
      item.outputUrl = URL.createObjectURL(result.blob);
      item.srcWidth = result.srcWidth;
      item.srcHeight = result.srcHeight;
      item.outWidth = result.outWidth;
      item.outHeight = result.outHeight;
      item.codec = result.codec;
      
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
    if (item.tempPreviewUrl) URL.revokeObjectURL(item.tempPreviewUrl);
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
  elements.convertButton.disabled =
    state.isConverting ||
    state.items.length === 0 ||
    state.items.every((item) => item.status === "done");
  elements.zipButton.disabled =
    state.isConverting ||
    !state.items.some((item) => item.status === "done");
  elements.clearButton.disabled =
    state.isConverting || state.items.length === 0;
  elements.queueHint.textContent =
    state.items.length === 0
      ? "Aucune image dans la file."
      : `${state.items.length} fichier(s) prêt(s).`;

  document.getElementById("renameBar").hidden =
    state.items.length === 0 || state.isConverting;

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
          <div class="card-field-group">
            <span class="card-field-label">Sujet de l'image</span>
            <input class="card-sujet-input" type="text" placeholder="ex: portrait-equipe" title="Sujet inséré dans la trame" style="margin: 0;" />
          </div>
          <div class="card-name" style="font-size: 0.68rem; color: var(--muted); margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="Chemin d'origine"></div>
          <div class="card-field-group">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span class="card-field-label">Nom de sortie final</span>
              <span class="card-rename-mode-badge auto">Auto</span>
            </div>
            <div style="display: flex; gap: 6px; align-items: center; width: 100%;">
              <input class="card-name-input" type="text" placeholder="nom de sortie final" title="Renommer ce fichier final" style="flex: 1; margin: 0;" />
              <button type="button" class="card-rename-reset-btn" title="Réinitialiser et ré-appliquer la trame automatique" style="display: none;">↺</button>
            </div>
          </div>
          <div class="card-meta" style="margin-top: 6px;">
            <span class="size-before"></span>
            <span class="size-arrow" style="display:none;">→</span>
            <span class="size-after"></span>
            <span class="gain-badge" style="display:none;"></span>
          </div>
          <div class="card-dims"></div>
        </div>
        <div class="card-actions">
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

function renderRow(item) {
  const card = elements.queueBody.querySelector(`[data-id="${item.id}"]`);
  if (!card) return;

  const nameEl = card.querySelector(".card-name");
  nameEl.textContent = item.relativePath;
  nameEl.title = item.relativePath;

  card.querySelector(".size-before").textContent = formatBytes(item.file.size);
  const dimsEl = card.querySelector(".card-dims");
  dimsEl.textContent = item.srcWidth
    ? `${item.srcWidth}×${item.srcHeight}`
    : (item.file.type.replace("image/", "").toUpperCase() || "IMAGE");

  const imgEl = card.querySelector(".card-preview");
  const placeholderEl = card.querySelector(".card-preview-placeholder");
  if (!imgEl.src && item.file) {
    const previewUrl = URL.createObjectURL(item.file);
    imgEl.src = previewUrl;
    imgEl.style.display = "block";
    if (placeholderEl) placeholderEl.style.display = "none";
    item.tempPreviewUrl = previewUrl;
  }

  const statusEl = card.querySelector(".card-status-badge");
  statusEl.className = `card-status-badge ${item.status}`;
  statusEl.textContent = statusLabel(item.status);
  if (item.error) {
    statusEl.title = item.error;
  }

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
  const nameInput = card.querySelector(".card-name-input");
  const sujetInput = card.querySelector(".card-sujet-input");

  const modeBadge = card.querySelector(".card-rename-mode-badge");
  const resetBtn = card.querySelector(".card-rename-reset-btn");

  if (item.customNameOverride) {
    if (modeBadge) {
      modeBadge.textContent = "Manuel";
      modeBadge.className = "card-rename-mode-badge manual";
    }
    if (resetBtn) {
      resetBtn.style.display = "grid";
      resetBtn.onclick = () => {
        item.customNameOverride = false;
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

  if (sujetInput) {
    if (document.activeElement !== sujetInput) sujetInput.value = item.sujet || "";
    sujetInput.oninput = () => {
      item.sujet = sujetInput.value;
      updateOutputNameFromPattern(item);
      enforceUniqueNames();
      
      // Update outputName input value on all cards to reflect index and deduplication changes
      state.items.forEach(other => {
        const otherCard = elements.queueBody.querySelector(`[data-id="${other.id}"]`);
        if (otherCard) {
          const otherInput = otherCard.querySelector(".card-name-input");
          if (otherInput && document.activeElement !== otherInput) {
            otherInput.value = other.outputName;
          }
          const otherResetBtn = otherCard.querySelector(".card-rename-reset-btn");
          const otherBadge = otherCard.querySelector(".card-rename-mode-badge");
          if (otherBadge) {
            otherBadge.textContent = other.customNameOverride ? "Manuel" : "Auto";
            otherBadge.className = `card-rename-mode-badge ${other.customNameOverride ? "manual" : "auto"}`;
          }
          if (otherResetBtn) {
            otherResetBtn.style.display = other.customNameOverride ? "grid" : "none";
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

  // Affiche toujours le nom de sortie estimé, éditable à la main
  nameInput.style.display = "block";
  if (document.activeElement !== nameInput) nameInput.value = item.outputName;
  nameInput.onchange = () => commitRename(item, nameInput.value, nameInput);

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
}

function percentGain(input, output) {
  if (!input) return 0;
  return Math.round((1 - output / input) * 100);
}

function statusClass(status) {
  if (status === "done") return "done";
  if (status === "error") return "error";
  if (status === "running") return "running";
  return "";
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

function waitFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

render();

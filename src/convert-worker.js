/**
 * Worker de conversion d'image.
 * Décode (createImageBitmap), recadre, réduit par paliers sur OffscreenCanvas,
 * puis encode via les codecs WASM @jsquash (vrai lossless WebP/VP8L et AVIF
 * de qualité contrôlée). Repli automatique sur OffscreenCanvas.convertToBlob
 * si le WASM échoue ou si le format n'est pas géré.
 *
 * Tout est hors du thread principal : l'UI ne fige jamais, sans limite de taille.
 */

let webpEncode = null;
let avifEncode = null;

async function getWebpEncode() {
  if (!webpEncode) {
    const mod = await import("@jsquash/webp/encode.js");
    webpEncode = mod.default;
  }
  return webpEncode;
}

async function getAvifEncode() {
  if (!avifEncode) {
    const mod = await import("@jsquash/avif/encode.js");
    avifEncode = mod.default;
  }
  return avifEncode;
}

self.onmessage = async (event) => {
  const { id, blob, settings, crop } = event.data;
  try {
    const result = await convert(blob, settings, crop);
    self.postMessage({ id, ok: true, ...result }, [result.buffer]);
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error && error.message ? error.message : "Erreur de conversion.",
    });
  }
};

async function convert(blob, settings, crop) {
  const bitmap = await createImageBitmap(blob, {
    imageOrientation: "from-image",
  });
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

  const format = settings.format || "image/webp";
  const context = canvas.getContext("2d");
  const imageData = context.getImageData(0, 0, width, height);

  let buffer;
  let codec;
  let engine;

  try {
    if (format === "image/avif") {
      const encode = await getAvifEncode();
      buffer = await encode(imageData, {
        quality: settings.lossless ? 100 : Math.round(settings.quality * 100),
        lossless: !!settings.lossless,
        speed: 6,
      });
      codec = settings.lossless ? "lossless" : "avif";
      engine = "wasm";
    } else {
      const encode = await getWebpEncode();
      buffer = await encode(imageData, {
        quality: settings.lossless ? 100 : Math.round(settings.quality * 100),
        lossless: settings.lossless ? 1 : 0,
      });
      codec = settings.lossless ? "lossless" : "lossy";
      engine = "wasm";
    }
  } catch (wasmError) {
    const fallbackBlob = await canvas.convertToBlob({
      type: format,
      quality: settings.lossless ? 1 : settings.quality,
    });
    if (
      !fallbackBlob ||
      (fallbackBlob.type !== "image/webp" && fallbackBlob.type !== "image/avif")
    ) {
      throw new Error(
        `Encodage ${format.replace("image/", "").toUpperCase()} non supporté.`,
      );
    }
    buffer = await fallbackBlob.arrayBuffer();
    codec = format === "image/avif" ? "avif" : settings.lossless ? "lossless" : "lossy";
    engine = "canvas";
  }

  return {
    buffer,
    srcWidth,
    srcHeight,
    outWidth: width,
    outHeight: height,
    codec,
    engine,
    mime: format,
  };
}

// Région source à extraire. Supporte un rectangle explicite (recadrage manuel
// normalisé) ou un recadrage centré automatique sur un ratio (recadrage de lot).
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
  // Un preset réseau social fixe une taille de sortie exacte.
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

// Réduction par paliers (halving) : garde la netteté sur les grosses réductions.
// La région source (recadrage) est appliquée sur le premier drawImage.
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
  const canvas = new OffscreenCanvas(dw, dh);
  const context = canvas.getContext("2d", { alpha: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, sx, sy, sw, sh, 0, 0, dw, dh);
  return canvas;
}

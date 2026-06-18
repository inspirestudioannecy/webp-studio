/**
 * Worker de conversion d'image.
 * Décode (createImageBitmap), recadre, réduit par paliers sur OffscreenCanvas,
 * puis encode via les codecs WASM @jsquash (vrai lossless WebP/VP8L et AVIF
 * de qualité contrôlée). Repli automatique sur OffscreenCanvas.convertToBlob
 * si le WASM échoue ou si le format n'est pas géré.
 *
 * Tout est hors du thread principal : l'UI ne fige jamais, sans limite de taille.
 */

import { computeRegion, targetDimensions, drawResized } from "./image-ops.js";

const createCanvas = (w, h) => new OffscreenCanvas(w, h);

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
    createCanvas,
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

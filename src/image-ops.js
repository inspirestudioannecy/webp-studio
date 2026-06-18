/**
 * Opérations géométriques d'image partagées entre le worker (OffscreenCanvas)
 * et le thread principal (canvas DOM, chemin de repli). Aucune dépendance au
 * DOM ici : le canvas est fourni par l'appelant via `createCanvas`, ce qui rend
 * le module utilisable dans les deux contextes.
 */

// Région source à extraire. Supporte un rectangle explicite (recadrage manuel
// normalisé) ou un recadrage centré automatique sur un ratio (recadrage de lot).
export function computeRegion(crop, W, H) {
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

export function targetDimensions(width, height, settings, crop) {
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
// `createCanvas(w, h)` retourne un canvas (OffscreenCanvas ou <canvas> DOM).
export function drawResized(source, sx, sy, sw, sh, targetWidth, targetHeight, createCanvas) {
  let current = source;
  let currentWidth = sw;
  let currentHeight = sh;
  let first = true;

  while (currentWidth > targetWidth * 2 && currentHeight > targetHeight * 2) {
    const nextWidth = Math.max(targetWidth, Math.floor(currentWidth / 2));
    const nextHeight = Math.max(targetHeight, Math.floor(currentHeight / 2));
    current = first
      ? paintStep(current, sx, sy, sw, sh, nextWidth, nextHeight, createCanvas)
      : paintStep(current, 0, 0, currentWidth, currentHeight, nextWidth, nextHeight, createCanvas);
    currentWidth = nextWidth;
    currentHeight = nextHeight;
    first = false;
  }

  return first
    ? paintStep(current, sx, sy, sw, sh, targetWidth, targetHeight, createCanvas)
    : paintStep(current, 0, 0, currentWidth, currentHeight, targetWidth, targetHeight, createCanvas);
}

function paintStep(source, sx, sy, sw, sh, dw, dh, createCanvas) {
  const canvas = createCanvas(dw, dh);
  const context = canvas.getContext("2d", { alpha: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, sx, sy, sw, sh, 0, 0, dw, dh);
  return canvas;
}

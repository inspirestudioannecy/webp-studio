#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const supportedExtensions = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".tif",
  ".tiff",
  ".bmp",
  ".avif",
  ".heic",
  ".heif",
  ".svg",
  ".webp",
]);

const defaultOptions = {
  inputDir: path.join(rootDir, "input"),
  outputDir: path.join(rootDir, "output"),
  quality: 80,
  format: "webp",
  width: null,
  height: null,
  lossless: false,
  concurrency: Math.max(1, os.cpus().length - 1),
  overwrite: false,
  recursive: true,
  keepTree: true,
};

const colors = {
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
  reset: "\x1b[0m",
};

function usage() {
  console.log(`
Usage:
  npm run convert
  npm run convert -- ./input ./output
  npm run convert -- ./images ./webp --quality 80 --overwrite

Options:
  --quality <1-100>       Qualite WebP/AVIF. Defaut: 80
  --format <webp|avif>    Format de sortie. Defaut: webp
  --width <pixels>        Largeur maximale de redimensionnement
  --height <pixels>       Hauteur maximale de redimensionnement
  --lossless              Active la compression sans perte
  --concurrency <number>  Nombre de conversions en parallele
  --overwrite             Reconvertit meme si fichier existe deja
  --flat                  Ne garde pas les sous-dossiers
  --help                  Affiche cette aide

Par defaut:
  entree:  ./input
  sortie:  ./output
`);
}

function parseArgs(argv) {
  const options = { ...defaultOptions };
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }

    if (arg === "--overwrite") {
      options.overwrite = true;
      continue;
    }

    if (arg === "--lossless") {
      options.lossless = true;
      continue;
    }

    if (arg === "--flat") {
      options.keepTree = false;
      continue;
    }

    if (arg === "--format" || arg === "-f") {
      const value = argv[index + 1];
      if (value !== "webp" && value !== "avif") {
        throw new Error("--format doit etre 'webp' ou 'avif'.");
      }
      options.format = value;
      index += 1;
      continue;
    }

    if (arg === "--width" || arg === "-w") {
      const value = Number(argv[index + 1]);
      if (!Number.isInteger(value) || value < 1) {
        throw new Error("--width doit etre un entier positif.");
      }
      options.width = value;
      index += 1;
      continue;
    }

    if (arg === "--height") {
      const value = Number(argv[index + 1]);
      if (!Number.isInteger(value) || value < 1) {
        throw new Error("--height doit etre un entier positif.");
      }
      options.height = value;
      index += 1;
      continue;
    }

    if (arg === "--quality" || arg === "-q") {
      const value = Number(argv[index + 1]);
      if (!Number.isInteger(value) || value < 1 || value > 100) {
        throw new Error("--quality doit etre un nombre entre 1 et 100.");
      }
      options.quality = value;
      index += 1;
      continue;
    }

    if (arg === "--concurrency" || arg === "-c") {
      const value = Number(argv[index + 1]);
      if (!Number.isInteger(value) || value < 1) {
        throw new Error("--concurrency doit etre un entier positif.");
      }
      options.concurrency = value;
      index += 1;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Option inconnue: ${arg}`);
    }

    positionals.push(arg);
  }

  if (positionals[0]) options.inputDir = path.resolve(positionals[0]);
  if (positionals[1]) options.outputDir = path.resolve(positionals[1]);
  if (positionals.length > 2) {
    throw new Error("Trop de dossiers fournis. Utilise: entree sortie");
  }

  return options;
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collectImages(inputDir, outputDir, recursive) {
  const files = [];
  const normalizedOutputDir = path.resolve(outputDir);

  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (!recursive) continue;
        const relativeToOutput = path.relative(
          normalizedOutputDir,
          path.resolve(entryPath),
        );
        const isInsideOutput =
          relativeToOutput === "" ||
          (!relativeToOutput.startsWith("..") &&
            !path.isAbsolute(relativeToOutput));

        if (isInsideOutput) continue;
        await walk(entryPath);
        continue;
      }

      if (!entry.isFile()) continue;

      const extension = path.extname(entry.name).toLowerCase();
      if (supportedExtensions.has(extension)) {
        files.push(entryPath);
      }
    }
  }

  await walk(inputDir);
  return files;
}

function getOutputPath(filePath, inputDir, outputDir, keepTree, format = "webp") {
  const parsed = path.parse(filePath);
  const relative = keepTree ? path.relative(inputDir, parsed.dir) : "";
  const outputName = `${parsed.name}.${format}`;
  return path.join(outputDir, relative, outputName);
}

async function shouldSkip(inputPath, outputPath, overwrite) {
  if (overwrite) return false;
  if (!(await pathExists(outputPath))) return false;

  const [inputStats, outputStats] = await Promise.all([
    fs.stat(inputPath),
    fs.stat(outputPath),
  ]);

  return outputStats.mtimeMs >= inputStats.mtimeMs;
}

async function convertImage(inputPath, outputPath, quality, overwrite, format = "webp", width = null, height = null, lossless = false) {
  if (await shouldSkip(inputPath, outputPath, overwrite)) {
    return { status: "skipped", inputPath, outputPath };
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  let transformer = sharp(inputPath, {
    animated: true,
    failOn: "warning",
  }).rotate();

  if (width || height) {
    transformer = transformer.resize({
      width: width || undefined,
      height: height || undefined,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  if (format === "avif") {
    transformer = transformer.avif({
      quality,
      effort: 4,
      lossless,
    });
  } else {
    transformer = transformer.webp({
      quality,
      effort: 4,
      smartSubsample: true,
      lossless,
    });
  }

  await transformer.toFile(outputPath);

  const [inputStats, outputStats] = await Promise.all([
    fs.stat(inputPath),
    fs.stat(outputPath),
  ]);

  const savedPercent =
    inputStats.size === 0
      ? 0
      : Math.round((1 - outputStats.size / inputStats.size) * 100);

  return {
    status: "converted",
    inputPath,
    outputPath,
    inputSize: inputStats.size,
    outputSize: outputStats.size,
    savedPercent,
  };
}

async function runPool(items, concurrency, task) {
  const results = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;

      try {
        results[index] = await task(items[index]);
      } catch (error) {
        results[index] = {
          status: "failed",
          inputPath: items[index],
          error,
        };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );

  return results;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function logResult(result, inputDir, outputDir) {
  const inputLabel = path.relative(inputDir, result.inputPath);

  if (result.status === "skipped") {
    console.log(`${colors.gray}skip${colors.reset} ${inputLabel}`);
    return;
  }

  if (result.status === "failed") {
    console.log(
      `${colors.red}fail${colors.reset} ${inputLabel} ${colors.gray}${result.error.message}${colors.reset}`,
    );
    return;
  }

  const outputLabel = path.relative(outputDir, result.outputPath);
  const saved =
    result.savedPercent > 0 ? `, -${result.savedPercent}%` : ", plus gros";

  console.log(
    `${colors.green}ok${colors.reset} ${inputLabel} -> ${outputLabel} (${formatBytes(
      result.inputSize,
    )} -> ${formatBytes(result.outputSize)}${saved})`,
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!(await pathExists(options.inputDir))) {
    await fs.mkdir(options.inputDir, { recursive: true });
    console.log(`Dossier cree: ${options.inputDir}`);
    console.log("Ajoute images dedans, puis relance: npm run convert");
    return;
  }

  await fs.mkdir(options.outputDir, { recursive: true });

  const images = await collectImages(
    options.inputDir,
    options.outputDir,
    options.recursive,
  );

  if (images.length === 0) {
    console.log(`Aucune image trouvee dans: ${options.inputDir}`);
    return;
  }

  console.log(
    `Conversion ${images.length} image(s) en WebP qualite ${options.quality}.`,
  );

  const results = await runPool(images, options.concurrency, (inputPath) => {
    const outputPath = getOutputPath(
      inputPath,
      options.inputDir,
      options.outputDir,
      options.keepTree,
      options.format,
    );

    return convertImage(
      inputPath,
      outputPath,
      options.quality,
      options.overwrite,
      options.format,
      options.width,
      options.height,
      options.lossless,
    );
  });

  for (const result of results) {
    logResult(result, options.inputDir, options.outputDir);
  }

  const converted = results.filter((result) => result.status === "converted");
  const skipped = results.filter((result) => result.status === "skipped");
  const failed = results.filter((result) => result.status === "failed");
  const inputTotal = converted.reduce((sum, result) => sum + result.inputSize, 0);
  const outputTotal = converted.reduce((sum, result) => sum + result.outputSize, 0);

  console.log("");
  console.log(
    `${colors.green}${converted.length} convertie(s)${colors.reset}, ${colors.gray}${skipped.length} ignoree(s)${colors.reset}, ${colors.red}${failed.length} erreur(s)${colors.reset}`,
  );

  if (converted.length > 0) {
    const savedPercent =
      inputTotal === 0 ? 0 : Math.round((1 - outputTotal / inputTotal) * 100);
    console.log(
      `Poids converti: ${formatBytes(inputTotal)} -> ${formatBytes(
        outputTotal,
      )} (${savedPercent}% gagne)`,
    );
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`${colors.red}Erreur:${colors.reset} ${error.message}`);
  process.exit(1);
});

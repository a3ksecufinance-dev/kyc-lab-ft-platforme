/**
 * Image Quality Check Service
 *
 * Vérifie 4 critères sur une image CIN avant OCR :
 *  1. Résolution suffisante (min 800×500)
 *  2. Luminosité correcte (moyenne 40-220 sur 0-255)
 *  3. Netteté (variance du Laplacien ≥ 30)
 *  4. Uniformité (pas d'image quasi-blanche/noire)
 *
 * Utilisé en soft-warning : n'empêche pas l'upload mais informe l'utilisateur
 * si la qualité est trop basse pour un OCR fiable.
 *
 * Utilise Jimp (pure JS) pour éviter les binaires natifs.
 */

import { createLogger } from "../../_core/logger";

const log = createLogger("image-quality");

// Seuils recommandés
const MIN_WIDTH       = 800;
const MIN_HEIGHT      = 500;
const MIN_BRIGHTNESS  = 40;
const MAX_BRIGHTNESS  = 220;
const MIN_SHARPNESS   = 30;    // Variance Laplacien
const MIN_ENTROPY     = 4.0;   // Bits (image non uniforme)

export interface ImageQualityReport {
  score:   number;              // 0-100 (100 = parfait)
  passed:  boolean;             // true si score ≥ 60
  issues:  string[];            // Liste des problèmes détectés
  metrics: {
    width?:      number;
    height?:     number;
    brightness?: number;        // 0-255
    sharpness?:  number;        // Variance Laplacien
    entropy?:    number;        // Bits
    processingMs?: number;
  };
}

/**
 * Analyse la qualité d'une image et renvoie un rapport détaillé.
 * Ne throw jamais — retourne un rapport dégradé en cas d'erreur.
 */
export async function checkImageQuality(buffer: Buffer): Promise<ImageQualityReport> {
  const t0 = Date.now();
  const issues: string[] = [];

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jimpModule: any = await import("jimp");
    const Jimp = jimpModule.Jimp ?? jimpModule.default?.Jimp ?? jimpModule.default;
    if (!Jimp || typeof Jimp.read !== "function") {
      return {
        score:   50,
        passed:  true,   // Bénéfice du doute si on ne peut pas analyser
        issues:  ["Analyse qualité indisponible"],
        metrics: { processingMs: Date.now() - t0 },
      };
    }

    const img = await Jimp.read(buffer);
    const { width, height } = img.bitmap;

    // ── 1. Résolution ────────────────────────────────────────────────────
    let resolutionScore = 100;
    if (width < MIN_WIDTH || height < MIN_HEIGHT) {
      resolutionScore = Math.round(Math.min(width / MIN_WIDTH, height / MIN_HEIGHT) * 100);
      issues.push(`Résolution trop basse (${width}×${height}, min ${MIN_WIDTH}×${MIN_HEIGHT})`);
    }

    // Downscale à ~600px longest side pour analyse rapide
    const analyzeImg = img.clone();
    const longest = Math.max(width, height);
    if (longest > 800) {
      const scale = 600 / longest;
      analyzeImg.resize({ w: Math.round(width * scale), h: Math.round(height * scale) });
    }

    const data = analyzeImg.bitmap.data;
    const w    = analyzeImg.bitmap.width;
    const h    = analyzeImg.bitmap.height;
    const nPixels = w * h;

    // ── 2. Luminosité + histogramme ──────────────────────────────────────
    let sumLum = 0;
    const histogram = new Uint32Array(256);
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
      const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      sumLum += lum;
      histogram[lum]!++;
    }
    const brightness = Math.round(sumLum / nPixels);

    let brightnessScore = 100;
    if (brightness < MIN_BRIGHTNESS) {
      brightnessScore = Math.round((brightness / MIN_BRIGHTNESS) * 100);
      issues.push(`Image trop sombre (luminosité ${brightness}, min ${MIN_BRIGHTNESS})`);
    } else if (brightness > MAX_BRIGHTNESS) {
      brightnessScore = Math.round(((255 - brightness) / (255 - MAX_BRIGHTNESS)) * 100);
      issues.push(`Image trop claire ou surexposée (luminosité ${brightness}, max ${MAX_BRIGHTNESS})`);
    }

    // ── 3. Entropie de Shannon (uniformité) ──────────────────────────────
    let entropy = 0;
    for (let i = 0; i < 256; i++) {
      const p = histogram[i]! / nPixels;
      if (p > 0) entropy -= p * Math.log2(p);
    }
    let entropyScore = 100;
    if (entropy < MIN_ENTROPY) {
      entropyScore = Math.round((entropy / MIN_ENTROPY) * 100);
      issues.push(`Image trop uniforme (entropie ${entropy.toFixed(2)}, min ${MIN_ENTROPY})`);
    }

    // ── 4. Netteté : variance du Laplacien ──────────────────────────────
    // Convertit d'abord en luminance array 1D
    const lum = new Uint8Array(nPixels);
    for (let i = 0; i < nPixels; i++) {
      const r = data[i * 4]!, g = data[i * 4 + 1]!, b = data[i * 4 + 2]!;
      lum[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }

    // Laplacien 3x3 : center*4 - top - bottom - left - right
    let sumLap = 0, sumLap2 = 0, count = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const c = lum[y * w + x]!;
        const t = lum[(y - 1) * w + x]!;
        const bo = lum[(y + 1) * w + x]!;
        const l = lum[y * w + x - 1]!;
        const r = lum[y * w + x + 1]!;
        const laplacian = 4 * c - t - bo - l - r;
        sumLap  += laplacian;
        sumLap2 += laplacian * laplacian;
        count++;
      }
    }
    const meanLap = sumLap / count;
    const variance = sumLap2 / count - meanLap * meanLap;
    const sharpness = Math.round(variance);

    let sharpnessScore = 100;
    if (sharpness < MIN_SHARPNESS) {
      sharpnessScore = Math.round((sharpness / MIN_SHARPNESS) * 100);
      issues.push(`Image floue (netteté ${sharpness}, min ${MIN_SHARPNESS})`);
    }

    // ── Score global (pondéré) ───────────────────────────────────────────
    // Sharpness et Brightness sont les plus critiques pour OCR
    const globalScore = Math.round(
      sharpnessScore * 0.4 +
      brightnessScore * 0.3 +
      resolutionScore * 0.2 +
      entropyScore * 0.1
    );

    const passed = globalScore >= 60;

    const durationMs = Date.now() - t0;
    log.info({
      globalScore, passed, sharpness, brightness, entropy: entropy.toFixed(2),
      width, height, durationMs,
    }, "Analyse qualité image terminée");

    return {
      score:   globalScore,
      passed,
      issues,
      metrics: {
        width, height,
        brightness,
        sharpness,
        entropy: parseFloat(entropy.toFixed(2)),
        processingMs: durationMs,
      },
    };

  } catch (err) {
    log.warn({ err }, "Erreur analyse qualité image — score neutre retourné");
    return {
      score:   50,
      passed:  true,
      issues:  ["Erreur d'analyse — bénéfice du doute"],
      metrics: { processingMs: Date.now() - t0 },
    };
  }
}

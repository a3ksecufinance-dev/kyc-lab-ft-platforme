/**
 * Client-side quality gate — analyse d'une image AVANT upload.
 *
 * Mêmes 4 critères que server/modules/documents/image-quality.service.ts :
 *   1. Résolution (min 800×500)
 *   2. Luminosité (moyenne 40-220 sur 0-255)
 *   3. Netteté (variance du Laplacien ≥ 30)
 *   4. Uniformité (entropie Shannon ≥ 4.0 bits)
 *
 * Utilise Canvas 2D natif — aucune dépendance externe.
 * Downscale à ~600px longest side pour tenir en <200ms sur mobile.
 */

const MIN_WIDTH      = 800;
const MIN_HEIGHT     = 500;
const MIN_BRIGHTNESS = 40;
const MAX_BRIGHTNESS = 220;
const MIN_SHARPNESS  = 30;
const MIN_ENTROPY    = 4.0;

export interface ClientQualityReport {
  score:   number;                // 0-100 (100 = parfait)
  passed:  boolean;               // true si score ≥ 60
  issues:  string[];
  metrics: {
    width:      number;
    height:     number;
    brightness: number;
    sharpness:  number;
    entropy:    number;
    durationMs: number;
  };
}

/**
 * Analyse un File (Blob) et renvoie un rapport de qualité.
 * Ne throw jamais — retourne un rapport neutre en cas d'erreur.
 */
export async function checkClientImageQuality(file: File): Promise<ClientQualityReport> {
  const t0 = performance.now();
  try {
    const img = await loadImage(file);
    const { width, height } = img;

    const issues: string[] = [];

    // ── 1. Résolution ─────────────────────────────────────────────────────
    let resolutionScore = 100;
    if (width < MIN_WIDTH || height < MIN_HEIGHT) {
      resolutionScore = Math.round(
        Math.min(width / MIN_WIDTH, height / MIN_HEIGHT) * 100,
      );
      issues.push(`Résolution basse (${width}×${height}, min ${MIN_WIDTH}×${MIN_HEIGHT})`);
    }

    // Downscale à 600px longest side pour analyse rapide
    const longest = Math.max(width, height);
    const scale = longest > 800 ? 600 / longest : 1;
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D non disponible");
    ctx.drawImage(img, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    const nPixels = w * h;

    // ── 2. Luminosité + histogramme ──────────────────────────────────────
    let sumLum = 0;
    const histogram = new Uint32Array(256);
    const lum = new Uint8Array(nPixels);
    for (let i = 0; i < nPixels; i++) {
      const r = data[i * 4]!;
      const g = data[i * 4 + 1]!;
      const b = data[i * 4 + 2]!;
      const l = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      lum[i] = l;
      sumLum += l;
      histogram[l]!++;
    }
    const brightness = Math.round(sumLum / nPixels);

    let brightnessScore = 100;
    if (brightness < MIN_BRIGHTNESS) {
      brightnessScore = Math.round((brightness / MIN_BRIGHTNESS) * 100);
      issues.push(`Trop sombre (luminosité ${brightness})`);
    } else if (brightness > MAX_BRIGHTNESS) {
      brightnessScore = Math.round(((255 - brightness) / (255 - MAX_BRIGHTNESS)) * 100);
      issues.push(`Trop lumineuse / surexposée (luminosité ${brightness})`);
    }

    // ── 3. Entropie (uniformité) ─────────────────────────────────────────
    let entropy = 0;
    for (let i = 0; i < 256; i++) {
      const p = histogram[i]! / nPixels;
      if (p > 0) entropy -= p * Math.log2(p);
    }
    let entropyScore = 100;
    if (entropy < MIN_ENTROPY) {
      entropyScore = Math.round((entropy / MIN_ENTROPY) * 100);
      issues.push(`Image trop uniforme (entropie ${entropy.toFixed(2)})`);
    }

    // ── 4. Netteté : variance du Laplacien 3×3 ───────────────────────────
    let sumLap = 0, sumLap2 = 0, count = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const c  = lum[y * w + x]!;
        const t  = lum[(y - 1) * w + x]!;
        const bo = lum[(y + 1) * w + x]!;
        const l  = lum[y * w + x - 1]!;
        const r  = lum[y * w + x + 1]!;
        const lap = 4 * c - t - bo - l - r;
        sumLap  += lap;
        sumLap2 += lap * lap;
        count++;
      }
    }
    const meanLap  = sumLap / count;
    const variance = sumLap2 / count - meanLap * meanLap;
    const sharpness = Math.round(variance);

    let sharpnessScore = 100;
    if (sharpness < MIN_SHARPNESS) {
      sharpnessScore = Math.round((sharpness / MIN_SHARPNESS) * 100);
      issues.push(`Image floue (netteté ${sharpness})`);
    }

    // ── Score global pondéré ──────────────────────────────────────────────
    const score = Math.round(
      sharpnessScore  * 0.4 +
      brightnessScore * 0.3 +
      resolutionScore * 0.2 +
      entropyScore    * 0.1,
    );

    return {
      score,
      passed: score >= 60,
      issues,
      metrics: {
        width, height,
        brightness, sharpness,
        entropy: parseFloat(entropy.toFixed(2)),
        durationMs: Math.round(performance.now() - t0),
      },
    };

  } catch (err) {
    // Bénéfice du doute : n'empêche pas l'upload
    return {
      score: 50,
      passed: true,
      issues: [`Analyse indisponible: ${(err as Error).message}`],
      metrics: {
        width: 0, height: 0, brightness: 0, sharpness: 0, entropy: 0,
        durationMs: Math.round(performance.now() - t0),
      },
    };
  }
}

/**
 * Décharge un File en HTMLImageElement.
 * URL.createObjectURL → onload → cleanup automatique.
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Lecture image échouée"));
    };
    img.src = url;
  });
}

/**
 * Compresse une image (Blob) via canvas si elle dépasse maxDimensionPx.
 * Utile pour réduire la taille avant upload (évite les 8 Mo d'un iPhone).
 * Renvoie le Blob compressé (ou l'original si pas besoin).
 */
export async function compressImageIfNeeded(
  file: File,
  maxDimensionPx = 2400,
  quality = 0.88,
): Promise<File> {
  try {
    const img = await loadImage(file);
    const longest = Math.max(img.width, img.height);
    if (longest <= maxDimensionPx) return file;

    const scale = maxDimensionPx / longest;
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);

    return new Promise((resolve) => {
      canvas.toBlob(
        blob => {
          if (!blob) { resolve(file); return; }
          const newFile = new File([blob], file.name, {
            type: "image/jpeg",
            lastModified: file.lastModified,
          });
          resolve(newFile);
        },
        "image/jpeg",
        quality,
      );
    });
  } catch {
    return file; // Fallback : envoyer l'original
  }
}

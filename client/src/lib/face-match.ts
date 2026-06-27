/**
 * Face Match — Comparaison biométrique côté client
 *
 * Utilise @vladmandic/face-api (fork moderne de face-api.js) avec 3 modèles :
 *  - TinyFaceDetector       : détection visages (~190 KB, rapide)
 *  - FaceLandmark68Net      : 68 points de référence (~350 KB)
 *  - FaceRecognitionNet     : descripteur 128D pour comparaison (~6.2 MB)
 *
 * Total : ~6.7 MB téléchargés une fois, mis en cache navigateur.
 *
 * Score retourné : 0-100 (100 = identique, 0 = aucune similitude)
 * Seuils recommandés :
 *   ≥ 80 : Match fort (identité confirmée)
 *   65-79 : Match acceptable (révision recommandée)
 *   < 65 : Match faible (révision manuelle obligatoire)
 */

import * as faceapi from "@vladmandic/face-api";

let modelsLoaded = false;
let loadingPromise: Promise<void> | null = null;

const MODEL_URL = "/models";

/**
 * Charge les 3 modèles nécessaires en mémoire navigateur.
 * Idempotent — peut être appelé plusieurs fois sans risque.
 */
export async function loadFaceModels(): Promise<void> {
  if (modelsLoaded) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    modelsLoaded = true;
  })();

  return loadingPromise;
}

/**
 * Convertit un base64 (sans préfixe data:) en HTMLImageElement.
 */
function base64ToImage(base64: string, mimeType = "image/jpeg"): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error("Image invalide"));
    img.src = `data:${mimeType};base64,${base64}`;
  });
}

/**
 * Extrait le descripteur facial 128D d'une image.
 * Retourne null si aucun visage détecté.
 */
async function extractDescriptor(image: HTMLImageElement): Promise<Float32Array | null> {
  await loadFaceModels();

  const detection = await faceapi
    .detectSingleFace(image, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptor();

  return detection?.descriptor ?? null;
}

export interface FaceMatchClientResult {
  score:        number;          // 0-100
  matched:      boolean;          // score >= 65
  message:      string;
  distance:     number;           // distance euclidienne brute
  faces: {
    cinDetected:    boolean;
    selfieDetected: boolean;
  };
  durationMs:   number;
}

/**
 * Compare un visage CIN avec un selfie.
 * Calcule la distance euclidienne entre les descripteurs 128D.
 *
 * Conversion distance → score :
 *   distance 0.0  → score 100% (identique)
 *   distance 0.6  → score 50%  (seuil de référence face-api)
 *   distance 1.0+ → score 0%   (différent)
 */
export async function matchFaces(
  cinImageBase64:    string,
  selfieImageBase64: string,
): Promise<FaceMatchClientResult> {
  const t0 = Date.now();

  const [cinImage, selfieImage] = await Promise.all([
    base64ToImage(cinImageBase64),
    base64ToImage(selfieImageBase64),
  ]);

  const [cinDescriptor, selfieDescriptor] = await Promise.all([
    extractDescriptor(cinImage),
    extractDescriptor(selfieImage),
  ]);

  const faces = {
    cinDetected:    !!cinDescriptor,
    selfieDetected: !!selfieDescriptor,
  };

  if (!cinDescriptor || !selfieDescriptor) {
    return {
      score:    0,
      matched:  false,
      message:  !cinDescriptor && !selfieDescriptor ? "Aucun visage détecté"
              : !cinDescriptor  ? "Visage CIN non détecté — réessayez la photo CIN"
              : "Visage selfie non détecté — réessayez le selfie",
      distance: 1,
      faces,
      durationMs: Date.now() - t0,
    };
  }

  // Distance euclidienne entre les deux descripteurs 128D
  const distance = faceapi.euclideanDistance(cinDescriptor, selfieDescriptor);

  // Conversion distance → score 0-100
  // face-api utilise 0.6 comme seuil de match par défaut
  // distance 0 → 100, distance 0.6 → 60, distance 1.0+ → 0
  let score: number;
  if (distance <= 0.3) {
    score = 100 - Math.round(distance * 33);  // 0.3 → 90
  } else if (distance <= 0.6) {
    score = 90 - Math.round((distance - 0.3) * 100);  // 0.6 → 60
  } else {
    score = Math.max(0, 60 - Math.round((distance - 0.6) * 150));  // 1.0 → 0
  }

  const matched = score >= 65;
  const message =
    score >= 85 ? "Correspondance excellente"
  : score >= 75 ? "Correspondance forte"
  : score >= 65 ? "Correspondance acceptable"
  : score >= 50 ? "Correspondance faible — révision manuelle requise"
  :               "Pas de correspondance significative";

  return {
    score, matched, message, distance,
    faces,
    durationMs: Date.now() - t0,
  };
}

/**
 * Vérifie qu'au moins 1 visage est détecté dans l'image.
 * Utile pour valider une capture avant traitement.
 */
export async function detectFace(imageBase64: string): Promise<{ detected: boolean; confidence: number }> {
  await loadFaceModels();
  const image = await base64ToImage(imageBase64);
  const detection = await faceapi.detectSingleFace(
    image,
    new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 })
  );
  return {
    detected: !!detection,
    confidence: detection ? Math.round(detection.score * 100) : 0,
  };
}

/**
 * Service de stockage de fichiers — abstraction local / S3 (AWS + MinIO)
 *
 * Stratégie :
 *  - dev  (STORAGE_BACKEND=local) : disque local dans ./uploads/
 *  - prod (STORAGE_BACKEND=s3)    : AWS S3 ou MinIO via AWS SDK v3
 *
 * Interface commune :
 *   saveFile(buffer, filename, mimeType)  → { path, url, backend, size }
 *   deleteFile(path, backend)
 *   getFileUrl(path, backend)             → URL signée (S3) ou URL locale
 *   checkS3Health()                       → statut connectivité bucket
 */

import fs   from "fs/promises";
import path from "path";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV }          from "./env";
import { createLogger } from "./logger";

const log = createLogger("storage");

export interface StoredFile {
  path:    string;   // chemin local relatif ou S3 key
  url:     string;   // URL de référence (signée à la volée pour S3)
  backend: "local" | "s3";
  size:    number;
}

// ─── Client S3 singleton ──────────────────────────────────────────────────────

let _s3: S3Client | null = null;

function getS3Client(): S3Client {
  if (!_s3) {
    _s3 = new S3Client({
      region:         ENV.S3_REGION,
      forcePathStyle: ENV.S3_FORCE_PATH_STYLE,   // requis pour MinIO
      ...(ENV.S3_ENDPOINT ? { endpoint: ENV.S3_ENDPOINT } : {}),
      credentials: {
        accessKeyId:     ENV.S3_ACCESS_KEY_ID     ?? "",
        secretAccessKey: ENV.S3_SECRET_ACCESS_KEY ?? "",
      },
    });
    log.info({
      region:   ENV.S3_REGION,
      endpoint: ENV.S3_ENDPOINT ?? "AWS",
      bucket:   ENV.S3_BUCKET,
      pathStyle: ENV.S3_FORCE_PATH_STYLE,
    }, "Client S3 initialisé");
  }
  return _s3;
}

// ─── Stockage local ───────────────────────────────────────────────────────────

async function ensureUploadDir(subdir: string): Promise<string> {
  const dir = path.join(ENV.UPLOAD_DIR, subdir);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function saveLocal(buffer: Buffer, filename: string, subdir: string): Promise<StoredFile> {
  const dir      = await ensureUploadDir(subdir);
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const unique   = `${Date.now()}_${safeName}`;
  const fullPath = path.join(dir, unique);

  await fs.writeFile(fullPath, buffer);
  const relativePath = path.join(subdir, unique);
  const url          = `/uploads/${subdir}/${unique}`;

  log.info({ path: relativePath, size: buffer.length }, "Fichier sauvegardé (local)");
  return { path: relativePath, url, backend: "local", size: buffer.length };
}

async function deleteLocal(filePath: string): Promise<void> {
  try {
    await fs.unlink(path.join(ENV.UPLOAD_DIR, filePath));
  } catch (err) {
    log.warn({ err, filePath }, "Échec suppression fichier local");
  }
}

// ─── Stockage S3 / MinIO ──────────────────────────────────────────────────────

async function saveS3(
  buffer:   Buffer,
  filename: string,
  subdir:   string,
  mimeType: string,
): Promise<StoredFile> {
  if (!ENV.S3_BUCKET) throw new Error("S3_BUCKET non configuré");

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key      = `documents/${subdir}/${Date.now()}_${safeName}`;

  await getS3Client().send(new PutObjectCommand({
    Bucket:                  ENV.S3_BUCKET,
    Key:                     key,
    Body:                    buffer,
    ContentType:             mimeType,
    ServerSideEncryption:    "AES256",    // SSE-S3 chiffrement au repos
  }));

  // URL de référence interne — sera remplacée par une URL signée à la lecture
  const url = `s3://${ENV.S3_BUCKET}/${key}`;

  log.info({ key, size: buffer.length, bucket: ENV.S3_BUCKET }, "Fichier sauvegardé (S3)");
  return { path: key, url, backend: "s3", size: buffer.length };
}

async function deleteS3(key: string): Promise<void> {
  if (!ENV.S3_BUCKET) return;
  try {
    await getS3Client().send(new DeleteObjectCommand({
      Bucket: ENV.S3_BUCKET,
      Key:    key,
    }));
    log.info({ key }, "Fichier supprimé (S3)");
  } catch (err) {
    log.warn({ err, key }, "Échec suppression fichier S3");
  }
}

async function getS3SignedUrl(key: string): Promise<string> {
  if (!ENV.S3_BUCKET) throw new Error("S3_BUCKET non configuré");
  return getSignedUrl(
    getS3Client(),
    new GetObjectCommand({ Bucket: ENV.S3_BUCKET, Key: key }),
    { expiresIn: ENV.S3_SIGNED_URL_EXPIRES },
  );
}

// ─── Health check S3 ─────────────────────────────────────────────────────────

export async function checkS3Health(): Promise<{
  status: "healthy" | "unhealthy";
  bucket?: string;
  error?:  string;
}> {
  if (ENV.STORAGE_BACKEND !== "s3") {
    return { status: "healthy", bucket: "local (S3 désactivé)" };
  }
  if (!ENV.S3_BUCKET) {
    return { status: "unhealthy", error: "S3_BUCKET non configuré" };
  }
  try {
    await getS3Client().send(new HeadBucketCommand({ Bucket: ENV.S3_BUCKET }));
    return { status: "healthy", bucket: ENV.S3_BUCKET };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: "unhealthy", bucket: ENV.S3_BUCKET, error: msg };
  }
}

// ─── Validation au démarrage ──────────────────────────────────────────────────

export async function validateStorageConfig(): Promise<void> {
  if (ENV.STORAGE_BACKEND !== "s3") return;

  const missing: string[] = [];
  if (!ENV.S3_BUCKET)          missing.push("S3_BUCKET");
  if (!ENV.S3_ACCESS_KEY_ID)   missing.push("S3_ACCESS_KEY_ID");
  if (!ENV.S3_SECRET_ACCESS_KEY) missing.push("S3_SECRET_ACCESS_KEY");

  if (missing.length > 0) {
    throw new Error(`STORAGE_BACKEND=s3 mais variables manquantes : ${missing.join(", ")}`);
  }

  // Vérifier accessibilité du bucket
  const health = await checkS3Health();
  if (health.status === "unhealthy") {
    throw new Error(`Bucket S3 inaccessible (${ENV.S3_BUCKET}) : ${health.error}`);
  }

  log.info({ bucket: ENV.S3_BUCKET, region: ENV.S3_REGION }, "Stockage S3 validé au démarrage");
}

// ─── API publique ─────────────────────────────────────────────────────────────

export async function saveFile(
  buffer:   Buffer,
  filename: string,
  mimeType: string,
  subdir    = "documents",
): Promise<StoredFile> {
  if (ENV.STORAGE_BACKEND === "s3") {
    return saveS3(buffer, filename, subdir, mimeType);
  }
  return saveLocal(buffer, filename, subdir);
}

export async function deleteFile(filePath: string, backend: "local" | "s3"): Promise<void> {
  if (backend === "s3") return deleteS3(filePath);
  return deleteLocal(filePath);
}

export async function getFileUrl(
  filePath:   string,
  backend:    "local" | "s3",
  storedUrl?: string,
): Promise<string> {
  if (backend === "s3") return getS3SignedUrl(filePath);
  return storedUrl ?? `/uploads/${filePath}`;
}

// ─── Validation fichier ───────────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/webp",
  "application/pdf",
]);

const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);

export function validateUploadedFile(
  originalName: string,
  mimeType:     string,
  sizeBytes:    number,
): { valid: boolean; error?: string } {
  const ext  = path.extname(originalName).toLowerCase();
  const maxB = ENV.UPLOAD_MAX_SIZE_MB * 1024 * 1024;

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return { valid: false, error: `Type MIME non autorisé : ${mimeType}` };
  }
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { valid: false, error: `Extension non autorisée : ${ext}` };
  }
  if (sizeBytes > maxB) {
    return { valid: false, error: `Fichier trop lourd (max ${ENV.UPLOAD_MAX_SIZE_MB} Mo)` };
  }
  return { valid: true };
}

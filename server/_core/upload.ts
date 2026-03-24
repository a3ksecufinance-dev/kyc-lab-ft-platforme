/**
 * Service de stockage de fichiers — abstraction local/S3
 *
 * Stratégie :
 *  - dev  (STORAGE_BACKEND=local) : disque local dans ./uploads/
 *  - prod (STORAGE_BACKEND=s3)    : S3 ou MinIO via AWS SDK v3
 *
 * Interface commune :
 *   saveFile(buffer, filename, mimeType)  → { path, url, backend }
 *   deleteFile(path, backend)
 *   getSignedUrl(path)                   → URL temporaire (S3) ou URL locale
 */

import fs   from "fs/promises";
import path from "path";
import { ENV } from "./env";
import { createLogger } from "./logger";

const log = createLogger("storage");

export interface StoredFile {
  path:    string;   // chemin local ou S3 key
  url:     string;   // URL publique ou signée
  backend: "local" | "s3";
  size:    number;
}

// ─── Stockage local ───────────────────────────────────────────────────────────

async function ensureUploadDir(subdir: string): Promise<string> {
  const dir = path.join(ENV.UPLOAD_DIR, subdir);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function saveLocal(
  buffer:   Buffer,
  filename: string,
  subdir:   string,
): Promise<StoredFile> {
  const dir      = await ensureUploadDir(subdir);
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const unique   = `${Date.now()}_${safeName}`;
  const fullPath = path.join(dir, unique);

  await fs.writeFile(fullPath, buffer);
  const relativePath = path.join(subdir, unique);
  const url = `/uploads/${subdir}/${unique}`;

  log.info({ path: relativePath, size: buffer.length }, "Fichier sauvegardé (local)");
  return { path: relativePath, url, backend: "local", size: buffer.length };
}

async function deleteLocal(filePath: string): Promise<void> {
  try {
    const full = path.join(ENV.UPLOAD_DIR, filePath);
    await fs.unlink(full);
  } catch (err) {
    log.warn({ err, filePath }, "Échec suppression fichier local");
  }
}

// ─── Stockage S3 ──────────────────────────────────────────────────────────────

async function getS3Client() {
  // Import dynamique — évite de charger le SDK AWS si on est en local
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { S3Client } = await import("@aws-sdk/client-s3" as any);
  return new S3Client({
    region: ENV.S3_REGION,
    ...(ENV.S3_ENDPOINT ? { endpoint: ENV.S3_ENDPOINT } : {}),
    credentials: {
      accessKeyId:     ENV.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: ENV.S3_SECRET_ACCESS_KEY ?? "",
    },
  });
}

async function saveS3(
  buffer:   Buffer,
  filename: string,
  subdir:   string,
  mimeType: string,
): Promise<StoredFile> {
  if (!ENV.S3_BUCKET) throw new Error("S3_BUCKET non configuré");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { PutObjectCommand } = await import("@aws-sdk/client-s3" as any);
  const client   = await getS3Client();
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key      = `documents/${subdir}/${Date.now()}_${safeName}`;

  await client.send(new PutObjectCommand({
    Bucket:      ENV.S3_BUCKET,
    Key:         key,
    Body:        buffer,
    ContentType: mimeType,
  }));

  // URL publique ou via endpoint custom (MinIO)
  const baseUrl = ENV.S3_ENDPOINT
    ? `${ENV.S3_ENDPOINT}/${ENV.S3_BUCKET}`
    : `https://${ENV.S3_BUCKET}.s3.${ENV.S3_REGION}.amazonaws.com`;
  const url = `${baseUrl}/${key}`;

  log.info({ key, size: buffer.length }, "Fichier sauvegardé (S3)");
  return { path: key, url, backend: "s3", size: buffer.length };
}

async function deleteS3(key: string): Promise<void> {
  if (!ENV.S3_BUCKET) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3" as any);
    const client = await getS3Client();
    await client.send(new DeleteObjectCommand({ Bucket: ENV.S3_BUCKET, Key: key }));
  } catch (err) {
    log.warn({ err, key }, "Échec suppression fichier S3");
  }
}

async function getS3SignedUrl(key: string, expiresIn = 3600): Promise<string> {
  if (!ENV.S3_BUCKET) throw new Error("S3_BUCKET non configuré");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { GetObjectCommand } = await import("@aws-sdk/client-s3" as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { getSignedUrl }     = await import("@aws-sdk/s3-request-presigner" as any);
  const client = await getS3Client();
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: ENV.S3_BUCKET, Key: key }),
    { expiresIn },
  );
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
  filePath: string,
  backend:  "local" | "s3",
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

import { describe, it, expect, vi } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("./env", () => ({
  ENV: {
    STORAGE_BACKEND:    "local",
    UPLOAD_DIR:         "./uploads_test",
    UPLOAD_MAX_SIZE_MB: 10,
    S3_REGION:          "eu-west-1",
    S3_FORCE_PATH_STYLE: false,
    S3_SIGNED_URL_EXPIRES: 3600,
    NODE_ENV:           "test",
  },
}));
vi.mock("./logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
// Mock fs pour ne pas créer de vrais fichiers
vi.mock("fs/promises", () => ({
  default: { mkdir: vi.fn().mockResolvedValue(undefined), writeFile: vi.fn().mockResolvedValue(undefined), unlink: vi.fn().mockResolvedValue(undefined) },
  mkdir:     vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink:    vi.fn().mockResolvedValue(undefined),
}));

import { validateUploadedFile } from "./upload";

// ─── validateUploadedFile ─────────────────────────────────────────────────────

describe("upload — validateUploadedFile", () => {

  // ── MIME type ──────────────────────────────────────────────────────────────

  it("accepte image/jpeg avec .jpg", () => {
    const r = validateUploadedFile("photo.jpg", "image/jpeg", 1024);
    expect(r.valid).toBe(true);
    expect(r.error).toBeUndefined();
  });

  it("accepte image/jpeg avec .jpeg", () => {
    const r = validateUploadedFile("photo.jpeg", "image/jpeg", 1024);
    expect(r.valid).toBe(true);
  });

  it("accepte image/jpg avec .jpg", () => {
    const r = validateUploadedFile("photo.jpg", "image/jpg", 1024);
    expect(r.valid).toBe(true);
  });

  it("accepte image/png avec .png", () => {
    const r = validateUploadedFile("document.png", "image/png", 2048);
    expect(r.valid).toBe(true);
  });

  it("accepte image/webp avec .webp", () => {
    const r = validateUploadedFile("doc.webp", "image/webp", 500);
    expect(r.valid).toBe(true);
  });

  it("accepte application/pdf avec .pdf", () => {
    const r = validateUploadedFile("passport.pdf", "application/pdf", 500_000);
    expect(r.valid).toBe(true);
  });

  it("rejette text/html", () => {
    const r = validateUploadedFile("page.html", "text/html", 100);
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/MIME/i);
  });

  it("rejette application/javascript", () => {
    const r = validateUploadedFile("script.js", "application/javascript", 100);
    expect(r.valid).toBe(false);
  });

  it("rejette application/x-php", () => {
    const r = validateUploadedFile("shell.php", "application/x-php", 100);
    expect(r.valid).toBe(false);
  });

  it("rejette image/svg+xml (vecteur — XSS possible)", () => {
    const r = validateUploadedFile("icon.svg", "image/svg+xml", 100);
    expect(r.valid).toBe(false);
  });

  // ── Extension ──────────────────────────────────────────────────────────────

  it("rejette .exe même avec un MIME autorisé", () => {
    const r = validateUploadedFile("virus.exe", "image/jpeg", 100);
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/extension/i);
  });

  it("rejette .php renommé en .pdf (mauvais MIME)", () => {
    // Si le MIME est text/x-php → rejeté par le filtre MIME
    const r = validateUploadedFile("shell.php.pdf", "text/x-php", 100);
    expect(r.valid).toBe(false);
  });

  it("rejette .docx", () => {
    const r = validateUploadedFile("doc.docx", "application/vnd.openxmlformats", 100);
    expect(r.valid).toBe(false);
  });

  it("rejette .zip", () => {
    const r = validateUploadedFile("archive.zip", "application/zip", 100);
    expect(r.valid).toBe(false);
  });

  it("est insensible à la casse de l'extension", () => {
    const r = validateUploadedFile("photo.JPG", "image/jpeg", 1024);
    expect(r.valid).toBe(true);
  });

  it("est insensible à la casse — .PDF accepté", () => {
    const r = validateUploadedFile("CONTRACT.PDF", "application/pdf", 1024);
    expect(r.valid).toBe(true);
  });

  // ── Taille ─────────────────────────────────────────────────────────────────

  it("accepte un fichier exactement à la limite (10 Mo)", () => {
    const tenMb = 10 * 1024 * 1024;
    const r = validateUploadedFile("file.pdf", "application/pdf", tenMb);
    expect(r.valid).toBe(true);
  });

  it("rejette un fichier dépassant 10 Mo", () => {
    const overLimit = 10 * 1024 * 1024 + 1;
    const r = validateUploadedFile("big.pdf", "application/pdf", overLimit);
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/Mo|trop lourd/i);
  });

  it("rejette un fichier de 0 octets — MIME inconnu", () => {
    const r = validateUploadedFile("empty.bin", "application/octet-stream", 0);
    expect(r.valid).toBe(false);
  });

  it("rejette un fichier de 100 Mo", () => {
    const r = validateUploadedFile("huge.pdf", "application/pdf", 100 * 1024 * 1024);
    expect(r.valid).toBe(false);
  });

  // ── Combinaisons limites ───────────────────────────────────────────────────

  it("rejette si MIME valide mais extension invalide", () => {
    const r = validateUploadedFile("document.txt", "image/jpeg", 1024);
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/extension/i);
  });

  it("rejette si extension valide mais MIME invalide", () => {
    const r = validateUploadedFile("document.pdf", "application/zip", 1024);
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/MIME/i);
  });

  it("retourne valid:true et pas d'error pour une combinaison parfaite", () => {
    const r = validateUploadedFile("id_card.jpg", "image/jpeg", 500_000);
    expect(r).toEqual({ valid: true });
  });
});

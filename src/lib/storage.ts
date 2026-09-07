import { supabase } from "./supabaseClient";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // reject before even attempting to compress/upload
const MAX_DIMENSION = 1600; // long edge, px — plenty for a receipt/room photo, a fraction of a modern phone camera's output
const JPEG_QUALITY = 0.8;

function originalExt(file: File) {
  return file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
}

/** Downscales + re-encodes as JPEG so a multi-MB phone photo doesn't ship to Storage untouched. Falls back to the original file if canvas encoding isn't available. */
async function compressImage(file: File): Promise<{ blob: Blob; ext: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return { blob: file, ext: originalExt(file) };

  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  return blob ? { blob, ext: ".jpg" } : { blob: file, ext: originalExt(file) };
}

/** Compresses (images only), enforces a size cap, uploads to a public bucket, and returns its public URL. */
export async function uploadPhoto(bucket: "expense-photos" | "maintenance-photos", file: File): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`Photo is too large (max ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB).`);
  }

  const { blob, ext } = file.type.startsWith("image/") ? await compressImage(file) : { blob: file, ext: originalExt(file) };
  const path = `${crypto.randomUUID()}${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, blob);
  if (error) throw error;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

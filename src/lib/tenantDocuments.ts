import { supabase } from "./supabaseClient";

const BUCKET = "tenant-documents";
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
/** Signed URLs are generated fresh each time documents are listed rather than stored — the
 * bucket is private (see the migration), so a stale stored URL would just expire uselessly. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export type TenantDocument = {
  id: string;
  name: string;
  filePath: string;
  contentType: string | null;
  sizeBytes: number | null;
  createdAt: string;
  /** Time-limited — re-fetch (listTenantDocuments) rather than caching this past its TTL. */
  url: string | null;
};

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function uploadTenantDocument(
  propertyId: string,
  tenantId: string,
  file: File
): Promise<void> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`"${file.name}" is too large (max ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB).`);
  }
  const path = `${propertyId}/${tenantId}/${crypto.randomUUID()}-${sanitizeFilename(file.name)}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file);
  if (uploadError) throw uploadError;

  const { error: insertError } = await supabase.from("tenant_documents").insert({
    tenant_id: tenantId,
    property_id: propertyId,
    name: file.name,
    file_path: path,
    content_type: file.type || null,
    size_bytes: file.size,
  });
  if (insertError) throw insertError;
}

export async function listTenantDocuments(tenantId: string): Promise<TenantDocument[]> {
  const { data, error } = await supabase
    .from("tenant_documents")
    .select("id, name, file_path, content_type, size_bytes, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!data || data.length === 0) return [];

  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(
      data.map((d) => d.file_path),
      SIGNED_URL_TTL_SECONDS
    );
  if (signError) throw signError;
  const urlByPath = new Map(signed.map((s) => [s.path, s.signedUrl]));

  return data.map((d) => ({
    id: d.id,
    name: d.name,
    filePath: d.file_path,
    contentType: d.content_type,
    sizeBytes: d.size_bytes,
    createdAt: d.created_at,
    url: urlByPath.get(d.file_path) ?? null,
  }));
}

export async function deleteTenantDocument(doc: Pick<TenantDocument, "id" | "filePath">): Promise<void> {
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([doc.filePath]);
  if (storageError) throw storageError;
  const { error: dbError } = await supabase.from("tenant_documents").delete().eq("id", doc.id);
  if (dbError) throw dbError;
}

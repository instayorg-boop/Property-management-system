/** No uploaded tenant photo: falls back to a real illustrated DiceBear avatar (the "blobs"
 * style — soft organic abstract shapes, not just letters on a color circle) rendered by
 * DiceBear's hosted API off a seed. Shared by AddTenant's photo picker preview and
 * TenantProfile's header avatar so the same seed always produces the same look in both places. */
export function dicebearAvatarUrl(seed: string): string {
  return `https://api.dicebear.com/10.x/blobs/svg?seed=${encodeURIComponent(seed)}`;
}

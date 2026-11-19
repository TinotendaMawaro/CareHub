import { supabase } from "@/lib/supabase/client";

export const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/heic"];
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const SIZE = 512;

/** Centre-crops to a square and scales to 512px JPEG. Falls back to the original if the browser can't decode it. */
async function toSquareJpeg(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const side = Math.min(bmp.width, bmp.height);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = Math.min(SIZE, side);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.88));
    return blob ?? file;
  } catch {
    return file;
  }
}

/** Object path inside the avatars bucket from its public URL, or null if it isn't one of ours. */
function pathFromUrl(url: string | null | undefined): string | null {
  const m = url ? /\/storage\/v1\/object\/public\/avatars\/(.+)$/.exec(url) : null;
  return m ? m[1] : null;
}

/**
 * Uploads a profile photo for `userId` (yourself, or anyone if you are an admin) and saves it on
 * their profile; the database mirrors it onto their staff record. Returns the new public URL.
 */
export async function uploadAvatar(file: File, userId: string, previousUrl?: string | null): Promise<string> {
  if (!AVATAR_TYPES.includes(file.type)) throw new Error("Use a PNG, JPG, WebP or GIF image.");
  if (file.size > 20 * 1024 * 1024) throw new Error("That image is over 20 MB.");
  const blob = await toSquareJpeg(file);
  if (blob.size > AVATAR_MAX_BYTES) throw new Error("That image is still over 5 MB after resizing. Try a smaller one.");
  const ext = blob.type === "image/jpeg" ? "jpg" : (file.name.split(".").pop() ?? "img").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${userId}/avatar-${Date.now()}.${ext}`;

  const up = await supabase.storage.from("avatars").upload(path, blob, { contentType: blob.type || file.type, cacheControl: "31536000", upsert: false });
  if (up.error) throw new Error(up.error.message);
  const url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;

  const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", userId);
  if (error) {
    await supabase.storage.from("avatars").remove([path]);
    throw new Error(error.message);
  }
  const old = pathFromUrl(previousUrl);
  if (old && old !== path) void supabase.storage.from("avatars").remove([old]);
  return url;
}

export async function removeAvatar(userId: string, previousUrl?: string | null): Promise<void> {
  const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", userId);
  if (error) throw new Error(error.message);
  const old = pathFromUrl(previousUrl);
  if (old) void supabase.storage.from("avatars").remove([old]);
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

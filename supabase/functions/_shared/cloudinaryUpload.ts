// Cloudinary upload via REST API (no Node SDK — Deno compatible)

function parseCloudinaryUrl(): { cloudName: string; apiKey: string; apiSecret: string } | null {
  const url = Deno.env.get("CLOUDINARY_URL") ?? "";
  if (!url.startsWith("cloudinary://") || url.includes("placeholder")) return null;
  // Format: cloudinary://API_KEY:API_SECRET@CLOUD_NAME
  const without = url.replace("cloudinary://", "");
  const atIdx = without.lastIndexOf("@");
  if (atIdx < 0) return null;
  const cloudName = without.slice(atIdx + 1);
  const creds = without.slice(0, atIdx);
  const colonIdx = creds.indexOf(":");
  if (colonIdx < 0) return null;
  return { cloudName, apiKey: creds.slice(0, colonIdx), apiSecret: creds.slice(colonIdx + 1) };
}

async function sha1Hex(data: string): Promise<string> {
  const encoded = new TextEncoder().encode(data);
  const hashBuf = await crypto.subtle.digest("SHA-1", encoded);
  return Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class CloudinaryNotConfiguredError extends Error {}
export class CloudinaryUploadError extends Error {}

export async function uploadPhotoBase64(base64: string): Promise<string> {
  const cfg = parseCloudinaryUrl();
  if (!cfg) throw new CloudinaryNotConfiguredError("Cloudinary not configured");

  const trimmed = base64.trim();
  if (!trimmed) throw new CloudinaryUploadError("Empty photo body");

  const payload = trimmed.startsWith("data:") ? trimmed : `data:image/jpeg;base64,${trimmed}`;

  const timestamp = String(Math.floor(Date.now() / 1000));
  const folder = "solarpunk-missions";
  const toSign = `folder=${folder}&timestamp=${timestamp}${cfg.apiSecret}`;
  const signature = await sha1Hex(toSign);

  const form = new FormData();
  form.append("file", payload);
  form.append("timestamp", timestamp);
  form.append("api_key", cfg.apiKey);
  form.append("signature", signature);
  form.append("folder", folder);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/upload`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new CloudinaryUploadError(`Cloudinary upload failed: ${text}`);
  }

  const data = await res.json() as { secure_url: string };
  return data.secure_url;
}

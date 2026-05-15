export function validateHttpUrl(input: string): {
  ok: boolean;
  normalized?: string;
  error?: string;
} {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: "Enter a URL." };
  }
  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, error: "That does not look like a valid URL." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Only http and https URLs are supported." };
  }
  if (!url.hostname) {
    return { ok: false, error: "Missing hostname." };
  }
  return { ok: true, normalized: url.toString() };
}

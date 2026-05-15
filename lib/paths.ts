export function getBasePath(): string {
  if (typeof window !== "undefined") {
    const p = process.env.NEXT_PUBLIC_BASE_PATH || "";
    return p.replace(/\/$/, "");
  }
  return (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "");
}

export function assetUrl(path: string): string {
  const base = getBasePath();
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}

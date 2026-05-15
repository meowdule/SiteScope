/** @type {import('next').NextConfig} */
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "");

const nextConfig = {
  output: "export",
  ...(basePath ? { basePath, assetPrefix: `${basePath}/` } : {}),
  images: { unoptimized: true },
  trailingSlash: false,
};

export default nextConfig;

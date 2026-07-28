import path from "node:path";
import type { NextConfig } from "next";

const repoRoot = path.join(__dirname, "../..");

const ORCHESTRATOR_URL =
  process.env.ORCHESTRATOR_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  outputFileTracingRoot: repoRoot,
  turbopack: {
    root: repoRoot,
  },
  async rewrites() {
    // Proxy browser calls to the FastAPI orchestrator so the frontend never
    // deals with CORS and the backend origin stays a server-side concern.
    return [
      {
        source: "/api/orchestrator/:path*",
        destination: `${ORCHESTRATOR_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;

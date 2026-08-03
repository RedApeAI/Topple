import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, __dirname, "");
  const backendTarget =
    environment.VITE_DEV_BACKEND_URL || "http://127.0.0.1:4000";
  const allowedHosts = (environment.VITE_DEV_ALLOWED_HOSTS || "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@mock": path.resolve(__dirname, "./mock"),
      },
    },
    server: {
      // Bind the IPv6 wildcard as a dual-stack listener. cloudflared resolves
      // `localhost` to ::1 on this machine, while browsers may use IPv4.
      host: "::",
      port: 3000,
      strictPort: true,
      allowedHosts,
      proxy: {
        // Preserve the public browser host/protocol so Better Auth can build
        // same-origin OAuth callbacks when Vite is behind an HTTPS tunnel.
        "/api": { target: backendTarget, changeOrigin: true, xfwd: true },
        "/healthz": { target: backendTarget, changeOrigin: true, xfwd: true },
      },
    },
  };
});

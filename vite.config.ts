import { fileURLToPath } from "url";
import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import { tempo } from "tempo-devtools/dist/vite";
import fs from "fs";

// Polyfill __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    base: env.NODE_ENV === "development" ? "/" : env.VITE_BASE_PATH || "/",
    optimizeDeps: {
      entries: ["src/main.tsx", "src/tempobook/**/*"],
    },
    plugins: [react(), tempo()],
    resolve: {
      preserveSymlinks: true,
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
        server: {
      allowedHosts: [
        // Existing allowed hosts
        ...(env.VITE_ALLOWED_ORIGINS || "")
          .split(",")
          .map(origin => origin.trim())
          .filter(Boolean),
        // Ngrok hosts add karein
        'unreleased-relentlessly-emogene.ngrok-free.dev',
        '.ngrok-free.dev'  // All ngrok domains ke liye
      ],
      host: true,
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:5000', // ✅ YAHAN PORT CHANGE KARO
          changeOrigin: true,
          secure: false
        }

      }
    },
  };
});

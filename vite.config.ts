import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nitro } from "nitro/vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function rolldownCompatPlugin(): import("vite").Plugin {
  return {
    name: "rolldown-compat",
    config(config) {
      if (config.environments) {
        for (const env of Object.values(config.environments)) {
          const b = (env as any)?.build;
          if (b?.rolldownOptions && !b?.rollupOptions) {
            b.rollupOptions = b.rolldownOptions;
          }
        }
      }
    },
    configEnvironment(name, envConfig) {
      const b = (envConfig.build as any);
      if (b?.rolldownOptions && !b?.rollupOptions) {
        return {
          build: {
            rollupOptions: b.rolldownOptions,
          },
        };
      }
    },
  };
}

export default defineConfig({
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
  plugins: [
    tsconfigPaths(),
    tanstackStart(),
    // 👇 Nitro प्लगइन योग्य फॉरमॅटमध्ये
    nitro({
      preset: "vercel",
    }),
    rolldownCompatPlugin(),
    react(),
    tailwindcss(),
  ],
  server: {
    port: 3000,
    host: true,
    watch: {
      ignored: [
        "**/.next/**",
        "**/.git/**",
        "**/eng.traineddata",
        "**/.tanstack/**",
        "**/scratch/**",
        "**/node_modules/**",
      ],
    },
  },
  preview: {
    port: 3000,
    host: true,
  },
  optimizeDeps: {
    exclude: [
      "googleapis",
      "tesseract.js",
      "mailparser",
      "@google/generative-ai",
    ],
  },
  ssr: {
    external: [
      "tesseract.js",
      "googleapis",
      "mailparser",
      "@google/generative-ai",
    ],
  },
});
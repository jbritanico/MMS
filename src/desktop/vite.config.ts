import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

// MapLibre GL 6 starts its web worker from a separate file, found next to the bundled app code
// as ./maplibre-gl-worker.mjs (which itself imports ./maplibre-gl-shared.mjs). Vite cannot see
// that file name, so it is not copied into dist and the installed app gets index.html instead:
// the map stays grey. This copies both files into dist/assets, where MapLibre looks for them.
function maplibreWorkerFiles(): Plugin {
  const require = createRequire(import.meta.url);
  return {
    name: "maplibre-worker-files",
    apply: "build",
    generateBundle() {
      for (const name of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
        this.emitFile({
          type: "asset",
          fileName: `assets/${name}`,
          source: readFileSync(require.resolve(`maplibre-gl/dist/${name}`)),
        });
      }
    },
  };
}


const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), maplibreWorkerFiles()],

  optimizeDeps: {
    exclude: ["maplibre-gl"],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
      "/export": {
        target: "http://127.0.0.1:8090",
        changeOrigin: true,
      },
      "/catalog": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
      "/audit": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
      "/executive-report": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});

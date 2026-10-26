import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" : l'app fonctionne aussi bien sur GitHub Pages que dans un sous-dossier.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      // Three.js dans son propre fichier, mis en cache séparément.
      output: { manualChunks: { three: ["three"] } },
    },
  },
});

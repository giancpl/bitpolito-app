import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    entries: ["index.html"],
    include: [
      "nostr-tools/pure",
      "nostr-tools/nip19",
      "nostr-tools/nip49",
      "nostr-tools/nip46",
      "nostr-tools/pool",
      "@scure/base",
      "idb-keyval",
      "qrcode",
    ],
  },
  server: { host: "127.0.0.1", watch: { ignored: ["**/.android-local/**", "**/android/**", "**/artifacts/**", "**/data/**", "**/test-results/**"] }, proxy: { "/api": process.env.BITPOLITO_API_PROXY||"http://127.0.0.1:3001" } },
  build: {
    outDir: "dist/client",
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          query: ["@tanstack/react-query"],
          ui: ["radix-ui"],
          motion: ["motion"],
        },
      },
    },
  },
});

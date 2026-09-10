import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Purely diagnostic: lets a production crash resolve to real file/line
    // instead of minified names (e.g. "hf is not a constructor"). No effect
    // on runtime behavior — just emits .js.map files alongside the bundle.
    sourcemap: true,
  },
}));

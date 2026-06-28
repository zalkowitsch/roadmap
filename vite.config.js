import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vercel serves from the domain root, so base "/" is correct. (Was "./" for
// GitHub Pages' subpath; Vercel doesn't need relative paths.)
export default defineConfig({
  plugins: [react()],
  base: "/",
});

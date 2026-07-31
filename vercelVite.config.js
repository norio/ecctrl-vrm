import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const isCodeSandbox =
  "SANDBOX_URL" in process.env || "CODESANDBOX_HOST" in process.env;

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "example");

export default defineConfig({
  plugins: [react()],
  root: "example/",
  publicDir: "../public/",
  // Absolute base so import.meta.env.BASE_URL resolves public assets from any
  // page depth (climb/). GitHub Pages builds override it via --base=/<repo>/.
  base: "/",
  server: {
    host: true,
    open: !isCodeSandbox, // Open if it's not a CodeSandbox
  },
  build: {
    outDir: "./exampleDist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(rootDir, "index.html"),
        climb: resolve(rootDir, "climb/index.html"),
      },
    },
  },
});

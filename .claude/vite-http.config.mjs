// Claude Code preview 用の一時 dev 設定 — 本体の vite.config.js (basic-ssl 付き) は
// プレビューブラウザが自己署名証明書を拒否するため、ssl 抜きの http で起動する。
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: resolve(here, "../example"),
  publicDir: resolve(here, "../public"),
  base: "./",
  server: { host: true, open: false },
});

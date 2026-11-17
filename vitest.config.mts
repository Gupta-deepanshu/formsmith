import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Vitest covers src/core only (pure TypeScript, no DOM needed).
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/core/**/*.test.ts"], environment: "node" },
});

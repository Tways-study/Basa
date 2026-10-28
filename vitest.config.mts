import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirrors the "@/*" path in tsconfig.json so tests import the same way the app does.
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: { include: ["lib/**/*.test.ts", "eval/**/*.test.ts"] },
});

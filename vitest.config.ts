import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals:     true,
    environment: "node",
    setupFiles:  ["./server/test-setup.ts"],
    // Exclure les tests Playwright (runner différent)
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "e2e/**",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include:  ["server/modules/**/*.ts"],
      exclude:  ["**/*.test.ts", "**/index.ts"],
    },
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "./shared"),
      "@server": path.resolve(__dirname, "./server"),
    },
  },
});

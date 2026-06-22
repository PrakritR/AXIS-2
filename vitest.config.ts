import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    setupFiles: ["./tests/setup/vitest.setup.ts"],
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx", "tests/integration/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/demo-*.ts", "src/lib/**/checkout-client.example.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

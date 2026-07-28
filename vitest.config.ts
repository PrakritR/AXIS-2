import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    // 482 fully-mocked files run in parallel, so a starved worker can blow the 5s default
    // even though the test itself does no I/O. That produced intermittent "Test timed out in
    // 5000ms" failures in a different unrelated file on roughly every third full run.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    setupFiles: ["./tests/setup/vitest.setup.ts"],
    // Many suites `await import("@/lib/...server")` inside the test body so the
    // module mocks are in place first. That bills the whole module graph's
    // transform cost to the per-test timeout, and under full-suite contention a
    // test that runs in 1.5s alone blew past the 5s default. The failures were
    // pure timeouts, never assertions. 20s keeps real hangs failing fast while
    // absorbing transform cost on a loaded machine.
    testTimeout: 20_000,
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

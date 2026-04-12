import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  test: {
    // jsdom for React component tests; server tests also work in jsdom
    environment: "jsdom",
    // Setup files for testing-library matchers
    setupFiles: ["./client/src/test/setup.ts"],
    // Include patterns for both client and server tests
    include: [
      "client/src/**/*.test.{ts,tsx}",
      "server/**/*.test.ts",
      "shared/**/*.test.ts",
    ],
  },
});

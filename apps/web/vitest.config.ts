import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "./coverage",
      include: [
        "app/services/**",
        "app/routes/api.*",
        "app/lib/intent.ts",
        "app/lib/supabase.server.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./app"),
    },
  },
  // Define env vars the same way vite.config.ts does for Workers compatibility
  define: {
    "process.env.SUPABASE_URL": JSON.stringify("https://test.supabase.co"),
    "process.env.SUPABASE_SECRET_KEY": JSON.stringify("test-secret-key"),
    "process.env.VITE_SUPABASE_URL": JSON.stringify("https://test.supabase.co"),
    "process.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY": JSON.stringify(
      "test-anon-key",
    ),
    "process.env.GEMINI_API_KEY": JSON.stringify("test-gemini-key"),
    "process.env.OPENAI_API_KEY": JSON.stringify("test-openai-key"),
    "process.env.VIMEO_PROXY_URL": JSON.stringify(""),
    "process.env.VIMEO_PROXY_FALLBACK_URL": JSON.stringify(""),
    "process.env.VIMEO_PROXY_API_KEY": JSON.stringify(""),
    "process.env.VIMEO_PROXY_FALLBACK_API_KEY": JSON.stringify(""),
    "process.env.VIMEO_TOKEN": JSON.stringify(""),
  },
});

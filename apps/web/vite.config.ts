import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env vars from both the monorepo root and the local apps/web directory.
  // The root .env has secrets (SUPABASE_SECRET_KEY, VIMEO_TOKEN, etc.)
  // The local .env has VITE_-prefixed vars for the browser client.
  // Local vars take precedence over root vars.
  const rootEnv = loadEnv(mode, path.resolve(process.cwd(), "../../"), "");
  const localEnv = loadEnv(mode, process.cwd(), "");
  const env = { ...rootEnv, ...localEnv };

  // Make all loaded environment variables available to the server-side
  // parts of the React Router dev server (loaders, actions).
  // This is crucial for server-side code to access secrets like SUPABASE_SECRET_KEY.
  Object.assign(process.env, env);

  return {
    plugins: [
      cloudflare({ viteEnvironment: { name: "ssr" } }),
      tailwindcss(),
      reactRouter(),
      tsconfigPaths(),
    ],
    resolve: {
      alias: {
        "~": path.resolve(__dirname, "./app"),
      },
    },
    // Replace process.env.* references at build time so server code works
    // on Cloudflare Workers (where process.env doesn't exist).
    // Locally, Vite dev server already has these via Object.assign above.
    define: {
      "process.env.SUPABASE_URL": JSON.stringify(env.SUPABASE_URL || ""),
      "process.env.SUPABASE_SECRET_KEY": JSON.stringify(
        env.SUPABASE_SECRET_KEY || "",
      ),
      "process.env.VITE_SUPABASE_URL": JSON.stringify(
        env.VITE_SUPABASE_URL || "",
      ),
      "process.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY": JSON.stringify(
        env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY || "",
      ),
      "process.env.GEMINI_API_KEY": JSON.stringify(env.GEMINI_API_KEY || ""),
      "process.env.VIMEO_TOKEN": JSON.stringify(env.VIMEO_TOKEN || ""),
      "process.env.VIMEO_PROXY_URL": JSON.stringify(env.VIMEO_PROXY_URL || ""),
      "process.env.VIMEO_PROXY_FALLBACK_URL": JSON.stringify(
        env.VIMEO_PROXY_FALLBACK_URL || "",
      ),
      "process.env.VIMEO_PROXY_API_KEY": JSON.stringify(
        env.VIMEO_PROXY_API_KEY || "",
      ),
      "process.env.VIMEO_PROXY_FALLBACK_API_KEY": JSON.stringify(
        env.VIMEO_PROXY_FALLBACK_API_KEY || "",
      ),
    },
  };
});

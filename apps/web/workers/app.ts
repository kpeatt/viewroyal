/// <reference types="@cloudflare/workers-types" />
import { createRequestHandler } from "react-router";
import apiApp from "../app/api";

interface Env {
  API_RATE_LIMITER: RateLimit;
  [key: string]: unknown;
}

declare module "react-router" {
  export interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE
);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    // Delegate /api/v1/* requests to the Hono API app
    if (url.pathname.startsWith("/api/v1/") || url.pathname === "/api/v1") {
      return apiApp.fetch(request, env, ctx);
    }

    // Everything else goes to React Router
    return requestHandler(request, {
      cloudflare: { env, ctx },
    });
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const baseUrl = (env.VIMEO_PROXY_FALLBACK_URL as string) || "https://vimeo-proxy.onrender.com";
    const url = `${baseUrl}/health`;
    console.log(`[Cron] Pinging Render fallback: ${url}`);
    ctx.waitUntil(
      fetch(url)
        .then((res) => console.log(`[Cron] Render responded: ${res.status}`))
        .catch((err) => console.warn(`[Cron] Render ping failed: ${err}`))
    );
  },
} satisfies ExportedHandler<Env>;

/// <reference types="@cloudflare/workers-types" />
import { createRequestHandler } from "react-router";

interface Env {
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
    return requestHandler(request, {
      cloudflare: { env, ctx },
    });
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const url = (env.VIMEO_PROXY_FALLBACK_URL as string) || "https://vimeo-proxy.onrender.com";
    ctx.waitUntil(
      fetch(url).catch(() => {
        // Swallow errors — the point is just to keep Render warm
      })
    );
  },
} satisfies ExportedHandler<Env>;

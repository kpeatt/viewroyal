/// <reference types="@cloudflare/workers-types" />

export interface ApiEnv {
  Bindings: {
    VITE_SUPABASE_URL: string;
    VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY: string;
    SUPABASE_SECRET_KEY: string;
    GEMINI_API_KEY: string;
    API_RATE_LIMITER: RateLimit;
    [key: string]: unknown;
  };
  Variables: {
    requestId: string;
    apiKeyId?: string;
    userId?: string;
    municipality?: {
      id: string;
      slug: string;
      name: string;
      short_name: string;
    };
  };
}

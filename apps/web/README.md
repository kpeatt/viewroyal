# ViewRoyal.ai — Web App

The public-facing web application for ViewRoyal.ai. Built with React Router 7 (SSR) and deployed to Cloudflare Workers.

## Setup

```bash
pnpm install
cp .env.example .env   # then fill in your keys
pnpm dev               # http://localhost:5173
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL (server-side) |
| `SUPABASE_SECRET_KEY` | Service role key (bypasses RLS) |
| `VITE_SUPABASE_URL` | Supabase URL (exposed to client) |
| `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Anon key (exposed to client) |
| `GEMINI_API_KEY` | Google Generative AI key (RAG Q&A) |
| `OPENAI_API_KEY` | OpenAI key (query embeddings via text-embedding-3-small) |
| `VIMEO_TOKEN` | Vimeo API token (optional, for direct API access) |
| `VIMEO_PROXY_URL` | Primary vimeo-proxy Worker URL |
| `VIMEO_PROXY_FALLBACK_URL` | Fallback proxy URL |
| `VIMEO_PROXY_API_KEY` | Auth key for primary proxy |
| `VIMEO_PROXY_FALLBACK_API_KEY` | Auth key for fallback proxy |

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev server with HMR |
| `pnpm build` | Production build |
| `pnpm start` | Start production server (Node) |
| `pnpm deploy` | Build and deploy to Cloudflare Workers |
| `pnpm typecheck` | Run TypeScript type checking |

## Stack

- **Framework:** React Router 7 (SSR) with React 19
- **Styling:** Tailwind CSS 4, shadcn/ui (Radix primitives)
- **Database:** Supabase (PostgreSQL + pgvector)
- **AI:** Google Gemini for RAG Q&A, OpenAI for vector embeddings
- **Video:** Vimeo with HLS playback via hls.js
- **Deployment:** Cloudflare Workers (primary), Docker (alternative)

## Project Structure

```
app/
  routes/          Route handlers (loaders, actions, components)
  components/      React components (ui/ for shadcn primitives)
  services/        Supabase queries and API integrations
  lib/             Utilities, Supabase clients, types
  hooks/           React hooks
  content/         Static markdown content
workers/
  app.ts           Cloudflare Workers entry point
```

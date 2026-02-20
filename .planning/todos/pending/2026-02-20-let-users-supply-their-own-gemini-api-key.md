---
created: 2026-02-20T22:50:25.098Z
title: Let users supply their own Gemini API key
area: api
files:
  - apps/web/app/services/rag.server.ts
  - apps/web/app/routes/api.ask.tsx
---

## Problem

Currently the RAG Q&A feature uses a single server-side Gemini API key (GEMINI_API_KEY set as a Cloudflare Worker secret). All user queries consume the operator's API quota and cost. As usage scales, this becomes a bottleneck — both financially and in terms of rate limits.

Allowing users to supply their own Gemini API key would let power users self-fund their usage, reduce operator costs, and remove rate limit pressure from the shared key.

## Solution

- Add a user settings field for storing an encrypted Gemini API key
- When a user has their own key configured, use it for their RAG queries instead of the server key
- Fall back to the server key for users without their own
- Consider: key validation on save, usage tracking per key, clear messaging about what the key is used for
- Security: keys should be encrypted at rest, never exposed in API responses

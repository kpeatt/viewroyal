---
created: 2026-02-28T08:38:14.097Z
title: Improve RAG search for specific item types
area: api
files:
  - apps/web/app/services/rag.server.ts
---

## Problem

The RAG Q&A search currently treats all content equally — transcript segments, motions, and document sections are all searched the same way. When a user asks about a specific type of item (e.g. "what bylaws were discussed" or "show me the motions about housing"), the search doesn't filter or boost by content type. This means results can be diluted with irrelevant content types, reducing answer quality for type-specific queries.

## Solution

- Detect item-type intent from the user's question (bylaws, motions, correspondence, reports, presentations, etc.)
- When a specific type is detected, either filter the vector search to that content type or boost matching types in the results
- Could use metadata filtering on the `document_type` field in `extracted_documents` or table-level filtering (e.g. search only `motions` table when asking about motions)
- Consider a lightweight classifier or keyword matching to detect query intent before running the vector search

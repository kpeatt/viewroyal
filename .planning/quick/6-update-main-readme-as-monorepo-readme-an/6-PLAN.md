---
phase: quick-6
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - README.md
  - apps/pipeline/README.md
autonomous: true
requirements: [QUICK-6]
must_haves:
  truths:
    - "Root README serves as monorepo overview, not a pipeline manual"
    - "Pipeline-specific docs (CLI flags, phases, AI refinement, embeddings, multi-municipality) live in apps/pipeline/README.md"
    - "Root README links to each sub-app README for details"
  artifacts:
    - path: "README.md"
      provides: "Monorepo overview with links to sub-apps"
      contains: "apps/pipeline/README.md"
    - path: "apps/pipeline/README.md"
      provides: "Pipeline-specific documentation"
      contains: "--ingest-only"
  key_links:
    - from: "README.md"
      to: "apps/pipeline/README.md"
      via: "markdown link"
      pattern: "apps/pipeline/README.md"
    - from: "README.md"
      to: "apps/web/README.md"
      via: "markdown link"
      pattern: "apps/web/README.md"
---

<objective>
Restructure the root README as a monorepo overview and create a pipeline-specific README at apps/pipeline/README.md.

Purpose: The root README currently contains 280 lines mixing monorepo overview with deep pipeline documentation. Sub-apps web/ and vimeo-proxy/ already have their own READMEs, but pipeline/ does not. This restructure makes the root a clean entry point and gives the pipeline its own comprehensive docs.

Output: Restructured root README.md + new apps/pipeline/README.md
</objective>

<execution_context>
@/Users/kyle/.claude/get-shit-done/workflows/execute-plan.md
@/Users/kyle/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@README.md (current root README — source content)
@apps/web/README.md (existing sub-app README for style reference)
@apps/vimeo-proxy/README.md (existing sub-app README for style reference)
@CLAUDE.md (project overview and structure)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create apps/pipeline/README.md with pipeline-specific content</name>
  <files>apps/pipeline/README.md</files>
  <action>
Create apps/pipeline/README.md by extracting and reorganizing pipeline-specific content from the root README. Follow the style established by apps/web/README.md and apps/vimeo-proxy/README.md (title with dash separator, Setup, then domain sections).

Structure the new README as:

1. **Title**: "# ViewRoyal.ai -- Data Pipeline" with a one-line description ("Python ETL pipeline that scrapes council meeting documents, diarizes video, and ingests structured data into Supabase.")
2. **Setup**: Prerequisites (Python 3.13+, uv), environment variables needed (DATABASE_URL, SUPABASE_URL, SUPABASE_KEY, SUPABASE_SECRET_KEY, GEMINI_API_KEY, OPENAI_API_KEY, VIMEO_TOKEN)
3. **Quick Start**: Basic `uv run python main.py --download-audio` command
4. **Pipeline Phases**: The 5-phase table (scrape, download audio, diarize, ingest, embed) with descriptions -- taken from root README's "Full Pipeline (5 Phases)" section
5. **CLI Reference**: The full CLI flags table -- taken from root README's "All CLI Flags" section
6. **Selective Execution**: The code block showing --ingest-only, --embed-only, --process-only, etc. -- taken from root README's "Selective Execution" section
7. **Standalone Embeddings**: The embed module commands -- taken from root README
8. **AI Refinement**: The explanation of Phase 4 Gemini extraction -- taken from root README
9. **Multi-Municipality Support**: The scraper table and explanation -- taken from root README
10. **Testing**: `uv run pytest` and example single-file test command (from CLAUDE.md)
11. **Project Structure**: Directory tree of pipeline/ internals

Do NOT include: features list, database schema, RAG Q&A system, web app setup, getting started for the full project, adapting for another municipality (that stays in root), license. Those belong in the root README.
  </action>
  <verify>Confirm apps/pipeline/README.md exists and contains: the 5-phase table, CLI flags table, selective execution examples, AI refinement section, multi-municipality section, standalone embeddings section.</verify>
  <done>apps/pipeline/README.md is a comprehensive pipeline reference that covers everything a pipeline developer needs without duplicating monorepo-level concerns.</done>
</task>

<task type="auto">
  <name>Task 2: Restructure root README.md as monorepo overview</name>
  <files>README.md</files>
  <action>
Rewrite the root README.md to serve as a concise monorepo entry point. Keep these sections from the current README (trimming where noted):

1. **Title + intro**: Keep the "ViewRoyal.ai" title, one-liner description, live link. Keep the Features list exactly as-is (this is the project showcase).
2. **Architecture**: Keep the directory tree and data flow line. Keep the municipality context layer paragraph. Remove the detailed pipeline internals -- just say "See [Pipeline README](apps/pipeline/README.md) for details."
3. **Tech Stack**: Keep the table as-is (it's a monorepo-level overview).
4. **Database Schema**: Keep the full schema section as-is (it's shared infrastructure, not pipeline-specific).
5. **Getting Started**: Keep Prerequisites, Environment Setup, Database Setup, and Web App sections. Replace the entire "Data Pipeline" section (lines ~136-218 currently covering full pipeline phases, selective execution, CLI flags, standalone embeddings, AI refinement, multi-municipality) with a brief block:
   ```
   ### Data Pipeline

   See [Pipeline README](apps/pipeline/README.md) for full documentation.

   Quick start:
   ```bash
   cd apps/pipeline
   uv run python main.py --download-audio
   ```
   ```
6. **RAG Q&A System**: Keep as-is (this is a product feature description, not pipeline docs).
7. **Adapting for Another Municipality**: Keep as-is (monorepo-level guidance).
8. **Apps**: Add a new "Apps" section (after Architecture, before Tech Stack) that lists each sub-app with a one-liner and link to its README:
   - **[Web App](apps/web/)** -- React Router 7 frontend deployed to Cloudflare Workers. [README](apps/web/README.md)
   - **[Data Pipeline](apps/pipeline/)** -- Python ETL pipeline for scraping, transcription, and AI-powered ingestion. [README](apps/pipeline/README.md)
   - **[Vimeo Proxy](apps/vimeo-proxy/)** -- Cloudflare Worker for extracting direct video URLs from Vimeo. [README](apps/vimeo-proxy/README.md)
9. **License**: Keep as-is.

The goal is to cut ~100 lines of pipeline-specific content from the root and replace with links. The root README should still feel complete and impressive as a project showcase but delegate deep pipeline docs to the sub-app README.
  </action>
  <verify>Confirm root README.md: (1) still has Features, Architecture, Tech Stack, Database Schema, RAG Q&A sections, (2) has a new "Apps" section linking to all three sub-app READMEs, (3) Data Pipeline section is now a brief pointer instead of 80+ lines, (4) no broken markdown formatting.</verify>
  <done>Root README is a monorepo overview (~180-200 lines) that showcases the project and links to sub-app READMEs for details. Pipeline-specific CLI flags, phase details, and selective execution docs are NOT in the root anymore.</done>
</task>

</tasks>

<verification>
- Root README.md contains links to apps/pipeline/README.md, apps/web/README.md, apps/vimeo-proxy/README.md
- apps/pipeline/README.md exists and contains full CLI reference, pipeline phases, and setup instructions
- No pipeline CLI flags appear in the root README (except the one quick-start example)
- Root README retains all product-level sections (Features, Database Schema, RAG Q&A, Tech Stack)
- Both files render valid markdown (no broken tables, code blocks, or links)
</verification>

<success_criteria>
- Root README reads as a monorepo overview, not a pipeline manual
- Pipeline README is self-contained for anyone working in apps/pipeline/
- Every sub-app in the monorepo has a README linked from root
- Total content is preserved (moved, not deleted)
</success_criteria>

<output>
After completion, create `.planning/quick/6-update-main-readme-as-monorepo-readme-an/6-SUMMARY.md`
</output>

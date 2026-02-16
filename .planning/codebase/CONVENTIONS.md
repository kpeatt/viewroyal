# Coding Conventions

**Analysis Date:** 2026-02-16

## Naming Patterns

**Files:**
- TypeScript/React files: `kebab-case.tsx` or `kebab-case.ts`
  - Example: `apps/web/app/routes/meeting-detail.tsx`, `apps/web/app/components/meeting/VideoWithSidebar.tsx`
  - UI component files: `apps/web/app/components/ui/card.tsx`, `apps/web/app/components/ui/tabs.tsx`
- Python files: `snake_case.py`
  - Example: `apps/pipeline/pipeline/ingestion/ai_refiner.py`, `apps/pipeline/main.py`
- Directories: `kebab-case` (TypeScript), `snake_case` (Python)

**Functions (TypeScript):**
- Exported functions: `camelCase`
  - Example: `getMeetings()`, `formatDate()`, `getMeetingById()`, `createSupabaseServerClient()`
- Private/internal functions: `camelCase` with optional leading underscore
  - Example: `_getCanonicalNames()`, `_getActiveCounselmembers()`
- React components: `PascalCase`
  - Example: `Home`, `AgendaOverview`, `Card`, `CardHeader`, `MeetingListRow`

**Functions (Python):**
- Functions: `snake_case`
  - Example: `extract_meeting_metadata()`, `sanitize_filename()`, `extract_date_from_string()`
- Classes: `PascalCase`
  - Example: `MeetingIngester`, `VimeoClient`, `MatterMatcher`
- Private methods: Leading underscore
  - Example: `_get_canonical_names()`, `_parse_agenda_lines()`

**Variables:**
- TypeScript/JavaScript: `camelCase` for all variables and properties
  - Example: `expandedItemId`, `onItemClick`, `loaderData`, `supabaseKey`
- Python: `snake_case`
  - Example: `meeting_date`, `item_order`, `is_controversial`, `municipality_id`
- Constants: UPPER_SNAKE_CASE (Python) or camelCase (TypeScript)
  - Example Python: `CANONICAL_NAMES`, `GEMINI_API_KEY`, `CACHE_TTL`
  - Example TypeScript: typically camelCase unless explicitly a constant

**Types:**
- TypeScript interfaces: `PascalCase`, typically end in name of thing they describe
  - Example: `Person`, `Meeting`, `AgendaItem`, `TranscriptSegment`, `Organization`
  - Props interfaces: `ComponentNameProps`
  - Example: `AgendaOverviewProps`, `VideoWithSidebarProps`
- Python type hints: use `Optional`, `List`, `Union` from typing module
  - Example: `Optional[str]`, `List[VoteRecord]`, `str | None` (modern union syntax)

## Code Style

**Formatting:**
- No formal linter config (ESLint/Prettier) at root — follows community standards
- TypeScript: 2-space indentation (inferred from source files)
- Python: 4-space indentation (PEP 8 standard)
- Max line length: Not enforced, but generally kept readable

**Linting:**
- TypeScript: `tsc` typecheck via `pnpm run typecheck` (strict mode enabled)
- Python: `pytest` with syntax validation on import
- No explicit ESLint or Prettier config detected

## Import Organization

**Order (TypeScript):**
1. Third-party libraries (React, React Router, UI libraries, etc.)
   ```typescript
   import { useState } from "react";
   import { Link } from "react-router";
   import { Badge } from "../components/ui/badge";
   ```
2. Internal services and utilities
   ```typescript
   import { getMeetings } from "../services/meetings";
   import { formatDate } from "../lib/utils";
   ```
3. Type imports
   ```typescript
   import type { Meeting, AgendaItem } from "../lib/types";
   ```

**Path Aliases (TypeScript):**
- `~/*` → `./app/*` (defined in `apps/web/tsconfig.json`)
- Example: `import { cn } from "~/lib/utils"` resolves to `apps/web/app/lib/utils.ts`

**Order (Python):**
1. Standard library imports
   ```python
   import os
   import json
   import re
   ```
2. Third-party packages
   ```python
   from supabase import Client
   from google import genai
   ```
3. Local package imports
   ```python
   from pipeline import config
   from pipeline.ingestion.ingester import MeetingIngester
   ```

## Error Handling

**Patterns (TypeScript):**
- Try-catch for async operations with error logging
  ```typescript
  try {
    const { data, error } = await supabase.from("meetings").select("*");
    if (error) {
      console.error("Error fetching meetings:", error);
      throw new Error(error.message);
    }
    return data;
  } catch (error) {
    console.error("Error fetching meetings:", error);
    throw new Response("Error loading meetings", { status: 500 });
  }
  ```
- Supabase returns `{ data, error }` tuple — always check `error` before using `data`
- Route loaders throw `Response(message, { status: code })` for HTTP errors
- Services log to console and throw Error with message string

**Patterns (Python):**
- Try-except with pass or early return for edge cases
  ```python
  try:
    # Attempt operation
    result = parse_data(input)
    return result
  except ValueError:
    return None
  except Exception as e:
    print(f"Error: {e}")
    return None
  ```
- Print statements for logging (no structured logging framework)
- Fallback to defaults: `self._canonical_names = CANONICAL_NAMES if fetch failed`

## Logging

**Framework (TypeScript):**
- `console.error()` for error conditions
- `console.warn()` for warnings (e.g., missing env vars)
- No dedicated logging library; console is primary

**Framework (Python):**
- `print()` statements with formatted strings
  - Example: `print(f"  [*] Loading {meeting_type}...")`
  - Info/progress: `print(f"  [*] ...")`
  - Warnings: `print(f"  [!] ...")`
  - Errors: `print(f"  [ERROR] ...")`
- No structured logging; output to stdout/stderr

## Comments

**When to Comment:**
- Complex business logic (e.g., diarization alignment, meeting type mapping)
- Non-obvious workarounds or edge cases
  - Example: `# Parse YYYY-MM-DD directly to avoid timezone shifts`
  - Example: `# Supabase returns foreign key relations as arrays (1-to-many) or objects (many-to-1)`
- API-specific quirks (Supabase, Gemini, etc.)

**JSDoc/TSDoc (TypeScript):**
- Used for exported service functions
  - Example: `/** * Search transcript segments using vector similarity */`
- Multi-line format with description only (no `@param` tags typically)
  ```typescript
  /**
   * Formats a YYYY-MM-DD date string into a localized string.
   * Prevents UTC-to-Local rollover issues by parsing parts directly.
   */
  export function formatDate(dateStr: string, options?: Intl.DateTimeFormatOptions)
  ```

**Docstrings (Python):**
- Used for class methods and utility functions
- Simple format: `"""One-line description."""` for simple functions
  - Example: `def sanitize_filename(name): """Sanitizes a string to be safe for filenames."""`
- Multi-line for complex logic with example or explanation

## Function Design

**Size (TypeScript):**
- React components: typically 50-200 lines (includes JSX markup)
- Service functions: 20-80 lines (data fetching + logic)
- Utility functions: under 30 lines

**Parameters:**
- React components accept `React.ComponentProps<"element">` pattern for consistency
  - Example: `function Card({ className, ...props }: React.ComponentProps<"div">)`
- Service functions use options/config objects rather than many params
  - Example: `getMeetings(supabase, options: GetMeetingsOptions = {})`

**Return Values:**
- TypeScript: explicit return types on exported functions
  - Example: `export async function getMeetings(...): Promise<Meeting[]>`
- Services return destructured objects: `{ data, error }` (Supabase style)
- React components return JSX.Element implicitly

**Python:**
- Functions return `None`, single value, tuple, or list
- Type hints with `Optional`, `List`, Union syntax
  - Example: `def extract_date_from_string(text) -> Optional[str]:`

## Module Design

**Exports (TypeScript):**
- Named exports for functions and types
  ```typescript
  export async function getMeetings(...) { ... }
  export interface GetMeetingsOptions { ... }
  export type MeetingType = "Regular Council" | "Committee of the Whole" | ...
  ```
- Default exports only for route components
  ```typescript
  export default function Home({ loaderData }: any)
  ```

**Barrel Files:**
- Not extensively used; imports go directly to source files
- Example: `import { Card, CardHeader } from "~/components/ui/card"` not through an index

**Python:**
- Classes encapsulate related operations: `MeetingIngester`, `MatterMatcher`
- Module-level functions for utilities: `pipeline.parser`, `pipeline.utils`
- `__init__.py` exists but minimal; imports done at usage point

## React/JSX Patterns

**Component Definition:**
- Named function components (not arrow functions)
  ```typescript
  function AgendaOverview({
    items,
    expandedItemId,
    onItemClick,
  }: AgendaOverviewProps) {
    return (...)
  }
  ```
- Props destructured in function parameters with TypeScript interface

**Hooks:**
- `useState` for local state
- `useCallback`, `useRouteLoaderData` from React Router for data

**Event Handlers:**
- Named as `onEventName` in props
  - Example: `onItemClick`, `onWatchVideo`, `onMotionClick`
- Passed as props to child components

**Styling:**
- Tailwind CSS with `cn()` utility from `~/lib/utils`
  ```typescript
  className={cn(
    "bg-white rounded-2xl shadow-sm border border-zinc-200",
    className
  )}
  ```
- Component-level className composition with spread props

---

*Convention analysis: 2026-02-16*

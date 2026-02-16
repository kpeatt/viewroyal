# Deferred Items - Phase 01: Schema Foundation

## Pre-existing Issues (Out of Scope)

### 1. workers/app.ts ScheduledEvent type error
- **Discovered during:** 01-01 overall verification (`pnpm typecheck`)
- **File:** `apps/web/workers/app.ts` line 29
- **Error:** `TS2322: Type '(_event: ScheduledEvent, env: Env, ctx: ExecutionContext<unknown>) => Promise<void>' is not assignable to type 'ExportedHandlerScheduledHandler<Env>'`
- **Cause:** ScheduledController vs ScheduledEvent type mismatch (likely a @cloudflare/workers-types version issue)
- **Impact:** `pnpm typecheck` fails but `pnpm build` likely succeeds (Vite doesn't run full tsc)
- **Not fixed because:** Pre-existing, not introduced by any Phase 1 changes

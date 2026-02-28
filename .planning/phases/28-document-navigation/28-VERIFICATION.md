---
phase: 28-document-navigation
verified: 2026-02-28T22:10:00Z
status: human_needed
score: 11/11 must-haves verified
human_verification:
  - test: "Navigate to a document with 3+ sections on desktop"
    expected: "TOC sidebar appears on the left, main content on the right in a two-column layout"
    why_human: "Visual layout cannot be verified programmatically"
  - test: "Scroll through a long document on desktop with TOC visible"
    expected: "The active section updates with an indigo left-border highlight as you scroll"
    why_human: "IntersectionObserver and real-time DOM state require a browser"
  - test: "Click a TOC item"
    expected: "Page smooth-scrolls to that section; URL hash updates (e.g., #section-3); hash does NOT change during passive scroll"
    why_human: "Scroll behavior and history.replaceState side effects require a browser"
  - test: "Load a URL with a hash (e.g., /meetings/X/documents/Y#section-4)"
    expected: "Page scrolls to section-4 on load"
    why_human: "Deep-link behavior requires a live browser with real URL"
  - test: "Resize to mobile viewport (< 1024px) on a 3+ section document"
    expected: "Sticky top bar appears below the nav showing current section name; tapping it expands a dropdown of all sections"
    why_human: "Mobile layout and interactive dropdown require a browser"
  - test: "Navigate to a document with 1-2 sections"
    expected: "Single-column layout, no TOC bar or sidebar visible"
    why_human: "Visual layout requires a browser"
  - test: "Navigate to a document that references a bylaw (e.g., a staff report about rezoning)"
    expected: "Purple inline badges appear below sections that mention real bylaws; clicking a badge navigates to /bylaws/{id}"
    why_human: "Visual rendering and navigation require a browser"
  - test: "Navigate to a document with bylaw references and scroll to the bottom"
    expected: "'Related Documents' section appears listing all cross-referenced bylaws with titles and section counts"
    why_human: "Visual rendering requires a browser"
  - test: "Navigate to a document with NO bylaw references"
    expected: "No cross-reference badges or Related Documents section visible"
    why_human: "Conditional rendering requires a browser with real document data"
---

# Phase 28: Document Navigation Verification Report

**Phase Goal:** Users can navigate long documents efficiently and discover related documents across the platform
**Verified:** 2026-02-28T22:10:00Z
**Status:** human_needed (all automated checks passed)
**Re-verification:** No — initial verification

## Goal Achievement

### Success Criteria (from ROADMAP.md)

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | User sees a table of contents sidebar for long documents that highlights the current section while scrolling | VERIFIED | `DocumentTOC` renders desktop sidebar with IntersectionObserver-based `useScrollSpy`; indigo active styling confirmed in code |
| 2 | User sees cross-references between related documents (e.g., a staff report that references a bylaw links to that bylaw's document) | VERIFIED | `detectCrossReferences` + `CrossRefBadge` + `RelatedDocuments` all wired into document-viewer loader and render |
| 3 | User can jump to any section in a long document via the TOC without losing their place | VERIFIED | `scrollToSection()` calls `scrollIntoView({ behavior: "smooth", block: "start" })` and `scroll-mt-20` offset prevents sticky-header occlusion |

**Score:** 3/3 success criteria verified

### Observable Truths (from plan must_haves)

**Plan 28-01 Truths (DOCV-04):**

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User sees a table of contents sidebar on desktop for documents with 3+ sections | VERIFIED | `showTOC = tocItems.length >= 3`; renders `<div className="hidden lg:block w-[220px] shrink-0">` with `DocumentTOC variant="desktop"` |
| 2 | User sees the current section highlighted in the TOC while scrolling | VERIFIED | `useScrollSpy` returns `activeId`; DocumentTOC applies `border-indigo-500 text-indigo-700 font-semibold` when `isActive` |
| 3 | User can click a TOC item to smooth-scroll to that section | VERIFIED | `scrollToSection()` calls `el.scrollIntoView({ behavior: "smooth", block: "start" })` on click |
| 4 | URL hash updates on TOC click but NOT during passive scrolling | VERIFIED | `history.replaceState` called only inside `scrollToSection()` (click handler), not inside the `IntersectionObserver` callback |
| 5 | User sees a collapsible sticky top bar on mobile showing the current section name | VERIFIED | `MobileTOC` renders `sticky top-16 z-30` bar with `useState` open/closed toggle and dropdown |
| 6 | Documents with fewer than 3 sections keep the existing single-column layout | VERIFIED | Ternary `{showTOC ? <two-column> : <single-column max-w-4xl>}` confirmed in document-viewer.tsx |

**Plan 28-02 Truths (DOCL-03):**

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 7 | User sees inline cross-reference badges when a document mentions a bylaw (e.g., "Bylaw No. 1059") | VERIFIED | `sectionCrossRefs` filter + `CrossRefBadge` rendered per section in DocumentContent |
| 8 | User can click a cross-reference badge to navigate to the bylaw detail page | VERIFIED | `CrossRefBadge` renders `<Link to={url}>` where `url = /bylaws/${bylaw.id}` |
| 9 | User sees a "Related Documents" section at the bottom collecting all cross-referenced items | VERIFIED | `{crossReferences.length > 0 && <RelatedDocuments crossReferences={crossReferences} />}` after gallery |
| 10 | Cross-references only link to bylaws that actually exist in the database (no false positives) | VERIFIED | `detectCrossReferences` filters via `bylawMap.get(bylawNumber)` — only DB-backed bylaws create a `CrossReference` |
| 11 | Cross-reference badges are visually distinct from regular text but not overwhelming | VERIFIED | Purple `bg-purple-50 text-purple-700 border-purple-200 rounded-full` badges with `BookOpen` icon; code confirmed |

**Combined score:** 11/11 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/web/app/lib/use-scroll-spy.ts` | IntersectionObserver scroll-spy hook | VERIFIED | 55 lines; exports `useScrollSpy(sectionIds): string \| null`; `rootMargin: "0px 0px -80% 0px"` |
| `apps/web/app/components/document/DocumentTOC.tsx` | Desktop sidebar + mobile collapsible bar | VERIFIED | 153 lines; exports `DocumentTOC` and `TOCItem`; `variant="desktop"\|"mobile"` |
| `apps/web/app/lib/cross-references.ts` | Regex-based cross-reference detection | VERIFIED | 84 lines; exports `detectCrossReferences`, `CrossReference`, `BylawRecord` |
| `apps/web/app/components/document/CrossRefBadge.tsx` | Inline badge for cross-references | VERIFIED | 21 lines; purple Link badge with BookOpen icon |
| `apps/web/app/components/document/RelatedDocuments.tsx` | Bottom section listing cross-referenced docs | VERIFIED | 48 lines; guard clause for empty array; lists bylaws with section counts |
| `apps/web/app/routes/document-viewer.tsx` | Restructured layout + cross-ref wiring | VERIFIED | Imports all new components; conditional two-column layout; bylaws query in Promise.all |
| `apps/web/tests/lib/document-toc.test.ts` | TOC unit tests | VERIFIED | 25 tests passing (threshold, mapping, null fallback, ordering, hook contract) |
| `apps/web/tests/lib/cross-references.test.ts` | Cross-reference unit tests | VERIFIED | 12 tests passing (extraction, year suffix, false positives, dedup, URL, sort order) |

### Key Link Verification

**Plan 28-01 Links:**

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `document-viewer.tsx` | `DocumentTOC.tsx` | `import.*DocumentTOC` | WIRED | Line 26: `import { DocumentTOC, type TOCItem }` + rendered at lines 361, 371 |
| `document-viewer.tsx` | `use-scroll-spy.ts` | `import.*useScrollSpy` | WIRED | Line 27: `import { useScrollSpy }` + called at line 164 |
| `DocumentTOC.tsx` | `use-scroll-spy.ts` | `useScrollSpy` used in component | N/A — design uses variant prop: `useScrollSpy` called in `document-viewer.tsx`, `activeId` passed as prop to `DocumentTOC` |
| `DocumentTOC.tsx` | section elements | `scrollIntoView` on click | WIRED | `scrollToSection()` calls `el.scrollIntoView({ behavior: "smooth", block: "start" })` at line 21 |

**Plan 28-02 Links:**

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `document-viewer.tsx (loader)` | `cross-references.ts` | `detectCrossReferences` | WIRED | Line 29: imported; line 118: called with sections + bylaws data |
| `document-viewer.tsx (loader)` | supabase bylaws table | `from("bylaws")` | WIRED | Lines 111–114: `.from("bylaws").select("id, title, bylaw_number").not("bylaw_number", "is", null)` in Promise.all |
| `document-viewer.tsx (component)` | `RelatedDocuments.tsx` | `RelatedDocuments` rendered | WIRED | Line 33: imported; line 576–578: rendered conditionally after gallery |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DOCV-04 | 28-01 | User sees a table of contents sidebar for long documents that highlights the current section while scrolling | SATISFIED | `DocumentTOC` + `useScrollSpy` + conditional two-column layout all implemented and wired |
| DOCL-03 | 28-02 | User sees cross-references between related documents (e.g., a staff report references a bylaw) | SATISFIED | `detectCrossReferences` + `CrossRefBadge` + `RelatedDocuments` fully implemented and wired in loader |

No orphaned requirements found. Both DOCV-04 and DOCL-03 are explicitly claimed in plan frontmatter and implemented.

### Anti-Patterns Found

None. No TODOs, FIXMEs, placeholders, or stub implementations detected across all 6 modified/created files.

The single `return null` in `RelatedDocuments.tsx` line 10 is a guard clause for empty cross-reference arrays, not a stub.

### Commit Verification

All 4 task commits confirmed in git log:

| Commit | Plan | Task |
|--------|------|------|
| `2d51c98c` | 28-01 | Add useScrollSpy hook, DocumentTOC component, and tests |
| `b2eb5dbe` | 28-01 | Restructure document-viewer with conditional TOC sidebar layout |
| `aa99c3e5` | 28-02 | Add cross-reference detection utility and badge components |
| `9c556516` | 28-02 | Integrate cross-references into document-viewer loader and page |

### Human Verification Required

All automated checks pass. The following behaviors require browser verification:

#### 1. Desktop TOC Sidebar Layout

**Test:** Navigate to a document with 3+ sections on a desktop viewport (>= 1024px)
**Expected:** Two-column layout — narrow TOC sidebar on the left, main content on the right; "Contents" label above the TOC list
**Why human:** Visual layout cannot be verified programmatically

#### 2. Scroll-Spy Active Highlighting

**Test:** Scroll slowly through a long document with the TOC visible
**Expected:** The currently-visible section's TOC entry gets an indigo left border and bold text; other entries remain grey
**Why human:** IntersectionObserver and real-time DOM state require a live browser

#### 3. TOC Click Navigation

**Test:** Click a TOC item in the desktop sidebar
**Expected:** Page smooth-scrolls to that section; URL updates to `#section-N`; scrolling passively does NOT change the URL
**Why human:** Scroll animation, `history.replaceState` side effects, and hash behavior require a browser

#### 4. Deep-Link Support

**Test:** Load a URL with a hash directly (e.g., `/meetings/X/documents/Y#section-4`)
**Expected:** Page scrolls to section-4 on load after layout settles
**Why human:** `requestAnimationFrame` deep-link behavior requires a live browser with real URL

#### 5. Mobile TOC Collapsible Bar

**Test:** Resize to mobile viewport (< 1024px); navigate to a 3+ section document
**Expected:** Sticky bar below the nav shows current section name with a List icon and chevron; tapping it expands a dropdown list of all sections; selecting a section scrolls to it and closes the dropdown
**Why human:** Mobile layout, sticky positioning, and interactive dropdown require a browser

#### 6. Short Document (No TOC)

**Test:** Navigate to a document with 1-2 sections
**Expected:** Single-column layout (`max-w-4xl`), no TOC bar or sidebar visible
**Why human:** Visual layout requires a browser

#### 7. Inline Cross-Reference Badges

**Test:** Navigate to a document that references bylaws in its text (e.g., a rezoning staff report)
**Expected:** Small purple badges with a book icon appear below sections that mention real bylaws; clicking a badge navigates to the correct `/bylaws/{id}` page
**Why human:** Visual rendering and navigation require a browser with real production data

#### 8. Related Documents Section

**Test:** Scroll to the bottom of a document with bylaw references
**Expected:** "Related Documents" heading appears after the gallery, listing all referenced bylaws with title and section count; each entry links to the bylaw page
**Why human:** Visual rendering requires a browser with real production data

#### 9. No Cross-References (Negative Case)

**Test:** Navigate to a document with no bylaw references (e.g., a meeting agenda)
**Expected:** No purple badges, no "Related Documents" section visible; existing layout unchanged
**Why human:** Conditional rendering requires a browser with real document data

---

## Gaps Summary

No gaps. All 11 observable truths pass automated verification. The phase goal — in-document navigation via TOC and cross-reference linking — is fully implemented and wired. The remaining 9 human verification items are behavioral/visual checks that cannot be automated without a real browser and production data.

---

_Verified: 2026-02-28T22:10:00Z_
_Verifier: Claude (gsd-verifier)_

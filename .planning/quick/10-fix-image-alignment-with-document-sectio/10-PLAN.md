---
phase: quick-10
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/app/routes/document-viewer.tsx
autonomous: true
requirements: [IMG-ALIGN-01]
must_haves:
  truths:
    - "Images with document_section_id are displayed in their correct section"
    - "Images without document_section_id fall back to positional consumption"
    - "Junk tag filtering and substantial image filtering still work"
    - "Gallery shows only truly unmatched images"
  artifacts:
    - path: "apps/web/app/routes/document-viewer.tsx"
      provides: "document_section_id-based image mapping with positional fallback"
      contains: "document_section_id"
  key_links:
    - from: "document_images.document_section_id"
      to: "imagesBySection Map"
      via: "groupBy on document_section_id"
      pattern: "document_section_id"
---

<objective>
Fix image-to-section alignment in the document viewer by using the `document_section_id` foreign key from `document_images` instead of a broken positional consumption algorithm.

Purpose: Images currently shift out of alignment when any image is filtered by the size threshold, causing all subsequent sections to display wrong images. The database already has the correct mapping (21/23 images for meeting 3649 have `document_section_id` set) -- the web app just ignores it.

Output: Updated `document-viewer.tsx` with correct image-section mapping.
</objective>

<execution_context>
@/Users/kyle/.claude/get-shit-done/workflows/execute-plan.md
@/Users/kyle/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/app/routes/document-viewer.tsx
@apps/web/app/lib/types.ts (DocumentImage interface — has document_section_id: number | null)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace positional image consumption with document_section_id-based mapping</name>
  <files>apps/web/app/routes/document-viewer.tsx</files>
  <action>
Replace the image-to-section mapping logic at lines ~128-161 with a two-phase approach:

**Phase 1: Group images that have document_section_id (database-assigned)**

From `documentImages` (already fetched with `document_section_id` in the select at line 97), build the primary section-to-images map:

```typescript
// Keep existing constants: MIN_IMAGE_AREA, JUNK_TAG_RE

// Sort all images by (page, id) as before
const sortedImages = [...documentImages].sort(
  (a, b) => a.page - b.page || a.id - b.id,
);

// Phase 1: Group images by their database-assigned document_section_id
// Apply substantial image filter only to DB-mapped images that will be inlined
const imagesBySection = new Map<number, DocumentImage[]>();

// Build a lookup from section DB id to section for quick access
const sectionById = new Map(allSections.map((s) => [s.id, s]));

for (const img of sortedImages) {
  if (img.document_section_id != null && sectionById.has(img.document_section_id)) {
    const area = (img.width ?? 0) * (img.height ?? 0);
    if (area >= MIN_IMAGE_AREA) {
      const existing = imagesBySection.get(img.document_section_id) || [];
      existing.push(img);
      imagesBySection.set(img.document_section_id, existing);
    }
  }
}

// Phase 2: Fallback — images without document_section_id use positional consumption
const unmappedImages = sortedImages.filter(
  (img) =>
    img.document_section_id == null &&
    (img.width ?? 0) * (img.height ?? 0) >= MIN_IMAGE_AREA,
);

let fallbackCursor = 0;
for (const section of allSections) {
  // Skip sections that already have DB-mapped images
  // (they don't need fallback allocation)
  if (imagesBySection.has(section.id)) continue;

  const tags = section.section_text.match(/\[Image:\s*[^\]]+\]/g) || [];
  const sectionImgs: DocumentImage[] = [];
  for (const tag of tags) {
    const desc = tag.replace(/^\[Image:\s*/, "").replace(/\]$/, "");
    if (JUNK_TAG_RE.test(desc)) continue;
    if (fallbackCursor < unmappedImages.length) {
      sectionImgs.push(unmappedImages[fallbackCursor++]);
    }
  }
  if (sectionImgs.length > 0) {
    imagesBySection.set(section.id, sectionImgs);
  }
}
```

Keep the existing `usedIds` / `galleryImages` logic unchanged (lines 164-168) -- it correctly computes gallery from whatever `imagesBySection` contains.

Keep the existing `inlineImages` function unchanged (lines 175-198) -- it replaces `[Image:]` tags with figures from the section's assigned images, which is still correct.

Keep all rendering code unchanged.

**Key behavioral changes:**
- Images with `document_section_id` go directly to the correct section (no positional drift)
- Size filter still applies (logos/artifacts still excluded from inline display)
- Only images WITHOUT `document_section_id` use the old positional fallback
- Fallback only targets sections that got zero DB-mapped images (avoids double-assigning)
- Gallery still catches everything not inlined
  </action>
  <verify>
    <automated>cd /Users/kyle/development/viewroyal/apps/web && pnpm typecheck</automated>
    <manual>Visit /meetings/3649/documents/{docId} and verify images appear in correct sections, not shifted</manual>
  </verify>
  <done>Images with document_section_id render in their correct section. Images without document_section_id fall back to positional matching. Junk/logo filtering still works. TypeScript compiles cleanly.</done>
</task>

</tasks>

<verification>
- `pnpm typecheck` passes in apps/web/
- Document viewer for meeting 3649 shows images aligned to their correct sections
- Gallery section only contains images that are truly unassigned (no document_section_id and not consumed by fallback, or below size threshold)
</verification>

<success_criteria>
- The broken positional cursor algorithm is replaced with document_section_id-based grouping
- Fallback path exists for images lacking document_section_id
- No TypeScript errors introduced
- Images in meeting 3649 documents display in correct sections
</success_criteria>

<output>
After completion, create `.planning/quick/10-fix-image-alignment-with-document-sectio/10-SUMMARY.md`
</output>

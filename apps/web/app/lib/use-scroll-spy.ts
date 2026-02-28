import { useEffect, useState } from "react";

/**
 * IntersectionObserver-based scroll-spy hook.
 * Tracks which section element is currently visible at the top of the viewport.
 *
 * @param sectionIds - Array of element IDs to observe (e.g., ["section-1", "section-2"])
 * @returns The ID of the currently active section, or null if none is intersecting
 */
export function useScrollSpy(sectionIds: string[]): string | null {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (sectionIds.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Find entries that are currently intersecting
        const intersecting = entries.filter((e) => e.isIntersecting);

        if (intersecting.length > 0) {
          // Pick the one closest to the top of the viewport
          const closest = intersecting.reduce((best, entry) =>
            entry.boundingClientRect.top < best.boundingClientRect.top
              ? entry
              : best,
          );
          setActiveId(closest.target.id);
        }
      },
      {
        // Only the top 20% of the viewport counts as the "active zone"
        rootMargin: "0px 0px -80% 0px",
        threshold: 0,
      },
    );

    const elements: Element[] = [];
    for (const id of sectionIds) {
      const el = document.getElementById(id);
      if (el) {
        observer.observe(el);
        elements.push(el);
      }
    }

    return () => {
      observer.disconnect();
    };
    // Re-create observer if sectionIds array changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(sectionIds)]);

  return activeId;
}

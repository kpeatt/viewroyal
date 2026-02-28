import { useState, useEffect } from "react";
import { List, ChevronDown, ChevronUp } from "lucide-react";
import { ScrollArea } from "../ui/scroll-area";
import { cn } from "../../lib/utils";

export interface TOCItem {
  id: string; // "section-1", "section-2", etc.
  title: string; // section_title
  order: number; // section_order
}

interface DocumentTOCProps {
  items: TOCItem[];
  activeId: string | null;
  variant: "desktop" | "mobile";
}

function scrollToSection(sectionId: string) {
  const el = document.getElementById(sectionId);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  history.replaceState(null, "", `#${sectionId}`);
}

export function DocumentTOC({ items, activeId, variant }: DocumentTOCProps) {
  // Deep-link support: scroll to hash on mount
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) {
      requestAnimationFrame(() => {
        scrollToSection(hash);
      });
    }
  }, []);

  if (variant === "mobile") {
    return <MobileTOC items={items} activeId={activeId} />;
  }

  return <DesktopTOC items={items} activeId={activeId} />;
}

function DesktopTOC({
  items,
  activeId,
}: {
  items: TOCItem[];
  activeId: string | null;
}) {
  return (
    <nav aria-label="Table of contents">
      <p className="text-xs uppercase text-zinc-400 font-semibold tracking-wider mb-3">
        Contents
      </p>
      <ScrollArea className="max-h-[calc(100vh-10rem)]">
        <ul className="space-y-0.5">
          {items.map((item) => {
            const isActive = activeId === item.id;
            return (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection(item.id);
                  }}
                  className={cn(
                    "block border-l-2 py-1.5 pl-3 text-sm leading-snug transition-colors",
                    isActive
                      ? "border-indigo-500 text-indigo-700 font-semibold"
                      : "border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300",
                  )}
                >
                  {item.title}
                </a>
              </li>
            );
          })}
        </ul>
      </ScrollArea>
    </nav>
  );
}

function MobileTOC({
  items,
  activeId,
}: {
  items: TOCItem[];
  activeId: string | null;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const activeItem = items.find((item) => item.id === activeId);
  const activeTitle = activeItem?.title ?? items[0]?.title ?? "Contents";

  return (
    <div className="sticky top-16 z-30 bg-white border-b border-zinc-200">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-zinc-700"
        aria-expanded={isOpen}
        aria-controls="mobile-toc-dropdown"
      >
        <List className="w-4 h-4 text-zinc-400 shrink-0" />
        <span className="truncate flex-1 text-left font-medium">
          {activeTitle}
        </span>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-zinc-400 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
        )}
      </button>

      {isOpen && (
        <div
          id="mobile-toc-dropdown"
          className="absolute left-0 right-0 bg-white border-b border-zinc-200 shadow-lg"
        >
          <ScrollArea className="max-h-64">
            <ul className="py-1">
              {items.map((item) => {
                const isActive = activeId === item.id;
                return (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        scrollToSection(item.id);
                        setIsOpen(false);
                      }}
                      className={cn(
                        "block px-4 py-2 text-sm transition-colors truncate",
                        isActive
                          ? "text-indigo-700 font-semibold bg-indigo-50 border-l-2 border-indigo-500"
                          : "text-zinc-600 hover:text-zinc-800 hover:bg-zinc-50 border-l-2 border-transparent",
                      )}
                    >
                      {item.title}
                    </a>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

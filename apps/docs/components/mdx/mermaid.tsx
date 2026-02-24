'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import mermaid from 'mermaid';

export function Mermaid({ chart }: { chart: string }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted || !ref.current) return;

    // Clear previous SVG to avoid mermaid caching stale renders
    ref.current.removeAttribute('data-processed');
    ref.current.innerHTML = chart;

    mermaid.initialize({
      startOnLoad: false,
      theme: resolvedTheme === 'dark' ? 'dark' : 'default',
      securityLevel: 'loose',
    });

    mermaid.run({ nodes: [ref.current] });
  }, [mounted, resolvedTheme, chart]);

  if (!mounted) return null;

  return (
    <div
      key={resolvedTheme}
      ref={ref}
      id={`mermaid-${id}`}
      className="mermaid"
    >
      {chart}
    </div>
  );
}

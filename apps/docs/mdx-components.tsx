import defaultComponents from 'fumadocs-ui/mdx';
import { APIPage } from '@/components/api-page';
import { Mermaid } from '@/components/mdx/mermaid';
import type { MDXComponents } from 'mdx/types';

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...defaultComponents,
    APIPage,
    Mermaid,
    ...components,
  };
}

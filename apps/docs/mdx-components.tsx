import defaultComponents from 'fumadocs-ui/mdx';
import { APIPage } from '@/components/api-page';
import type { MDXComponents } from 'mdx/types';

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...defaultComponents,
    APIPage,
    ...components,
  };
}

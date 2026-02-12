import { useState, useEffect, type ReactNode } from "react";

interface ClientOnlyProps {
  children: () => ReactNode;
  fallback?: ReactNode;
}

/**
 * A utility component that ensures its children are only rendered on the client.
 * This is useful for wrapping components that rely on browser-specific APIs,
 * preventing SSR mismatches or errors.
 * The `children` prop is a function to further prevent the child component's code
 * from being executed prematurely on the server.
 *
 * @param {ClientOnlyProps} props - The component props.
 * @param {() => ReactNode} props.children - A function that returns the component(s) to render only on the client.
 * @param {ReactNode} [props.fallback=null] - An optional element to render on the server
 * and during the initial client-side render.
 * @returns {ReactNode} The children on the client, or the fallback/null on the server.
 */
export function ClientOnly({ children, fallback = null }: ClientOnlyProps) {
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) {
    return <>{fallback}</>;
  }

  return <>{children()}</>;
}

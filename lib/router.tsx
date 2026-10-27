import React from "react";
import {
  Link as TanStackLink,
  useRouter as useTanStackRouter,
  useNavigate,
} from "@tanstack/react-router";

/**
 * Universal Link component compatible with Next.js <Link href="...">
 * mapped to TanStack Router <Link to="...">
 */
export function Link({
  href,
  to,
  children,
  className,
  ...props
}: any) {
  const destination = to || href || "/";
  return (
    <TanStackLink to={destination} className={className} {...props}>
      {children}
    </TanStackLink>
  );
}

/**
 * Universal router hook compatible with Next.js useRouter()
 * mapped to TanStack Router navigate and router.invalidate()
 */
export function useRouter() {
  const router = useTanStackRouter();
  const navigate = useNavigate();

  return {
    push: (url: string) => navigate({ to: url }),
    replace: (url: string) => navigate({ to: url, replace: true }),
    refresh: () => router.invalidate(),
    back: () => window.history.back(),
    forward: () => window.history.forward(),
  };
}

/**
 * Universal useSearchParams hook compatible with Next.js
 */
export function useSearchParams() {
  if (typeof window === "undefined") {
    return new URLSearchParams();
  }
  return new URLSearchParams(window.location.search);
}

export default Link;

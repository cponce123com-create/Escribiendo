"use client";
import { useEffect } from "react";
export function SearchFragmentOnLoad({ query }: { query: string }) {
  useEffect(() => {
    if (!query) return;
    const timer = window.setTimeout(
      () => window.dispatchEvent(new CustomEvent("studio-search", { detail: query })),
      150,
    );
    return () => window.clearTimeout(timer);
  }, [query]);
  return null;
}

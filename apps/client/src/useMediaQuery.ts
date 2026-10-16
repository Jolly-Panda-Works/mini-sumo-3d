import { useEffect, useState } from "react";

/** True while the media query matches (updates on resize and rotation). */
export function useMediaQuery(query: string): boolean {
  const get = () => (typeof window.matchMedia === "function" ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/** Phones (and narrow windows): the hub layout with the arena carousel. */
export const PHONE_QUERY = "(max-width: 760px)";

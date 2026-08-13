import * as React from "react"

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"

/**
 * Returns whether the user has requested reduced motion.
 *
 * Guards against environments without `window.matchMedia` (jsdom, SSR) —
 * those always report `false` so rendering never blocks on the media query.
 */
export function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false
    return window.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false
  })

  React.useEffect(() => {
    const mql = window.matchMedia?.(REDUCED_MOTION_QUERY)
    if (!mql) return

    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches)

    setReducedMotion(mql.matches)
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return reducedMotion
}

import * as React from "react"

import { cn } from "@/lib/utils"
import type { MotionDuration } from "@/theme/motion"
import { useReducedMotion } from "./use-reduced-motion"

const DURATION_CLASS: Record<MotionDuration, string> = {
  fast: "duration-fast",
  base: "duration-base",
  slow: "duration-slow",
}

interface FadeInProps extends React.ComponentProps<"div"> {
  /** Entrance duration. Defaults to `base` (200ms). */
  duration?: MotionDuration
}

/**
 * Mount-only fade + rise entrance: opacity 0→1, translateY 8px→0.
 *
 * Children are always rendered and visible — the animation never gates
 * content. With reduced motion, children render with no transform and no
 * animation. `fill-mode-backwards` holds the from-state during any delay, so
 * Staggered children don't flash before their turn.
 */
export function FadeIn({ className, duration = "base", ...props }: FadeInProps) {
  const reducedMotion = useReducedMotion()

  if (reducedMotion) {
    return <div className={className} {...props} />
  }

  return (
    <div
      className={cn(
        "animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-backwards ease-enter",
        DURATION_CLASS[duration],
        className
      )}
      {...props}
    />
  )
}

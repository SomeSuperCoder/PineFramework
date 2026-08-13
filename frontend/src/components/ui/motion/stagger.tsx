import * as React from "react"

import { motion } from "@/theme/motion"
import { useReducedMotion } from "./use-reduced-motion"

interface StaggerProps extends React.ComponentProps<"div"> {
  /** Delay between consecutive children, ms. Defaults to `motion.stagger.stepMs`. */
  stepMs?: number
}

type ChildStyle = React.CSSProperties

/**
 * Sequences sibling entrances: each child is delayed by `index * stepMs`,
 * capped at `motion.stagger.maxOffsetMs` (100ms). Children bring their own
 * entrance (e.g. FadeIn); Stagger only owns the timing. With reduced motion,
 * no delays are applied and children render immediately.
 */
export function Stagger({
  className,
  stepMs = motion.stagger.stepMs,
  children,
  ...props
}: StaggerProps) {
  const reducedMotion = useReducedMotion()

  return (
    <div className={className} {...props}>
      {React.Children.map(children, (child, index) => {
        if (reducedMotion || !React.isValidElement<{ style?: ChildStyle }>(child)) {
          return child
        }

        const offsetMs = Math.min(index * stepMs, motion.stagger.maxOffsetMs)

        return React.cloneElement(child, {
          style: {
            ...(child.props.style ?? {}),
            animationDelay: `${offsetMs}ms`,
            transitionDelay: `${offsetMs}ms`,
          },
        })
      })}
    </div>
  )
}

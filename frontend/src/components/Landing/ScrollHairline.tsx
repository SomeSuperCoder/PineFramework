import { motion, useReducedMotion, useScroll, useSpring } from 'framer-motion';
import { DUR_SLOW, EASE_ENTER } from './motion-variants';

/** Scroll hairline — yellow page marker driven by scroll (DESIGN §2.0, §7).
 *  Spring is tuned to feel ~duration-slow (250ms); no new motion tokens.
 *  Reduced motion: static full-width marker that fades out (DESIGN §8). */
export function ScrollHairline() {
  const prefersReducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 24, mass: 0.3 });

  if (prefersReducedMotion) {
    return (
      <motion.div
        aria-hidden="true"
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: DUR_SLOW, ease: EASE_ENTER, delay: 0.5 }}
        className="fixed inset-x-0 top-0 z-50 h-[2px] bg-[#ffd02f]"
      />
    );
  }

  return (
    <motion.div
      aria-hidden="true"
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-50 h-[2px] origin-left bg-[#ffd02f]"
    />
  );
}

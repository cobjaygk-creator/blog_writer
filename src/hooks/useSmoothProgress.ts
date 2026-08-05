"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Smooth progress toward a moving target. While stalled below the soft ceiling,
 * slowly trickles so the bar never looks frozen.
 */
export function useSmoothProgress(options: {
  active: boolean;
  /** Hard target the bar should approach (from phase floor / upload %). */
  target: number;
  /** Soft cap while waiting in the same phase (bar trickles toward this). */
  ceiling: number;
  /** Jump to 100 and settle when true. */
  complete?: boolean;
}) {
  const { active, target, ceiling, complete } = options;
  const [display, setDisplay] = useState(0);
  const displayRef = useRef(0);
  const targetRef = useRef(target);
  const ceilingRef = useRef(ceiling);
  const completeRef = useRef(Boolean(complete));

  targetRef.current = target;
  ceilingRef.current = ceiling;
  completeRef.current = Boolean(complete);

  useEffect(() => {
    if (!active) {
      displayRef.current = 0;
      setDisplay(0);
      return;
    }

    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      let current = displayRef.current;
      if (completeRef.current) {
        const goal = 100;
        current += (goal - current) * Math.min(1, dt * 8);
        if (goal - current < 0.2) current = goal;
      } else {
        const hard = Math.max(0, Math.min(99, targetRef.current));
        const soft = Math.max(hard, Math.min(99, ceilingRef.current));

        if (current < hard) {
          // Catch up to new phase floor quickly but smoothly
          current += (hard - current) * Math.min(1, dt * 5);
          if (hard - current < 0.15) current = hard;
        } else if (current < soft - 0.4) {
          // Trickle toward soft ceiling (never jump)
          const remain = soft - current;
          const rate = Math.max(0.35, remain * 0.12);
          current += rate * dt;
          if (current > soft - 0.35) current = soft - 0.35;
        }
      }

      displayRef.current = current;
      setDisplay(current);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  return Math.round(display * 10) / 10;
}

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';
const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};

/** True when the user asked for less motion. Movement is dropped; fades and colour changes stay. */
export function useReducedMotion() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
}

/** Ease-out cubic tween from the last shown value to `to`, 650ms. Instant under reduced motion. */
export function useCountUp(to: number, duration = 650) {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(reduced ? to : 0);
  const shown = useRef(reduced ? to : 0);
  useEffect(() => {
    if (reduced) { shown.current = to; setValue(to); return; }
    const from = shown.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      shown.current = from + (to - from) * (1 - (1 - p) ** 3);
      setValue(shown.current);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration, reduced]);
  return value;
}

/** A number that counts up. The animated text is hidden from screen readers; they get the final value at once. */
export function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const shown = useCountUp(value);
  return <><span aria-hidden="true">{format(shown)}</span><span className="sr-only">{format(value)}</span></>;
}

/** False for one frame pair after `key` changes, then true: flip a transition from its start to its end. Always true under reduced motion. */
export function useDrawn(key?: unknown) {
  const reduced = useReducedMotion();
  const [drawn, setDrawn] = useState(reduced);
  useEffect(() => {
    if (reduced) { setDrawn(true); return; }
    setDrawn(false);
    let b = 0;
    const a = requestAnimationFrame(() => { b = requestAnimationFrame(() => setDrawn(true)); });
    return () => { cancelAnimationFrame(a); cancelAnimationFrame(b); };
  }, [key, reduced]);
  return drawn;
}

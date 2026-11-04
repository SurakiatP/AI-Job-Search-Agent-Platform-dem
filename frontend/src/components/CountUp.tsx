import { useEffect, useState } from 'react';

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Counts from 0 to the real value once (400 ms, ease-out). Starts at 0 so the final number never flashes first;
// reduced motion shows the value at once. A later change of value jumps straight to it (no replay).
export function CountUp({ value, delay = 0, duration = 400 }: { value: number; delay?: number; duration?: number }) {
  const [shown, setShown] = useState(() => (reduced() || value < 10 ? value : 0));
  const [played, setPlayed] = useState(false);
  useEffect(() => {
    // Small numbers show as they are: 0 → 1 looks like a wrong value flashing, not a count.
    if (played || value < 10 || reduced()) { setShown(value); return; }
    let frame = 0;
    const start = performance.now() + delay;
    const tick = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - start) / duration));
      setShown(Math.round(value * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick); else setPlayed(true);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, played, delay, duration]);
  return <>{shown}</>;
}

import { useEffect, useState } from 'react';

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Counts from 0 to the real value once (400 ms, ease-out). Starts at 0 so the final number never flashes first;
// reduced motion shows the value at once. A later change of value jumps straight to it (no replay).
export function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(() => (reduced() ? value : 0));
  const [played, setPlayed] = useState(false);
  useEffect(() => {
    if (played || value === 0 || reduced()) { setShown(value); return; }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 400);
      setShown(Math.round(value * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick); else setPlayed(true);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, played]);
  return <>{shown}</>;
}

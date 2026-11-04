import type React from 'react';
const sizeClass = { 32: 'size-8 text-sm', 40: 'size-10 text-base', 48: 'size-12 text-xl' } as const;
// Six fixed hues, light tint with dark text of the same hue (all pairs at least 7:1); the same company always gets the same one.
const HUES = [178, 205, 150, 32, 265, 340] as const;

function hueFor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return HUES[h % HUES.length];
}

// Initial-letter mark for a company; decorative, the name is always written beside it.
export function CompanyMark({ name, size = 40 }: { name: string | null; size?: 32 | 40 | 48 }) {
  const clean = name?.trim() ?? '';
  const first = clean ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(clean)[Symbol.iterator]().next().value?.segment ?? '' : '';
  const hue = clean ? hueFor(clean.toLocaleLowerCase()) : null;
  const style = hue == null ? undefined : { '--mark-h': hue } as React.CSSProperties;
  return <span aria-hidden="true" style={style} className={`inline-flex shrink-0 items-center justify-center rounded-xl font-semibold ${hue == null ? 'bg-muted text-foreground' : 'company-mark'} ${sizeClass[size]}`}>{first.toLocaleUpperCase()}</span>;
}

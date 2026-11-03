const sizeClass = { 32: 'size-8 text-sm', 40: 'size-10 text-base', 48: 'size-12 text-xl' } as const;

// Initial-letter mark for a company; decorative, the name is always written beside it.
export function CompanyMark({ name, size = 40 }: { name: string | null; size?: 32 | 40 | 48 }) {
  const first = name ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(name.trim())[Symbol.iterator]().next().value?.segment ?? '' : '';
  return <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center rounded-lg bg-muted font-semibold text-foreground ${sizeClass[size]}`}>{first.toLocaleUpperCase()}</span>;
}

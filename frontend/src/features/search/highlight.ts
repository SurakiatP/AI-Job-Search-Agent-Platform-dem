export type Segment = { text: string; kind: 'plain' | 'matched' | 'missing' };

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Splits plain text into segments around skill surfaces; never builds HTML strings.
export function highlightSegments(text: string, terms: { matched: Record<string, string>; missing: Record<string, string> }): Segment[] {
  const kinds = new Map<string, Segment['kind']>();
  for (const surface of Object.values(terms.missing)) if (surface.trim()) kinds.set(surface.toLowerCase(), 'missing');
  for (const surface of Object.values(terms.matched)) if (surface.trim()) kinds.set(surface.toLowerCase(), 'matched');
  if (!kinds.size) return [{ text, kind: 'plain' }];
  const alternatives = [...kinds.keys()].sort((a, b) => b.length - a.length).map(term =>
    /^[\x00-\x7f]+$/.test(term) ? `(?<![A-Za-z0-9])${escapeRegExp(term)}(?![A-Za-z0-9])` : escapeRegExp(term));
  const pattern = new RegExp(alternatives.join('|'), 'gi');
  const out: Segment[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > last) out.push({ text: text.slice(last, start), kind: 'plain' });
    out.push({ text: match[0], kind: kinds.get(match[0].toLowerCase()) ?? 'plain' });
    last = start + match[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), kind: 'plain' });
  return out;
}

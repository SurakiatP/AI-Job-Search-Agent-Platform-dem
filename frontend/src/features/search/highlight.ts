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

type HastNode = { type: string; value?: string; tagName?: string; properties?: Record<string, unknown>; children?: HastNode[] };
const MARK_CLASS = { matched: 'rounded bg-success/15 px-0.5 text-success', missing: 'rounded bg-destructive/12 px-0.5 text-destructive' };

// Rehype plugin: marks skill terms inside rendered markdown text, so headings and lists keep their shape.
export function rehypeHighlight(terms: Parameters<typeof highlightSegments>[1], labels: { matched: string; missing: string }) {
  const walk = (node: HastNode) => {
    if (!node.children || node.tagName === 'code' || node.tagName === 'pre') return;
    node.children = node.children.flatMap(child => {
      if (child.type !== 'text') { walk(child); return [child]; }
      return highlightSegments(child.value ?? '', terms).map(seg => seg.kind === 'plain' ? { type: 'text', value: seg.text } : {
        type: 'element', tagName: 'mark', properties: { className: MARK_CLASS[seg.kind] },
        children: [{ type: 'text', value: seg.text }, { type: 'element', tagName: 'span', properties: { className: 'sr-only' }, children: [{ type: 'text', value: ` ${labels[seg.kind]}` }] }],
      });
    });
  };
  return () => (tree: HastNode) => { walk(tree); };
}

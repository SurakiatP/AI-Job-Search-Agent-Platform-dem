// A small drawn page for a theme card: layout, accent, heading style and density, so cards differ at a glance.
import type { Tokens } from './themes';

const LINE = '#CBD5E1';
const INK = '#64748B';

export function ThemeThumb({ layout, tokens }: { layout: string; tokens: Tokens }) {
  const a = tokens.accent;
  const gap = tokens.density === 'compact' ? 5 : tokens.density === 'relaxed' ? 9 : 7;
  const side = layout === 'ditgar' || layout === 'teak';
  const left = side ? 22 : 6;
  const sections = [0, 1, 2].map(i => 30 + i * (gap + 12));
  return <svg viewBox="0 0 60 80" role="img" aria-hidden="true" className="h-full w-full">
    <rect width="60" height="80" rx="3" fill="#FFFFFF" />
    {side && <rect width="18" height="80" rx="3" fill={a} opacity="0.12" />}
    {side && <rect x="2" y="3" width="14" height="14" rx="2" fill={a} />}
    {layout === 'saffron' && <rect width="60" height="20" rx="3" fill={a} />}
    {layout === 'saffron' && <circle cx="10" cy="10" r="5" fill="#FFFFFF" opacity="0.9" />}
    {layout === 'lotus' && <rect x="45" y="5" width="10" height="13" rx="2" fill={a} opacity="0.35" />}
    <rect x={layout === 'saffron' ? 19 : left} y={layout === 'saffron' ? 7 : 6} width={layout === 'kakuna' ? 28 : 22} height="3.2" rx="1.6" fill={layout === 'saffron' ? '#FFFFFF' : INK}
      transform={layout === 'kakuna' ? 'translate(9 0)' : undefined} />
    {layout === 'onyx' && <rect x="6" y="15" width="48" height="0.8" fill={LINE} />}
    {sections.map(y => <g key={y}>
      {tokens.heading_style === 'band' && <rect x={left} y={y - 3} width={54 - left} height="6" rx="1.5" fill={a} opacity="0.14" />}
      <rect x={left + (tokens.heading_style === 'band' ? 1.5 : 0)} y={y - 1} width="14" height="2.4" rx="1.2" fill={a} />
      {tokens.heading_style === 'rule' && <rect x={left} y={y + 3} width={54 - left} height="0.7" fill={a} />}
      {[0, 1].map(k => <rect key={k} x={left} y={y + 6 + k * 3.6} width={(54 - left) * (k ? 0.7 : 1)} height="1.6" rx="0.8" fill={LINE} />)}
    </g>)}
  </svg>;
}

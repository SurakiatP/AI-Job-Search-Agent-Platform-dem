// SPEC-RTH: resume themes are data (layout + tokens). The server is the authority; these helpers only mirror its rules for hints.
export type Tokens = {
  accent: string;
  font_pair: 'sans' | 'serif';
  size: 'small' | 'normal' | 'large';
  density: 'compact' | 'normal' | 'relaxed';
  heading_style: 'plain' | 'rule' | 'band';
};
export type Preset = { id: string; layout: string; th: string; en: string; ats_safe: boolean; photo: boolean; tokens: Tokens };
export type Custom = { id: string; name: string; layout: string; tokens: Tokens; ats_safe: boolean; photo: boolean };
export type ThemeList = { presets: Preset[]; custom: Custom[] };
export type Working = { layout: string; tokens: Tokens };

export const LAYOUTS = ['onyx', 'kakuna', 'ditgar', 'lotus', 'teak', 'saffron'] as const;
export const FILE_MAX_BYTES = 4096;
export const customId = (id: string) => `custom:${id}`;
export const isCustom = (templateId: string) => templateId.startsWith('custom:');

const luminance = (hex: string) => {
  const channel = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

/** Same rule as the server: accent text must reach 4.5:1 on white and on the 10% heading band. */
export function accentOk(hex: string): boolean {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return false;
  const tint = '#' + [1, 3, 5].map(i => Math.round(255 * 0.9 + parseInt(hex.slice(i, i + 2), 16) * 0.1).toString(16).padStart(2, '0')).join('');
  return [ '#FFFFFF', tint ].every(bg => (luminance(bg) + 0.05) / (luminance(hex) + 0.05) >= 4.5);
}

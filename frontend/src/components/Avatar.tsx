import type { ReactElement } from 'react';
import type { Account } from '../lib/api-types';
import { cn } from '@/lib/utils';

export const AVATAR_PRESETS = ['compass', 'briefcase', 'spark', 'mountain'] as const;
export type AvatarPreset = (typeof AVATAR_PRESETS)[number];

// Four calm, job-search themed pictures. Plain SVG drawn here, so nothing is fetched and they follow light and dark themes.
const art: Record<AvatarPreset, { bg: string; node: ReactElement }> = {
  compass: { bg: '#4f46e5', node: <g fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="24" cy="24" r="13" /><path d="m29.5 18.5-3.8 8.2-8.2 3.8 3.8-8.2z" fill="#fff" fillOpacity=".9" /></g> },
  briefcase: { bg: '#0f766e', node: <g fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="10" y="17" width="28" height="19" rx="3.5" /><path d="M18 17v-3.5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2V17M10 26h28" /></g> },
  spark: { bg: '#9333ea', node: <g fill="#fff"><path d="M24 9c1.2 7.4 3.6 9.8 11 11-7.4 1.2-9.8 3.6-11 11-1.2-7.4-3.6-9.8-11-11 7.4-1.2 9.8-3.6 11-11z" /><circle cx="35" cy="33" r="2.4" fillOpacity=".85" /><circle cx="13" cy="34" r="1.6" fillOpacity=".7" /></g> },
  mountain: { bg: '#c2410c', node: <g fill="#fff"><path d="m8 36 11-17 7 10 4-5.5L40 36z" fillOpacity=".95" /><circle cx="33" cy="14" r="3.2" fillOpacity=".8" /></g> },
};

const initial = (email: string) => (email.trim()[0] ?? '?').toUpperCase();

export function PresetArt({ preset, className }: { preset: AvatarPreset; className?: string }) {
  const { bg, node } = art[preset];
  return <svg viewBox="0 0 48 48" aria-hidden="true" className={cn('size-full', className)}><rect width="48" height="48" fill={bg} />{node}</svg>;
}

// The person's picture: their upload, else the built-in avatar they picked, else the first letter of their email on a calm colour.
export function Avatar({ account, size = 36, className }: { account: Account; size?: number; className?: string }) {
  const style = { width: size, height: size };
  const shell = cn('block shrink-0 overflow-hidden rounded-full bg-accent text-center font-semibold text-primary ring-1 ring-border', className);
  if (account.has_avatar_image) return <img src={`/v1/account/avatar?v=${encodeURIComponent(account.avatar_version ?? '')}`} alt="" style={style} className={cn(shell, 'object-cover')} />;
  if (account.avatar_preset) return <span style={style} className={shell}><PresetArt preset={account.avatar_preset} /></span>;
  return <span aria-hidden="true" style={{ ...style, lineHeight: `${size}px`, fontSize: Math.max(11, size * 0.45) }} className={shell}>{initial(account.email)}</span>;
}

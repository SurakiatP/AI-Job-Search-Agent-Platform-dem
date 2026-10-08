import { useEffect, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy } from 'lucide-react';
import { Button } from './ui/button';

const copy = {
  th: { copy: 'คัดลอก', done: 'คัดลอกแล้ว ✓', md: 'คัดลอกแบบ Markdown', fail: 'คัดลอกไม่สำเร็จ ลองเลือกข้อความแล้วคัดลอกเอง' },
  en: { copy: 'Copy', done: 'Copied ✓', md: 'Copy as Markdown', fail: 'Could not copy. Select the text and copy it yourself.' },
};

// Copies the rendered text (innerText of `source`, so what you see is what you copy); the second button copies the raw Markdown.
export function CopyButton({ source, markdown, className }: { source: RefObject<HTMLElement | null>; markdown: string; className?: string }) {
  const c = copy[useTranslation().i18n.language.startsWith('th') ? 'th' : 'en'];
  const [state, setState] = useState<'' | 'text' | 'md' | 'fail'>('');
  const timer = useRef<number>(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  async function run(kind: 'text' | 'md') {
    let ok = true;
    try { await navigator.clipboard.writeText(kind === 'md' ? markdown : source.current?.innerText ?? markdown); } catch { ok = false; }
    setState(ok ? kind : 'fail');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState(''), 2000);
  }
  return <span className={`flex flex-wrap items-center gap-2 ${className ?? ''}`}>
    <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => void run('text')}>{state === 'text' ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}{state === 'text' ? c.done : c.copy}</Button>
    <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={() => void run('md')}>{state === 'md' ? c.done : c.md}</Button>
    <span role="status" className="text-xs text-destructive">{state === 'fail' ? c.fail : ''}</span>
  </span>;
}

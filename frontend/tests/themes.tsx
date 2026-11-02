// Visual harness for the SPEC-RTH theme panel: the API is faked in the browser, so no backend is needed. Open /tests/themes.html.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { AppProviders, useLocale } from '../src/app/providers';
import { ThemePanel } from '../src/features/themes/ThemePanel';
import type { Tokens, Working } from '../src/features/themes/themes';
import '../src/styles.css';

const base: Tokens = { accent: '#3730A3', font_pair: 'sans', size: 'normal', density: 'normal', heading_style: 'plain' };
const preset = (id: string, layout: string, th: string, en: string, ats: boolean, photo: boolean, t: Partial<Tokens> = {}) => ({ id, layout, th, en, ats_safe: ats, photo, tokens: { ...base, ...t } });
const presets = [
  preset('onyx', 'onyx', 'Onyx', 'Onyx', true, false), preset('kakuna', 'kakuna', 'Kakuna', 'Kakuna', true, false), preset('ditgar', 'ditgar', 'Ditgar', 'Ditgar', false, false),
  preset('lotus', 'lotus', 'Lotus', 'Lotus', true, true), preset('teak', 'teak', 'Teak', 'Teak', false, true), preset('saffron', 'saffron', 'Saffron', 'Saffron', true, true),
  preset('paper', 'onyx', 'กระดาษ', 'Paper', true, false, { font_pair: 'serif', density: 'relaxed', heading_style: 'rule' }),
  preset('compact', 'onyx', 'กะทัดรัด', 'Compact', true, false, { size: 'small', density: 'compact' }),
  preset('banner', 'kakuna', 'แบนเนอร์', 'Banner', true, false, { heading_style: 'band' }),
  preset('classic', 'kakuna', 'คลาสสิก', 'Classic', true, false, { font_pair: 'serif', density: 'relaxed', heading_style: 'rule' }),
  preset('portrait', 'lotus', 'พอร์ตเทรต', 'Portrait', true, true, { font_pair: 'serif' }),
  preset('studio', 'saffron', 'สตูดิโอ', 'Studio', true, true, { size: 'large', heading_style: 'band' }),
];
let custom = [{ id: '11111111-1111-4111-8111-111111111111', name: 'ธีมสำหรับสมัครงานราชการ', layout: 'onyx', tokens: { ...base, accent: '#115E59', heading_style: 'rule' as const }, ats_safe: true, photo: false }];

const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const path = new URL(url, location.origin).pathname.replace(/^\/v1/, '');
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  if (path === '/auth/session') return json({ csrf_token: 'harness', expires_at: '2099-01-01T00:00:00Z', user: { id: 'u1', email: 'tester@example.test', locale: 'th', email_verified: true } });
  if (path === '/resume-themes' && (!init?.method || init.method === 'GET')) return json({ presets, custom });
  if (path === '/resume-themes' && init?.method === 'POST') {
    const body = JSON.parse(String(init.body));
    const made = { id: crypto.randomUUID(), name: body.name, layout: body.layout, tokens: body.tokens, ats_safe: true, photo: false };
    custom = [...custom, made];
    return json(made, 201);
  }
  if (path.startsWith('/resume-themes/') && init?.method === 'DELETE') { custom = custom.filter(t => !path.endsWith(t.id)); return new Response(null, { status: 204 }); }
  return realFetch(input, init);
};

function Harness() {
  const { locale } = useLocale();
  const [template, setTemplate] = useState('paper');
  const [working, setWorking] = useState<Working | null>(null);
  return <main className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-4 p-4">
    <ThemePanel templateId={template} accent="indigo" hasPhoto locale={locale} onPick={setTemplate} onWorking={setWorking} />
    <p className="break-all text-sm text-muted-foreground" data-testid="state">{template} {working ? JSON.stringify(working.tokens) : ''}</p>
  </main>;
}

createRoot(document.getElementById('root')!).render(<AppProviders><BrowserRouter><Harness /></BrowserRouter></AppProviders>);

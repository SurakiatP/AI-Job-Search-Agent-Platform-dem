import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Search } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { categoryLabel } from '../search/categories';

type Stats = { total: number; new_7d: number | null; thai_postings: number; categories: { value: string; count: number }[] };

const copy = {
  th: { title: 'ค้นหางานจริงในไทยตอนนี้', label: 'ค้นหาตำแหน่ง บริษัท หรือทักษะ', placeholder: 'เช่น Frontend, Data analyst', go: 'ค้นหา', total: 'งานในไทย', fresh: 'ใหม่ 7 วัน', thai: 'ประกาศภาษาไทย', cats: 'หมวดงาน' },
  en: { title: 'Search real jobs in Thailand now', label: 'Search title, company or skill', placeholder: 'e.g. Frontend, Data analyst', go: 'Search', total: 'Jobs in Thailand', fresh: 'New in 7 days', thai: 'Thai postings', cats: 'Categories' },
};

export function SearchTeaser({ locale, className }: { locale: 'th' | 'en'; className?: string }) {
  const c = copy[locale];
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [q, setQ] = useState('');
  const nf = new Intl.NumberFormat(locale === 'th' ? 'th-TH' : 'en-US');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/v1/public/job-stats', { signal: controller.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('stats'))))
      .then((s: Stats) => setStats(s))
      .catch(() => setStats(null)); // numbers are optional; the search box still works
    return () => controller.abort();
  }, []);

  const go = (key: 'q' | 'category', value: string) => navigate(`/app/search?${new URLSearchParams(value ? { [key]: value } : {}).toString()}`);
  const submit = (e: FormEvent) => { e.preventDefault(); go('q', q.trim()); };

  return <section className={className} aria-labelledby="teaser-title">
    <div className="landing-glass mx-auto grid max-w-3xl justify-items-center gap-6 rounded-3xl p-6 text-center sm:p-10">
      <h2 id="teaser-title" className="text-3xl font-semibold not-italic [text-wrap:balance]">{c.title}</h2>
      {stats && <ul className="grid w-full gap-4 sm:grid-cols-3">
        {([[stats.total, c.total], [stats.new_7d, c.fresh], [stats.thai_postings, c.thai]] as const).filter(([n]) => typeof n === 'number').map(([n, label]) => <li key={label} className="grid gap-1">
          <span className="landing-gradient-text text-3xl font-semibold tabular-nums">{nf.format(n as number)}</span>
          <span className="text-sm text-muted-foreground">{label}</span>
        </li>)}
      </ul>}
      <form onSubmit={submit} className="grid w-full gap-2 text-left">
        <Label htmlFor="teaser-q">{c.label}</Label>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input id="teaser-q" type="search" className="pl-9" value={q} placeholder={c.placeholder} onChange={e => setQ(e.target.value)} />
          </div>
          <Button type="submit" className="shrink-0 whitespace-nowrap">{c.go}</Button>
        </div>
      </form>
      {stats && stats.categories.length > 0 && <div role="group" aria-label={c.cats} className="flex flex-wrap justify-center gap-2">
        {stats.categories.slice(0, 8).map(f => <Button key={f.value} type="button" variant="outline" size="sm" className="h-auto min-h-9 whitespace-normal rounded-full" onClick={() => go('category', f.value)}>
          {categoryLabel(locale, f.value)}<span className="text-muted-foreground">{nf.format(f.count)}</span>
        </Button>)}
      </div>}
    </div>
  </section>;
}

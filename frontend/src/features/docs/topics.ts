// The manual pages live in manual/pages/th/user-guide (written with manual-kit); the order here matches their file numbers.
export type Stage = 'brand' | 'cv' | 'search' | 'evaluate' | 'docs' | 'track';
export const topics = [
  { id: 'getting-started', file: '01-getting-started', stage: 'brand' },
  { id: 'cv-and-experience', file: '02-cv-and-experience', stage: 'cv' },
  { id: 'build-cv', file: '03-build-cv', stage: 'cv' },
  { id: 'search-and-evaluate', file: '04-search-and-evaluate', stage: 'search' },
  { id: 'tailor-and-draft', file: '05-tailor-and-draft', stage: 'docs' },
  { id: 'interview-practice', file: '06-interview-practice', stage: 'evaluate' },
  { id: 'track-applications', file: '07-track-applications', stage: 'track' },
  { id: 'job-alerts', file: '08-job-alerts', stage: 'search' },
  { id: 'safety-and-data', file: '09-safety-and-data', stage: 'brand' },
] as const satisfies readonly { id: string; file: string; stage: Stage }[];

const pages = import.meta.glob('../../../../manual/pages/*/user-guide/*.md', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>;

export function loadPage(file: string, locale: 'th' | 'en'): Promise<string> | undefined {
  return pages[`../../../../manual/pages/${locale}/user-guide/${file}.md`]?.();
}

// Turns a manual-kit page into plain Markdown: drops the front matter and the first title (the page header shows it),
// writes {{ui:"label"}} as bold and [[page-id]] as a link to that topic.
export type Section = { heading: string; body: string };
export function prepare(raw: string, titleOf: (id: string) => string): { title: string; sections: Section[] } {
  const front = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  const title = front?.[1].match(/^title:\s*(.+)$/m)?.[1].trim() ?? '';
  const body = raw.slice(front?.[0].length ?? 0)
    .replace(/\{\{ui:"([^"]+)"\}\}/g, '**$1**')
    .replace(/\{\{ui:([\w.-]+)\}\}/g, '**$1**')
    .replace(/\[\[([\w-]+)\]\]/g, (_, id: string) => {
      const topic = topics.find(item => item.id === id);
      return topic ? `[${titleOf(id)}](/docs/${id})` : id;
    });
  // The picture note line (an italic line right after a picture) is replaced by the figure caption.
  const clean = body.replace(/(!\[[^\]]*\]\([^)]*\))\n\*[^*\n]+\*\n/g, '$1\n');
  const sections = clean.split(/^## /m).filter(Boolean).map(part => {
    const [heading, ...rest] = part.split('\n');
    return { heading: heading.trim(), body: rest.join('\n').trim() };
  });
  return { title, sections };
}

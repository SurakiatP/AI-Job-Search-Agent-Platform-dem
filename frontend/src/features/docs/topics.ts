// The manual pages live in manual/pages/th/user-guide (written with manual-kit); the order here matches their file numbers.
export type Stage = 'cv' | 'search' | 'evaluate' | 'docs' | 'track';
export const topics = [
  { id: 'getting-started', file: '01-getting-started', stage: undefined },
  { id: 'cv-and-experience', file: '02-cv-and-experience', stage: 'cv' },
  { id: 'search-and-evaluate', file: '03-search-and-evaluate', stage: 'search' },
  { id: 'tailor-and-draft', file: '04-tailor-and-draft', stage: 'docs' },
  { id: 'interview-practice', file: '05-interview-practice', stage: 'evaluate' },
  { id: 'track-applications', file: '06-track-applications', stage: 'track' },
  { id: 'job-alerts', file: '07-job-alerts', stage: 'search' },
  { id: 'safety-and-data', file: '08-safety-and-data', stage: undefined },
] as const satisfies readonly { id: string; file: string; stage: Stage | undefined }[];

const pages = import.meta.glob('../../../../manual/pages/*/user-guide/*.md', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>;

export function loadPage(file: string, locale: 'th' | 'en'): Promise<string> | undefined {
  return pages[`../../../../manual/pages/${locale}/user-guide/${file}.md`]?.();
}

// Turns a manual-kit page into plain Markdown: drops the front matter and the first title (the page header shows it),
// writes {{ui:"label"}} as bold and [[page-id]] as a link to that topic.
export function prepare(raw: string, titleOf: (id: string) => string): { title: string; body: string } {
  const front = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  const title = front?.[1].match(/^title:\s*(.+)$/m)?.[1].trim() ?? '';
  const body = raw.slice(front?.[0].length ?? 0)
    .replace(/\{\{ui:"([^"]+)"\}\}/g, '**$1**')
    .replace(/\{\{ui:([\w.-]+)\}\}/g, '**$1**')
    .replace(/\[\[([\w-]+)\]\]/g, (_, id: string) => {
      const topic = topics.find(item => item.id === id);
      return topic ? `[${titleOf(id)}](/docs/${id})` : id;
    });
  return { title, body };
}

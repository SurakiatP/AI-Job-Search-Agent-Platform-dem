// Category slug labels shared by the search page and the landing chips.
export const CATEGORY_LABELS: Record<'th' | 'en', Record<string, string>> = {
  th: { frontend: 'Frontend', backend: 'Backend', fullstack: 'Fullstack', design: 'ดีไซน์', devops: 'DevOps', data_analytics: 'วิเคราะห์ข้อมูล', finance: 'การเงิน', ai_engineering: 'AI/ML' },
  en: { frontend: 'Frontend', backend: 'Backend', fullstack: 'Fullstack', design: 'Design', devops: 'DevOps', data_analytics: 'Data analytics', finance: 'Finance', ai_engineering: 'AI/ML' },
};

export const humanize = (slug: string) => { const s = slug.replace(/[_-]+/g, ' ').trim(); return s.charAt(0).toUpperCase() + s.slice(1); };

export const categoryLabel = (locale: 'th' | 'en', slug: string) => CATEGORY_LABELS[locale][slug] ?? humanize(slug);

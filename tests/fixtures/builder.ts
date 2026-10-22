import type { Page } from '@playwright/test';
import { projectId } from './application';

export const cvId = '77777777-7777-4777-8777-777777777777';
export const empty = () => ({
  basics: { name: '', headline: '', email: '', phone: '', location: '', profiles: [] }, summary: { content: '' }, summary_hidden: false,
  sections: Object.fromEntries(['experience', 'education', 'skills', 'projects', 'certifications', 'languages', 'awards', 'publications', 'volunteer', 'references', 'interests']
    .map(name => [name, { hidden: false, items: [] }])),
  order: ['summary', 'experience', 'education', 'skills', 'projects', 'certifications', 'languages', 'awards', 'publications', 'volunteer', 'references', 'interests'],
  references_on_request: false,
});

export type State = { draft: any; puts: any[]; previews: number; publishes: number; failPut: boolean; created: boolean; renames: any[]; pdf: string; times: Record<string, number[]> };

export async function builderApi(page: Page, start: Partial<State> = {}) {
  const state: State = { draft: { id: 'd1', cv_id: cvId, document_id: null, name: 'CV ของฉัน', resume_data: empty(), template_id: 'onyx', accent: 'indigo', document_language: 'th', ats_safe: true, updated_at: '2026-10-19T00:00:00.000Z' },
    puts: [], previews: 0, publishes: 0, failPut: false, created: false, renames: [], pdf: '%PDF-1.4\n1 0 obj << /Type /Page >> endobj\n%%EOF', times: { put: [], preview: [] }, ...start };
  await page.route('**/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/v1', '');
    const json = (status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === `/projects/${projectId}/cvs/builder` && request.method() === 'POST') { state.created = true; return json(201, { id: cvId, name: 'CV ของฉัน', is_primary: true, created_at: '2026-10-19T00:00:00Z', latest_revision: null, revision_count: 0, in_use: false, has_builder_draft: true }); }
    if (path === '/resume-templates') return json(200, { templates: [], accents: [], provinces: [{ id: 'TH-10', en: 'Bangkok', th: 'กรุงเทพมหานคร' }, { id: 'TH-50', en: 'Chiang Mai', th: 'เชียงใหม่' }] });
    if (path === `/projects/${projectId}/cvs/${cvId}` && request.method() === 'PATCH') { state.renames.push(request.postDataJSON()); return json(200, { id: cvId, name: request.postDataJSON().name }); }
    if (path === `/projects/${projectId}/cvs/${cvId}/draft`) {
      if (request.method() === 'PUT') state.times.put.push(Date.now());
      if (request.method() === 'GET') return json(200, state.draft);
      if (state.failPut) return route.abort('internetdisconnected');
      const body = request.postDataJSON();
      state.puts.push(body);
      state.draft = { ...state.draft, ...body, updated_at: `2026-10-19T00:00:${String(state.puts.length).padStart(2, '0')}.000Z` };
      return json(200, state.draft);
    }
    if (path.endsWith('/draft/preview')) { state.previews += 1; state.times.preview.push(Date.now()); return route.fulfill({ status: 200, contentType: 'application/pdf', body: state.pdf }); }
    if (path.endsWith('/draft/publish')) { state.publishes += 1; return json(201, { id: 'r1', revision: 1, created_at: '2026-10-19T00:00:00Z', original_filename: 'cv.pdf', mime_type: 'application/pdf', size_bytes: 10 }); }
    return route.fallback();
  });
  return state;
}

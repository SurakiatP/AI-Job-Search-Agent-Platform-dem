// Synthetic screens that show the AI features, used only by the manual picture/clip tools (never by real tests).
import type { Page } from '@playwright/test';
import { jobId, projectId, sessionId } from './application';
import { builderApi, cvId, empty } from './builder';
import { at, boot, fact, practiceApi, setId } from './practice';

type Locale = 'th' | 'en';
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
const T = <A>(locale: Locale, th: A, en: A) => (locale === 'th' ? th : en);
const api = `**/v1/projects/${projectId}`;
const asyncApi = `**/v1/async/projects/${projectId}`;
const session = { id: sessionId, project_id: projectId, title: 'Session', created_at: '2026-10-01T00:00:00Z', cv_revision_id: 'c1', job_revision_id: jobId,
  cv_name: 'Data CV', cv_revision: 4, job_title: 'AI Engineer', job_company: 'Example Co' };
const run = (id: string, operation: string, extra: Record<string, unknown> = {}) => ({ id, project_id: projectId, session_id: sessionId, operation, status: 'completed', job_revision_id: jobId,
  output_language: 'th', result_file_ids: [], created_at: '2026-10-10T00:00:00Z', finished_at: '2026-10-10T00:01:00Z', retry_of_id: null, ...extra });

/** Session page with a finished AI evaluation (verdict, requirement match, strengths, risks). */
export async function evaluationScene(page: Page, locale: Locale) {
  const report = {
    verdict: T(locale, 'ควรสมัคร: ทักษะหลักตรงกับงานนี้ส่วนใหญ่', 'Worth applying: most core skills match'),
    summary: T(locale, 'งาน RAG ภาษาไทยที่คุณทำจริงตรงกับตำแหน่งนี้', 'Your production RAG work fits this role.'),
    requirements: [
      { requirement: 'LLM pipelines / RAG', importance: 'critical', match: 'strong', evidence: T(locale, 'แชตบอต RAG ภาษาไทย', 'Thai RAG chatbot') },
      { requirement: 'Python + FastAPI', importance: 'high', match: 'strong', evidence: T(locale, 'ตัวจำแนกบน FastAPI', 'Classifier on FastAPI') },
      { requirement: 'SQL', importance: 'high', match: 'strong', evidence: 'PostgreSQL' },
      { requirement: 'Function calling', importance: 'high', match: 'partial', evidence: T(locale, 'ใช้ LangChain เท่านั้น', 'LangChain only') },
      { requirement: 'GKE / Cloud Run', importance: 'preferred', match: 'missing', evidence: '' },
    ],
    strengths: [T(locale, 'RAG ภาษาไทยที่ใช้งานจริง', 'Production RAG in Thai')],
    risks: [T(locale, 'ไม่พบหลักฐานเรื่อง Google Cloud', 'No Google Cloud evidence')],
    interview_prep: [T(locale, 'เล่าวิธีลดค่า LLM ลง 35%', 'Explain how you cut LLM cost by 35%')],
    cv_changes: [T(locale, 'ระบุ function calling ในงาน AI Engineer', 'Name function calling in your AI Engineer role')],
  };
  await page.route(`${api}/sessions/${sessionId}`, r => r.fulfill(json(session)));
  await page.route(new RegExp(`(?:/v1/projects/${projectId}/runs|/v1/async/projects/${projectId}/agent-runs)(?:\\?.*)?$`), r =>
    r.fulfill(json([run('cccccccc-0000-4000-8000-000000000001', 'evaluate_job', { evaluation_result: { score: 4.2, report, report_markdown: report.verdict } })])));
}

/** Session page whose tailor-CV agent returns proposals to review (interactive mode). */
export async function tailorScene(page: Page, locale: Locale) {
  const payload = { kind: 'tailor', mode: 'interactive', base_revision_id: null, stop_reason: 'interactive', coverage_before: 0.4, coverage_after: 0.6, proposals: [
    { id: 0, find: '', text: T(locale, 'สร้างไปป์ไลน์ Airflow ให้แดชบอร์ด 40 ชุด', 'Built Airflow pipelines serving 40 dashboards'), evidence_ids: ['f1', 'f2'], status: 'proposed' },
    { id: 1, find: 'Python', text: T(locale, 'ลดค่า LLM ลง 35% ด้วยการแคชคำตอบ', 'Cut LLM cost by 35% by caching answers'), evidence_ids: ['f3'], status: 'proposed' },
    { id: 2, find: 'SQL', text: T(locale, 'นำทีมวิศวกร 50 คน', 'Led a team of 50 engineers'), evidence_ids: ['f9'], status: 'rejected_by_gate' },
  ] };
  let runs: unknown[] = [];
  await page.route(`${api}/sessions/${sessionId}`, r => r.fulfill(json(session)));
  for (const url of [`${api}/runs`, `${asyncApi}/agent-runs`]) await page.route(url, r => {
    if (r.request().method() === 'POST') { runs = [run('bbbbbbbb-0000-4000-8000-000000000001', 'tailor_cv', { result_payload: payload })]; return r.fulfill(json(runs[0], 202)); }
    return r.fulfill(json(runs));
  });
  await page.route(`${api}/runs/*/events`, r => r.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }));
}

export const feedbackFor = (locale: Locale) => {
  const answer = T(locale, 'ทีมอยากได้โมเดลใหญ่ที่สุด ผมสร้างชุดทดสอบ 500 ข้อและเทียบสามโมเดลก่อนตัดสินใจ', 'The team wanted the largest model. I built a 500-question test set and compared three models.');
  return { status: 'done', kind: 'answer', scores: { structure: 4, relevance: 5, evidence: 3, clarity: 4, company_fit: 3 },
    summary: T(locale, 'เล่าเรื่องชัด แต่ผลลัพธ์ควรมีตัวเลข', 'Clear story; the result needs a number.'),
    star: [{ part: 'S', start: 0, end: T(locale, 25, 34) }, { part: 'A', start: T(locale, 26, 35), end: answer.length }],
    add: [T(locale, 'ปิดท้ายด้วยค่าใช้จ่ายที่ประหยัดได้', 'Close with the cost you saved')],
    unused_facts: [{ id: fact, text: T(locale, 'สร้างชุดทดสอบ 500 ข้อสำหรับคำตอบ RAG', 'Built a 500-question test set for RAG answers') }] };
};

/** Practice set page with an answer that already has AI feedback (scores, STAR marks, what to add). */
export async function feedbackScene(page: Page, locale: Locale) {
  await boot(page);
  const state = await practiceApi(page);
  const answer = T(locale, 'ทีมอยากได้โมเดลใหญ่ที่สุด ผมสร้างชุดทดสอบ 500 ข้อและเทียบสามโมเดลก่อนตัดสินใจ', 'The team wanted the largest model. I built a 500-question test set and compared three models.');
  state.questions[0].attempts = [{ id: 'a1', answer, created_at: at, feedback: {
    status: 'done', kind: 'answer', scores: { structure: 4, relevance: 5, evidence: 3, clarity: 4, company_fit: 3 },
    summary: T(locale, 'เล่าเรื่องชัด แต่ผลลัพธ์ควรมีตัวเลข', 'Clear story; the result needs a number.'),
    star: [{ part: 'S', start: 0, end: T(locale, 25, 34) }, { part: 'A', start: T(locale, 26, 35), end: answer.length }],
    add: [T(locale, 'ปิดท้ายด้วยค่าใช้จ่ายที่ประหยัดได้', 'Close with the cost you saved')],
    unused_facts: [{ id: fact, text: T(locale, 'สร้างชุดทดสอบ 500 ข้อสำหรับคำตอบ RAG', 'Built a 500-question test set for RAG answers') }] } }];
}

/** CV page, experience bank tab: facts that the agent extracted from a CV, with the extraction summary. */
export async function experienceScene(page: Page, locale: Locale) {
  const item = (id: string, text: string, role: string, org: string, period: string) => ({ id, kind: 'experience', text, role, organization: org, period, source: 'cv', source_cv_id: 'c1', source_cv_name: 'Data CV', created_at: '2026-10-10T00:00:00Z' });
  const items = [
    item('e1', T(locale, 'สร้างแชตบอต RAG ภาษาไทยให้ทีมบริการลูกค้า', 'Built a Thai RAG chatbot for the support team'), 'AI Engineer', 'Example Co', '2022–2024'),
    item('e2', T(locale, 'ลดค่า LLM ลง 35% ด้วยการแคชคำตอบ', 'Cut LLM cost by 35% by caching answers'), 'AI Engineer', 'Example Co', '2022–2024'),
    item('e3', T(locale, 'สร้างไปป์ไลน์ข้อมูลด้วย Airflow สำหรับแดชบอร์ด 40 ชุด', 'Built Airflow pipelines for 40 dashboards'), 'Data Engineer', 'Sample Bank', '2019–2022'),
    { ...item('e4', 'PostgreSQL, Python, FastAPI', '', '', ''), kind: 'skill', role: null, organization: null, period: null },
  ];
  await page.route(`**/v1/projects/${projectId}/experience**`, r => r.fulfill(json({ items, provider_configured: true,
    extraction: { run_id: 'r1', status: 'completed', cv_id: 'c1', summary: { added: 4, duplicates: 0, rejected: 1 } } })));
  await page.route(`${api}/cvs`, r => r.fulfill(json([{ id: 'c1', name: 'Data CV', is_primary: true, in_use: false, revision_count: 1, latest_revision: { id: 'rv1', revision: 1, created_at: '2026-10-10T00:00:00Z', original_filename: 'cv.pdf', mime_type: 'application/pdf', size_bytes: 2048, file_id: null } }])));
}

const filled = (locale: Locale) => {
  const data: any = empty();
  data.basics = { ...data.basics, name: T(locale, 'สมชาย ทดสอบ', 'Somchai Example'), headline: T(locale, 'นักวิเคราะห์ข้อมูล', 'Data Analyst'), email: 'somchai@example.com', phone: '0800000000', location: T(locale, 'กรุงเทพมหานคร', 'Bangkok'),
    address: { line: '', subdistrict: '', district: '', province: '', postcode: '' }, address_full: false };
  data.summary = { content: T(locale, 'นักวิเคราะห์ข้อมูลที่มีประสบการณ์ 4 ปี ถนัด SQL และ Python', 'Data analyst with 4 years of experience in SQL and Python.') };
  data.personal = { birth_date: '', nationality: '', military_status: '', line_id: '', driving_license: '', expected_salary: '', available_from: '' }; data.personal_hidden = true;
  data.sections.experience.items = [{ id: 'x1', position: T(locale, 'นักวิเคราะห์ข้อมูล', 'Data Analyst'), company: 'Example Co', location: T(locale, 'กรุงเทพมหานคร', 'Bangkok'), start: '2022-01', end: '', current: true,
    highlights: [T(locale, 'สร้างแดชบอร์ดยอดขายด้วย SQL', 'Built a sales dashboard in SQL'), T(locale, 'ลดเวลาทำรายงานจาก 2 วันเหลือ 2 ชั่วโมง', 'Cut reporting time from 2 days to 2 hours')] }];
  data.sections.skills.items = [{ id: 's1', name: 'SQL', level: 4, keywords: ['PostgreSQL'] }, { id: 's2', name: 'Python', level: 4, keywords: ['pandas'] }];
  return data;
};

/** CV builder editor with a believable draft already typed in. */
export async function builderScene(page: Page, locale: Locale) {
  await builderApi(page, { draft: { id: 'd1', cv_id: cvId, document_id: null, name: T(locale, 'CV ของฉัน', 'My CV'), resume_data: filled(locale), template_id: 'onyx', accent: 'indigo', document_language: locale, ats_safe: true, updated_at: '2026-10-19T00:00:00.000Z' } });
}
export { builderApi, cvId };

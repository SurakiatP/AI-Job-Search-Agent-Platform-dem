import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router';
import { AppProviders, useLocale } from '../src/app/providers';
import { useDraft } from '../src/app/drafts';
import { AppShell } from '../src/components/AppShell';
import { AppearanceControl } from '../src/components/AppearanceControl';
import { Button } from '../src/components/Button';
import '../src/styles.css';

function Harness() {
  const { locale } = useLocale();
  const [project, setProject] = useState('project-a');
  const [session, setSession] = useState('session-a');
  const [draft, setDraft] = useDraft(project, session);
  const en = locale === 'en';
  return <AppShell projectId={project} sessionId={session} projects={[{
    id: 'project-a', name: 'โปรเจกต์สังเคราะห์', href: '/tests/project',
    sessions: [{ id: 'session-a', name: 'บทสนทนาสังเคราะห์', href: '/tests/session' }],
  }]}>
    <h1>{en ? 'Shell verification' : 'ตรวจสอบหน้าจอ'}</h1>
    <AppearanceControl />
    <Routes>
      <Route path="/tests/shell.html" element={<div className="shell-test-form">
        <label htmlFor="draft">{en ? 'Message' : 'ข้อความ'}</label>
        <textarea id="draft" value={draft} onChange={event => setDraft(event.target.value)} />
        <div className="shell-test-actions">
          <Button onClick={() => setSession('session-b')}>{en ? 'Next session' : 'บทสนทนาถัดไป'}</Button>
          <Button onClick={() => setProject('project-b')}>{en ? 'Next project' : 'โปรเจกต์ถัดไป'}</Button>
          <Button onClick={() => { setProject('project-a'); setSession('session-a'); }}>{en ? 'First project and session' : 'กลับโปรเจกต์และบทสนทนาแรก'}</Button>
          <Link to="/tests/other">{en ? 'Other page' : 'หน้าอื่น'}</Link>
        </div>
      </div>} />
      <Route path="/tests/other" element={<p>{en ? 'Another page' : 'อีกหน้าหนึ่ง'}</p>} />
      <Route path="/app/projects" element={<p>{en ? 'Projects test page' : 'หน้าทดสอบโปรเจกต์'}</p>} />
      <Route path="/app/settings" element={<p>{en ? 'Settings test page' : 'หน้าทดสอบการตั้งค่า'}</p>} />
      <Route path="/tests/project" element={<p>{en ? 'Project test page' : 'หน้าทดสอบโปรเจกต์'}</p>} />
      <Route path="/tests/session" element={<p>{en ? 'Session test page' : 'หน้าทดสอบบทสนทนา'}</p>} />
    </Routes>
  </AppShell>;
}

createRoot(document.getElementById('root')!).render(<AppProviders><BrowserRouter><Harness /></BrowserRouter></AppProviders>);

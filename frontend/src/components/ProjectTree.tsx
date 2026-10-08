import { useEffect, useState } from 'react';
import { ChevronDown, Folder, FolderOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router';
import { cn } from '@/lib/utils';
import { apiRequest } from '../lib/api';
import { ApiError } from '../lib/api-types';
import { sendJson, useResource } from '../features/projects/useResource';
import { NewSessionDialog } from '../features/sessions/NewSessionDialog';
import { Button } from './ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { ItemMenu } from './ItemMenu';
import { ScrollingName } from './ScrollingName';
import { Input } from './ui/input';

export type SidebarProject = {
  id: string; name: string; href: string;
  sessions: { id: string; name: string; href: string }[];
};
type Target = { kind: 'project' | 'session'; projectId: string; id: string; name: string };
type DialogState = { mode: 'rename' | 'delete'; target: Target } | null;
type SessionLite = { id: string; title: string };

const copy = {
  th: {
    projects: 'โปรเจกต์', toggleList: 'ย่อ/ขยายรายการโปรเจกต์', newProject: 'โปรเจกต์ใหม่', newSession: 'เซสชันใหม่',
    expand: (n: string) => `แสดงเซสชันของ ${n}`, collapse: (n: string) => `ซ่อนเซสชันของ ${n}`, options: (n: string) => `ตัวเลือกสำหรับ ${n}`,
    rename: 'เปลี่ยนชื่อ', delete: 'ลบ', cancel: 'ยกเลิก', save: 'บันทึก', confirmDelete: 'ลบ', saving: 'กำลังบันทึก…',
    renameProject: 'เปลี่ยนชื่อโปรเจกต์', renameSession: 'เปลี่ยนชื่อเซสชัน', name: 'ชื่อ', failed: 'ดำเนินการไม่สำเร็จ ลองอีกครั้ง',
    deleteProject: (n: string) => `ลบโปรเจกต์ “${n}”?`, deleteSession: (n: string) => `ลบเซสชัน “${n}”?`,
    deleteProjectBody: 'โปรเจกต์นี้จะถูกลบถาวร ลบได้เฉพาะโปรเจกต์ที่ไม่มี CV งาน หรือประวัติการทำงานของเอเจนต์ และย้อนกลับไม่ได้',
    deleteSessionBody: 'เซสชันและข้อความในเซสชันนี้จะถูกลบถาวร ลบได้เฉพาะเซสชันที่ไม่มีประวัติงานของเอเจนต์ และย้อนกลับไม่ได้',
    project_not_empty: 'ลบไม่ได้: โปรเจกต์นี้ยังมี CV งาน หรือประวัติการทำงานอยู่', session_has_runs: 'ลบไม่ได้: เซสชันนี้มีประวัติงานของเอเจนต์',
  },
  en: {
    projects: 'Projects', toggleList: 'Collapse or expand the project list', newProject: 'New project', newSession: 'New session',
    expand: (n: string) => `Show sessions of ${n}`, collapse: (n: string) => `Hide sessions of ${n}`, options: (n: string) => `Options for ${n}`,
    rename: 'Rename', delete: 'Delete', cancel: 'Cancel', save: 'Save', confirmDelete: 'Delete', saving: 'Saving…',
    renameProject: 'Rename project', renameSession: 'Rename session', name: 'Name', failed: 'That did not work. Try again.',
    deleteProject: (n: string) => `Delete project “${n}”?`, deleteSession: (n: string) => `Delete session “${n}”?`,
    deleteProjectBody: 'This permanently deletes the project. It can only be deleted when it has no CV, jobs or agent run history, and this cannot be undone.',
    deleteSessionBody: 'This permanently deletes the session and its messages. It can only be deleted when it has no agent run history, and this cannot be undone.',
    project_not_empty: 'Cannot delete: this project still has a CV, jobs or run history.', session_has_runs: 'Cannot delete: this session has agent run history.',
  },
};
type Copy = typeof copy.en;
function useCopy(): Copy { return copy[useTranslation().i18n.language.startsWith('th') ? 'th' : 'en']; }

const rowClass = 'group relative flex items-center gap-0.5 rounded-md text-sm transition-colors hover:bg-accent/60';
// Only the project that matches the route gets the background and accent bar; the active session row is a lighter highlight.
const currentProjectClass = 'bg-accent text-accent-foreground before:absolute before:inset-y-1.5 before:start-0 before:w-1 before:rounded-full before:bg-primary';
const activeSessionClass = 'has-[a[aria-current=page]]:bg-accent/60 has-[a[aria-current=page]]:font-medium';

function RowMenu({ name, onRename, onDelete }: { name: string; onRename: () => void; onDelete: () => void }) {
  const c = useCopy();
  return <ItemMenu reveal label={c.options(name)} actions={[
    { label: c.rename, icon: <Pencil className="size-4" aria-hidden="true" />, onSelect: onRename },
    { label: c.delete, icon: <Trash2 className="size-4" aria-hidden="true" />, destructive: true, onSelect: onDelete },
  ]} />;
}

function ItemDialog({ state, onClose, onDone }: { state: NonNullable<DialogState>; onClose: () => void; onDone: (state: NonNullable<DialogState>, newName?: string) => void }) {
  const c = useCopy();
  const { mode, target } = state;
  const [value, setValue] = useState(target.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isProject = target.kind === 'project';
  const base = isProject ? `/projects/${target.id}` : `/projects/${target.projectId}/sessions/${target.id}`;
  async function submit() {
    const next = value.trim();
    if (busy || (mode === 'rename' && !next)) return;
    if (mode === 'rename' && next === target.name) { onClose(); return; }
    setBusy(true); setError('');
    try {
      if (mode === 'rename') await sendJson(base, 'PATCH', isProject ? { name: next } : { title: next });
      else await apiRequest(base, { method: 'DELETE' });
      onDone(state, next);
    } catch (caught) {
      const code = caught instanceof ApiError && caught.status === 409 ? caught.code : '';
      setError(code === 'project_not_empty' || code === 'session_has_runs' ? c[code] : c.failed);
      setBusy(false);
    }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent {...(mode === 'rename' ? { 'aria-describedby': undefined } : {})}>
      <form className="grid gap-4" onSubmit={event => { event.preventDefault(); void submit(); }}>
        <DialogTitle>{mode === 'rename' ? (isProject ? c.renameProject : c.renameSession) : (isProject ? c.deleteProject(target.name) : c.deleteSession(target.name))}</DialogTitle>
        {mode === 'rename'
          ? <label className="grid gap-1.5 text-sm font-medium">{c.name}<Input autoFocus maxLength={200} value={value} onChange={event => setValue(event.target.value)} onFocus={event => event.currentTarget.select()} /></label>
          : <DialogDescription>{isProject ? c.deleteProjectBody : c.deleteSessionBody}</DialogDescription>}
        {error && <p role="alert" className="text-sm text-destructive [overflow-wrap:anywhere]">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <DialogClose asChild><Button type="button" variant="outline" disabled={busy}>{c.cancel}</Button></DialogClose>
          {mode === 'rename'
            ? <Button type="submit" disabled={busy || !value.trim()}>{busy ? c.saving : c.save}</Button>
            : <Button type="submit" variant="destructive" disabled={busy}>{c.confirmDelete}</Button>}
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}

function ProjectRow({ project, current, sessionId, expanded, version, onToggle, onNavigate, onDialog }: {
  project: SidebarProject; current: boolean; sessionId?: string; expanded: boolean; version: number;
  onToggle: () => void; onNavigate?: () => void; onDialog: (state: NonNullable<DialogState>) => void;
}) {
  const c = useCopy();
  const { pathname } = useLocation();
  const [creating, setCreating] = useState(false);
  const lazy = useResource<SessionLite[]>(expanded && !current ? `/projects/${project.id}/sessions` : null);
  const { reload } = lazy;
  useEffect(() => { if (version) reload(); }, [version, reload]);
  const sessions = current ? project.sessions : (lazy.data ?? []).map(item => ({ id: item.id, name: item.title, href: `/app/projects/${project.id}/sessions/${item.id}` }));
  const projectTarget: Target = { kind: 'project', projectId: project.id, id: project.id, name: project.name };
  return <li>
    <div className={cn(rowClass, current && currentProjectClass)}>
      <button type="button" aria-expanded={expanded} aria-label={expanded ? c.collapse(project.name) : c.expand(project.name)} onClick={onToggle}
        className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        {expanded ? <FolderOpen className="size-4" aria-hidden="true" /> : <Folder className="size-4" aria-hidden="true" />}
      </button>
      <Link to={project.href} title={project.name} aria-current={pathname === project.href ? 'page' : undefined}
        className={cn('min-w-0 flex-1 rounded-md py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring', current && 'font-semibold')}
        onClick={() => { if (!expanded) onToggle(); onNavigate?.(); }}><ScrollingName>{project.name}</ScrollingName></Link>
      <RowMenu name={project.name} onRename={() => onDialog({ mode: 'rename', target: projectTarget })} onDelete={() => onDialog({ mode: 'delete', target: projectTarget })} />
    </div>
    {expanded && <ul className="ms-4 mt-0.5 grid grid-cols-1 gap-0.5 border-s ps-1.5">
      {sessions.map(session => {
        const target: Target = { kind: 'session', projectId: project.id, id: session.id, name: session.name };
        return <li key={session.id} className={cn(rowClass, activeSessionClass)}>
          <Link to={session.href} title={session.name} aria-current={current && session.id === sessionId ? 'page' : undefined}
            className="min-w-0 flex-1 rounded-md px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={onNavigate}><ScrollingName>{session.name}</ScrollingName></Link>
          <RowMenu name={session.name} onRename={() => onDialog({ mode: 'rename', target })} onDelete={() => onDialog({ mode: 'delete', target })} />
        </li>;
      })}
      <li>
        <button type="button" onClick={() => setCreating(true)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm text-muted-foreground outline-none transition-colors hover:bg-accent/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
          <Plus className="size-4 shrink-0" aria-hidden="true" />{c.newSession}
        </button>
        {creating && <NewSessionDialog projectId={project.id} onClose={() => { setCreating(false); onNavigate?.(); }} />}
      </li>
    </ul>}
  </li>;
}

export function ProjectTree({ projects, projectId, sessionId, onNavigate, onReload }: {
  projects: SidebarProject[]; projectId?: string; sessionId?: string; onNavigate?: () => void; onReload?: () => void;
}) {
  const c = useCopy();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [listOpen, setListOpen] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(projectId ? [projectId] : []));
  const [dialog, setDialog] = useState<DialogState>(null);
  const [version, setVersion] = useState(0);
  // Navigating to another project collapses the rest so the current one is the only open group.
  useEffect(() => { if (projectId) setExpanded(new Set([projectId])); }, [projectId]);
  const refresh = () => { setVersion(value => value + 1); onReload?.(); };
  function done(state: NonNullable<DialogState>) {
    setDialog(null); refresh();
    const { kind, id, projectId: owner } = state.target;
    if (state.mode !== 'delete') return;
    if (kind === 'session' && id === sessionId) { onNavigate?.(); navigate(`/app/projects/${owner}/overview`); }
    if (kind === 'project' && id === projectId) { onNavigate?.(); navigate('/app/projects'); }
  }
  return <section aria-labelledby="sidebar-projects-heading" className="grid grid-cols-1 gap-1">
    <div className="flex items-center justify-between gap-1">
      <h2 id="sidebar-projects-heading" className="min-w-0 text-sm font-medium">
        <button type="button" aria-expanded={listOpen} aria-label={`${c.projects}: ${c.toggleList}`} onClick={() => setListOpen(value => !value)} className="flex items-center gap-1 rounded-md px-2 py-1.5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
          {c.projects}<ChevronDown className={cn('size-4 transition-transform', !listOpen && '-rotate-90')} aria-hidden="true" />
        </button>
      </h2>
      <Button asChild variant="ghost" size="icon" className="size-8"><Link to="/app/projects/new" aria-label={c.newProject} title={c.newProject} onClick={onNavigate}><Plus className="size-4" aria-hidden="true" /></Link></Button>
    </div>
    {listOpen && (projects.length === 0 ? <p className="px-2 text-sm text-muted-foreground">{t('noProjects')}</p> : <ul className="grid grid-cols-1 gap-0.5">
      {projects.map(project => <ProjectRow key={project.id} project={project} current={project.id === projectId} sessionId={sessionId} expanded={expanded.has(project.id)} version={version}
        onToggle={() => setExpanded(set => { const next = new Set(set); if (!next.delete(project.id)) next.add(project.id); return next; })}
        onNavigate={onNavigate} onDialog={setDialog} />)}
    </ul>)}
    {dialog && <ItemDialog key={`${dialog.mode}:${dialog.target.id}`} state={dialog} onClose={() => setDialog(null)} onDone={done} />}
  </section>;
}

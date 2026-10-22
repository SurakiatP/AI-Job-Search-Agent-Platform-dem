import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

const DraftContext = createContext<{
  drafts: Record<string, string>;
  setDraft: (key: string, text: string) => void;
  files: Record<string, File>;
  setFileDraft: (key: string, file: File | undefined) => void;
} | null>(null);

export function DraftProvider({ children }: { children: ReactNode }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, File>>({});
  const setDraft = (key: string, text: string) => setDrafts(previous => ({ ...previous, [key]: text }));
  const setFileDraft = (key: string, file: File | undefined) => setFiles(previous => {
    const next = { ...previous };
    if (file) next[key] = file;
    else delete next[key];
    return next;
  });
  return <DraftContext.Provider value={{ drafts, setDraft, files, setFileDraft }}>{children}</DraftContext.Provider>;
}

export function useDraft(projectId: string, sessionId: string, field = 'message') {
  const context = useContext(DraftContext);
  if (!context) throw new Error('useDraft requires DraftProvider');
  const key = JSON.stringify([projectId, sessionId, field]);
  return [context.drafts[key] ?? '', (text: string) => context.setDraft(key, text)] as const;
}

export function useFileDraft(projectId: string, sessionId: string, field = 'file') {
  const context = useContext(DraftContext);
  if (!context) throw new Error('useFileDraft requires DraftProvider');
  const key = JSON.stringify([projectId, sessionId, field]);
  return [context.files[key], (file: File | undefined) => context.setFileDraft(key, file)] as const;
}

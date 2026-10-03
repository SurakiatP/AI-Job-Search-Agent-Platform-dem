import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

const DraftContext = createContext<{
  drafts: Record<string, string>;
  setDraft: (key: string, text: string) => void;
} | null>(null);

export function DraftProvider({ children }: { children: ReactNode }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const setDraft = (key: string, text: string) => setDrafts(previous => ({ ...previous, [key]: text }));
  return <DraftContext.Provider value={{ drafts, setDraft }}>{children}</DraftContext.Provider>;
}

export function useDraft(projectId: string, sessionId: string, field = 'message') {
  const context = useContext(DraftContext);
  if (!context) throw new Error('useDraft requires DraftProvider');
  const key = JSON.stringify([projectId, sessionId, field]);
  return [context.drafts[key] ?? '', (text: string) => context.setDraft(key, text)] as const;
}

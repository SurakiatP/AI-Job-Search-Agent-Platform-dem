import { useEffect, useState } from 'react';
import { apiRequest } from './api';
import { onTrashChanged } from './trash';

// Items in the project trash (evaluations + documents + CVs); refreshes on project change and after any trash action.
export function useTrashCount(projectId?: string): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!projectId) return;
    let live = true;
    const load = () => Promise.all([
      apiRequest<unknown[]>(`/projects/${projectId}/sessions?view=trash`),
      apiRequest<unknown[]>(`/projects/${projectId}/documents/trash`),
      apiRequest<unknown[]>(`/projects/${projectId}/cvs?view=trash`),
    ]).then(lists => { if (live) setCount(lists.reduce((n, list) => n + list.length, 0)); }).catch(() => undefined);
    void load();
    const stop = onTrashChanged(() => void load());
    return () => { live = false; stop(); };
  }, [projectId]);
  return count;
}

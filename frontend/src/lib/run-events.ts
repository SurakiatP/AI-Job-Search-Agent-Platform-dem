import { apiRequest, initializeOwnerSession } from './api';
import { ApiError, type RunEvent, type RunEventView } from './api-types';

const TERMINAL_EVENTS = new Set(['run_completed', 'run_failed', 'run_cancelled', 'run_interrupted']);

function decodeEvent(raw: string): RunEventView | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const event = value as Partial<RunEventView>;
    if (!Number.isSafeInteger(event.sequence) || typeof event.event_type !== 'string' || !event.data || typeof event.data !== 'object') return null;
    return event as RunEventView;
  } catch {
    return null;
  }
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal.aborted) return resolve();
    const timer = window.setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { window.clearTimeout(timer); resolve(); }, { once: true });
  });
}

/** Reconnects to persisted SSE events with an explicit cursor; unsubscribing only closes this stream. */
export function watchRun(
  projectId: string,
  runId: string,
  after: number,
  onEvent: (event: RunEvent) => void,
): () => void {
  const controller = new AbortController();
  let cursor = Math.max(0, after);
  let stopped = false;
  let backoff = 250;
  const terminal = () => { stopped = true; controller.abort(); };

  const consume = async () => {
    const owner = await initializeOwnerSession();
    if (owner.status !== 'ready') return;
    while (!stopped && !controller.signal.aborted) {
      try {
        const response = await fetch(
          `/api/v1/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/events`,
          { credentials: 'same-origin', headers: { 'Last-Event-ID': String(cursor) }, signal: controller.signal },
        );
        if (!response.ok) {
          if (response.status < 500 && response.status !== 429) {
            // Re-check auth and report a stable sanitized event failure through the normal API error type.
            throw await (async () => {
              try { return new ApiError(response.status, await response.json()); }
              catch { return new ApiError(response.status); }
            })();
          }
          throw new Error('stream_retry');
        }
        if (!response.body) throw new Error('stream_retry');
        backoff = 250;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (!stopped) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
          let boundary = buffer.indexOf('\n\n');
          while (boundary >= 0) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
            if (data) {
              const event = decodeEvent(data);
              if (event && event.sequence > cursor) {
                cursor = event.sequence;
                onEvent({ ...event, run_id: runId });
                if (TERMINAL_EVENTS.has(event.event_type)) { terminal(); break; }
              }
            }
            boundary = buffer.indexOf('\n\n');
          }
        }
      } catch (error) {
        if (controller.signal.aborted || stopped) break;
        if (error instanceof ApiError && error.status < 500 && error.status !== 429) break;
      }
      if (!stopped && !controller.signal.aborted) {
        await wait(backoff, controller.signal);
        backoff = Math.min(backoff * 2, 4000);
      }
    }
  };

  void consume();
  return () => {
    stopped = true;
    controller.abort();
  };
}

export async function getRun(projectId: string, runId: string) {
  return apiRequest<import('./api-types').RunView>(`/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}`);
}

/** Reads the persisted event log of a resting run as one finite replay. */
export async function fetchRunEvents(projectId: string, runId: string): Promise<RunEventView[]> {
  const response = await fetch(`/api/v1/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/events`, { credentials: 'same-origin', headers: { 'Last-Event-ID': '0' } });
  if (!response.ok) throw new Error('events_failed');
  return (await response.text()).replace(/\r\n/g, '\n').split('\n\n')
    .map(frame => decodeEvent(frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')))
    .filter((event): event is RunEventView => event !== null);
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../../lib/api';
import type { ApprovalView, JobRevisionView, Locale, MessageView, RunEvent, RunOperation, RunStatus, RunView } from '../../lib/api-types';
import { getRun, watchRun } from '../../lib/run-events';

type Intent = {
  signature: string;
  idempotencyKey: string;
  message: string;
  messageAttempted: boolean;
  operation: RunOperation;
  job: JobRevisionView;
  outputLanguage: Locale;
  retryOf?: string;
};

type State = {
  loading: boolean;
  messages: MessageView[];
  run: RunView | null;
  events: RunEvent[];
  approvals: ApprovalView[];
  error: string | null;
  submitting: boolean;
  cancellationPending: boolean;
};

const initial: State = { loading: true, messages: [], run: null, events: [], approvals: [], error: null, submitting: false, cancellationPending: false };

function isTerminal(status: RunStatus) {
  return status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'interrupted';
}

function newIdempotencyKey() {
  return crypto.randomUUID();
}

export function useRun(projectId: string, sessionId: string) {
  const scope = JSON.stringify([projectId, sessionId]);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const [state, setState] = useState<State>(initial);
  const intent = useRef<Intent | null>(null);
  const lastIntent = useRef<Intent | null>(null);
  const lastEventSequence = useRef(0);
  const operationInFlight = useRef(false);
  const reconciliation = useRef(0);

  const reload = useCallback(async () => {
    const requestedScope = scope;
    const [messages, runs, approvals] = await Promise.all([
      apiRequest<MessageView[]>(`/projects/${encodeURIComponent(projectId)}/sessions/${encodeURIComponent(sessionId)}/messages`),
      apiRequest<RunView[]>(`/projects/${encodeURIComponent(projectId)}/runs`),
      apiRequest<ApprovalView[]>(`/projects/${encodeURIComponent(projectId)}/approvals`),
    ]);
    if (scopeRef.current !== requestedScope) return;
    const latest = runs.find(run => run.session_id === sessionId) ?? null;
    if (!intent.current) {
      lastIntent.current = latest?.job_revision_id ? {
        signature: '',
        idempotencyKey: '',
        message: '',
        messageAttempted: true,
        operation: latest.operation,
        job: { id: latest.job_revision_id, revision: 0, created_at: '', title: '', company: null, source_url: null },
        outputLanguage: latest.output_language,
      } : null;
    }
    setState(current => ({
      ...current,
      loading: false,
      messages,
      run: current.run?.id === latest?.id && current.run && isTerminal(current.run.status) && latest && !isTerminal(latest.status) ? current.run : latest,
      approvals,
      events: latest?.id === current.run?.id ? current.events : [],
      error: null,
      cancellationPending: latest && isTerminal(latest.status) ? false : current.cancellationPending,
    }));
  }, [projectId, sessionId, scope]);

  useEffect(() => {
    let active = true;
    intent.current = null;
    lastIntent.current = null;
    lastEventSequence.current = 0;
    reconciliation.current += 1;
    setState(initial);
    void reload().catch(error => {
      if (active) setState(current => ({ ...current, loading: false, error: safeErrorKey(error) }));
    });
    return () => { active = false; };
  }, [reload]);

  const activeRunId = state.run?.id;
  const activeRunStatus = state.run?.status;
  useEffect(() => {
    if (!activeRunId || !activeRunStatus || isTerminal(activeRunStatus)) return;
    return watchRun(projectId, activeRunId, lastEventSequence.current, event => {
      lastEventSequence.current = Math.max(lastEventSequence.current, event.sequence);
      setState(current => {
        if (current.run?.id !== activeRunId || current.events.some(item => item.sequence === event.sequence)) return current;
        const events = [...current.events, event].sort((a, b) => a.sequence - b.sequence);
        const cancelConfirmed = event.event_type === 'run_cancelled';
        return { ...current, events, cancellationPending: cancelConfirmed ? false : current.cancellationPending };
      });
      const requestVersion = ++reconciliation.current;
      void getRun(projectId, activeRunId).then(next => {
        if (scopeRef.current !== scope || requestVersion !== reconciliation.current) return;
        setState(current => {
          if (current.run?.id !== next.id) return current;
          if (isTerminal(current.run.status) && !isTerminal(next.status)) return current;
          return { ...current, run: next, cancellationPending: isTerminal(next.status) ? false : current.cancellationPending };
        });
      }).catch(() => undefined);
      if (event.event_type === 'approval_requested') {
        void apiRequest<ApprovalView[]>(`/projects/${encodeURIComponent(projectId)}/approvals`)
          .then(approvals => { if (scopeRef.current === scope) setState(current => ({ ...current, approvals })); })
          .catch(error => { if (scopeRef.current === scope) setState(current => ({ ...current, error: safeErrorKey(error) })); });
      }
    });
  }, [projectId, activeRunId, activeRunStatus, scope]);

  useEffect(() => {
    if (!activeRunId || !activeRunStatus || isTerminal(activeRunStatus)) return;
    const timer = window.setInterval(() => {
      if (activeRunStatus === 'waiting_approval') {
        void apiRequest<ApprovalView[]>(`/projects/${encodeURIComponent(projectId)}/approvals`).then(approvals => {
          if (scopeRef.current === scope) setState(current => ({ ...current, approvals }));
        }).catch(error => { if (scopeRef.current === scope) setState(current => ({ ...current, error: safeErrorKey(error) })); });
      }
      const version = ++reconciliation.current;
      void getRun(projectId, activeRunId).then(next => {
        if (scopeRef.current !== scope || version !== reconciliation.current) return;
        setState(current => current.run?.id === next.id && !(isTerminal(current.run.status) && !isTerminal(next.status))
          ? { ...current, run: next, cancellationPending: isTerminal(next.status) ? false : current.cancellationPending }
          : current);
      }).catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [projectId, activeRunId, activeRunStatus, scope]);

  const submit = useCallback(async (input: { message: string; operation: RunOperation; job: JobRevisionView; outputLanguage: Locale }) => {
    const text = input.message.trim();
    if (!text || state.submitting || operationInFlight.current) return;
    operationInFlight.current = true;
    const signature = JSON.stringify([text, input.operation, input.job.id, input.job.revision, input.outputLanguage]);
    if (!intent.current || intent.current.signature !== signature) {
      intent.current = {
        signature,
        idempotencyKey: newIdempotencyKey(),
        message: text,
        messageAttempted: false,
        operation: input.operation,
        job: input.job,
        outputLanguage: input.outputLanguage,
      };
    }
    const currentIntent = intent.current;
    setState(current => ({ ...current, submitting: true, error: null }));
    try {
      // Message writes have no idempotency contract; attempt each immutable intent once.
      if (!currentIntent.messageAttempted) {
        currentIntent.messageAttempted = true;
        await apiRequest<MessageView>(`/projects/${encodeURIComponent(projectId)}/sessions/${encodeURIComponent(sessionId)}/messages`, {
          method: 'POST', body: JSON.stringify({ content: text }),
        });
      }
      const run = await apiRequest<RunView>(`/projects/${encodeURIComponent(projectId)}/runs`, {
        method: 'POST',
        headers: { 'Idempotency-Key': currentIntent.idempotencyKey },
        body: JSON.stringify({
          session_id: sessionId,
          operation: currentIntent.operation,
          job_revision_id: currentIntent.job.id,
          output_language: currentIntent.outputLanguage,
          idempotency_key: currentIntent.idempotencyKey,
          ...(currentIntent.retryOf ? { retry_of_id: currentIntent.retryOf } : {}),
        }),
      });
      if (scopeRef.current !== scope) return;
      lastIntent.current = currentIntent;
      intent.current = null;
      lastEventSequence.current = 0;
      setState(current => ({ ...current, run, events: [], submitting: false, cancellationPending: false, error: null }));
      void reload().catch(() => undefined);
      return run;
    } catch (error) {
      if (scopeRef.current === scope) setState(current => ({ ...current, submitting: false, error: safeErrorKey(error) }));
    } finally {
      operationInFlight.current = false;
    }
  }, [projectId, sessionId, scope, state.submitting, reload]);

  const cancel = useCallback(async () => {
    const run = state.run;
    if (!run || state.submitting || operationInFlight.current || isTerminal(run.status)) return;
    operationInFlight.current = true;
    setState(current => ({ ...current, submitting: true, cancellationPending: true, error: null }));
    try {
      const confirmed = await apiRequest<RunView>(`/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(run.id)}/cancel`, { method: 'POST' });
      if (scopeRef.current !== scope) return;
      setState(current => ({
        ...current,
        run: confirmed,
        submitting: false,
        cancellationPending: !isTerminal(confirmed.status),
      }));
    } catch (error) {
      if (scopeRef.current === scope) setState(current => ({ ...current, submitting: false, cancellationPending: safeErrorKey(error) === 'errors.network_error', error: safeErrorKey(error) }));
    } finally {
      operationInFlight.current = false;
    }
  }, [projectId, scope, state.run, state.submitting]);

  const retry = useCallback(async () => {
    const run = state.run;
    const previous = intent.current?.retryOf === run?.id ? intent.current : lastIntent.current;
    if (!run || !previous || !isTerminal(run.status) || state.submitting || operationInFlight.current) return;
    operationInFlight.current = true;
    const next: Intent = previous.retryOf === run.id
      ? previous
      : { ...previous, idempotencyKey: newIdempotencyKey(), messageAttempted: true, retryOf: run.id };
    intent.current = next;
    setState(current => ({ ...current, submitting: true, error: null }));
    try {
      const retried = await apiRequest<RunView>(`/projects/${encodeURIComponent(projectId)}/runs`, {
        method: 'POST',
        headers: { 'Idempotency-Key': next.idempotencyKey },
        body: JSON.stringify({
          session_id: sessionId,
          operation: next.operation,
          job_revision_id: next.job.id,
          output_language: next.outputLanguage,
          idempotency_key: next.idempotencyKey,
          retry_of_id: run.id,
        }),
      });
      if (scopeRef.current !== scope) return;
      lastIntent.current = next;
      intent.current = null;
      lastEventSequence.current = 0;
      setState(current => ({ ...current, run: retried, events: [], submitting: false, error: null }));
    } catch (error) {
      if (scopeRef.current === scope) setState(current => ({ ...current, submitting: false, error: safeErrorKey(error) }));
    } finally {
      operationInFlight.current = false;
    }
  }, [projectId, sessionId, scope, state.run, state.submitting]);

  const decideApproval = useCallback(async (approvalId: string, decision: 'approve' | 'reject') => {
    if (state.submitting || operationInFlight.current) return;
    operationInFlight.current = true;
    setState(current => ({ ...current, submitting: true, error: null }));
    try {
      const approval = await apiRequest<ApprovalView>(`/projects/${encodeURIComponent(projectId)}/approvals/${encodeURIComponent(approvalId)}/decision`, {
        method: 'POST', body: JSON.stringify({ decision }),
      });
      if (scopeRef.current !== scope) return;
      setState(current => ({ ...current, approvals: current.approvals.map(item => item.id === approval.id ? approval : item), submitting: false }));
      void reload().catch(() => undefined);
    } catch (error) {
      const key = safeErrorKey(error);
      if (scopeRef.current !== scope) return;
      setState(current => ({ ...current, submitting: false, error: key }));
      if (key === 'errors.approval_stale' || key === 'errors.approval_expired') void reload().catch(() => undefined);
    } finally {
      operationInFlight.current = false;
    }
  }, [projectId, reload, scope, state.submitting]);

  const pendingApproval = state.approvals.find(item => item.run_id === state.run?.id && item.consumed_at === null && item.decision === null) ?? null;
  return { ...state, pendingApproval, submit, cancel, retry, decideApproval, reload };
}

function safeErrorKey(error: unknown): string {
  if (error && typeof error === 'object' && 'message_key' in error && typeof error.message_key === 'string') return error.message_key;
  return 'errors.request_failed';
}

import type { AdminAuditEntry } from '@/lib/api-types';

export const ACTIONS = ['user.suspend', 'user.enable', 'user.reset_password', 'user.delete', 'run.cancel', 'run.retry', 'model.add', 'model.price', 'task.model', 'benchmark.start', 'webhook.resend'] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
/** Ids that are UUIDs show as their first 8 characters (the app's short id); model ids and operation names stay whole. */
export const shortId = (id: string) => (UUID.test(id) ? id.slice(0, 8) : id);

/** "key: value, key: value"; empty values are left out. */
export const summarise = (detail: AdminAuditEntry['detail']) => Object.entries(detail).filter(([, v]) => v !== null && v !== '').map(([k, v]) => `${k}: ${String(v)}`).join(', ');

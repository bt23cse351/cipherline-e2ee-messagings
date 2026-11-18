import { SecurityLog, type SecurityAction, type SecurityResult } from '../models/SecurityLog.ts';

export async function logSecurityEvent(params: {
  userId?: string | null;
  action: SecurityAction;
  result: SecurityResult;
  detail?: string;
}): Promise<void> {
  try {
    await SecurityLog.create({
      userId: params.userId || null,
      action: params.action,
      result: params.result,
      detail: (params.detail || '').slice(0, 250),
      timestamp: new Date(),
    });
  } catch (err) {
    console.error('[CipherLine] Failed to write SecurityLog:', err instanceof Error ? err.message : 'unknown');
  }
}

import ky from 'ky';
import { evidenceResponseSchema } from './schema';
import type { FieldId } from './domain';

const client = ky.create({ timeout: 10_000, retry: { limit: 1 } });

export async function fetchEvidence() {
  const payload = await client.get('/api/evidence').json<unknown>();
  return evidenceResponseSchema.parse(payload);
}

export type SubmitRevisionPayload = {
  recordId: string;
  baseBaselineId: string;
  changes: Partial<Record<FieldId, number | string>>;
  reason: string;
  actor: string;
  idempotencyKey: string;
  simulateFailure?: boolean;
};

export async function submitRevision(payload: SubmitRevisionPayload) {
  const response = await client
    .post('/api/evidence', { json: { ...payload, action: 'submit' } })
    .json<{ ok: boolean; accepted: boolean; revision: number; recordedAt: string; idempotencyKey: string }>();
  return response;
}

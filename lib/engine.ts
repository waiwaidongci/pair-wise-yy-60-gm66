// 版本化核验引擎（纯函数，不依赖 UI 与存储，可独立单测）。
// 覆盖：基线版本、不可变计算快照、字段级签署、旧基线合并与冲突裁决、签发失效判定。

export type FieldKey = 'activity' | 'factor' | 'evidence' | 'timeRange';

export const FIELD_ORDER: FieldKey[] = ['activity', 'factor', 'evidence', 'timeRange'];

export const FIELD_LABELS: Record<FieldKey, string> = {
  activity: '活动数据',
  factor: '排放因子',
  evidence: '来源证据',
  timeRange: '时间范围'
};

export type UserRole = '核验员' | '复核人';

export const USERS: { name: string; role: UserRole; fields: FieldKey[] }[] = [
  { name: '沈楠', role: '核验员', fields: ['activity', 'timeRange'] },
  { name: '韩跃', role: '核验员', fields: ['factor'] },
  { name: '徐璐', role: '核验员', fields: ['evidence'] },
  { name: '陈岩', role: '复核人', fields: [] }
];

export const REVIEWERS = USERS.filter((user) => user.role === '复核人').map((user) => user.name);

export const DEFAULT_FIELD_OWNERS: Record<FieldKey, string> = {
  activity: '沈楠',
  factor: '韩跃',
  evidence: '徐璐',
  timeRange: '沈楠'
};

export type RecordStatus = '待核验' | '复核中' | '已核验' | '需补证';

/** 某一修订时点生成的不可变计算快照 */
export type CalcSnapshot = {
  revision: number;
  activity: number;
  unit: string;
  factor: number;
  factorUnit: string;
  evidenceIds: string[];
  timeRange: string;
  conversion: number;
  reduction: number;
  formula: string;
  at: string;
};

export type FieldChange = { from: unknown; to: unknown };

export type RevisionKind = '初始导入' | '直接修订' | '草稿合并' | '裁决应用';

/** 一次修订：留下原始值、因子、证据编号与原因，并附当时数据生成的不可变快照 */
export type Revision = {
  revision: number;
  recordId: string;
  author: string;
  reason: string;
  at: string;
  changes: Partial<Record<FieldKey, FieldChange>>;
  evidenceIds: string[];
  snapshot: CalcSnapshot;
  kind: RevisionKind;
  draftId?: string;
};

export type Signoff = { by: string; at: string; revision: number };

export type VersionedRecord = {
  id: string;
  source: string;
  owner: string;
  unit: string;
  factorUnit: string;
  anomaly: number;
  status: RecordStatus;
  activity: number;
  factor: number;
  timeRange: string;
  evidenceIds: string[];
  /** 当前基线版本号 */
  revision: number;
  /** 只增不改的修订链 */
  history: Revision[];
  /** 字段级签署；字段被修订后对应签署即被移除（视为失效） */
  signoffs: Partial<Record<FieldKey, Signoff>>;
  fieldOwners: Record<FieldKey, string>;
};

export type DraftState = '待提交' | '提交失败' | '已合并' | '部分合并-待裁决';

/** 修订草稿：携带提交时的基线版本，失败可恢复重试且重试不产生新版本 */
export type Draft = {
  draftId: string;
  recordId: string;
  baseRevision: number;
  author: string;
  reason: string;
  changes: Partial<Record<FieldKey, unknown>>;
  evidenceIds: string[];
  createdAt: string;
  state: DraftState;
  attempts: number;
  lastError?: string;
};

export type Conflict = {
  id: string;
  recordId: string;
  draftId: string;
  field: FieldKey;
  baseValue: unknown;
  incomingValue: unknown;
  currentValue: unknown;
  status: '待裁决' | '已裁决';
  resolution?: '采用提交值' | '保留当前值';
  resolvedBy?: string;
  resolvedAt?: string;
};

export type IssuanceRun = {
  id: string;
  /** 生成时的数据指纹；监测期数据一变化即与之不符，结果立即失效 */
  epoch: string;
  createdAt: string;
  createdBy: string;
  totalReduction: number;
  checksSnapshot: Record<string, boolean>;
};

export function conversionFor(unit: string): number {
  return unit === 'kWh' || unit === 'L' ? 0.001 : 1;
}

export function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function computeReduction(activity: number, factor: number, unit: string): number {
  return round4(activity * factor * conversionFor(unit));
}

export function totalReduction(records: VersionedRecord[]): number {
  return round4(records.reduce((total, record) => total + computeReduction(record.activity, record.factor, record.unit), 0));
}

export function isEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function currentValueOf(record: VersionedRecord, field: FieldKey): unknown {
  switch (field) {
    case 'activity': return record.activity;
    case 'factor': return record.factor;
    case 'evidence': return record.evidenceIds;
    case 'timeRange': return record.timeRange;
  }
}

export function formatFieldValue(field: FieldKey, value: unknown): string {
  if (field === 'evidence') return (value as string[]).join('、') || '（空）';
  if (typeof value === 'number') return value.toLocaleString('zh-CN');
  return String(value);
}

/** 按当时数据生成不可变计算快照 */
export function buildSnapshot(record: VersionedRecord, at: string): CalcSnapshot {
  const conversion = conversionFor(record.unit);
  return {
    revision: record.revision,
    activity: record.activity,
    unit: record.unit,
    factor: record.factor,
    factorUnit: record.factorUnit,
    evidenceIds: [...record.evidenceIds],
    timeRange: record.timeRange,
    conversion,
    reduction: computeReduction(record.activity, record.factor, record.unit),
    formula: `${record.activity.toLocaleString('zh-CN')} ${record.unit} × ${record.factor} ${record.factorUnit} × ${conversion}`,
    at
  };
}

/**
 * 应用一次修订，生成新基线版本。
 * 无实际变化时不产生新版本（重试/重复提交幂等）。
 */
export function applyRevision(
  record: VersionedRecord,
  input: { changes: Partial<Record<FieldKey, unknown>>; reason: string; author: string; at: string; kind: RevisionKind; draftId?: string }
): VersionedRecord {
  const changes: Partial<Record<FieldKey, FieldChange>> = {};
  const next: VersionedRecord = {
    ...record,
    evidenceIds: [...record.evidenceIds],
    signoffs: { ...record.signoffs }
  };
  for (const field of FIELD_ORDER) {
    if (!(field in input.changes)) continue;
    const to = input.changes[field];
    const from = currentValueOf(record, field);
    if (isEqual(from, to)) continue;
    changes[field] = { from, to };
    if (field === 'activity') next.activity = to as number;
    if (field === 'factor') next.factor = to as number;
    if (field === 'evidence') next.evidenceIds = [...(to as string[])];
    if (field === 'timeRange') next.timeRange = to as string;
    // 数据一变，该字段旧签署立即失效
    delete next.signoffs[field];
  }
  if (Object.keys(changes).length === 0) return record;
  next.revision = record.revision + 1;
  next.status = '复核中';
  const snapshot = buildSnapshot(next, input.at);
  next.history = [
    ...record.history,
    {
      revision: next.revision,
      recordId: record.id,
      author: input.author,
      reason: input.reason,
      at: input.at,
      changes,
      evidenceIds: [...next.evidenceIds],
      snapshot,
      kind: input.kind,
      draftId: input.draftId
    }
  ];
  return next;
}

/** 自 baseRevision 之后被改过的字段集合 */
export function fieldsChangedSince(record: VersionedRecord, baseRevision: number): Set<FieldKey> {
  const changed = new Set<FieldKey>();
  for (const revision of record.history) {
    if (revision.revision <= baseRevision) continue;
    for (const field of Object.keys(revision.changes)) changed.add(field as FieldKey);
  }
  return changed;
}

/** 回溯某个字段在指定版本时的取值 */
export function valueAtRevision(record: VersionedRecord, revision: number, field: FieldKey): unknown {
  let value = currentValueOf(record, field);
  for (let i = record.history.length - 1; i >= 0; i -= 1) {
    const entry = record.history[i];
    if (entry.revision <= revision) break;
    const change = entry.changes[field];
    if (change) value = change.from;
  }
  return value;
}

export type MergeResult = {
  record: VersionedRecord;
  mergedFields: FieldKey[];
  conflicts: Conflict[];
};

/**
 * 基于旧基线提交的合并：
 * - 草稿基线之后未被他人改过的字段 → 自动合并为新版本；
 * - 双方改过的字段 → 生成待裁决冲突，不落地数据；
 * - 与当前值一致的字段 → 忽略。
 */
export function mergeDraft(record: VersionedRecord, draft: Draft, at: string, makeConflictId: () => string): MergeResult {
  const changedSince = fieldsChangedSince(record, draft.baseRevision);
  const mergedFields: FieldKey[] = [];
  const conflicts: Conflict[] = [];
  const autoChanges: Partial<Record<FieldKey, unknown>> = {};
  for (const field of FIELD_ORDER) {
    if (!(field in draft.changes)) continue;
    const value = draft.changes[field];
    const current = currentValueOf(record, field);
    if (isEqual(value, current)) continue;
    if (changedSince.has(field)) {
      conflicts.push({
        id: makeConflictId(),
        recordId: record.id,
        draftId: draft.draftId,
        field,
        baseValue: valueAtRevision(record, draft.baseRevision, field),
        incomingValue: value,
        currentValue: current,
        status: '待裁决'
      });
    } else {
      autoChanges[field] = value;
      mergedFields.push(field);
    }
  }
  const next = mergedFields.length
    ? applyRevision(record, {
        changes: autoChanges,
        reason: `${draft.reason}（草稿 ${draft.draftId} 基于 V${draft.baseRevision} 自动合并）`,
        author: draft.author,
        at,
        kind: '草稿合并',
        draftId: draft.draftId
      })
    : record;
  return { record: next, mergedFields, conflicts };
}

/** 核验员只能签自己负责的字段 */
export function signField(record: VersionedRecord, field: FieldKey, actor: string, at: string): { ok: boolean; error?: string; record: VersionedRecord } {
  if (record.fieldOwners[field] !== actor) {
    return { ok: false, error: `${actor} 不是「${FIELD_LABELS[field]}」的负责核验员（应为 ${record.fieldOwners[field]}），已拒绝签署。`, record };
  }
  if (record.status === '需补证') {
    return { ok: false, error: `${record.id} 处于需补证状态，补证完成前不能签署。`, record };
  }
  const next: VersionedRecord = {
    ...record,
    signoffs: { ...record.signoffs, [field]: { by: actor, at, revision: record.revision } }
  };
  if (next.status === '待核验') next.status = '复核中';
  return { ok: true, record: next };
}

export function canCompleteReview(record: VersionedRecord): boolean {
  return FIELD_ORDER.every((field) => Boolean(record.signoffs[field]));
}

/** 只有复核人能在全部字段签署后完成记录 */
export function completeReview(record: VersionedRecord, actor: string): { ok: boolean; error?: string; record: VersionedRecord } {
  if (!REVIEWERS.includes(actor)) {
    return { ok: false, error: `仅复核人（${REVIEWERS.join('、')}）可完成记录，${actor} 无权操作。`, record };
  }
  if (record.status === '需补证') {
    return { ok: false, error: `${record.id} 处于需补证状态，不能完成复核。`, record };
  }
  const unsigned = FIELD_ORDER.filter((field) => !record.signoffs[field]);
  if (unsigned.length) {
    return { ok: false, error: `仍有字段未按当前基线签署：${unsigned.map((field) => FIELD_LABELS[field]).join('、')}。`, record };
  }
  return { ok: true, record: { ...record, status: '已核验' } };
}

/** 数据指纹：任一记录版本变化即变化，用于签发失效判定 */
export function computeEpoch(records: VersionedRecord[]): string {
  const raw = records.map((record) => `${record.id}#${record.revision}`).join('|');
  let hash = 5381;
  for (let i = 0; i < raw.length; i += 1) hash = ((hash << 5) + hash + raw.charCodeAt(i)) >>> 0;
  return `E-${hash.toString(16).toUpperCase().padStart(8, '0')}`;
}

/** 签发结果是否仍然有效：数据指纹一致、无待裁决冲突、无未合并草稿 */
export function isRunValid(run: IssuanceRun, currentEpoch: string, pendingConflicts: number, activeDrafts: number): boolean {
  return run.epoch === currentEpoch && pendingConflicts === 0 && activeDrafts === 0;
}

export type IssuanceInput = {
  records: VersionedRecord[];
  openFindings: number;
  pendingConflicts: Conflict[];
  activeDrafts: Draft[];
  checks: Record<string, boolean>;
  checkLabels: Record<string, string>;
};

/** 签发门禁评估：冲突未裁决、草稿未合并、发现未关闭、记录未核验、门禁未确认均阻塞签发 */
export function evaluateIssuance(input: IssuanceInput): { blockers: string[]; ready: boolean } {
  const blockers: string[] = [];
  if (input.openFindings > 0) blockers.push(`${input.openFindings} 项核验发现仍未关闭`);
  const pending = input.pendingConflicts.filter((conflict) => conflict.status === '待裁决');
  if (pending.length) blockers.push(`${pending.length} 个冲突字段待裁决（${pending.map((conflict) => `${conflict.recordId}·${FIELD_LABELS[conflict.field]}`).join('，')}）`);
  const drafts = input.activeDrafts.filter((draft) => draft.state !== '已合并');
  if (drafts.length) blockers.push(`${drafts.length} 份修订草稿未合并（${drafts.map((draft) => draft.draftId).join('、')}）`);
  const unverified = input.records.filter((record) => record.status !== '已核验');
  if (unverified.length) blockers.push(`${unverified.length} 条记录未完成复核（${unverified.map((record) => record.id).join('、')}）`);
  for (const [key, label] of Object.entries(input.checkLabels)) {
    if (!input.checks[key]) blockers.push(`签发门禁「${label}」未按当前数据指纹确认`);
  }
  return { blockers, ready: blockers.length === 0 };
}

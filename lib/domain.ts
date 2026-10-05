// 碳减排监测台账 — 基线版本核验域逻辑
// 全部为纯函数，不依赖 React / Zustand。记录、证据、计算链、签发准备均按基线版本组织。

export type FieldId = 'activity' | 'factor' | 'evidence' | 'timeRange' | 'unit';

export const FIELD_LABELS: Record<FieldId, string> = {
  activity: '活动数据',
  factor: '排放因子',
  evidence: '证据编号',
  timeRange: '时间范围',
  unit: '计量单位'
};

// 核验员可签署的字段（按职责划分）
export const VERIFIER_FIELDS: FieldId[] = ['activity', 'factor', 'evidence', 'timeRange'];
// 仅复核人可签署 / 完成的字段
export const REVIEWER_FIELDS: FieldId[] = ['unit'];

export type RevisionEntry = {
  id: string;
  baselineSeq: number;
  field: FieldId;
  previousValue: number | string; // 原始值
  newValue: number | string;
  factor: number;                 // 修订时采用的排放因子
  factorUnit: string;
  evidenceNo: string;             // 证据编号
  reason: string;                 // 修订原因
  actor: string;
  timestamp: string;
};

export type CalculationSnapshot = {
  recordId: string;
  baselineId: string;
  activity: number;
  factor: number;
  unit: string;
  factorUnit: string;
  conversionFactor: number;
  reduction: number;              // 按当时数据计算的不可变结果
  formula: string;
  computedAt: string;
  inputHash: string;
};

export type FieldSignature = {
  field: FieldId;
  verifier: string;
  signedAt: string;
  baselineId: string;             // 签署时所依据的基线
};

export type BaselineVersion = {
  id: string;                    // 基线版本号，如 B-001
  recordId: string;
  seq: number;
  createdAt: string;
  createdBy: string;
  reason: string;
  values: Record<FieldId, number | string>;
  snapshot: CalculationSnapshot;  // 不可变计算快照
  revisions: RevisionEntry[];
  parentBaselineId: string | null;
};

export type AdjudicationItem = {
  id: string;
  recordId: string;
  field: FieldId;
  baseValue: number | string;
  currentValue: number | string;
  proposedValue: number | string;
  proposedBy: string;
  reason: string;
  status: 'open' | 'resolved';
  resolution: 'keepCurrent' | 'acceptProposed' | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  baselineId: string;
};

export type IssuanceSignoff = {
  id: string;
  recordId: string;
  baselineId: string;
  baselineHash: string;          // 签发时基线的哈希，数据一变即失效
  signedBy: string;
  signedAt: string;
  valid: boolean;
};

export type DraftSubmission = {
  id: string;
  recordId: string;
  baseBaselineId: string;        // 提交所依据的旧基线
  changes: Partial<Record<FieldId, number | string>>;
  reason: string;
  actor: string;
  idempotencyKey: string;        // 重试不生成新版本
  status: 'failed' | 'pending';
  failureReason: string | null;
  createdAt: string;
  lastAttemptAt: string;
};

export type CarbonRecord = {
  id: string;
  source: string;
  owner: string;
  status: '待核验' | '复核中' | '已核验' | '需补证';
  currentBaselineId: string;
  baselines: BaselineVersion[];
  signatures: FieldSignature[];
  signoffs: IssuanceSignoff[];
  // 当前基线的非规范化值（便于 UI 直接读取）
  activity: number;
  unit: string;
  factor: number;
  factorUnit: string;
  timeRange: string;
  evidenceNo: string;
  evidenceCount: number;
  anomaly: number;
};

// —— 计算链 ——

// 单位换算系数：kWh→MWh，L(kg→t)
export function conversionFor(unit: string): number {
  if (unit === 'kWh' || unit === 'L') return 0.001;
  return 1;
}

export function computeReduction(activity: number, factor: number, unit: string) {
  const conversionFactor = conversionFor(unit);
  const reduction = activity * factor * conversionFactor;
  return { reduction, conversionFactor };
}

export function buildFormula(activity: number, factor: number, unit: string, factorUnit: string): string {
  if (unit === 'kWh') return `(${activity} kWh × 0.001) × ${factor} ${factorUnit}`;
  if (unit === 'L') return `${activity} L × ${factor} ${factorUnit} × 0.001`;
  return `${activity} ${unit} × ${factor} ${factorUnit}`;
}

function hashString(raw: string): string {
  let h = 0;
  for (let i = 0; i < raw.length; i++) {
    h = ((h << 5) - h + raw.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

export function hashInputs(activity: number, factor: number, unit: string, factorUnit: string): string {
  return 'H' + hashString(`${activity}|${factor}|${unit}|${factorUnit}`);
}

export function hashBaseline(baseline: BaselineVersion): string {
  return 'B' + hashString(JSON.stringify(baseline.values));
}

export function buildSnapshot(record: CarbonRecord, baselineId: string, at: string): CalculationSnapshot {
  const { reduction, conversionFactor } = computeReduction(record.activity, record.factor, record.unit);
  return {
    recordId: record.id,
    baselineId,
    activity: record.activity,
    factor: record.factor,
    unit: record.unit,
    factorUnit: record.factorUnit,
    conversionFactor,
    reduction,
    formula: buildFormula(record.activity, record.factor, record.unit, record.factorUnit),
    computedAt: at,
    inputHash: hashInputs(record.activity, record.factor, record.unit, record.factorUnit)
  };
}

export function applyValuesToRecord(record: CarbonRecord, values: Record<FieldId, number | string>): CarbonRecord {
  return {
    ...record,
    activity: values.activity as number,
    factor: values.factor as number,
    unit: values.unit as string,
    timeRange: values.timeRange as string,
    evidenceNo: values.evidence as string
  };
}

// 在当前基线上应用变更，生成新基线 + 修订条目 + 不可变快照
export function applyChanges(
  record: CarbonRecord,
  changes: Partial<Record<FieldId, number | string>>,
  reason: string,
  actor: string,
  at: string
): { record: CarbonRecord; baseline: BaselineVersion; revisions: RevisionEntry[] } {
  const prevBaseline = record.baselines[record.baselines.length - 1];
  const values: Record<FieldId, number | string> = { ...prevBaseline.values };
  const revisions: RevisionEntry[] = [];
  let revSeq = 1;
  for (const [field, newValue] of Object.entries(changes) as [FieldId, number | string][]) {
    const previousValue = values[field];
    if (previousValue === newValue) continue;
    revisions.push({
      id: `${prevBaseline.id}-R${revSeq++}`,
      baselineSeq: record.baselines.length + 1,
      field,
      previousValue,
      newValue,
      factor: (field === 'factor' ? newValue : values.factor) as number,
      factorUnit: record.factorUnit,
      evidenceNo: (field === 'evidence' ? newValue : values.evidence) as string,
      reason,
      actor,
      timestamp: at
    });
    values[field] = newValue;
  }
  const seq = record.baselines.length + 1;
  const id = `B-${String(seq).padStart(3, '0')}`;
  const updatedRecord = applyValuesToRecord(record, values);
  const snapshot = buildSnapshot(updatedRecord, id, at);
  const baseline: BaselineVersion = {
    id,
    recordId: record.id,
    seq,
    createdAt: at,
    createdBy: actor,
    reason,
    values,
    snapshot,
    revisions,
    parentBaselineId: prevBaseline.id
  };
  return { record: updatedRecord, baseline, revisions };
}

// 基于旧基线提交：合并未冲突字段，冲突字段留待裁决
export type MergeResult = {
  status: 'accepted' | 'merged' | 'conflict';
  mergedChanges: Partial<Record<FieldId, number | string>>;
  conflicts: AdjudicationItem[];
};

export function mergeChanges(
  record: CarbonRecord,
  baseBaselineId: string,
  proposedChanges: Partial<Record<FieldId, number | string>>,
  actor: string,
  reason: string,
  at: string
): MergeResult {
  const baseBaseline = record.baselines.find((b) => b.id === baseBaselineId);
  const currentBaseline = record.baselines[record.baselines.length - 1];
  if (!baseBaseline || baseBaseline.id === currentBaseline.id) {
    return { status: 'accepted', mergedChanges: { ...proposedChanges }, conflicts: [] };
  }
  const mergedChanges: Partial<Record<FieldId, number | string>> = {};
  const conflicts: AdjudicationItem[] = [];
  for (const [field, proposedValue] of Object.entries(proposedChanges) as [FieldId, number | string][]) {
    const baseValue = baseBaseline.values[field];
    const currentValue = currentBaseline.values[field];
    if (currentValue === baseValue) {
      // 该字段未被他人改动 — 合并
      mergedChanges[field] = proposedValue;
    } else {
      // 双方都改了同一字段 — 冲突，留待裁决
      conflicts.push({
        id: `ADJ-${field}-${hashString(at + field + actor).slice(1, 7)}`,
        recordId: record.id,
        field,
        baseValue,
        currentValue,
        proposedValue,
        proposedBy: actor,
        reason,
        status: 'open',
        resolution: null,
        resolvedBy: null,
        resolvedAt: null,
        baselineId: baseBaselineId
      });
    }
  }
  const status = conflicts.length === 0 ? 'merged' : Object.keys(mergedChanges).length > 0 ? 'merged' : 'conflict';
  return { status, mergedChanges, conflicts };
}

// —— 签署与签发 ——

export function getCurrentBaseline(record: CarbonRecord): BaselineVersion {
  return record.baselines[record.baselines.length - 1];
}

export function getCurrentSignatures(record: CarbonRecord): FieldSignature[] {
  const current = getCurrentBaseline(record);
  return record.signatures.filter((s) => s.baselineId === current.id);
}

export function getStaleSignatures(record: CarbonRecord): FieldSignature[] {
  const current = getCurrentBaseline(record);
  return record.signatures.filter((s) => s.baselineId !== current.id);
}

export function getValidSignoff(record: CarbonRecord): IssuanceSignoff | null {
  const current = getCurrentBaseline(record);
  const currentHash = hashBaseline(current);
  return record.signoffs.find((s) => s.valid && s.baselineHash === currentHash) ?? null;
}

export function getStaleSignoffs(record: CarbonRecord): IssuanceSignoff[] {
  const current = getCurrentBaseline(record);
  const currentHash = hashBaseline(current);
  return record.signoffs.filter((s) => s.valid && s.baselineHash !== currentHash);
}

export function canSignField(field: FieldId, role: 'verifier' | 'reviewer'): boolean {
  if (role === 'reviewer') return REVIEWER_FIELDS.includes(field) || VERIFIER_FIELDS.includes(field);
  return VERIFIER_FIELDS.includes(field);
}

export function getSignedFields(record: CarbonRecord): Set<FieldId> {
  return new Set(getCurrentSignatures(record).map((s) => s.field));
}

export type CompletionCheck = {
  ok: boolean;
  missingFields: FieldId[];
  openConflicts: number;
  staleSignoffs: number;
};

export function checkCompletion(record: CarbonRecord, openConflictCount: number): CompletionCheck {
  const signed = getSignedFields(record);
  const missingFields = VERIFIER_FIELDS.filter((f) => !signed.has(f));
  const staleSignoffs = getStaleSignoffs(record).length;
  return {
    ok: missingFields.length === 0 && openConflictCount === 0,
    missingFields,
    openConflicts: openConflictCount,
    staleSignoffs
  };
}

// 把扁平记录初始化为带基线的记录
export function seedRecord(
  partial: Omit<CarbonRecord, 'baselines' | 'signatures' | 'signoffs' | 'currentBaselineId'>,
  at = '2026-07-01T00:00:00Z'
): CarbonRecord {
  const record: CarbonRecord = {
    ...partial,
    currentBaselineId: 'B-001',
    baselines: [],
    signatures: [],
    signoffs: []
  };
  const baseline = buildInitialBaseline(record, at);
  record.baselines = [baseline];
  return record;
}

function buildInitialBaseline(record: CarbonRecord, at: string): BaselineVersion {
  const values: Record<FieldId, number | string> = {
    activity: record.activity,
    factor: record.factor,
    evidence: record.evidenceNo,
    timeRange: record.timeRange,
    unit: record.unit
  };
  const snapshot = buildSnapshot(record, 'B-001', at);
  return {
    id: 'B-001',
    recordId: record.id,
    seq: 1,
    createdAt: at,
    createdBy: '系统',
    reason: '初始基线',
    values,
    snapshot,
    revisions: [],
    parentBaselineId: null
  };
}

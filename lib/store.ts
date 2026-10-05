import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  type AdjudicationItem,
  type CarbonRecord,
  type DraftSubmission,
  type FieldId,
  type FieldSignature,
  type IssuanceSignoff,
  type RevisionEntry,
  type BaselineVersion,
  applyChanges,
  canSignField,
  checkCompletion,
  getCurrentBaseline,
  getStaleSignoffs,
  hashBaseline,
  mergeChanges,
  seedRecord
} from './domain';
import { submitRevision } from './api';

export type RecordStatus = '待核验' | '复核中' | '已核验' | '需补证';
export type Role = 'verifier' | 'reviewer';

export type Finding = {
  id: string;
  recordId: string;
  type: '缺失证据' | '单位不一致' | '时间范围' | '异常波动';
  title: string;
  detail: string;
  assignee: string;
  due: string;
  status: '开放' | '补证中' | '已关闭';
};

type RevisionResult = {
  status: 'accepted' | 'merged' | 'conflict';
  mergedChanges: Partial<Record<FieldId, number | string>>;
  conflicts: AdjudicationItem[];
  baseline: BaselineVersion | null;
  revisions: RevisionEntry[];
};

function now() {
  return new Date().toISOString();
}

const defaultRecords: CarbonRecord[] = [
  seedRecord({ id: 'ACT-0318', source: '电表 E-17 / 四号压缩机组', activity: 428650, unit: 'kWh', factor: 0.5568, factorUnit: 'tCO2/MWh', timeRange: '2026-07-01 至 07-31', evidenceNo: 'EV-2026-0318', evidenceCount: 4, anomaly: 2.3, owner: '项目现场 O2', status: '复核中' }),
  seedRecord({ id: 'ACT-0321', source: '蒸汽流量计 ST-04', activity: 2038.4, unit: 'GJ', factor: 0.11, factorUnit: 'tCO2/GJ', timeRange: '2026-07-01 至 07-31', evidenceNo: 'EV-2026-0321', evidenceCount: 3, anomaly: 0, owner: '能源中心', status: '已核验' }),
  seedRecord({ id: 'ACT-0325', source: '柴油消耗台账 / 应急泵', activity: 1846, unit: 'L', factor: 2.68, factorUnit: 'kgCO2/L', timeRange: '2026-07-01 至 07-31', evidenceNo: 'EV-2026-0325', evidenceCount: 2, anomaly: 8.6, owner: '设备保障部', status: '需补证' }),
  seedRecord({ id: 'ACT-0331', source: '光伏逆变器阵列 PV-2', activity: 182460, unit: 'kWh', factor: 0.5568, factorUnit: 'tCO2/MWh', timeRange: '2026-07-01 至 07-31', evidenceNo: 'EV-2026-0331', evidenceCount: 5, anomaly: -1.2, owner: '新能源运维', status: '已核验' }),
  seedRecord({ id: 'ACT-0337', source: '天然气流量计 NG-02', activity: 62.8, unit: 'kNm3', factor: 2.1622, factorUnit: 'tCO2/kNm3', timeRange: '2026-07-01 至 07-31', evidenceNo: 'EV-2026-0337', evidenceCount: 1, anomaly: 12.4, owner: '热力站', status: '待核验' })
];

const defaultFindings: Finding[] = [
  { id: 'F-104', recordId: 'ACT-0337', type: '缺失证据', title: '缺少天然气流量计校验证书', detail: '计量记录已提交，但校准有效期证明不足。', assignee: '热力站 · 韩跃', due: '09-30', status: '开放' },
  { id: 'F-105', recordId: 'ACT-0325', type: '异常波动', title: '柴油消耗较上期上升 18.6%', detail: '项目方尚未说明测试运行时长变化。', assignee: '设备保障部 · 姜婷', due: '10-02', status: '补证中' },
  { id: 'F-106', recordId: 'ACT-0318', type: '单位不一致', title: '原始表单位为 MWh，台账记录为 kWh', detail: '需补充单位换算链并保留原始记录。', assignee: '项目现场 · 徐璐', due: '09-30', status: '开放' }
];

type State = {
  records: CarbonRecord[];
  findings: Finding[];
  drafts: DraftSubmission[];
  adjudicationItems: AdjudicationItem[];
  selectedRecordId: string;
  sampledIds: string[];
  issuanceChecks: Record<string, boolean>;
  currentRole: Role;
  currentActor: string;
  lastRevisionResult: RevisionResult | null;
  selectRecord: (id: string) => void;
  toggleSample: (id: string) => void;
  setRole: (role: Role) => void;
  setActor: (name: string) => void;
  startCorrection: (id: string) => void;
  requestEvidence: (findingId: string) => void;
  closeFinding: (findingId: string) => void;
  toggleIssuanceCheck: (id: string) => void;
  // 修订：基于基线提交，合并未冲突字段，冲突留待裁决
  submitRevision: (recordId: string, changes: Partial<Record<FieldId, number | string>>, reason: string, simulateFailure?: boolean, baseBaselineIdOverride?: string) => Promise<RevisionResult>;
  // 模拟并发核验员：基于旧基线提交，演示合并未冲突字段 + 冲突留待裁决
  simulateConcurrentVerifier: (recordId: string) => Promise<RevisionResult>;
  // 核验员只签自己负责的字段
  signField: (recordId: string, field: FieldId) => void;
  // 复核人才能完成记录
  completeRecord: (recordId: string) => void;
  // 冲突裁决
  adjudicate: (itemId: string, resolution: 'keepCurrent' | 'acceptProposed') => void;
  // 草稿恢复重试（不生成新版本）
  retryDraft: (draftId: string, simulateFailure?: boolean) => Promise<void>;
  dismissDraft: (draftId: string) => void;
  clearLastResult: () => void;
};

export const useCarbonStore = create<State>()(
  persist(
    (set, get) => ({
      records: defaultRecords,
      findings: defaultFindings,
      drafts: [],
      adjudicationItems: [],
      selectedRecordId: 'ACT-0318',
      sampledIds: ['ACT-0318', 'ACT-0337'],
      issuanceChecks: { evidence: false, calculation: true, revisions: true, methodology: false },
      currentRole: 'verifier',
      currentActor: '沈楠',
      lastRevisionResult: null,

      selectRecord: (id) => set({ selectedRecordId: id }),
      toggleSample: (id) =>
        set((state) => ({
          sampledIds: state.sampledIds.includes(id)
            ? state.sampledIds.filter((item) => item !== id)
            : [...state.sampledIds, id]
        })),
      setRole: (role) => set({ currentRole: role }),
      setActor: (name) => set({ currentActor: name }),
      startCorrection: (id) =>
        set((state) => ({
          records: state.records.map((record) => (record.id === id ? { ...record, status: '复核中' } : record))
        })),
      requestEvidence: (findingId) =>
        set((state) => ({
          findings: state.findings.map((finding) => (finding.id === findingId ? { ...finding, status: '补证中' } : finding))
        })),
      closeFinding: (findingId) =>
        set((state) => ({
          findings: state.findings.map((finding) => (finding.id === findingId ? { ...finding, status: '已关闭' } : finding))
        })),
      toggleIssuanceCheck: (id) =>
        set((state) => ({ issuanceChecks: { ...state.issuanceChecks, [id]: !state.issuanceChecks[id] } })),

      submitRevision: async (recordId, changes, reason, simulateFailure, baseBaselineIdOverride) => {
        const state = get();
        const record = state.records.find((r) => r.id === recordId);
        if (!record) throw new Error('记录不存在');
        const baseBaseline = baseBaselineIdOverride
          ? record.baselines.find((b) => b.id === baseBaselineIdOverride) ?? getCurrentBaseline(record)
          : getCurrentBaseline(record);
        const at = now();
        const idempotencyKey = `IDEM-${recordId}-${baseBaseline.id}-${Object.keys(changes).join(',')}-${at}`;

        // 1. 本地合并：未冲突字段合并，冲突字段留待裁决
        const merge = mergeChanges(record, baseBaseline.id, changes, state.currentActor, reason, at);

        // 2. 调用服务端（可能失败 → 草稿恢复）
        try {
          await submitRevision({
            recordId,
            baseBaselineId: baseBaseline.id,
            changes,
            reason,
            actor: state.currentActor,
            idempotencyKey,
            simulateFailure
          });
        } catch (err) {
          // 提交失败 → 保存为草稿，可恢复重试
          const draft: DraftSubmission = {
            id: `DRAFT-${recordId}-${at}`,
            recordId,
            baseBaselineId: baseBaseline.id,
            changes,
            reason,
            actor: state.currentActor,
            idempotencyKey,
            status: 'failed',
            failureReason: err instanceof Error ? err.message : '提交失败',
            createdAt: at,
            lastAttemptAt: at
          };
          set((s) => ({ drafts: [...s.drafts, draft] }));
          return { status: 'conflict', mergedChanges: {}, conflicts: merge.conflicts, baseline: null, revisions: [] };
        }

        // 3. 成功：应用合并后的变更，生成新基线（不可变快照）
        const toApply = merge.status === 'accepted' ? changes : merge.mergedChanges;
        let updatedRecord = record;
        let baseline: BaselineVersion | null = null;
        let revisions: RevisionEntry[] = [];
        if (Object.keys(toApply).length > 0) {
          const applied = applyChanges(record, toApply, reason, state.currentActor, at);
          updatedRecord = applied.record;
          baseline = applied.baseline;
          revisions = applied.revisions;
        }

        // 4. 新基线 → 旧签发立即失效
        const staleSignoffs = getStaleSignoffs(updatedRecord);
        const invalidatedSignoffs: IssuanceSignoff[] = staleSignoffs.map((s) => ({ ...s, valid: false }));
        const validSignoffs = updatedRecord.signoffs.filter((s) => !staleSignoffs.includes(s));

        // 5. 冲突字段进入裁决队列
        const newAdjudications = merge.conflicts;

        set((s) => ({
          records: s.records.map((r) =>
            r.id === recordId
              ? {
                  ...updatedRecord,
                  status: '复核中',
                  signoffs: [...validSignoffs, ...invalidatedSignoffs]
                }
              : r
          ),
          adjudicationItems: [...s.adjudicationItems, ...newAdjudications],
          lastRevisionResult: {
            status: merge.status,
            mergedChanges: merge.mergedChanges,
            conflicts: merge.conflicts,
            baseline,
            revisions
          }
        }));

        return {
          status: merge.status,
          mergedChanges: merge.mergedChanges,
          conflicts: merge.conflicts,
          baseline,
          revisions
        };
      },

      simulateConcurrentVerifier: async (recordId) => {
        const state = get();
        const record = state.records.find((r) => r.id === recordId);
        if (!record) throw new Error('记录不存在');
        // 并发核验员基于上一基线提交（旧基线），改动同一字段 → 触发冲突
        const currentBaseline = getCurrentBaseline(record);
        const prevBaseline = record.baselines.length > 1 ? record.baselines[record.baselines.length - 2] : currentBaseline;
        const field: FieldId = 'activity';
        const baseValue = prevBaseline.values[field] as number;
        const proposedValue = Math.round(baseValue * (1 + (Math.random() * 0.1 - 0.05)) * 100) / 100;
        return get().submitRevision(
          recordId,
          { [field]: proposedValue },
          '并发核验员基于旧基线提交的修订',
          false,
          prevBaseline.id
        );
      },

      signField: (recordId, field) => {
        const state = get();
        const record = state.records.find((r) => r.id === recordId);
        if (!record) return;
        if (!canSignField(field, state.currentRole)) return;
        const current = getCurrentBaseline(record);
        const signature: FieldSignature = {
          field,
          verifier: state.currentActor,
          signedAt: now(),
          baselineId: current.id
        };
        set((s) => ({
          records: s.records.map((r) =>
            r.id === recordId
              ? {
                  ...r,
                  signatures: [...r.signatures.filter((sig) => !(sig.field === field && sig.baselineId === current.id)), signature]
                }
              : r
          )
        }));
      },

      completeRecord: (recordId) => {
        const state = get();
        if (state.currentRole !== 'reviewer') return;
        const record = state.records.find((r) => r.id === recordId);
        if (!record) return;
        const openConflicts = state.adjudicationItems.filter((a) => a.recordId === recordId && a.status === 'open').length;
        const check = checkCompletion(record, openConflicts);
        if (!check.ok) return; // 挡住签发
        const current = getCurrentBaseline(record);
        const signoff: IssuanceSignoff = {
          id: `SIG-${recordId}-${now()}`,
          recordId,
          baselineId: current.id,
          baselineHash: hashBaseline(current),
          signedBy: state.currentActor,
          signedAt: now(),
          valid: true
        };
        set((s) => ({
          records: s.records.map((r) => (r.id === recordId ? { ...r, status: '已核验', signoffs: [...r.signoffs.filter((sg) => sg.baselineId !== current.id), signoff] } : r))
        }));
      },

      adjudicate: (itemId, resolution) => {
        const state = get();
        const item = state.adjudicationItems.find((a) => a.id === itemId);
        if (!item || item.status !== 'open') return;
        const at = now();
        const record = state.records.find((r) => r.id === item.recordId);
        if (!record) return;

        let updatedRecord = record;
        if (resolution === 'acceptProposed') {
          // 采纳提议值 → 生成新基线
          const applied = applyChanges(record, { [item.field]: item.proposedValue }, item.reason, state.currentActor, at);
          updatedRecord = applied.record;
        }

        const staleSignoffs = getStaleSignoffs(updatedRecord);
        const invalidated = staleSignoffs.map((s) => ({ ...s, valid: false }));
        const valid = updatedRecord.signoffs.filter((s) => !staleSignoffs.includes(s));

        set((s) => ({
          records: s.records.map((r) =>
            r.id === item.recordId ? { ...updatedRecord, signoffs: [...valid, ...invalidated] } : r
          ),
          adjudicationItems: s.adjudicationItems.map((a) =>
            a.id === itemId
              ? { ...a, status: 'resolved', resolution, resolvedBy: state.currentActor, resolvedAt: at }
              : a
          )
        }));
      },

      retryDraft: async (draftId, simulateFailure) => {
        const state = get();
        const draft = state.drafts.find((d) => d.id === draftId);
        if (!draft) return;
        // 重试不生成新版本：复用 idempotencyKey
        const record = state.records.find((r) => r.id === draft.recordId);
        if (!record) return;
        try {
          await submitRevision({
            recordId: draft.recordId,
            baseBaselineId: draft.baseBaselineId,
            changes: draft.changes,
            reason: draft.reason,
            actor: draft.actor,
            idempotencyKey: draft.idempotencyKey,
            simulateFailure
          });
          // 成功 → 移除草稿，应用变更
          const merge = mergeChanges(record, draft.baseBaselineId, draft.changes, draft.actor, draft.reason, now());
          const toApply = merge.status === 'accepted' ? draft.changes : merge.mergedChanges;
          if (Object.keys(toApply).length > 0) {
            const applied = applyChanges(record, toApply, draft.reason, draft.actor, now());
            const staleSignoffs = getStaleSignoffs(applied.record);
            const invalidated = staleSignoffs.map((s) => ({ ...s, valid: false }));
            const valid = applied.record.signoffs.filter((s) => !staleSignoffs.includes(s));
            set((s) => ({
              records: s.records.map((r) => (r.id === draft.recordId ? { ...applied.record, signoffs: [...valid, ...invalidated] } : r)),
              drafts: s.drafts.filter((d) => d.id !== draftId),
              adjudicationItems: [...s.adjudicationItems, ...merge.conflicts]
            }));
          } else {
            set((s) => ({ drafts: s.drafts.filter((d) => d.id !== draftId) }));
          }
        } catch (err) {
          // 仍然失败 → 更新草稿，保留可恢复状态
          set((s) => ({
            drafts: s.drafts.map((d) =>
              d.id === draftId ? { ...d, lastAttemptAt: now(), failureReason: err instanceof Error ? err.message : '重试失败' } : d
            )
          }));
        }
      },

      dismissDraft: (draftId) => set((s) => ({ drafts: s.drafts.filter((d) => d.id !== draftId) })),
      clearLastResult: () => set({ lastRevisionResult: null })
    }),
    { name: 'yy60-carbon-evidence-v2' }
  )
);

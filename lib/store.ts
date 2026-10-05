import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  applyRevision,
  completeReview as engineCompleteReview,
  computeEpoch,
  evaluateIssuance,
  FIELD_LABELS,
  FIELD_ORDER,
  isRunValid,
  mergeDraft,
  signField as engineSignField,
  totalReduction,
  type Conflict,
  type Draft,
  type FieldKey,
  type IssuanceRun,
  type VersionedRecord
} from './engine';
import { buildSeedRecords } from './seed';

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

const defaultFindings: Finding[] = [
  { id: 'F-104', recordId: 'ACT-0337', type: '缺失证据', title: '缺少天然气流量计校验证书', detail: '计量记录已提交，但校准有效期证明不足。', assignee: '热力站 · 韩跃', due: '09-30', status: '开放' },
  { id: 'F-105', recordId: 'ACT-0325', type: '异常波动', title: '柴油消耗较上期上升 18.6%', detail: '项目方尚未说明测试运行时长变化。', assignee: '设备保障部 · 姜婷', due: '10-02', status: '补证中' },
  { id: 'F-106', recordId: 'ACT-0318', type: '单位不一致', title: '原始表单位为 MWh，台账记录为 kWh', detail: '需补充单位换算链并保留原始记录。', assignee: '项目现场 · 徐璐', due: '09-30', status: '开放' }
];

export const ISSUANCE_CHECK_LABELS: Record<string, string> = {
  evidence: '证据与计算链完整',
  calculation: '计算过程复核通过',
  revisions: '历史修订未覆盖原始数据',
  methodology: '方法学与监测计划匹配'
};

const emptyChecks = (): Record<string, boolean> => ({ evidence: false, calculation: false, revisions: false, methodology: false });

/** 初始草稿：一份提交失败待恢复重试的修订草稿 */
const initialDrafts: Draft[] = [
  {
    draftId: 'D-1',
    recordId: 'ACT-0325',
    baseRevision: 4,
    author: '沈楠',
    reason: '剔除应急泵空载测试柴油 16 L',
    changes: { activity: 1830 },
    evidenceIds: ['EV-2220', 'EV-2221'],
    createdAt: '2026-10-04T09:12:00.000Z',
    state: '提交失败',
    attempts: 1,
    lastError: '提交未到达台账服务（模拟故障）。草稿已保留，可恢复重试，重试不产生新版本。'
  }
];

/** 初始签发记录：基于旧数据指纹，演示数据变化后立即失效 */
const initialRuns: IssuanceRun[] = [
  {
    id: 'IS-1',
    epoch: 'E-0LD2026A',
    createdAt: '2026-09-30T10:00:00.000Z',
    createdBy: '陈岩',
    totalReduction: 698.42,
    checksSnapshot: { evidence: true, calculation: true, revisions: true, methodology: true }
  }
];

const pendingConflictCount = (conflicts: Conflict[]) => conflicts.filter((conflict) => conflict.status === '待裁决').length;
const activeDraftCount = (drafts: Draft[]) => drafts.filter((draft) => draft.state !== '已合并').length;

type State = {
  records: VersionedRecord[];
  findings: Finding[];
  drafts: Draft[];
  conflicts: Conflict[];
  issuanceRuns: IssuanceRun[];
  issuanceChecks: Record<string, boolean>;
  /** 门禁确认时对应的数据指纹；数据一变化即视为过期结论 */
  checksEpoch: string | null;
  selectedRecordId: string;
  sampledIds: string[];
  actor: string;
  simulateFailure: boolean;
  notice: string | null;
  draftSeq: number;
  conflictSeq: number;
  issuanceSeq: number;
  selectRecord: (id: string) => void;
  toggleSample: (id: string) => void;
  setActor: (actor: string) => void;
  toggleSimulateFailure: () => void;
  dismissNotice: () => void;
  createDraft: (recordId: string, changes: Partial<Record<FieldKey, unknown>>, reason: string, submit: boolean) => void;
  submitDraft: (draftId: string) => void;
  adjudicate: (conflictId: string, choice: 'mine' | 'theirs') => void;
  simulateOtherSubmit: (recordId: string) => void;
  signField: (recordId: string, field: FieldKey) => void;
  signMyFields: (recordId: string) => void;
  signSampledFields: () => void;
  completeReview: (recordId: string) => void;
  requestEvidence: (findingId: string) => void;
  closeFinding: (findingId: string) => void;
  toggleIssuanceCheck: (id: string) => void;
  runIssuance: () => void;
};

export const useCarbonStore = create<State>()(
  persist(
    (set, get) => ({
      records: buildSeedRecords(),
      findings: defaultFindings,
      drafts: initialDrafts,
      conflicts: [],
      issuanceRuns: initialRuns,
      issuanceChecks: emptyChecks(),
      checksEpoch: null,
      selectedRecordId: 'ACT-0318',
      sampledIds: ['ACT-0318', 'ACT-0337'],
      actor: '沈楠',
      simulateFailure: false,
      notice: null,
      draftSeq: 1,
      conflictSeq: 0,
      issuanceSeq: 1,

      selectRecord: (id) => set({ selectedRecordId: id }),
      toggleSample: (id) => set((state) => ({ sampledIds: state.sampledIds.includes(id) ? state.sampledIds.filter((item) => item !== id) : [...state.sampledIds, id] })),
      setActor: (actor) => set({ actor, notice: null }),
      toggleSimulateFailure: () => set((state) => ({ simulateFailure: !state.simulateFailure })),
      dismissNotice: () => set({ notice: null }),

      createDraft: (recordId, changes, reason, submit) => {
        const state = get();
        const record = state.records.find((item) => item.id === recordId);
        if (!record) return;
        if (Object.keys(changes).length === 0) {
          set({ notice: '修订内容与原值一致，未创建草稿。' });
          return;
        }
        const draftId = `D-${state.draftSeq + 1}`;
        const draft: Draft = {
          draftId,
          recordId,
          baseRevision: record.revision,
          author: state.actor,
          reason,
          changes,
          evidenceIds: [...record.evidenceIds],
          createdAt: new Date().toISOString(),
          state: '待提交',
          attempts: 0
        };
        set({ drafts: [...state.drafts, draft], draftSeq: state.draftSeq + 1, notice: `草稿 ${draftId} 已创建（基线 V${record.revision}，提交人 ${state.actor}）。` });
        if (submit) get().submitDraft(draftId);
      },

      submitDraft: (draftId) => set((state) => {
        const draft = state.drafts.find((item) => item.draftId === draftId);
        if (!draft) return state;
        // 幂等：已合并的草稿重试不会生成新版本
        if (draft.state === '已合并') return { notice: `草稿 ${draftId} 已合并，重试不会生成新版本。` };
        if (draft.state === '部分合并-待裁决') return { notice: `草稿 ${draftId} 存在待裁决冲突，请先完成裁决。` };
        const record = state.records.find((item) => item.id === draft.recordId);
        if (!record) return state;
        const attempts = draft.attempts + 1;
        // 失败路径：只更新草稿状态，绝不触碰记录与版本号
        if (state.simulateFailure) {
          return {
            drafts: state.drafts.map((item) => item.draftId === draftId ? { ...item, attempts, state: '提交失败' as const, lastError: '提交未到达台账服务（模拟故障）。草稿已保留，可恢复重试，重试不产生新版本。' } : item),
            notice: `草稿 ${draftId} 第 ${attempts} 次提交失败，记录未变化，可恢复重试。`
          };
        }
        const epochBefore = computeEpoch(state.records);
        const validRunsBefore = state.issuanceRuns.filter((run) => isRunValid(run, epochBefore, pendingConflictCount(state.conflicts), activeDraftCount(state.drafts))).map((run) => run.id);
        let conflictSeq = state.conflictSeq;
        const result = mergeDraft(record, draft, new Date().toISOString(), () => `C-${++conflictSeq}`);
        const records = state.records.map((item) => item.id === record.id ? result.record : item);
        const conflicts = [...state.conflicts, ...result.conflicts];
        const drafts = state.drafts.map((item) => item.draftId === draftId
          ? { ...item, attempts, state: (result.conflicts.length ? '部分合并-待裁决' : '已合并') as Draft['state'], lastError: undefined }
          : item);
        const invalidated = computeEpoch(records) !== epochBefore ? validRunsBefore : [];
        let notice = result.conflicts.length
          ? `草稿 ${draftId} 基于旧基线 V${draft.baseRevision} 提交：${result.mergedFields.map((field) => FIELD_LABELS[field]).join('、') || '无'} 已自动合并，${result.conflicts.length} 个冲突字段留待裁决，签发已阻塞。`
          : result.mergedFields.length
            ? `草稿 ${draftId} 已合并为 ${record.id} V${result.record.revision}，并按当时数据生成不可变快照。`
            : `草稿 ${draftId} 与当前数据一致，无有效变化，已关闭。`;
        if (invalidated.length) notice += ` 监测期数据已变化，签发结果 ${invalidated.join('、')} 立即失效，就绪度已重算。`;
        return { records, drafts, conflicts, conflictSeq, notice };
      }),

      adjudicate: (conflictId, choice) => set((state) => {
        const conflict = state.conflicts.find((item) => item.id === conflictId);
        if (!conflict || conflict.status !== '待裁决') return state;
        const record = state.records.find((item) => item.id === conflict.recordId);
        if (!record) return state;
        const at = new Date().toISOString();
        const epochBefore = computeEpoch(state.records);
        const validRunsBefore = state.issuanceRuns.filter((run) => isRunValid(run, epochBefore, pendingConflictCount(state.conflicts), activeDraftCount(state.drafts))).map((run) => run.id);
        let records = state.records;
        if (choice === 'mine') {
          const draft = state.drafts.find((item) => item.draftId === conflict.draftId);
          const next = applyRevision(record, {
            changes: { [conflict.field]: conflict.incomingValue },
            reason: `冲突裁决：采用 ${draft?.author ?? conflict.draftId} 在 ${conflict.draftId} 中的提交值`,
            author: state.actor,
            at,
            kind: '裁决应用',
            draftId: conflict.draftId
          });
          records = state.records.map((item) => item.id === record.id ? next : item);
        }
        const conflicts = state.conflicts.map((item) => item.id === conflictId
          ? { ...item, status: '已裁决' as const, resolution: (choice === 'mine' ? '采用提交值' : '保留当前值') as Conflict['resolution'], resolvedBy: state.actor, resolvedAt: at }
          : item);
        const stillPending = conflicts.some((item) => item.draftId === conflict.draftId && item.status === '待裁决');
        const drafts = stillPending
          ? state.drafts
          : state.drafts.map((item) => item.draftId === conflict.draftId && item.state === '部分合并-待裁决' ? { ...item, state: '已合并' as const } : item);
        const invalidated = computeEpoch(records) !== epochBefore ? validRunsBefore : [];
        let notice = choice === 'mine'
          ? `已裁决采用提交值，${conflict.recordId} 生成新版本并留下裁决链。`
          : `已裁决保留当前值，${conflict.recordId} 数据不变。`;
        if (invalidated.length) notice += ` 签发结果 ${invalidated.join('、')} 已失效。`;
        return { records, conflicts, drafts, notice };
      }),

      simulateOtherSubmit: (recordId) => set((state) => {
        const record = state.records.find((item) => item.id === recordId);
        if (!record) return state;
        const epochBefore = computeEpoch(state.records);
        const validRunsBefore = state.issuanceRuns.filter((run) => isRunValid(run, epochBefore, pendingConflictCount(state.conflicts), activeDraftCount(state.drafts))).map((run) => run.id);
        const nextFactor = Math.round((record.factor + 0.0002) * 10000) / 10000;
        const next = applyRevision(record, {
          changes: { factor: nextFactor },
          reason: '另一核验组并发提交的因子修订（模拟）',
          author: '韩跃',
          at: new Date().toISOString(),
          kind: '直接修订'
        });
        const records = state.records.map((item) => item.id === recordId ? next : item);
        const invalidated = computeEpoch(records) !== epochBefore ? validRunsBefore : [];
        let notice = `模拟并发：韩跃已将 ${recordId} 排放因子修订为 ${nextFactor}（V${next.revision}）。基于旧基线的草稿提交时将走合并流程。`;
        if (invalidated.length) notice += ` 签发结果 ${invalidated.join('、')} 立即失效。`;
        return { records, notice };
      }),

      signField: (recordId, field) => set((state) => {
        const record = state.records.find((item) => item.id === recordId);
        if (!record) return state;
        const result = engineSignField(record, field, state.actor, new Date().toISOString());
        if (!result.ok) return { notice: result.error ?? '签署被拒绝。' };
        return {
          records: state.records.map((item) => item.id === recordId ? result.record : item),
          notice: `${state.actor} 已按当前基线 V${record.revision} 签署 ${recordId} 的「${FIELD_LABELS[field]}」。`
        };
      }),

      signMyFields: (recordId) => set((state) => {
        const record = state.records.find((item) => item.id === recordId);
        if (!record) return state;
        const owned = FIELD_ORDER.filter((field) => record.fieldOwners[field] === state.actor && !record.signoffs[field]);
        if (!owned.length) return { notice: `${state.actor} 在 ${recordId} 没有待签署字段。` };
        let next = record;
        const at = new Date().toISOString();
        for (const field of owned) next = engineSignField(next, field, state.actor, at).record;
        return {
          records: state.records.map((item) => item.id === recordId ? next : item),
          notice: `${state.actor} 已签署 ${recordId} 的 ${owned.map((field) => FIELD_LABELS[field]).join('、')}。`
        };
      }),

      signSampledFields: () => set((state) => {
        let records = state.records;
        let count = 0;
        const at = new Date().toISOString();
        for (const id of state.sampledIds) {
          const record = records.find((item) => item.id === id);
          if (!record || record.status === '需补证') continue;
          const owned = FIELD_ORDER.filter((field) => record.fieldOwners[field] === state.actor && !record.signoffs[field]);
          if (!owned.length) continue;
          let next = record;
          for (const field of owned) next = engineSignField(next, field, state.actor, at).record;
          records = records.map((item) => item.id === id ? next : item);
          count += owned.length;
        }
        return { records, notice: count ? `${state.actor} 已在抽样记录中签署 ${count} 个字段。` : `${state.actor} 在抽样记录中没有可签署字段。` };
      }),

      completeReview: (recordId) => set((state) => {
        const record = state.records.find((item) => item.id === recordId);
        if (!record) return state;
        const result = engineCompleteReview(record, state.actor);
        if (!result.ok) return { notice: result.error ?? '完成复核被拒绝。' };
        return {
          records: state.records.map((item) => item.id === recordId ? result.record : item),
          notice: `${recordId} 已由复核人 ${state.actor} 完成记录，状态转为已核验。`
        };
      }),

      requestEvidence: (findingId) => set((state) => ({ findings: state.findings.map((finding) => finding.id === findingId ? { ...finding, status: '补证中' } : finding) })),
      closeFinding: (findingId) => set((state) => ({ findings: state.findings.map((finding) => finding.id === findingId ? { ...finding, status: '已关闭' } : finding) })),

      toggleIssuanceCheck: (id) => set((state) => {
        const epoch = computeEpoch(state.records);
        // 数据指纹已变化 → 旧门禁结论作废，从空白重新确认
        const base = state.checksEpoch === epoch ? state.issuanceChecks : emptyChecks();
        return { issuanceChecks: { ...base, [id]: !base[id] }, checksEpoch: epoch };
      }),

      runIssuance: () => set((state) => {
        const epoch = computeEpoch(state.records);
        const checks = state.checksEpoch === epoch ? state.issuanceChecks : {};
        const result = evaluateIssuance({
          records: state.records,
          openFindings: state.findings.filter((finding) => finding.status !== '已关闭').length,
          pendingConflicts: state.conflicts,
          activeDrafts: state.drafts,
          checks,
          checkLabels: ISSUANCE_CHECK_LABELS
        });
        if (!result.ready) return { notice: `签发准备被阻塞：${result.blockers[0] ?? '存在未满足门禁'}${result.blockers.length > 1 ? ` 等 ${result.blockers.length} 项` : ''}` };
        const run: IssuanceRun = {
          id: `IS-${state.issuanceSeq + 1}`,
          epoch,
          createdAt: new Date().toISOString(),
          createdBy: state.actor,
          totalReduction: totalReduction(state.records),
          checksSnapshot: { ...state.issuanceChecks }
        };
        return {
          issuanceRuns: [...state.issuanceRuns, run],
          issuanceSeq: state.issuanceSeq + 1,
          notice: `签发准备 ${run.id} 已生成（数据指纹 ${epoch}，减排量 ${run.totalReduction.toFixed(2)} tCO₂e）。监测期数据一旦变化，本结果立即失效并重算。`
        };
      })
    }),
    {
      name: 'yy60-carbon-evidence',
      version: 2,
      // 旧版本持久化结构不兼容，直接弃用并回到种子数据
      migrate: () => ({}) as State
    }
  )
);

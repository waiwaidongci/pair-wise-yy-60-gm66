// 初始数据：每条记录自带完整修订链（原始值、因子、证据编号、原因、不可变快照）。
import {
  applyRevision,
  DEFAULT_FIELD_OWNERS,
  type FieldKey,
  type RecordStatus,
  type VersionedRecord
} from './engine';

type SeedStep = {
  author: string;
  reason: string;
  at: string;
  changes: Partial<Record<FieldKey, unknown>>;
};

type SeedInput = {
  id: string;
  source: string;
  owner: string;
  unit: string;
  factorUnit: string;
  anomaly: number;
  status: RecordStatus;
  signedFields: FieldKey[];
  base: { activity: number; factor: number; timeRange: string; evidenceIds: string[]; at: string };
  steps?: SeedStep[];
};

function buildRecord(input: SeedInput): VersionedRecord {
  let record: VersionedRecord = {
    id: input.id,
    source: input.source,
    owner: input.owner,
    unit: input.unit,
    factorUnit: input.factorUnit,
    anomaly: input.anomaly,
    status: '待核验',
    activity: 0,
    factor: 0,
    timeRange: '',
    evidenceIds: [],
    revision: 0,
    history: [],
    signoffs: {},
    fieldOwners: { ...DEFAULT_FIELD_OWNERS }
  };
  record = applyRevision(record, {
    changes: { activity: input.base.activity, factor: input.base.factor, evidence: input.base.evidenceIds, timeRange: input.base.timeRange },
    reason: '初始基线导入',
    author: '系统导入',
    at: input.base.at,
    kind: '初始导入'
  });
  for (const step of input.steps ?? []) {
    record = applyRevision(record, { changes: step.changes, reason: step.reason, author: step.author, at: step.at, kind: '直接修订' });
  }
  const signoffs: VersionedRecord['signoffs'] = {};
  for (const field of input.signedFields) {
    signoffs[field] = { by: record.fieldOwners[field], at: `${record.history[record.history.length - 1].at.slice(0, 10)}T10:00:00.000Z`, revision: record.revision };
  }
  return { ...record, status: input.status, signoffs };
}

const RANGE = '2026-07-01 至 07-31';

export function buildSeedRecords(): VersionedRecord[] {
  return [
    buildRecord({
      id: 'ACT-0318',
      source: '电表 E-17 / 四号压缩机组',
      owner: '项目现场 O2',
      unit: 'kWh',
      factorUnit: 'tCO2/MWh',
      anomaly: 2.3,
      status: '复核中',
      signedFields: ['activity', 'timeRange'],
      base: { activity: 429800, factor: 0.5568, timeRange: RANGE, evidenceIds: ['EV-2201', 'EV-2202', 'EV-2203'], at: '2026-09-12T02:10:00.000Z' },
      steps: [
        { author: '徐璐', reason: '补充单位换算链原始记录（MWh→kWh）', at: '2026-09-20T06:30:00.000Z', changes: { evidence: ['EV-2201', 'EV-2202', 'EV-2203', 'EV-2204'] } },
        { author: '沈楠', reason: '剔除压缩机测试运行电量 1150 kWh', at: '2026-09-27T09:05:00.000Z', changes: { activity: 428650 } }
      ]
    }),
    buildRecord({
      id: 'ACT-0321',
      source: '蒸汽流量计 ST-04',
      owner: '能源中心',
      unit: 'GJ',
      factorUnit: 'tCO2/GJ',
      anomaly: 0,
      status: '已核验',
      signedFields: ['activity', 'factor', 'evidence', 'timeRange'],
      base: { activity: 2038.4, factor: 0.1102, timeRange: RANGE, evidenceIds: ['EV-2210', 'EV-2211'], at: '2026-09-11T03:00:00.000Z' },
      steps: [
        { author: '韩跃', reason: '按最新蒸汽焓值表更新排放因子', at: '2026-09-19T08:40:00.000Z', changes: { factor: 0.11 } }
      ]
    }),
    buildRecord({
      id: 'ACT-0325',
      source: '柴油消耗台账 / 应急泵',
      owner: '设备保障部',
      unit: 'L',
      factorUnit: 'kgCO2/L',
      anomaly: 8.6,
      status: '需补证',
      signedFields: [],
      base: { activity: 1900, factor: 2.68, timeRange: RANGE, evidenceIds: ['EV-2220'], at: '2026-09-10T01:20:00.000Z' },
      steps: [
        { author: '沈楠', reason: '按油库出库单核减 28 L', at: '2026-09-15T07:10:00.000Z', changes: { activity: 1872 } },
        { author: '徐璐', reason: '补充油库出库单扫描件', at: '2026-09-18T02:50:00.000Z', changes: { evidence: ['EV-2220', 'EV-2221'] } },
        { author: '沈楠', reason: '剔除异常空载测试消耗 26 L', at: '2026-09-26T10:15:00.000Z', changes: { activity: 1846 } }
      ]
    }),
    buildRecord({
      id: 'ACT-0331',
      source: '光伏逆变器阵列 PV-2',
      owner: '新能源运维',
      unit: 'kWh',
      factorUnit: 'tCO2/MWh',
      anomaly: -1.2,
      status: '已核验',
      signedFields: ['activity', 'factor', 'evidence', 'timeRange'],
      base: { activity: 182460, factor: 0.5568, timeRange: RANGE, evidenceIds: ['EV-2230', 'EV-2231', 'EV-2232', 'EV-2233', 'EV-2234'], at: '2026-09-13T05:30:00.000Z' }
    }),
    buildRecord({
      id: 'ACT-0337',
      source: '天然气流量计 NG-02',
      owner: '热力站',
      unit: 'kNm3',
      factorUnit: 'tCO2/kNm3',
      anomaly: 12.4,
      status: '待核验',
      signedFields: [],
      base: { activity: 62.8, factor: 2.1622, timeRange: RANGE, evidenceIds: ['EV-2240'], at: '2026-09-14T02:00:00.000Z' }
    })
  ];
}

// 引擎与存储行为校验：node scripts/engine-check.mjs（先运行 npm run test:engine 中的 tsc 编译）
const assert = require('node:assert/strict');
const engine = require('../.engine-check/engine.js');
const { useCarbonStore } = require('../.engine-check/store.js');

const S = () => useCarbonStore.getState();
const recordOf = (id) => S().records.find((record) => record.id === id);

// 1. 提交失败 → 草稿保留可重试，失败与重试都不产生多余版本
const revBefore = recordOf('ACT-0325').revision;
useCarbonStore.setState({ simulateFailure: true });
S().submitDraft('D-1');
assert.equal(S().drafts.find((draft) => draft.draftId === 'D-1').state, '提交失败');
assert.equal(recordOf('ACT-0325').revision, revBefore, '失败不得生成新版本');
useCarbonStore.setState({ simulateFailure: false });
S().submitDraft('D-1');
assert.equal(S().drafts.find((draft) => draft.draftId === 'D-1').state, '已合并');
assert.equal(recordOf('ACT-0325').revision, revBefore + 1, '重试成功只生成一个新版本');
S().submitDraft('D-1');
assert.equal(recordOf('ACT-0325').revision, revBefore + 1, '已合并草稿重试幂等');

// 2. 修订链留痕：原始值、因子、证据编号、原因、不可变快照
const merged = recordOf('ACT-0325');
const lastRev = merged.history[merged.history.length - 1];
assert.equal(lastRev.kind, '草稿合并');
assert.equal(lastRev.changes.activity.from, 1846);
assert.equal(lastRev.changes.activity.to, 1830);
assert.ok(lastRev.reason.includes('剔除应急泵空载测试'));
assert.ok(lastRev.evidenceIds.length > 0);
assert.equal(lastRev.snapshot.reduction, engine.computeReduction(1830, 2.68, 'L'));
const firstRev = merged.history[0];
assert.equal(firstRev.snapshot.reduction, engine.computeReduction(firstRev.snapshot.activity, firstRev.snapshot.factor, firstRev.snapshot.unit), '历史快照不可变');

// 3. 旧基线提交：未冲突字段自动合并，不产生冲突
S().createDraft('ACT-0318', { activity: 428000 }, '测试合并：剔除待机电量', false);
const draftA = S().drafts[S().drafts.length - 1];
S().simulateOtherSubmit('ACT-0318'); // 他人并发修改排放因子
S().submitDraft(draftA.draftId);
assert.equal(S().drafts.find((draft) => draft.draftId === draftA.draftId).state, '已合并');
assert.equal(S().conflicts.length, 0, '未冲突字段应自动合并');
assert.equal(recordOf('ACT-0318').activity, 428000);

// 4. 双方改同一字段 → 冲突待裁决并阻塞签发；裁决后落地
S().createDraft('ACT-0318', { factor: 0.6 }, '测试冲突：采用区域电网因子', false);
const draftB = S().drafts[S().drafts.length - 1];
S().simulateOtherSubmit('ACT-0318'); // 他人也改因子
S().submitDraft(draftB.draftId);
assert.equal(S().drafts.find((draft) => draft.draftId === draftB.draftId).state, '部分合并-待裁决');
const conflict = S().conflicts.find((item) => item.draftId === draftB.draftId);
assert.ok(conflict && conflict.status === '待裁决');
assert.equal(conflict.field, 'factor');
const blocked = engine.evaluateIssuance({
  records: S().records,
  openFindings: 0,
  pendingConflicts: S().conflicts,
  activeDrafts: S().drafts,
  checks: { evidence: true, calculation: true, revisions: true, methodology: true },
  checkLabels: { evidence: '证据与计算链完整', calculation: '计算过程复核通过', revisions: '历史修订未覆盖原始数据', methodology: '方法学与监测计划匹配' }
});
assert.ok(!blocked.ready && blocked.blockers.some((item) => item.includes('裁决')), '待裁决冲突必须阻塞签发');
S().adjudicate(conflict.id, 'mine');
assert.equal(S().conflicts.find((item) => item.id === conflict.id).status, '已裁决');
assert.equal(recordOf('ACT-0318').factor, 0.6, '裁决采用提交值后应生成新版本');
assert.equal(S().drafts.find((draft) => draft.draftId === draftB.draftId).state, '已合并');

// 5. 字段级签署权限与复核人完成记录
useCarbonStore.setState({ actor: '韩跃' });
S().signField('ACT-0337', 'activity');
assert.ok(!recordOf('ACT-0337').signoffs.activity, '非负责核验员签署应被拒绝');
S().signField('ACT-0337', 'factor');
assert.equal(recordOf('ACT-0337').signoffs.factor.by, '韩跃');
useCarbonStore.setState({ actor: '陈岩' });
S().completeReview('ACT-0337');
assert.notEqual(recordOf('ACT-0337').status, '已核验', '字段未签全时复核人不得完成');
useCarbonStore.setState({ actor: '沈楠' });
S().signField('ACT-0337', 'activity');
S().signField('ACT-0337', 'timeRange');
useCarbonStore.setState({ actor: '徐璐' });
S().signField('ACT-0337', 'evidence');
S().completeReview('ACT-0337');
assert.notEqual(recordOf('ACT-0337').status, '已核验', '非复核人不得完成记录');
useCarbonStore.setState({ actor: '陈岩' });
S().completeReview('ACT-0337');
assert.equal(recordOf('ACT-0337').status, '已核验');

// 6. 数据修订使被改字段的签署失效
const signedBefore = Object.keys(recordOf('ACT-0337').signoffs).length;
assert.ok(signedBefore > 0);
S().simulateOtherSubmit('ACT-0337'); // 改因子
assert.ok(!recordOf('ACT-0337').signoffs.factor, '因子被修订后其签署应失效');
assert.equal(recordOf('ACT-0337').status, '复核中', '数据变化后记录应回到复核中');

// 7. 监测期数据一变化，旧签发结果立即失效
const epoch1 = engine.computeEpoch(S().records);
const run = { id: 'IS-X', epoch: epoch1, createdAt: '', createdBy: '陈岩', totalReduction: 0, checksSnapshot: {} };
assert.ok(engine.isRunValid(run, epoch1, 0, 0));
S().simulateOtherSubmit('ACT-0337');
const epoch2 = engine.computeEpoch(S().records);
assert.notEqual(epoch1, epoch2);
assert.ok(!engine.isRunValid(run, epoch2, 0, 0), '数据指纹变化后旧签发结果必须失效');

console.log('engine/store checks passed: 失败重试幂等、修订留痕、快照不可变、旧基线合并、冲突裁决阻塞签发、字段级签署、复核人完成、签发失效重算');

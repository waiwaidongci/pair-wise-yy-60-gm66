'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  AppBar,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Drawer,
  IconButton,
  LinearProgress,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Toolbar,
  Tooltip,
  Typography
} from '@mui/material';
import {
  AccountTreeOutlined,
  AssessmentOutlined,
  CloudUploadOutlined,
  DashboardOutlined,
  FactCheckOutlined,
  FindInPageOutlined,
  GavelOutlined,
  MenuOutlined,
  NotificationsNoneOutlined,
  ScienceOutlined,
  TaskAltOutlined
} from '@mui/icons-material';
import { fetchEvidence } from '@/lib/api';
import { ISSUANCE_CHECK_LABELS, useCarbonStore } from '@/lib/store';
import {
  computeEpoch,
  evaluateIssuance,
  FIELD_ORDER,
  isRunValid,
  totalReduction,
  USERS,
  type FieldKey
} from '@/lib/engine';
import RevisionTimeline from './RevisionTimeline';
import SignoffCard from './SignoffCard';
import DraftsPanel from './DraftsPanel';
import ConflictsPanel from './ConflictsPanel';

const drawerWidth = 232;

type View = 'overview' | 'verify' | 'issuance';

const ISSUANCE_CHECK_ITEMS = [
  { id: 'evidence', detail: '活动数据、排放因子、来源证据与修订说明可追溯。' },
  { id: 'calculation', detail: '单位和换算系数一致，关键公式由核验员确认。' },
  { id: 'revisions', detail: '所有数据均有版本号和修订原因，原始版本未被覆盖。' },
  { id: 'methodology', detail: '项目采用方法学与监测计划一致。' }
];

export default function EvidenceWorkbench({ initialView }: { initialView: View }) {
  const [view] = useState<View>(initialView);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [recordFilter, setRecordFilter] = useState('全部');
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftActivity, setDraftActivity] = useState('');
  const [draftFactor, setDraftFactor] = useState('');
  const [draftEvidence, setDraftEvidence] = useState('');
  const [draftReason, setDraftReason] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['carbon-api'], queryFn: fetchEvidence });
  const store = useCarbonStore();
  const selected = store.records.find((record) => record.id === store.selectedRecordId) ?? store.records[0];
  const visibleRecords = useMemo(() => recordFilter === '全部' ? store.records : store.records.filter((record) => record.status === recordFilter), [recordFilter, store.records]);
  const epoch = computeEpoch(store.records);
  const liveTotal = totalReduction(store.records);
  const openFindings = store.findings.filter((item) => item.status !== '已关闭');
  const pendingConflicts = store.conflicts.filter((item) => item.status === '待裁决');
  const activeDrafts = store.drafts.filter((item) => item.state !== '已合并');
  const checksStale = store.checksEpoch !== null && store.checksEpoch !== epoch;
  const effectiveChecks = checksStale || store.checksEpoch === null ? {} : store.issuanceChecks;
  const confirmedChecks = Object.values(effectiveChecks).filter(Boolean).length;
  const issuance = evaluateIssuance({
    records: store.records,
    openFindings: openFindings.length,
    pendingConflicts: store.conflicts,
    activeDrafts: store.drafts,
    checks: effectiveChecks,
    checkLabels: ISSUANCE_CHECK_LABELS
  });
  const readiness = issuance.ready ? 100 : Math.min(96, Math.round(
    confirmedChecks / ISSUANCE_CHECK_ITEMS.length * 60 +
    (openFindings.length === 0 ? 15 : 0) +
    (pendingConflicts.length === 0 ? 15 : 0) +
    (activeDrafts.length === 0 ? 10 : 0)
  ));

  const nav = [
    { id: 'overview', label: '监测期总览', href: '/', icon: DashboardOutlined },
    { id: 'verify', label: '证据与抽样核验', href: '/verify', icon: FindInPageOutlined },
    { id: 'issuance', label: '签发准备', href: '/issuance', icon: AssessmentOutlined }
  ];

  const openDraftDialog = () => {
    setDraftActivity(String(selected.activity));
    setDraftFactor(String(selected.factor));
    setDraftEvidence(selected.evidenceIds.join('、'));
    setDraftReason('');
    setDraftOpen(true);
  };

  const buildDraftChanges = (): Partial<Record<FieldKey, unknown>> => {
    const changes: Partial<Record<FieldKey, unknown>> = {};
    if (draftActivity.trim() && Number(draftActivity) !== selected.activity) changes.activity = Number(draftActivity);
    if (draftFactor.trim() && Number(draftFactor) !== selected.factor) changes.factor = Number(draftFactor);
    const ids = draftEvidence.split(/[,，、\s]+/).filter(Boolean);
    if (JSON.stringify(ids) !== JSON.stringify(selected.evidenceIds)) changes.evidence = ids;
    return changes;
  };

  const submitDraftDialog = (submit: boolean) => {
    store.createDraft(selected.id, buildDraftChanges(), draftReason.trim(), submit);
    setDraftOpen(false);
    setDraftReason('');
  };

  const signedCount = (recordId: string) => {
    const record = store.records.find((item) => item.id === recordId);
    return record ? FIELD_ORDER.filter((field) => record.signoffs[field]).length : 0;
  };

  const navDrawer = (
    <Box sx={{ width: drawerWidth, bgcolor: '#f8faf9', height: '100%' }}>
      <Box sx={{ p: 2.2, pt: 3 }}>
        <Typography variant="overline" color="text.secondary">当前项目</Typography>
        <Typography fontWeight={800} fontSize={13} mt={.5}>{data?.project.name ?? '临港工业园区能效提升项目'}</Typography>
        <Typography variant="caption" color="text.secondary">{data?.project.id ?? 'CN-ER-2026-041'}</Typography>
      </Box>
      <Divider />
      <List sx={{ px: 1, py: 1.2 }}>
        {nav.map(({ id, label, href, icon: Icon }) => (
          <ListItemButton key={id} component={Link} href={href} selected={view === id} sx={{ borderRadius: 1, mb: .4, '&.Mui-selected': { bgcolor: '#e4f1ec', color: '#12664f' } }}>
            <ListItemIcon sx={{ minWidth: 36, color: 'inherit' }}><Icon fontSize="small" /></ListItemIcon>
            <ListItemText primary={label} primaryTypographyProps={{ fontSize: 13, fontWeight: view === id ? 750 : 500 }} />
          </ListItemButton>
        ))}
      </List>
      <Box sx={{ p: 2, mt: 2 }}>
        <Box sx={{ p: 1.3, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'white' }}>
          <Stack direction="row" alignItems="center" spacing={1} mb={1}><ScienceOutlined color="primary" fontSize="small" /><Typography fontSize={12} fontWeight={750}>数据指纹</Typography></Stack>
          <Chip size="small" variant="outlined" color="primary" label={epoch} />
          <Typography variant="caption" color="text.secondary" display="block" mt={1}>监测期数据一变化，指纹即变，旧签发结果立即失效。</Typography>
        </Box>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" elevation={0} sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, bgcolor: '#173a31', borderBottom: '1px solid rgba(255,255,255,.12)' }}>
        <Toolbar sx={{ minHeight: '62px !important', gap: 1.4 }}>
          <IconButton color="inherit" sx={{ display: { md: 'none' } }} onClick={() => setMobileOpen(true)}><MenuOutlined /></IconButton>
          <Box sx={{ width: 36, height: 36, borderRadius: 1, border: '1px solid #80b6a6', display: 'grid', placeItems: 'center' }}>
            <AccountTreeOutlined fontSize="small" />
          </Box>
          <Box>
            <Typography fontSize={15} fontWeight={800}>碳减排项目监测核验</Typography>
            <Typography fontSize={10} color="#a9c5bc">MRV Evidence & Issuance Readiness</Typography>
          </Box>
          <Box sx={{ flex: 1 }} />
          {pendingConflicts.length > 0 && <Chip size="small" icon={<GavelOutlined />} label={`${pendingConflicts.length} 项冲突待裁决`} sx={{ color: '#ffb4a2', borderColor: '#a85435', bgcolor: 'rgba(255,255,255,.05)' }} variant="outlined" />}
          <Chip size="small" label={`${openFindings.length} 项发现开放`} sx={{ color: '#ffdda7', borderColor: '#a87935', bgcolor: 'rgba(255,255,255,.05)' }} variant="outlined" />
          <Select
            size="small"
            value={store.actor}
            onChange={(event) => store.setActor(event.target.value)}
            sx={{ color: 'white', fontSize: 12, '& .MuiSelect-icon': { color: '#a9c5bc' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,.3)' } }}
          >
            {USERS.map((user) => <MenuItem key={user.name} value={user.name}>{user.name} · {user.role}</MenuItem>)}
          </Select>
          <IconButton color="inherit"><NotificationsNoneOutlined /></IconButton>
          <Avatar sx={{ width: 30, height: 30, bgcolor: '#e1a45d', fontSize: 12 }}>{store.actor[0]}</Avatar>
        </Toolbar>
      </AppBar>
      <Drawer variant="permanent" sx={{ width: drawerWidth, flexShrink: 0, display: { xs: 'none', md: 'block' }, '& .MuiDrawer-paper': { width: drawerWidth, pt: '62px', boxSizing: 'border-box', borderRightColor: '#dce4e0' } }}>{navDrawer}</Drawer>
      <Drawer variant="temporary" open={mobileOpen} onClose={() => setMobileOpen(false)} ModalProps={{ keepMounted: true }} sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { width: drawerWidth, pt: '62px' } }}>{navDrawer}</Drawer>

      <Box component="main" sx={{ flexGrow: 1, minWidth: 0, bgcolor: '#f2f5f3', pt: '62px' }}>
        <Box sx={{ p: { xs: 1.5, md: 3 }, maxWidth: 1640, mx: 'auto' }}>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2} mb={2.4}>
            <Box>
              <Typography variant="overline" color="text.secondary" fontWeight={750}>CN-ER-2026-041 / {data?.summary.period ?? '第三监测期'}</Typography>
              <Typography variant="h5" fontWeight={850} mt={.3}>{view === 'overview' ? '监测期总览' : view === 'verify' ? '证据与抽样核验' : '签发准备'}</Typography>
              <Typography variant="body2" color="text.secondary" mt={.5}>{view === 'overview' ? '汇总活动数据、排放因子、证据完整度和异常波动。' : view === 'verify' ? '字段级签署、草稿合并与冲突裁决，全部留痕。' : '关闭发现项并完成签发前完整性门禁。'}</Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" startIcon={<CloudUploadOutlined />}>导入监测数据</Button>
              <Button variant="contained" startIcon={<TaskAltOutlined />} disabled={view !== 'issuance' || !issuance.ready} onClick={store.runIssuance}>提交签发准备</Button>
            </Stack>
          </Stack>
          {store.notice && <Alert severity="info" onClose={store.dismissNotice} sx={{ mb: 1.6 }}>{store.notice}</Alert>}
          {isLoading && <LinearProgress />}

          {view === 'overview' && (
            <>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 1.4, mb: 2 }}>
                {[
                  { label: '减排量（实时重算）', value: liveTotal.toLocaleString('zh-CN', { maximumFractionDigits: 2 }), unit: 'tCO₂e', note: `数据指纹 ${epoch}` },
                  { label: '证据完整度', value: `${data?.summary.evidenceRate ?? 92}%`, unit: '', note: '5 份证据待补充' },
                  { label: '开放发现项', value: `${openFindings.length}`, unit: '项', note: '关闭后方可签发' },
                  { label: '待裁决冲突', value: `${pendingConflicts.length}`, unit: '项', note: `${activeDrafts.length} 份草稿未合并` }
                ].map((item) => <Card elevation={0} variant="outlined" key={item.label}><CardContent sx={{ p: 1.8, '&:last-child': { pb: 1.8 } }}><Typography variant="caption" color="text.secondary">{item.label}</Typography><Stack direction="row" alignItems="baseline" spacing={.6} mt={.5}><Typography variant="h5" fontWeight={850}>{item.value}</Typography><Typography fontSize={12} color="text.secondary">{item.unit}</Typography></Stack><Typography fontSize={11} color="text.secondary" mt={.7}>{item.note}</Typography></CardContent></Card>)}
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1.55fr) minmax(300px, .7fr)' }, gap: 1.5 }}>
                <Stack spacing={1.5}>
                  <Card elevation={0} variant="outlined">
                    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ p: 1.6 }}>
                      <Box><Typography fontWeight={800} fontSize={14}>活动数据与计算链</Typography><Typography fontSize={11} color="text.secondary">选择记录查看公式、来源证据和修订版本</Typography></Box>
                      <Tabs value={recordFilter} onChange={(_, value) => setRecordFilter(value)} variant="scrollable"><Tab value="全部" label="全部" /><Tab value="待核验" label="待核验" /><Tab value="需补证" label="需补证" /><Tab value="已核验" label="已核验" /></Tabs>
                    </Stack>
                    <Divider />
                    <Box sx={{ overflowX: 'auto' }}>
                      <Box sx={{ minWidth: 900 }}>
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1.7fr .9fr .8fr 1fr .6fr .8fr', gap: 1, px: 1.7, py: 1, bgcolor: '#f7f9f8', color: 'text.secondary', fontSize: 11, fontWeight: 750 }}>
                          <span>数据来源</span><span>活动数据</span><span>排放因子</span><span>时间范围</span><span>签署</span><span>状态</span>
                        </Box>
                        {visibleRecords.map((record) => {
                          const hasConflict = pendingConflicts.some((conflict) => conflict.recordId === record.id);
                          return (
                            <Box key={record.id} role="button" tabIndex={0} onClick={() => store.selectRecord(record.id)} sx={{ display: 'grid', gridTemplateColumns: '1.7fr .9fr .8fr 1fr .6fr .8fr', gap: 1, px: 1.7, py: 1.25, borderTop: '1px solid #e8ecea', cursor: 'pointer', bgcolor: selected.id === record.id ? '#eff7f3' : 'white', '&:hover': { bgcolor: '#f6faf8' } }}>
                              <Box><Typography fontSize={12.5} fontWeight={700}>{record.source}</Typography><Typography fontSize={10} color="text.secondary">{record.id} · {record.owner} · 基线 V{record.revision}</Typography></Box>
                              <Box><Typography fontSize={12}>{record.activity.toLocaleString()} {record.unit}</Typography><Typography fontSize={10} color={record.anomaly > 5 ? 'secondary.main' : 'text.secondary'}>异常 {record.anomaly > 0 ? '+' : ''}{record.anomaly}%</Typography></Box>
                              <Typography fontSize={12}>{record.factor} <small>{record.factorUnit}</small></Typography>
                              <Typography fontSize={11}>{record.timeRange}</Typography>
                              <Typography fontSize={12}>{signedCount(record.id)}/{FIELD_ORDER.length}</Typography>
                              <Stack direction="row" spacing={.5} alignItems="center">
                                <Chip size="small" label={record.status} color={record.status === '已核验' ? 'success' : record.status === '需补证' ? 'warning' : 'default'} variant={record.status === '已核验' ? 'filled' : 'outlined'} />
                                {hasConflict && <Chip size="small" color="warning" variant="outlined" label="待裁决" />}
                              </Stack>
                            </Box>
                          );
                        })}
                      </Box>
                    </Box>
                  </Card>
                  <RevisionTimeline record={selected} />
                </Stack>
                <Stack spacing={1.5}>
                  <Card elevation={0} variant="outlined"><CardContent><Stack direction="row" justifyContent="space-between" alignItems="center"><Typography fontWeight={800} fontSize={14}>当前基线计算链</Typography><Chip size="small" label={`${selected.id} · V${selected.revision}`} /></Stack><Box sx={{ mt: 1.5, p: 1.3, bgcolor: '#f4f7f5', fontFamily: 'monospace', borderRadius: 1, fontSize: 11 }}>
                    <Box>活动数据 = {selected.activity.toLocaleString()} {selected.unit}</Box>
                    <Box mt={.6}>排放因子 = {selected.factor} {selected.factorUnit}</Box>
                    <Box mt={.6}>证据编号 = {selected.evidenceIds.join('、') || '无'}</Box>
                    <Divider sx={{ my: 1 }} />
                    <Box sx={{ color: '#14644f', fontWeight: 800 }}>减排量 = {(selected.activity * selected.factor * (selected.unit === 'kWh' || selected.unit === 'L' ? 0.001 : 1)).toFixed(2)} tCO₂e</Box>
                  </Box><Stack direction="row" spacing={1} mt={1.5}><Button size="small" variant="outlined" onClick={openDraftDialog}>修订数据</Button><Button size="small" component={Link} href="/verify">去签署</Button></Stack></CardContent></Card>
                  <Card elevation={0} variant="outlined"><CardContent><Typography fontWeight={800} fontSize={14} mb={1.2}>核验发现项</Typography>{openFindings.slice(0, 3).map((finding) => <Box key={finding.id} sx={{ py: 1, borderTop: '1px solid #edf0ef' }}><Stack direction="row" spacing={1}><Alert severity={finding.status === '补证中' ? 'warning' : 'error'} sx={{ p: .2, '& .MuiAlert-icon': { mr: .3, fontSize: 17 } }} /><Box><Typography fontSize={12} fontWeight={700}>{finding.title}</Typography><Typography fontSize={10} color="text.secondary" mt={.3}>{finding.assignee} · {finding.due}</Typography></Box></Stack></Box>)}</CardContent></Card>
                </Stack>
              </Box>
            </>
          )}

          {view === 'verify' && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1fr) 380px' }, gap: 1.5 }}>
              <Stack spacing={1.5}>
                <Card elevation={0} variant="outlined">
                  <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1} sx={{ p: 1.6 }}>
                    <Box><Typography fontWeight={800} fontSize={14}>证据矩阵与抽样任务</Typography><Typography fontSize={11} color="text.secondary">已抽取 {store.sampledIds.length} 条记录 · 当前操作人 {store.actor}</Typography></Box>
                    <Stack direction="row" spacing={1}><Button variant="outlined" onClick={() => useCarbonStore.setState((state) => ({ sampledIds: state.records.filter((item) => Math.abs(item.anomaly) > 5).map((item) => item.id) }))}>按异常抽样</Button><Button variant="contained" onClick={store.signSampledFields}>批量签署我的字段</Button></Stack>
                  </Stack><Divider />
                  {store.records.map((record) => (
                    <Box key={record.id} onClick={() => store.selectRecord(record.id)} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '22px minmax(210px, 1.3fr) .8fr .8fr auto' }, alignItems: 'center', gap: 1.2, px: 1.6, py: 1.3, borderTop: '1px solid #edf0ef', cursor: 'pointer', bgcolor: selected.id === record.id ? '#eff7f3' : 'white' }}>
                      <input type="checkbox" checked={store.sampledIds.includes(record.id)} onChange={() => store.toggleSample(record.id)} onClick={(event) => event.stopPropagation()} aria-label={`抽样 ${record.id}`} />
                      <Box><Typography fontSize={12.5} fontWeight={700}>{record.source}</Typography><Typography fontSize={10} color="text.secondary">{record.id} · 证据 {record.evidenceIds.length} 份 · 基线 V{record.revision}</Typography></Box>
                      <Box><Typography variant="caption" color="text.secondary">字段签署</Typography><Typography fontSize={11}>{signedCount(record.id)} / {FIELD_ORDER.length} 已签</Typography></Box>
                      <Box><Typography variant="caption" color="text.secondary">状态</Typography><Box><Chip size="small" label={record.status} color={record.status === '已核验' ? 'success' : record.status === '需补证' ? 'warning' : 'default'} variant="outlined" /></Box></Box>
                      <Stack direction="row" spacing={.7} onClick={(event) => event.stopPropagation()}>
                        <Button size="small" variant="outlined" onClick={() => store.signMyFields(record.id)}>签我的字段</Button>
                      </Stack>
                    </Box>
                  ))}
                </Card>
                <SignoffCard record={selected} />
              </Stack>
              <Stack spacing={1.5}>
                <DraftsPanel />
                <ConflictsPanel />
                <Card elevation={0} variant="outlined"><CardContent><Typography fontWeight={800} fontSize={14} mb={1.3}>发现项闭环</Typography>{store.findings.map((finding) => <Box key={finding.id} sx={{ borderTop: '1px solid #edf0ef', py: 1.2 }}><Stack direction="row" justifyContent="space-between"><Typography fontSize={12} fontWeight={700}>{finding.title}</Typography><Chip size="small" label={finding.status} color={finding.status === '已关闭' ? 'success' : finding.status === '补证中' ? 'warning' : 'error'} /></Stack><Typography fontSize={10.5} color="text.secondary" mt={.5}>{finding.detail}</Typography><Stack direction="row" spacing={.7} mt={1}><Button size="small" disabled={finding.status === '已关闭'} onClick={() => store.requestEvidence(finding.id)}>发起补证</Button><Button size="small" disabled={finding.status === '已关闭'} onClick={() => store.closeFinding(finding.id)}>关闭</Button></Stack></Box>)}</CardContent></Card>
                <Alert severity="info">任何数据修订都会生成新版本与不可变快照，原始提交和计算链不会被覆盖。</Alert>
              </Stack>
            </Box>
          )}

          {view === 'issuance' && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 380px' }, gap: 1.5 }}>
              <Stack spacing={1.5}>
                <Card elevation={0} variant="outlined">
                  <CardContent>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
                      <Box>
                        <Typography fontWeight={800} fontSize={14}>签发前完整性检查</Typography>
                        <Typography fontSize={11} color="text.secondary">门禁结论绑定数据指纹 {epoch}，数据一变化即失效。</Typography>
                      </Box>
                      <Chip size="small" variant="outlined" color="primary" label={epoch} />
                    </Stack>
                    {checksStale && <Alert severity="warning" sx={{ mt: 1.2 }}>监测期数据已变化，此前门禁结论基于旧数据指纹，已失效，请按当前数据重新确认。</Alert>}
                    <Box mt={.5}>
                      {ISSUANCE_CHECK_ITEMS.map((item) => (
                        <Box key={item.id} component="label" sx={{ display: 'flex', gap: 1.3, alignItems: 'flex-start', borderTop: '1px solid #edf0ef', py: 1.5, cursor: 'pointer' }}>
                          <input type="checkbox" checked={Boolean(effectiveChecks[item.id])} onChange={() => store.toggleIssuanceCheck(item.id)} />
                          <Box><Typography fontSize={12.5} fontWeight={700}>{ISSUANCE_CHECK_LABELS[item.id]}</Typography><Typography fontSize={10.5} color="text.secondary" mt={.4}>{item.detail}</Typography></Box>
                        </Box>
                      ))}
                    </Box>
                  </CardContent>
                </Card>
                <Card elevation={0} variant="outlined">
                  <CardContent>
                    <Typography fontWeight={800} fontSize={14} mb={1}>签发阻塞项（{issuance.blockers.length}）</Typography>
                    {issuance.blockers.length === 0 && <Alert severity="success">无阻塞项，可提交签发准备。</Alert>}
                    {issuance.blockers.map((blocker) => <Alert key={blocker} severity="warning" sx={{ mb: .8 }}>{blocker}</Alert>)}
                  </CardContent>
                </Card>
              </Stack>
              <Stack spacing={1.5}>
                <Card elevation={0} variant="outlined"><CardContent><Typography fontWeight={800} fontSize={14}>签发就绪度</Typography><Stack direction="row" alignItems="baseline" spacing={1} mt={1}><Typography variant="h4" fontWeight={850}>{readiness}%</Typography><Typography fontSize={11} color="text.secondary">完成度</Typography></Stack><LinearProgress variant="determinate" value={readiness} sx={{ height: 7, borderRadius: 3, mt: 1 }} /><Typography fontSize={11} color="text.secondary" mt={1.2}>就绪度随监测期数据实时重算；当前减排量 {liveTotal.toFixed(2)} tCO₂e。</Typography></CardContent></Card>
                <Card elevation={0} variant="outlined">
                  <CardContent>
                    <Typography fontWeight={800} fontSize={14} mb={.5}>签发记录</Typography>
                    <Typography fontSize={11} color="text.secondary" mb={1}>监测期数据一变化，旧签发结果立即失效。</Typography>
                    {[...store.issuanceRuns].reverse().map((run) => {
                      const valid = isRunValid(run, epoch, pendingConflicts.length, activeDrafts.length);
                      return (
                        <Box key={run.id} sx={{ borderTop: '1px solid #edf0ef', py: 1.2 }}>
                          <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Typography fontSize={12} fontWeight={700}>{run.id} · {run.createdBy}</Typography>
                            <Chip size="small" color={valid ? 'success' : 'error'} variant={valid ? 'filled' : 'outlined'} label={valid ? '有效' : '已失效'} />
                          </Stack>
                          <Typography fontSize={10.5} color="text.secondary" mt={.4}>{new Date(run.createdAt).toLocaleString('zh-CN')} · 指纹 {run.epoch}{run.epoch !== epoch ? `（当前 ${epoch}）` : ''}</Typography>
                          <Typography fontSize={11} mt={.3}>减排量 {run.totalReduction.toFixed(2)} tCO₂e{!valid && run.totalReduction !== liveTotal ? ` → 重算 ${liveTotal.toFixed(2)} tCO₂e` : ''}</Typography>
                        </Box>
                      );
                    })}
                  </CardContent>
                </Card>
                <Alert severity={issuance.ready ? 'success' : 'warning'}>{issuance.ready ? '全部门禁已完成，可提交签发准备。' : '存在阻塞项，解决后方可提交签发准备。'}</Alert>
              </Stack>
            </Box>
          )}
        </Box>
      </Box>

      <Tooltip title="核验记录会写入审计链"><Button sx={{ position: 'fixed', bottom: 18, right: 18, zIndex: 5 }} variant="contained" size="small" startIcon={<FactCheckOutlined />}>操作均留痕</Button></Tooltip>
      {draftOpen && (
        <Box sx={{ position: 'fixed', inset: 0, zIndex: 60, bgcolor: 'rgba(15,25,22,.4)', display: 'grid', placeItems: 'center', p: 2 }} onMouseDown={() => setDraftOpen(false)}>
          <Card sx={{ width: 'min(560px, 100%)' }} onMouseDown={(event) => event.stopPropagation()}><CardContent sx={{ p: 2.2 }}>
            <Typography variant="h6" fontWeight={800}>修订数据（生成草稿）</Typography>
            <Typography variant="body2" color="text.secondary" mt={.5}>
              {selected.id} 当前基线 V{selected.revision}。草稿携带基线版本提交：提交时若基线已过期，未冲突字段自动合并，冲突字段留待裁决并阻塞签发；提交失败可恢复重试，重试不产生新版本。
            </Typography>
            <TextField fullWidth size="small" label={`活动数据 / ${selected.unit}`} value={draftActivity} onChange={(event) => setDraftActivity(event.target.value)} margin="normal" />
            <TextField fullWidth size="small" label={`排放因子 / ${selected.factorUnit}`} value={draftFactor} onChange={(event) => setDraftFactor(event.target.value)} margin="normal" />
            <TextField fullWidth size="small" label="证据编号（顿号或逗号分隔）" value={draftEvidence} onChange={(event) => setDraftEvidence(event.target.value)} margin="normal" />
            <TextField fullWidth size="small" label="修订原因" multiline rows={3} value={draftReason} onChange={(event) => setDraftReason(event.target.value)} margin="normal" />
            {!draftReason.trim() && <Alert severity="warning">必须填写修订原因，原因将随修订链永久保留。</Alert>}
            <Stack direction="row" spacing={1} justifyContent="flex-end" mt={2}>
              <Button onClick={() => setDraftOpen(false)}>取消</Button>
              <Button variant="outlined" disabled={!draftReason.trim()} onClick={() => submitDraftDialog(false)}>存草稿</Button>
              <Button variant="contained" disabled={!draftReason.trim()} onClick={() => submitDraftDialog(true)}>提交</Button>
            </Stack>
          </CardContent></Card>
        </Box>
      )}
    </Box>
  );
}

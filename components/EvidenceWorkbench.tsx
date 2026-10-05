'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AppBar,
  Avatar,
  Box,
  Button,
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
  MenuOutlined,
  NotificationsNoneOutlined,
  ScienceOutlined,
  TaskAltOutlined
} from '@mui/icons-material';
import { fetchEvidence } from '@/lib/api';
import { useCarbonStore, type Role } from '@/lib/store';
import { getCurrentBaseline, getValidSignoff, getStaleSignoffs } from '@/lib/domain';
import RecordDetail from './workbench/RecordDetail';
import VerifyMatrix from './workbench/VerifyMatrix';
import IssuancePanel from './workbench/IssuancePanel';

const drawerWidth = 232;

type View = 'overview' | 'verify' | 'issuance';

export default function EvidenceWorkbench({ initialView }: { initialView: View }) {
  const [view] = useState<View>(initialView);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [recordFilter, setRecordFilter] = useState('全部');
  const { data, isLoading } = useQuery({ queryKey: ['carbon-api'], queryFn: fetchEvidence });
  const store = useCarbonStore();
  const selected = store.records.find((record) => record.id === store.selectedRecordId) ?? store.records[0];
  const visibleRecords = useMemo(
    () => (recordFilter === '全部' ? store.records : store.records.filter((record) => record.status === recordFilter)),
    [recordFilter, store.records]
  );
  const openFindings = store.findings.filter((item) => item.status !== '已关闭');
  const openConflicts = store.adjudicationItems.filter((a) => a.status === 'open');
  const drafts = store.drafts;

  // 签发就绪度：所有记录均有有效签发，且无开放冲突 / 发现项 / 草稿
  const issuanceReady = useMemo(() => {
    const allSigned = store.records.every((r) => getValidSignoff(r) !== null);
    return allSigned && openConflicts.length === 0 && openFindings.length === 0 && drafts.length === 0;
  }, [store.records, openConflicts.length, openFindings.length, drafts.length]);

  const nav = [
    { id: 'overview', label: '监测期总览', href: '/', icon: DashboardOutlined },
    { id: 'verify', label: '证据与抽样核验', href: '/verify', icon: FindInPageOutlined },
    { id: 'issuance', label: '签发准备', href: '/issuance', icon: AssessmentOutlined }
  ];

  const navDrawer = (
    <Box sx={{ width: drawerWidth, bgcolor: '#f8faf9', height: '100%' }}>
      <Box sx={{ p: 2.2, pt: 3 }}>
        <Typography variant="overline" color="text.secondary">当前项目</Typography>
        <Typography fontWeight={800} fontSize={13} mt={0.5}>{data?.project.name ?? '临港工业园区能效提升项目'}</Typography>
        <Typography variant="caption" color="text.secondary">{data?.project.id ?? 'CN-ER-2026-041'}</Typography>
      </Box>
      <Divider />
      <List sx={{ px: 1, py: 1.2 }}>
        {nav.map(({ id, label, href, icon: Icon }) => (
          <ListItemButton key={id} component={Link} href={href} selected={view === id} sx={{ borderRadius: 1, mb: 0.4, '&.Mui-selected': { bgcolor: '#e4f1ec', color: '#12664f' } }}>
            <ListItemIcon sx={{ minWidth: 36, color: 'inherit' }}><Icon fontSize="small" /></ListItemIcon>
            <ListItemText primary={label} primaryTypographyProps={{ fontSize: 13, fontWeight: view === id ? 750 : 500 }} />
          </ListItemButton>
        ))}
      </List>
      <Box sx={{ p: 2, mt: 2 }}>
        <Box sx={{ p: 1.3, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'white' }}>
          <Stack direction="row" alignItems="center" spacing={1} mb={1}><ScienceOutlined color="primary" fontSize="small" /><Typography fontSize={12} fontWeight={750}>核验状态</Typography></Stack>
          <LinearProgress variant="determinate" value={78} sx={{ height: 5, borderRadius: 2 }} />
          <Typography variant="caption" color="text.secondary" display="block" mt={1}>78% 证据已完成初审</Typography>
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
          <Chip size="small" label={`${openConflicts.length} 项冲突待裁决`} sx={{ color: openConflicts.length > 0 ? '#ffdda7' : '#a9c5bc', borderColor: openConflicts.length > 0 ? '#a87935' : '#3a5a50', bgcolor: 'rgba(255,255,255,.05)' }} variant="outlined" />
          <Chip size="small" label={`${drafts.length} 份草稿待恢复`} sx={{ color: drafts.length > 0 ? '#ffdda7' : '#a9c5bc', borderColor: drafts.length > 0 ? '#a87935' : '#3a5a50', bgcolor: 'rgba(255,255,255,.05)' }} variant="outlined" />
          <Tooltip title="切换核验员 / 复核人角色"><Select size="small" value={store.currentRole} onChange={(e) => store.setRole(e.target.value as Role)} sx={{ color: 'white', '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,.3)' }, '& .MuiSvgIcon-root': { color: 'white' } }}>
            <MenuItem value="verifier">核验员</MenuItem>
            <MenuItem value="reviewer">复核人</MenuItem>
          </Select></Tooltip>
          <IconButton color="inherit"><NotificationsNoneOutlined /></IconButton>
          <Avatar sx={{ width: 30, height: 30, bgcolor: '#e1a45d', fontSize: 12 }}>沈</Avatar>
        </Toolbar>
      </AppBar>
      <Drawer variant="permanent" sx={{ width: drawerWidth, flexShrink: 0, display: { xs: 'none', md: 'block' }, '& .MuiDrawer-paper': { width: drawerWidth, pt: '62px', boxSizing: 'border-box', borderRightColor: '#dce4e0' } }}>{navDrawer}</Drawer>
      <Drawer variant="temporary" open={mobileOpen} onClose={() => setMobileOpen(false)} ModalProps={{ keepMounted: true }} sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { width: drawerWidth, pt: '62px' } }}>{navDrawer}</Drawer>

      <Box component="main" sx={{ flexGrow: 1, minWidth: 0, bgcolor: '#f2f5f3', pt: '62px' }}>
        <Box sx={{ p: { xs: 1.5, md: 3 }, maxWidth: 1640, mx: 'auto' }}>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2} mb={2.4}>
            <Box>
              <Typography variant="overline" color="text.secondary" fontWeight={750}>CN-ER-2026-041 / {data?.summary.period ?? '第三监测期'}</Typography>
              <Typography variant="h5" fontWeight={850} mt={0.3}>{view === 'overview' ? '监测期总览' : view === 'verify' ? '证据与抽样核验' : '签发准备'}</Typography>
              <Typography variant="body2" color="text.secondary" mt={0.5}>{view === 'overview' ? '基线版本、不可变计算快照与修订链。' : view === 'verify' ? '按职责签署字段，冲突留待裁决，草稿可恢复。' : '基于基线哈希的签发门禁，数据一变即失效。'}</Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" startIcon={<CloudUploadOutlined />}>导入监测数据</Button>
              <Button variant="contained" startIcon={<TaskAltOutlined />} disabled={view !== 'issuance' || !issuanceReady}>提交签发准备</Button>
            </Stack>
          </Stack>
          {isLoading && <LinearProgress />}

          {view === 'overview' && (
            <>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 1.4, mb: 2 }}>
                {[
                  { label: '基线版本', value: `${selected.baselines.length}`, unit: '版', note: `当前 ${getCurrentBaseline(selected).id}` },
                  { label: '证据完整度', value: `${data?.summary.evidenceRate ?? 92}%`, unit: '', note: `${selected.evidenceCount} 份证据` },
                  { label: '开放冲突', value: `${openConflicts.length}`, unit: '项', note: openConflicts.length > 0 ? '阻塞签发' : '无阻塞' },
                  { label: '抽样任务', value: `${store.sampledIds.length} / 18`, unit: '', note: '完成率 67%' }
                ].map((item) => (
                  <Box key={item.label} sx={{ p: 1.8, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'white' }}>
                    <Typography variant="caption" color="text.secondary">{item.label}</Typography>
                    <Stack direction="row" alignItems="baseline" spacing={0.6} mt={0.5}>
                      <Typography variant="h5" fontWeight={850}>{item.value}</Typography>
                      <Typography fontSize={12} color="text.secondary">{item.unit}</Typography>
                    </Stack>
                    <Typography fontSize={11} color="text.secondary" mt={0.7}>{item.note}</Typography>
                  </Box>
                ))}
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1.55fr) minmax(300px, .7fr)' }, gap: 1.5 }}>
                <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'white' }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ p: 1.6 }}>
                    <Box><Typography fontWeight={800} fontSize={14}>活动数据与基线版本</Typography><Typography fontSize={11} color="text.secondary">选择记录查看不可变计算快照与修订链</Typography></Box>
                    <Select size="small" value={recordFilter} onChange={(e) => setRecordFilter(e.target.value)}>
                      <MenuItem value="全部">全部</MenuItem>
                      <MenuItem value="待核验">待核验</MenuItem>
                      <MenuItem value="需补证">需补证</MenuItem>
                      <MenuItem value="已核验">已核验</MenuItem>
                    </Select>
                  </Stack>
                  <Divider />
                  <Box sx={{ overflowX: 'auto' }}>
                    <Box sx={{ minWidth: 840 }}>
                      <Box sx={{ display: 'grid', gridTemplateColumns: '1.7fr .9fr .8fr 1fr .7fr .7fr', gap: 1, px: 1.7, py: 1, bgcolor: '#f7f9f8', color: 'text.secondary', fontSize: 11, fontWeight: 750 }}>
                        <span>数据来源</span><span>活动数据</span><span>排放因子</span><span>基线版本</span><span>证据</span><span>状态</span>
                      </Box>
                      {visibleRecords.map((record) => {
                        const baseline = getCurrentBaseline(record);
                        const signoff = getValidSignoff(record);
                        const stale = getStaleSignoffs(record).length;
                        return (
                          <Box key={record.id} role="button" tabIndex={0} onClick={() => store.selectRecord(record.id)} sx={{ display: 'grid', gridTemplateColumns: '1.7fr .9fr .8fr 1fr .7fr .7fr', gap: 1, px: 1.7, py: 1.25, borderTop: '1px solid #e8ecea', cursor: 'pointer', bgcolor: selected.id === record.id ? '#eff7f3' : 'white', '&:hover': { bgcolor: '#f6faf8' } }}>
                            <Box>
                              <Typography fontSize={12.5} fontWeight={700}>{record.source}</Typography>
                              <Typography fontSize={10} color="text.secondary">{record.id} · {record.owner} · {baseline.id}</Typography>
                            </Box>
                            <Box>
                              <Typography fontSize={12}>{record.activity.toLocaleString()} {record.unit}</Typography>
                              <Typography fontSize={10} color={record.anomaly > 5 ? 'secondary.main' : 'text.secondary'}>异常 {record.anomaly > 0 ? '+' : ''}{record.anomaly}%</Typography>
                            </Box>
                            <Typography fontSize={12}>{record.factor} <small>{record.factorUnit}</small></Typography>
                            <Box>
                              <Chip size="small" label={baseline.id} variant="outlined" sx={{ height: 20, fontSize: 10 }} />
                              {signoff && <Typography fontSize={9} color="success.main" mt={0.3}>已签发</Typography>}
                              {stale > 0 && <Typography fontSize={9} color="warning.main" mt={0.3}>{stale} 份签发已失效</Typography>}
                            </Box>
                            <Typography fontSize={12}>{record.evidenceCount} 项</Typography>
                            <Chip size="small" label={record.status} color={record.status === '已核验' ? 'success' : record.status === '需补证' ? 'warning' : 'default'} variant={record.status === '已核验' ? 'filled' : 'outlined'} />
                          </Box>
                        );
                      })}
                    </Box>
                  </Box>
                </Box>
                <RecordDetail record={selected} />
              </Box>
            </>
          )}

          {view === 'verify' && <VerifyMatrix />}
          {view === 'issuance' && <IssuancePanel />}
        </Box>
      </Box>

      <Tooltip title="核验记录会写入审计链"><Button sx={{ position: 'fixed', bottom: 18, right: 18, zIndex: 5 }} variant="contained" size="small" startIcon={<FactCheckOutlined />}>操作均留痕</Button></Tooltip>
    </Box>
  );
}

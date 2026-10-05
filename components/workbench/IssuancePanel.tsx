'use client';

import { useMemo } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  LinearProgress,
  Stack,
  Typography
} from '@mui/material';
import {
  CheckCircleOutlined,
  ErrorOutlineOutlined,
  CalculateOutlined,
  VerifiedUserOutlined
} from '@mui/icons-material';
import { useCarbonStore } from '@/lib/store';
import {
  type CarbonRecord,
  getCurrentBaseline,
  getValidSignoff,
  getStaleSignoffs,
  checkCompletion,
  hashBaseline
} from '@/lib/domain';

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function RecordSignoffRow({ record }: { record: CarbonRecord }) {
  const store = useCarbonStore();
  const current = getCurrentBaseline(record);
  const signoff = getValidSignoff(record);
  const stale = getStaleSignoffs(record);
  const openConflicts = store.adjudicationItems.filter((a) => a.recordId === record.id && a.status === 'open').length;
  const check = checkCompletion(record, openConflicts);
  const canComplete = store.currentRole === 'reviewer' && check.ok;
  const checkIcon = <CheckCircleOutlined />;
  const errorIcon = <ErrorOutlineOutlined />;

  return (
    <Box sx={{ py: 1.5, borderTop: '1px solid #edf0ef' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Box>
          <Typography fontSize={12.5} fontWeight={700}>{record.source}</Typography>
          <Typography fontSize={10} color="text.secondary">{record.id} · 当前基线 {current.id} · 哈希 {hashBaseline(current)}</Typography>
        </Box>
        {signoff ? (
          <Chip size="small" icon={<CheckCircleOutlined />} label="已签发" color="success" variant="filled" />
        ) : (
          <Chip size="small" icon={<ErrorOutlineOutlined />} label="未签发" color="default" variant="outlined" />
        )}
      </Stack>

      {signoff && (
        <Box sx={{ mt: 1, p: 1, bgcolor: '#f1f8f4', borderRadius: 1, border: '1px solid #c8e0d2' }}>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <VerifiedUserOutlined sx={{ fontSize: 14, color: 'success.main' }} />
            <Typography fontSize={11} fontWeight={700} color="success.main">签发有效</Typography>
          </Stack>
          <Typography fontSize={10} color="text.secondary" mt={0.3}>签发人 {signoff.signedBy} · {formatTime(signoff.signedAt)}</Typography>
          <Typography fontSize={10} color="text.secondary">基线哈希 {signoff.baselineHash} 与当前基线一致</Typography>
        </Box>
      )}

      {stale.length > 0 && (
        <Box sx={{ mt: 1, p: 1, bgcolor: '#fdf3f3', borderRadius: 1, border: '1px solid #f0c8c8' }}>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <ErrorOutlineOutlined sx={{ fontSize: 14, color: 'error.main' }} />
            <Typography fontSize={11} fontWeight={700} color="error.main">{stale.length} 份旧签发已失效</Typography>
          </Stack>
          {stale.map((s) => (
            <Typography key={s.id} fontSize={10} color="text.secondary" mt={0.3}>
              {s.baselineId} · {s.signedBy} · {formatTime(s.signedAt)} · 哈希 {s.baselineHash}
            </Typography>
          ))}
          <Typography fontSize={10} color="warning.main" mt={0.5} fontWeight={700}>监测期数据已变更，旧签发结果立即失效，需重算后重新签发。</Typography>
        </Box>
      )}

      {!check.ok && (
        <Alert severity="warning" sx={{ mt: 1, py: 0.3 }}>
          <Typography fontSize={10.5}>
            未满足签发条件：{check.missingFields.length > 0 ? `待签署 ${check.missingFields.join('、')}` : ''}{check.openConflicts > 0 ? `；${check.openConflicts} 项冲突待裁决` : ''}
          </Typography>
        </Alert>
      )}

      <Stack direction="row" spacing={0.7} mt={1}>
        <Button size="small" variant="contained" color="success" disabled={!canComplete} onClick={() => store.completeRecord(record.id)}>
          {signoff ? '重新签发' : '完成签发'}
        </Button>
        <Button size="small" startIcon={<CalculateOutlined />} onClick={() => { /* 重算：基于当前基线快照刷新签发状态 */ store.completeRecord(record.id); }}>
          重算并刷新
        </Button>
      </Stack>
    </Box>
  );
}

export default function IssuancePanel() {
  const store = useCarbonStore();
  const openConflicts = store.adjudicationItems.filter((a) => a.status === 'open');
  const drafts = store.drafts;

  const stats = useMemo(() => {
    const total = store.records.length;
    const signed = store.records.filter((r) => getValidSignoff(r) !== null).length;
    const stale = store.records.reduce((n, r) => n + getStaleSignoffs(r).length, 0);
    return { total, signed, stale };
  }, [store.records]);

  const ready = stats.signed === stats.total && openConflicts.length === 0 && drafts.length === 0;

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 380px' }, gap: 1.5 }}>
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'white', p: 1.8 }}>
        <Typography fontWeight={800} fontSize={14}>签发准备 · 基线哈希门禁</Typography>
        <Typography fontSize={11} color="text.secondary" mb={1}>签发结果绑定基线哈希。监测期数据一变化，旧签发立即失效并重算。</Typography>
        <Divider />
        {store.records.map((record) => (
          <RecordSignoffRow key={record.id} record={record} />
        ))}
      </Box>

      <Stack spacing={1.5}>
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'white', p: 1.8 }}>
          <Typography fontWeight={800} fontSize={14}>签发就绪度</Typography>
          <Stack direction="row" alignItems="baseline" spacing={1} mt={1}>
            <Typography variant="h4" fontWeight={850}>{Math.round((stats.signed / stats.total) * 100)}</Typography>
            <Typography fontSize={11} color="text.secondary">%</Typography>
          </Stack>
          <LinearProgress variant="determinate" value={(stats.signed / stats.total) * 100} />
          <Typography fontSize={11} color="text.secondary" mt={1.2}>已签发 {stats.signed} / {stats.total} 条记录。</Typography>
          {stats.stale > 0 && <Typography fontSize={11} color="error.main" mt={0.5}>{stats.stale} 份旧签发已失效，需重算。</Typography>}
        </Box>

        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'white', p: 1.8 }}>
          <Typography fontWeight={800} fontSize={14} mb={1}>门禁检查</Typography>
          {[
            { ok: stats.signed === stats.total, title: '全部记录已签发', detail: '每条记录均有绑定基线哈希的有效签发。' },
            { ok: openConflicts.length === 0, title: '无开放冲突', detail: '冲突字段已裁决，未挡住签发。' },
            { ok: drafts.length === 0, title: '无待恢复草稿', detail: '失败提交已重试或放弃。' },
            { ok: stats.stale === 0, title: '无失效签发', detail: '数据变更后旧签发已重算刷新。' }
          ].map((item) => (
            <Stack key={item.title} direction="row" spacing={1.2} alignItems="flex-start" sx={{ py: 1, borderTop: '1px solid #edf0ef' }}>
              {item.ok ? <CheckCircleOutlined sx={{ fontSize: 18, color: 'success.main', mt: 0.2 }} /> : <ErrorOutlineOutlined sx={{ fontSize: 18, color: 'warning.main', mt: 0.2 }} />}
              <Box>
                <Typography fontSize={12.5} fontWeight={700}>{item.title}</Typography>
                <Typography fontSize={10.5} color="text.secondary" mt={0.2}>{item.detail}</Typography>
              </Box>
            </Stack>
          ))}
        </Box>

        <Alert severity={ready ? 'success' : 'warning'}>
          {ready ? '全部门禁已完成，可提交签发准备。' : '完成上述门禁后可提交签发准备。'}
        </Alert>
      </Stack>
    </Box>
  );
}

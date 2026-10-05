'use client';

import { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Collapse,
  Divider,
  Stack,
  Typography,
  Alert
} from '@mui/material';
import {
  ExpandMoreOutlined,
  HistoryOutlined,
  LockOutlined
} from '@mui/icons-material';
import {
  type CarbonRecord,
  type BaselineVersion,
  FIELD_LABELS,
  getCurrentBaseline,
  getValidSignoff,
  getStaleSignoffs,
  getCurrentSignatures,
  getStaleSignatures
} from '@/lib/domain';

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function SnapshotBlock({ baseline }: { baseline: BaselineVersion }) {
  const snap = baseline.snapshot;
  const lockIcon = <LockOutlined sx={{ fontSize: 12 }} />;
  return (
    <Box sx={{ p: 1.3, bgcolor: '#f4f7f5', borderRadius: 1, fontSize: 11, fontFamily: 'monospace' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.6}>
        <Chip size="small" icon={lockIcon} label={`不可变快照 · ${baseline.id}`} sx={{ height: 20, fontSize: 10, bgcolor: '#e4f1ec' }} />
        <Typography fontSize={9} color="text.secondary">inputHash {snap.inputHash}</Typography>
      </Stack>
      <Box>活动数据 = {snap.activity.toLocaleString()} {snap.unit}</Box>
      <Box mt={0.4}>排放因子 = {snap.factor} {snap.factorUnit}</Box>
      <Box mt={0.4}>换算系数 = {snap.conversionFactor}</Box>
      <Divider sx={{ my: 0.8 }} />
      <Box sx={{ color: '#14644f', fontWeight: 800 }}>减排量 = {snap.reduction.toFixed(4)} tCO₂e</Box>
      <Typography fontSize={9} color="text.secondary" mt={0.5}>{snap.formula}</Typography>
      <Typography fontSize={9} color="text.secondary" mt={0.3}>计算于 {formatTime(snap.computedAt)}</Typography>
    </Box>
  );
}

export default function RecordDetail({ record }: { record: CarbonRecord }) {
  const [expandedBaseline, setExpandedBaseline] = useState<string | null>(getCurrentBaseline(record).id);
  const historyIcon = <HistoryOutlined sx={{ fontSize: 12 }} />;
  const current = getCurrentBaseline(record);
  const signoff = getValidSignoff(record);
  const staleSignoffs = getStaleSignoffs(record);
  const currentSigs = getCurrentSignatures(record);
  const staleSigs = getStaleSignatures(record);

  return (
    <Stack spacing={1.5}>
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'white', p: 1.8 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography fontWeight={800} fontSize={14}>计算链与不可变快照</Typography>
          <Chip size="small" label={record.id} />
        </Stack>
        <Box sx={{ mt: 1.5 }}>
          <SnapshotBlock baseline={current} />
        </Box>
        <Stack direction="row" spacing={1} mt={1.5}>
          <Button size="small" variant="outlined">修订数据</Button>
          <Button size="small">查看证据</Button>
        </Stack>
      </Box>

      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'white', p: 1.8 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
          <Typography fontWeight={800} fontSize={14}>基线版本与修订链</Typography>
          <Chip size="small" icon={historyIcon} label={`${record.baselines.length} 版`} sx={{ height: 20, fontSize: 10 }} />
        </Stack>
        {record.baselines.slice().reverse().map((baseline) => {
          const isCurrent = baseline.id === current.id;
          const expanded = expandedBaseline === baseline.id;
          return (
            <Box key={baseline.id} sx={{ borderTop: '1px solid #edf0ef', py: 1 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" onClick={() => setExpandedBaseline(expanded ? null : baseline.id)} sx={{ cursor: 'pointer' }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip size="small" label={baseline.id} color={isCurrent ? 'primary' : 'default'} variant={isCurrent ? 'filled' : 'outlined'} sx={{ height: 20, fontSize: 10 }} />
                  <Typography fontSize={11.5} fontWeight={700}>{baseline.reason}</Typography>
                </Stack>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography fontSize={11} color="text.secondary">{baseline.snapshot.reduction.toFixed(2)} tCO₂e</Typography>
                  <ExpandMoreOutlined sx={{ fontSize: 16, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
                </Stack>
              </Stack>
              <Typography fontSize={10} color="text.secondary" mt={0.3}>{formatTime(baseline.createdAt)} · {baseline.createdBy}</Typography>
              <Collapse in={expanded}>
                <Box sx={{ mt: 1 }}>
                  {baseline.revisions.length === 0 ? (
                    <Typography fontSize={10.5} color="text.secondary" sx={{ fontStyle: 'italic' }}>初始基线，无修订条目。</Typography>
                  ) : (
                    baseline.revisions.map((rev) => (
                      <Box key={rev.id} sx={{ mt: 0.8, p: 1, bgcolor: '#fafbfb', border: '1px solid #eef1f0', borderRadius: 1 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Chip size="small" label={FIELD_LABELS[rev.field]} sx={{ height: 18, fontSize: 9 }} />
                          <Typography fontSize={9} color="text.secondary">{rev.id}</Typography>
                        </Stack>
                        <Typography fontSize={11} mt={0.5}>
                          原始值 <Box component="span" sx={{ fontFamily: 'monospace', color: 'secondary.main' }}>{String(rev.previousValue)}</Box>
                          {' → '}
                          <Box component="span" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{String(rev.newValue)}</Box>
                        </Typography>
                        <Typography fontSize={10} color="text.secondary" mt={0.3}>因子 {rev.factor} {rev.factorUnit} · 证据 {rev.evidenceNo}</Typography>
                        <Typography fontSize={10} color="text.secondary" mt={0.3}>原因：{rev.reason}</Typography>
                        <Typography fontSize={9} color="text.secondary" mt={0.2}>{rev.actor} · {formatTime(rev.timestamp)}</Typography>
                      </Box>
                    ))
                  )}
                </Box>
              </Collapse>
            </Box>
          );
        })}
      </Box>

      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'white', p: 1.8 }}>
        <Typography fontWeight={800} fontSize={14} mb={1}>签署与签发状态</Typography>
        {signoff ? (
          <Alert severity="success" sx={{ mb: 1 }}>已签发 · {signoff.signedBy} · {formatTime(signoff.signedAt)} · 基线哈希 {signoff.baselineHash}</Alert>
        ) : (
          <Alert severity="warning" sx={{ mb: 1 }}>当前基线尚未签发</Alert>
        )}
        {staleSignoffs.length > 0 && (
          <Alert severity="error" sx={{ mb: 1 }}>{staleSignoffs.length} 份旧基线签发已失效（数据已变更，需重算后重新签发）</Alert>
        )}
        <Typography fontSize={11} fontWeight={700} mt={1}>当前基线签署</Typography>
        {currentSigs.length === 0 ? (
          <Typography fontSize={10.5} color="text.secondary" sx={{ fontStyle: 'italic' }}>暂无签署</Typography>
        ) : (
          currentSigs.map((sig) => (
            <Stack key={sig.field} direction="row" justifyContent="space-between" sx={{ py: 0.5, borderTop: '1px solid #edf0ef' }}>
              <Typography fontSize={11}>{FIELD_LABELS[sig.field]}</Typography>
              <Typography fontSize={10.5} color="text.secondary">{sig.verifier} · {formatTime(sig.signedAt)}</Typography>
            </Stack>
          ))
        )}
        {staleSigs.length > 0 && (
          <>
            <Typography fontSize={11} fontWeight={700} mt={1} color="warning.main">过期签署（基线已变）</Typography>
            {staleSigs.map((sig) => (
              <Stack key={sig.field} direction="row" justifyContent="space-between" sx={{ py: 0.5, borderTop: '1px solid #edf0ef', opacity: 0.6 }}>
                <Typography fontSize={11}>{FIELD_LABELS[sig.field]}</Typography>
                <Typography fontSize={10.5} color="text.secondary">{sig.verifier} · {sig.baselineId}</Typography>
              </Stack>
            ))}
          </>
        )}
      </Box>
    </Stack>
  );
}

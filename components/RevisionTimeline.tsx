'use client';

import { Box, Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import { FIELD_LABELS, FIELD_ORDER, formatFieldValue, type VersionedRecord } from '@/lib/engine';

const KIND_COLOR: Record<string, 'default' | 'primary' | 'secondary' | 'warning'> = {
  初始导入: 'default',
  直接修订: 'primary',
  草稿合并: 'secondary',
  裁决应用: 'warning'
};

/** 修订链与不可变计算快照：每次修订保留原始值、因子、证据编号与原因 */
export default function RevisionTimeline({ record }: { record: VersionedRecord }) {
  const revisions = [...record.history].reverse();
  return (
    <Card elevation={0} variant="outlined">
      <CardContent sx={{ p: 1.6, '&:last-child': { pb: 1.6 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
          <Box>
            <Typography fontWeight={800} fontSize={14}>修订链与不可变计算快照</Typography>
            <Typography fontSize={11} color="text.secondary">{record.id} · 每次修订保留原始值、因子、证据编号与原因，快照生成后不可改</Typography>
          </Box>
          <Chip size="small" color="primary" variant="outlined" label={`当前基线 V${record.revision}`} />
        </Stack>
        <Box mt={.5}>
          {revisions.map((revision) => (
            <Box key={revision.revision} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '86px 1fr' }, gap: 1.2, py: 1.2, borderTop: '1px solid #edf0ef' }}>
              <Stack spacing={.5} alignItems="flex-start">
                <Chip size="small" label={`V${revision.revision}`} color={revision.revision === record.revision ? 'primary' : 'default'} variant={revision.revision === record.revision ? 'filled' : 'outlined'} />
                <Chip size="small" variant="outlined" color={KIND_COLOR[revision.kind] ?? 'default'} label={revision.kind} />
              </Stack>
              <Box minWidth={0}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Typography fontSize={12} fontWeight={700}>{revision.author}</Typography>
                  <Typography fontSize={10} color="text.secondary">{new Date(revision.at).toLocaleString('zh-CN')}</Typography>
                  {revision.draftId && <Chip size="small" variant="outlined" label={`草稿 ${revision.draftId}`} />}
                </Stack>
                <Typography fontSize={11} color="text.secondary" mt={.3}>{revision.reason}</Typography>
                {revision.kind === '初始导入' ? (
                  <Typography fontSize={11} mt={.3}>· 初始基线：{formatFieldValue('activity', revision.snapshot.activity)} {revision.snapshot.unit} · 因子 {revision.snapshot.factor} {revision.snapshot.factorUnit}</Typography>
                ) : (
                  FIELD_ORDER.filter((field) => revision.changes[field]).map((field) => {
                    const change = revision.changes[field]!;
                    return (
                      <Typography key={field} fontSize={11} mt={.3}>
                        · {FIELD_LABELS[field]}：{formatFieldValue(field, change.from)} → <b>{formatFieldValue(field, change.to)}</b>
                      </Typography>
                    );
                  })
                )}
                <Stack direction="row" spacing={.5} mt={.6} flexWrap="wrap" useFlexGap>
                  {revision.evidenceIds.map((id) => <Chip key={id} size="small" variant="outlined" label={id} />)}
                </Stack>
                <Box sx={{ mt: .8, p: 1, bgcolor: '#f4f7f5', borderRadius: 1, fontFamily: 'monospace', fontSize: 10.5 }}>
                  <Box>快照 V{revision.snapshot.revision} · {revision.snapshot.formula}</Box>
                  <Box sx={{ color: '#14644f', fontWeight: 800 }}>减排量 = {revision.snapshot.reduction.toFixed(2)} tCO₂e · 证据 {revision.snapshot.evidenceIds.join('、') || '无'}</Box>
                </Box>
              </Box>
            </Box>
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}

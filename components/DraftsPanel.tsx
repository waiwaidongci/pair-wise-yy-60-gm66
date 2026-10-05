'use client';

import { Alert, Box, Button, Card, CardContent, Chip, Stack, Switch, Typography } from '@mui/material';
import { ReplayOutlined, SendOutlined, SyncProblemOutlined } from '@mui/icons-material';
import { FIELD_LABELS, FIELD_ORDER, formatFieldValue, type Draft } from '@/lib/engine';
import { useCarbonStore } from '@/lib/store';

const STATE_STYLE: Record<Draft['state'], { color: 'default' | 'error' | 'success' | 'warning'; label: string }> = {
  待提交: { color: 'default', label: '待提交' },
  提交失败: { color: 'error', label: '提交失败' },
  已合并: { color: 'success', label: '已合并' },
  '部分合并-待裁决': { color: 'warning', label: '部分合并·待裁决' }
};

/** 修订草稿箱：携带基线版本提交；失败可恢复重试且重试不产生新版本 */
export default function DraftsPanel() {
  const drafts = useCarbonStore((state) => state.drafts);
  const records = useCarbonStore((state) => state.records);
  const simulateFailure = useCarbonStore((state) => state.simulateFailure);
  const toggleSimulateFailure = useCarbonStore((state) => state.toggleSimulateFailure);
  const submitDraft = useCarbonStore((state) => state.submitDraft);
  const simulateOtherSubmit = useCarbonStore((state) => state.simulateOtherSubmit);
  const selectedRecordId = useCarbonStore((state) => state.selectedRecordId);
  const ordered = [...drafts].reverse();

  return (
    <Card elevation={0} variant="outlined">
      <CardContent sx={{ p: 1.6, '&:last-child': { pb: 1.6 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
          <Box>
            <Typography fontWeight={800} fontSize={14}>修订草稿箱</Typography>
            <Typography fontSize={11} color="text.secondary">草稿携带基线版本提交；失败可恢复重试，重试不产生新版本</Typography>
          </Box>
          <Stack direction="row" alignItems="center" spacing={.5}>
            <Typography fontSize={11} color={simulateFailure ? 'error' : 'text.secondary'}>模拟提交故障</Typography>
            <Switch size="small" checked={simulateFailure} onChange={toggleSimulateFailure} />
          </Stack>
        </Stack>
        <Button size="small" variant="outlined" startIcon={<SyncProblemOutlined />} sx={{ mt: 1 }} onClick={() => simulateOtherSubmit(selectedRecordId)}>
          模拟他人抢先提交（{selectedRecordId} 因子修订）
        </Button>
        {ordered.length === 0 && <Typography fontSize={11} color="text.secondary" mt={1.2}>暂无草稿。在总览页「修订数据」可创建修订草稿。</Typography>}
        {ordered.map((draft) => {
          const record = records.find((item) => item.id === draft.recordId);
          const stale = record ? draft.baseRevision < record.revision : false;
          const style = STATE_STYLE[draft.state];
          return (
            <Box key={draft.draftId} sx={{ borderTop: '1px solid #edf0ef', mt: 1, pt: 1.1 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                <Typography fontSize={12} fontWeight={700}>{draft.draftId} · {draft.recordId}</Typography>
                <Chip size="small" color={style.color} variant={draft.state === '已合并' ? 'filled' : 'outlined'} label={style.label} />
              </Stack>
              <Typography fontSize={10.5} color="text.secondary" mt={.4}>
                {draft.author} · 基线 V{draft.baseRevision}{record ? ` / 当前 V${record.revision}` : ''}{stale && draft.state !== '已合并' ? '（基线已过期，提交时将自动合并）' : ''} · 第 {draft.attempts} 次提交
              </Typography>
              <Typography fontSize={11} mt={.3}>
                {FIELD_ORDER.filter((field) => field in draft.changes).map((field) => `${FIELD_LABELS[field]}→${formatFieldValue(field, draft.changes[field])}`).join('；')}
              </Typography>
              <Typography fontSize={10.5} color="text.secondary" mt={.2}>{draft.reason}</Typography>
              {draft.lastError && <Alert severity="error" sx={{ mt: .8, py: 0 }}>{draft.lastError}</Alert>}
              {(draft.state === '待提交' || draft.state === '提交失败') && (
                <Stack direction="row" spacing={.8} mt={.8}>
                  <Button size="small" variant="contained" startIcon={draft.state === '提交失败' ? <ReplayOutlined /> : <SendOutlined />} onClick={() => submitDraft(draft.draftId)}>
                    {draft.state === '提交失败' ? '恢复重试' : '提交'}
                  </Button>
                </Stack>
              )}
              {draft.state === '部分合并-待裁决' && <Alert severity="warning" sx={{ mt: .8, py: 0 }}>部分字段已合并，冲突字段请在下方裁决面板处理，裁决前签发被阻塞。</Alert>}
            </Box>
          );
        })}
      </CardContent>
    </Card>
  );
}

'use client';

import { Box, Button, Card, CardContent, Chip, Divider, Stack, Tooltip, Typography } from '@mui/material';
import { FactCheckOutlined, TaskAltOutlined } from '@mui/icons-material';
import {
  canCompleteReview,
  currentValueOf,
  FIELD_LABELS,
  FIELD_ORDER,
  formatFieldValue,
  REVIEWERS,
  type VersionedRecord
} from '@/lib/engine';
import { useCarbonStore } from '@/lib/store';

/** 字段级签署卡：核验员只能签自己负责的字段，复核人才能最终完成记录 */
export default function SignoffCard({ record }: { record: VersionedRecord }) {
  const actor = useCarbonStore((state) => state.actor);
  const signField = useCarbonStore((state) => state.signField);
  const completeReview = useCarbonStore((state) => state.completeReview);
  const signedCount = FIELD_ORDER.filter((field) => record.signoffs[field]).length;
  const reviewable = canCompleteReview(record) && record.status !== '已核验' && record.status !== '需补证';
  const isReviewer = REVIEWERS.includes(actor);

  return (
    <Card elevation={0} variant="outlined">
      <CardContent sx={{ p: 1.6, '&:last-child': { pb: 1.6 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
          <Box>
            <Typography fontWeight={800} fontSize={14}>字段级签署</Typography>
            <Typography fontSize={11} color="text.secondary">{record.id} · 基线 V{record.revision} · 字段被修订后对应签署自动失效</Typography>
          </Box>
          <Chip size="small" variant="outlined" color={signedCount === FIELD_ORDER.length ? 'success' : 'default'} label={`${signedCount} / ${FIELD_ORDER.length} 已签`} />
        </Stack>
        <Box mt={1}>
          {FIELD_ORDER.map((field) => {
            const signoff = record.signoffs[field];
            const owner = record.fieldOwners[field];
            const mine = owner === actor;
            return (
              <Stack key={field} direction="row" alignItems="center" spacing={1} sx={{ py: .9, borderTop: '1px solid #edf0ef' }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography fontSize={12} fontWeight={700}>{FIELD_LABELS[field]} <Typography component="span" fontSize={10} color="text.secondary">负责：{owner}</Typography></Typography>
                  <Typography fontSize={11} color="text.secondary" noWrap>{formatFieldValue(field, currentValueOf(record, field))}</Typography>
                </Box>
                {signoff ? (
                  <Chip size="small" color="success" variant="outlined" label={`${signoff.by} 签于 V${signoff.revision}`} />
                ) : (
                  <Tooltip title={mine ? '按当前基线签署该字段' : `仅 ${owner} 可签署该字段`}>
                    <span>
                      <Button size="small" variant="outlined" disabled={!mine || record.status === '需补证'} startIcon={<FactCheckOutlined />} onClick={() => signField(record.id, field)}>
                        签署
                      </Button>
                    </span>
                  </Tooltip>
                )}
              </Stack>
            );
          })}
        </Box>
        <Divider sx={{ my: 1.2 }} />
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
          <Typography fontSize={11} color="text.secondary">
            {record.status === '已核验' ? '记录已完成复核。' : reviewable ? '全部字段已签署，复核人可完成记录。' : '全部字段签署后，复核人才能完成记录。'}
          </Typography>
          <Tooltip title={isReviewer ? '完成该记录' : `仅复核人（${REVIEWERS.join('、')}）可完成记录`}>
            <span>
              <Button size="small" variant="contained" disabled={!reviewable || !isReviewer} startIcon={<TaskAltOutlined />} onClick={() => completeReview(record.id)}>
                完成复核
              </Button>
            </span>
          </Tooltip>
        </Stack>
      </CardContent>
    </Card>
  );
}

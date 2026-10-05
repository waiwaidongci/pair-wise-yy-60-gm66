'use client';

import { Box, Button, Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import { GavelOutlined } from '@mui/icons-material';
import { FIELD_LABELS, formatFieldValue } from '@/lib/engine';
import { useCarbonStore } from '@/lib/store';

/** 冲突裁决：旧基线提交与当前基线都改过的字段在此裁决，裁决前阻塞签发 */
export default function ConflictsPanel() {
  const conflicts = useCarbonStore((state) => state.conflicts);
  const adjudicate = useCarbonStore((state) => state.adjudicate);
  const pending = conflicts.filter((conflict) => conflict.status === '待裁决');
  const resolved = conflicts.filter((conflict) => conflict.status === '已裁决');

  return (
    <Card elevation={0} variant="outlined">
      <CardContent sx={{ p: 1.6, '&:last-child': { pb: 1.6 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography fontWeight={800} fontSize={14}>冲突裁决</Typography>
            <Typography fontSize={11} color="text.secondary">双方均修改的字段留待裁决，裁决前阻塞签发</Typography>
          </Box>
          <Chip size="small" color={pending.length ? 'warning' : 'success'} variant="outlined" label={pending.length ? `${pending.length} 项待裁决` : '无待裁决冲突'} />
        </Stack>
        {conflicts.length === 0 && <Typography fontSize={11} color="text.secondary" mt={1.2}>暂无冲突。两名核验员基于同一基线修改同一字段时，冲突会出现在这里。</Typography>}
        {pending.map((conflict) => (
          <Box key={conflict.id} sx={{ borderTop: '1px solid #edf0ef', mt: 1, pt: 1.1 }}>
            <Stack direction="row" spacing={.8} alignItems="center">
              <GavelOutlined fontSize="small" color="warning" />
              <Typography fontSize={12} fontWeight={700}>{conflict.recordId} · {FIELD_LABELS[conflict.field]}</Typography>
              <Chip size="small" variant="outlined" label={conflict.draftId} />
            </Stack>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: .8, mt: .8 }}>
              {[
                { label: `基线值（V前）`, value: conflict.baseValue },
                { label: '提交值', value: conflict.incomingValue },
                { label: '当前值', value: conflict.currentValue }
              ].map((item) => (
                <Box key={item.label} sx={{ p: .8, bgcolor: '#f7f9f8', borderRadius: 1 }}>
                  <Typography fontSize={10} color="text.secondary">{item.label}</Typography>
                  <Typography fontSize={11.5} fontWeight={700} mt={.2}>{formatFieldValue(conflict.field, item.value)}</Typography>
                </Box>
              ))}
            </Box>
            <Stack direction="row" spacing={.8} mt={.9}>
              <Button size="small" variant="contained" onClick={() => adjudicate(conflict.id, 'mine')}>采用提交值</Button>
              <Button size="small" variant="outlined" onClick={() => adjudicate(conflict.id, 'theirs')}>保留当前值</Button>
            </Stack>
          </Box>
        ))}
        {resolved.map((conflict) => (
          <Stack key={conflict.id} direction="row" justifyContent="space-between" alignItems="center" sx={{ borderTop: '1px solid #edf0ef', mt: 1, pt: 1 }}>
            <Typography fontSize={11} color="text.secondary">{conflict.id} · {conflict.recordId} · {FIELD_LABELS[conflict.field]}</Typography>
            <Chip size="small" color="success" variant="outlined" label={`${conflict.resolution} · ${conflict.resolvedBy}`} />
          </Stack>
        ))}
      </CardContent>
    </Card>
  );
}

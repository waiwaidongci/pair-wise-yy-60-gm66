'use client';

import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import {
  CloudSyncOutlined,
  GavelOutlined,
  HistoryOutlined,
  LockOutlined,
  PersonOutlined,
  RefreshOutlined,
  WarningAmberOutlined
} from '@mui/icons-material';
import { useCarbonStore } from '@/lib/store';
import {
  type FieldId,
  type CarbonRecord,
  FIELD_LABELS,
  VERIFIER_FIELDS,
  REVIEWER_FIELDS,
  canSignField,
  checkCompletion,
  getCurrentBaseline,
  getCurrentSignatures,
  getSignedFields
} from '@/lib/domain';

const ALL_FIELDS: FieldId[] = ['activity', 'factor', 'evidence', 'timeRange', 'unit'];

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function FieldRow({ record, field }: { record: CarbonRecord; field: FieldId }) {
  const store = useCarbonStore();
  const current = getCurrentBaseline(record);
  const sig = getCurrentSignatures(record).find((s) => s.field === field);
  const signed = !!sig;
  const canSign = canSignField(field, store.currentRole);
  const value = current.values[field];

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '1.2fr 1.5fr 1.5fr auto', gap: 1, alignItems: 'center', py: 1, borderTop: '1px solid #edf0ef' }}>
      <Stack direction="row" spacing={0.6} alignItems="center">
        <Typography fontSize={12} fontWeight={700}>{FIELD_LABELS[field]}</Typography>
        {REVIEWER_FIELDS.includes(field) && <Chip size="small" label="复核人" sx={{ height: 16, fontSize: 8, bgcolor: '#fdf0e6', color: '#b4642f' }} />}
      </Stack>
      <Typography fontSize={11.5} fontFamily="monospace">{String(value)}</Typography>
      {signed ? (
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Chip size="small" icon={<LockOutlined sx={{ fontSize: 11 }} />} label={`${sig!.verifier} · ${formatTime(sig!.signedAt)}`} color="success" variant="outlined" sx={{ height: 20, fontSize: 9 }} />
        </Stack>
      ) : (
        <Typography fontSize={10.5} color="text.secondary" sx={{ fontStyle: 'italic' }}>未签署</Typography>
      )}
      <Tooltip title={canSign ? (signed ? '重新签署' : '签署该字段') : store.currentRole === 'verifier' ? '该字段需复核人签署' : '不可签署'}>
        <span>
          <Button size="small" variant={signed ? 'outlined' : 'contained'} disabled={!canSign} onClick={() => store.signField(record.id, field)}>
            {signed ? '重签' : '签署'}
          </Button>
        </span>
      </Tooltip>
    </Box>
  );
}

function RevisionDialog({ record, open, onClose }: { record: CarbonRecord; open: boolean; onClose: () => void }) {
  const store = useCarbonStore();
  const [field, setField] = useState<FieldId>('activity');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const current = getCurrentBaseline(record);
  const handleSubmit = async () => {
    if (!reason.trim() || !value) return;
    setSubmitting(true);
    const numValue = Number(value);
    const parsed = field === 'activity' || field === 'factor' ? (isNaN(numValue) ? value : numValue) : value;
    await store.submitRevision(record.id, { [field]: parsed }, reason, simulateFailure);
    setSubmitting(false);
    setValue('');
    setReason('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>修订字段 · 生成新版本</DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>当前基线 {current.id}。修订将留下原始值、因子、证据编号和原因，并生成不可变计算快照。</Alert>
        <Stack direction="row" spacing={1} mb={2} flexWrap="wrap" useFlexGap>
          {ALL_FIELDS.map((f) => (
            <Chip key={f} label={FIELD_LABELS[f]} onClick={() => setField(f)} color={field === f ? 'primary' : 'default'} variant={field === f ? 'filled' : 'outlined'} />
          ))}
        </Stack>
        <TextField fullWidth size="small" label={`修订值 / ${FIELD_LABELS[field]}`} value={value} onChange={(e) => setValue(e.target.value)} margin="normal" />
        <TextField fullWidth size="small" label="修订原因" multiline rows={3} value={reason} onChange={(e) => setReason(e.target.value)} margin="normal" />
        {!reason.trim() && <Alert severity="warning" sx={{ mt: 1 }}>必须填写修订原因。</Alert>}
        <FormControlLabel control={<Switch checked={simulateFailure} onChange={(e) => setSimulateFailure(e.target.checked)} />} label={<Typography fontSize={12}>模拟提交失败（用于草稿恢复演示）</Typography>} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button variant="contained" disabled={!reason.trim() || !value || submitting} onClick={handleSubmit}>生成新版本</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function VerifyMatrix() {
  const store = useCarbonStore();
  const [revisionRecord, setRevisionRecord] = useState<CarbonRecord | null>(null);
  const [simulateFailure, setSimulateFailure] = useState(false);

  const openConflicts = store.adjudicationItems.filter((a) => a.status === 'open');
  const drafts = store.drafts;

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1fr) 380px' }, gap: 1.5 }}>
      <Stack spacing={1.5}>
        {drafts.length > 0 && (
          <Alert severity="warning" icon={<CloudSyncOutlined />} sx={{ '& .MuiAlert-message': { width: '100%' } }}>
            <Typography fontWeight={700} fontSize={13}>提交失败 · {drafts.length} 份草稿待恢复</Typography>
            <Typography fontSize={11} color="text.secondary" mt={0.3}>草稿可恢复重试，重试使用同一幂等键，不会生成新版本。</Typography>
            {drafts.map((draft) => (
              <Box key={draft.id} sx={{ mt: 1, p: 1, bgcolor: 'white', borderRadius: 1, border: '1px solid #f0d9b5' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography fontSize={11.5} fontWeight={700}>{draft.recordId} · 基于 {draft.baseBaselineId}</Typography>
                  <Stack direction="row" spacing={0.5}>
                    <Button size="small" variant="contained" startIcon={<RefreshOutlined />} onClick={() => store.retryDraft(draft.id, simulateFailure)}>重试</Button>
                    <Button size="small" onClick={() => store.dismissDraft(draft.id)}>放弃</Button>
                  </Stack>
                </Stack>
                <Typography fontSize={10.5} color="text.secondary" mt={0.3}>变更：{Object.entries(draft.changes).map(([f, v]) => `${FIELD_LABELS[f as FieldId]}=${v}`).join('，')}</Typography>
                <Typography fontSize={10} color="error" mt={0.2}>失败原因：{draft.failureReason}</Typography>
              </Box>
            ))}
          </Alert>
        )}

        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'white' }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1} sx={{ p: 1.6 }}>
            <Box>
              <Typography fontWeight={800} fontSize={14}>证据矩阵与字段签署</Typography>
              <Typography fontSize={11} color="text.secondary">核验员只签自己负责的字段，复核人才能完成记录</Typography>
            </Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <FormControlLabel control={<Switch size="small" checked={simulateFailure} onChange={(e) => setSimulateFailure(e.target.checked)} />} label={<Typography fontSize={11}>模拟故障</Typography>} />
            </Stack>
          </Stack>
          <Divider />
          {store.records.map((record) => {
            const current = getCurrentBaseline(record);
            const signed = getSignedFields(record);
            const check = checkCompletion(record, openConflicts.filter((a) => a.recordId === record.id).length);
            const canComplete = store.currentRole === 'reviewer' && check.ok;
            return (
              <Box key={record.id} sx={{ px: 1.6, py: 1.3, borderTop: '1px solid #edf0ef' }}>
                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={1}>
                  <Box>
                    <Stack direction="row" spacing={0.8} alignItems="center">
                      <Typography fontSize={12.5} fontWeight={700}>{record.source}</Typography>
                      <Chip size="small" label={current.id} variant="outlined" sx={{ height: 18, fontSize: 9 }} />
                      {record.status === '已核验' && <Chip size="small" label="已核验" color="success" sx={{ height: 18, fontSize: 9 }} />}
                    </Stack>
                    <Typography fontSize={10} color="text.secondary">{record.id} · {record.owner} · 证据 {record.evidenceCount} 份</Typography>
                  </Box>
                  <Stack direction="row" spacing={0.7} flexWrap="wrap" useFlexGap>
                    <Button size="small" variant="outlined" startIcon={<HistoryOutlined />} onClick={() => setRevisionRecord(record)}>修订</Button>
                    <Tooltip title={store.currentRole !== 'reviewer' ? '仅复核人可完成记录' : check.ok ? '完成记录并签发' : `缺少：${check.missingFields.map((f) => FIELD_LABELS[f]).join('、')}${check.openConflicts > 0 ? `；${check.openConflicts} 项冲突待裁决` : ''}`}>
                      <span>
                        <Button size="small" variant="contained" color="success" disabled={!canComplete} onClick={() => store.completeRecord(record.id)}>完成记录</Button>
                      </span>
                    </Tooltip>
                  </Stack>
                </Stack>
                <Box sx={{ mt: 1 }}>
                  {ALL_FIELDS.map((field) => (
                    <FieldRow key={field} record={record} field={field} />
                  ))}
                </Box>
                {!check.ok && store.currentRole === 'reviewer' && (
                  <Alert severity="warning" sx={{ mt: 1 }} icon={<WarningAmberOutlined />}>
                    未完成：{check.missingFields.length > 0 ? `待签署 ${check.missingFields.map((f) => FIELD_LABELS[f]).join('、')}` : ''}{check.openConflicts > 0 ? `；${check.openConflicts} 项冲突待裁决` : ''}
                  </Alert>
                )}
              </Box>
            );
          })}
        </Box>
      </Stack>

      <Stack spacing={1.5}>
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'white', p: 1.8 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
            <Typography fontWeight={800} fontSize={14}>冲突裁决</Typography>
            <Chip size="small" icon={<GavelOutlined sx={{ fontSize: 12 }} />} label={`${openConflicts.length} 项待裁决`} color={openConflicts.length > 0 ? 'warning' : 'default'} sx={{ height: 20, fontSize: 10 }} />
          </Stack>
          {openConflicts.length === 0 ? (
            <Typography fontSize={11} color="text.secondary" sx={{ fontStyle: 'italic' }}>无开放冲突。基于旧基线提交时，未冲突字段会自动合并，冲突字段进入此队列。</Typography>
          ) : (
            openConflicts.map((item) => (
              <Box key={item.id} sx={{ mt: 1, p: 1, bgcolor: '#fdf6ec', border: '1px solid #f0d9b5', borderRadius: 1 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Chip size="small" label={FIELD_LABELS[item.field]} sx={{ height: 18, fontSize: 9 }} />
                  <Typography fontSize={9} color="text.secondary">{item.recordId} · {item.baselineId}</Typography>
                </Stack>
                <Typography fontSize={11} mt={0.5}>基线值 <Box component="span" sx={{ fontFamily: 'monospace' }}>{String(item.baseValue)}</Box></Typography>
                <Typography fontSize={11}>当前值 <Box component="span" sx={{ fontFamily: 'monospace', color: 'success.main' }}>{String(item.currentValue)}</Box>（{item.proposedBy} 已合并）</Typography>
                <Typography fontSize={11}>提议值 <Box component="span" sx={{ fontFamily: 'monospace', color: 'warning.main' }}>{String(item.proposedValue)}</Box>（{item.proposedBy}）</Typography>
                <Typography fontSize={10} color="text.secondary" mt={0.3}>原因：{item.reason}</Typography>
                <Stack direction="row" spacing={0.7} mt={1}>
                  <Button size="small" variant="outlined" onClick={() => store.adjudicate(item.id, 'keepCurrent')}>保留当前值</Button>
                  <Button size="small" variant="contained" onClick={() => store.adjudicate(item.id, 'acceptProposed')}>采纳提议值</Button>
                </Stack>
              </Box>
            ))
          )}
        </Box>

        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'white', p: 1.8 }}>
          <Typography fontWeight={800} fontSize={14} mb={1}>并发核验演示</Typography>
          <Typography fontSize={11} color="text.secondary" mb={1}>模拟两名核验员基于同一旧基线同时提交：未冲突字段自动合并，冲突字段进入裁决并挡住签发。</Typography>
          <Button size="small" variant="outlined" startIcon={<PersonOutlined />} onClick={() => store.simulateConcurrentVerifier(store.selectedRecordId)}>
            模拟并发核验员提交
          </Button>
        </Box>

        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'white', p: 1.8 }}>
          <Typography fontWeight={800} fontSize={14} mb={1}>发现项闭环</Typography>
          {store.findings.map((finding) => (
            <Box key={finding.id} sx={{ borderTop: '1px solid #edf0ef', py: 1.2 }}>
              <Stack direction="row" justifyContent="space-between">
                <Typography fontSize={12} fontWeight={700}>{finding.title}</Typography>
                <Chip size="small" label={finding.status} color={finding.status === '已关闭' ? 'success' : finding.status === '补证中' ? 'warning' : 'error'} />
              </Stack>
              <Typography fontSize={10.5} color="text.secondary" mt={0.5}>{finding.detail}</Typography>
              <Stack direction="row" spacing={0.7} mt={1}>
                <Button size="small" disabled={finding.status === '已关闭'} onClick={() => store.requestEvidence(finding.id)}>发起补证</Button>
                <Button size="small" disabled={finding.status === '已关闭'} onClick={() => store.closeFinding(finding.id)}>关闭</Button>
              </Stack>
            </Box>
          ))}
        </Box>
      </Stack>

      {revisionRecord && (
        <RevisionDialog record={revisionRecord} open={!!revisionRecord} onClose={() => setRevisionRecord(null)} />
      )}
    </Box>
  );
}

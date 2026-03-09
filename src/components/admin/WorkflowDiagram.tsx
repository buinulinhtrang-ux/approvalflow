/**
 * WorkflowDiagram v2 — Timeline hiện đại
 *
 * Hai chế độ:
 *   'template' — preview thiết kế template (admin)
 *   'live'     — trạng thái thực tế của request (RequestDetail)
 */
import React from 'react';
import { Check, X, Clock, AlertTriangle, SkipForward, GitBranch } from 'lucide-react';
import type { BranchCondition, StepStatus, StepInstance, WorkflowStep } from '../../types';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface DiagramStep {
  id: string | number;
  order: number;
  name: string;
  approverLabel?: string;
  parallelGroup?: number;
  requireAll?: boolean;
  branchConditions?: BranchCondition[];
  // live mode
  status?: StepStatus;
  assigneeName?: string;
  actedByName?: string;
  comment?: string;
  actedAt?: string;
  deadlineAt?: string;
}

interface WorkflowDiagramProps {
  steps: DiagramStep[];
  mode?: 'template' | 'live';
  compact?: boolean;
}

// ─── Status token table ───────────────────────────────────────────────────────

interface StatusToken {
  bubble: string;   // bubble background
  ring:   string;   // bubble ring/border
  icon:   string;   // icon color
  accent: string;   // card left-border
  cardBg: string;
  cardBd: string;   // card border
  text:   string;   // primary text
  muted:  string;   // secondary text
  chip:   string;   // status chip bg
  chipTx: string;   // status chip text
  label:  string;
  rail:   string;   // connecting rail segment color
}

const TOKEN: Record<string, StatusToken> = {
  PENDING: {
    bubble: '#F1F5F9', ring: '#CBD5E1', icon: '#94A3B8',
    accent: '#CBD5E1', cardBg: '#FAFBFC', cardBd: '#E2E8F4',
    text: '#64748B', muted: '#94A3B8', chip: '#F1F5F9', chipTx: '#64748B',
    label: 'Chờ xử lý', rail: '#E2E8F4',
  },
  IN_PROGRESS: {
    bubble: '#2563EB', ring: '#93C5FD', icon: '#FFFFFF',
    accent: '#2563EB', cardBg: '#F0F7FF', cardBd: '#BFDBFE',
    text: '#1E40AF', muted: '#3B82F6', chip: '#DBEAFE', chipTx: '#1D4ED8',
    label: 'Đang duyệt', rail: '#BFDBFE',
  },
  APPROVED: {
    bubble: '#16A34A', ring: '#86EFAC', icon: '#FFFFFF',
    accent: '#16A34A', cardBg: '#F0FDF4', cardBd: '#BBF7D0',
    text: '#15803D', muted: '#22C55E', chip: '#DCFCE7', chipTx: '#15803D',
    label: 'Đã phê duyệt', rail: '#86EFAC',
  },
  REJECTED: {
    bubble: '#DC2626', ring: '#FCA5A5', icon: '#FFFFFF',
    accent: '#DC2626', cardBg: '#FFF5F5', cardBd: '#FECACA',
    text: '#B91C1C', muted: '#EF4444', chip: '#FEE2E2', chipTx: '#B91C1C',
    label: 'Từ chối', rail: '#FCA5A5',
  },
  SKIPPED: {
    bubble: '#E2E8F0', ring: '#E2E8F0', icon: '#94A3B8',
    accent: '#E2E8F0', cardBg: '#F8FAFC', cardBd: '#E2E8F4',
    text: '#94A3B8', muted: '#CBD5E1', chip: '#F1F5F9', chipTx: '#94A3B8',
    label: 'Bỏ qua', rail: '#E2E8F4',
  },
  CANCELLED: {
    bubble: '#E5E7EB', ring: '#E5E7EB', icon: '#9CA3AF',
    accent: '#D1D5DB', cardBg: '#F9FAFB', cardBd: '#E5E7EB',
    text: '#6B7280', muted: '#9CA3AF', chip: '#F3F4F6', chipTx: '#6B7280',
    label: 'Đã hủy', rail: '#E5E7EB',
  },
  ESCALATED: {
    bubble: '#D97706', ring: '#FCD34D', icon: '#FFFFFF',
    accent: '#D97706', cardBg: '#FFFBEB', cardBd: '#FDE68A',
    text: '#92400E', muted: '#D97706', chip: '#FEF3C7', chipTx: '#92400E',
    label: 'Leo thang', rail: '#FCD34D',
  },
  // template (no status)
  TEMPLATE: {
    bubble: '#E2E8F4', ring: '#E2E8F4', icon: '#4A5568',
    accent: '#0E1F40', cardBg: '#FFFFFF', cardBd: '#E2E8F4',
    text: '#1C2333', muted: '#64748B', chip: '#EFF4FF', chipTx: '#1D4ED8',
    label: '', rail: '#E2E8F4',
  },
};

const BRANCH_TOKEN: Record<string, { bg: string; color: string; label: string }> = {
  SKIP:    { bg: '#FEF3C7', color: '#92400E', label: 'Bỏ qua' },
  GOTO:    { bg: '#EDE9FE', color: '#5B21B6', label: '→ Bước' },
  APPROVE: { bg: '#DCFCE7', color: '#15803D', label: 'Tự duyệt' },
  REJECT:  { bg: '#FEE2E2', color: '#B91C1C', label: 'Từ chối' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getToken(status?: StepStatus, mode?: 'template' | 'live'): StatusToken {
  if (mode === 'template' || !status) return TOKEN.TEMPLATE;
  return TOKEN[status] ?? TOKEN.PENDING;
}

function groupLevels(steps: DiagramStep[]): DiagramStep[][] {
  const sorted = [...steps].sort((a, b) => a.order - b.order);
  const levels: DiagramStep[][] = [];
  const placed = new Set<number>();

  for (const step of sorted) {
    if (step.parallelGroup != null) {
      if (placed.has(step.parallelGroup)) continue;
      placed.add(step.parallelGroup);
      levels.push(sorted.filter(s => s.parallelGroup === step.parallelGroup));
    } else {
      levels.push([step]);
    }
  }
  return levels;
}

function fmtDate(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ─── StatusIcon ───────────────────────────────────────────────────────────────

function StatusIcon({ status, size = 13 }: { status?: StepStatus; size?: number }) {
  switch (status) {
    case 'APPROVED':    return <Check size={size} strokeWidth={2.5} />;
    case 'REJECTED':
    case 'CANCELLED':   return <X size={size} strokeWidth={2.5} />;
    case 'ESCALATED':   return <AlertTriangle size={size} strokeWidth={2} />;
    case 'SKIPPED':     return <SkipForward size={size} strokeWidth={2} />;
    case 'IN_PROGRESS': return <Clock size={size} strokeWidth={2} />;
    default:            return null;
  }
}

// ─── Single step row ─────────────────────────────────────────────────────────

function StepRow({ step, mode, compact, stepNum }: {
  step: DiagramStep;
  mode: 'template' | 'live';
  compact: boolean;
  stepNum: number;
}) {
  const tk     = getToken(step.status, mode);
  const isLive = mode === 'live' && !!step.status;
  const isPulse = step.status === 'IN_PROGRESS';
  const isSkipped = step.status === 'SKIPPED' || step.status === 'CANCELLED';

  const hasBranch = (step.branchConditions?.length ?? 0) > 0;

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      {/* Bubble */}
      <div style={{ position: 'relative', flexShrink: 0, marginTop: 2 }}>
        {/* Pulse ring for IN_PROGRESS */}
        {isPulse && (
          <div style={{
            position: 'absolute', inset: -5, borderRadius: '50%',
            border: `2px solid ${tk.ring}`,
            animation: 'wd-pulse 1.6s ease-in-out infinite',
            pointerEvents: 'none',
          }} />
        )}
        <div style={{
          width: 30, height: 30, borderRadius: '50%',
          background: tk.bubble,
          border: `2px solid ${tk.ring}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: tk.icon,
          transition: 'all .2s',
          boxShadow: isLive && !isSkipped ? `0 2px 8px ${tk.ring}60` : 'none',
        }}>
          {isLive && step.status !== 'PENDING'
            ? <StatusIcon status={step.status} size={13} />
            : <span style={{ fontSize: 10, fontWeight: 700, color: mode === 'template' ? '#4A5568' : '#94A3B8' }}>
                {stepNum}
              </span>
          }
        </div>
      </div>

      {/* Card */}
      <div style={{
        flex: 1,
        background: tk.cardBg,
        border: `1px solid ${tk.cardBd}`,
        borderLeft: `3px solid ${tk.accent}`,
        borderRadius: 10,
        padding: compact ? '8px 12px' : '10px 14px',
        opacity: isSkipped ? 0.55 : 1,
        transition: 'opacity .2s',
        marginBottom: 0,
      }}>
        {/* Top row: name + status chip */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: compact ? 12.5 : 13,
            fontWeight: 700,
            color: tk.text,
            textDecoration: isSkipped ? 'line-through' : 'none',
          }}>
            {step.name || `Bước ${step.order}`}
          </span>

          {isLive && step.status && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px',
              borderRadius: 20, background: tk.chip, color: tk.chipTx,
              letterSpacing: '.3px', whiteSpace: 'nowrap',
            }}>
              {TOKEN[step.status]?.label ?? step.status}
            </span>
          )}
        </div>

        {/* Assignee / approver */}
        {!compact && (step.assigneeName || step.approverLabel) && (
          <div style={{ marginTop: 3, fontSize: 11.5, color: tk.muted, display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{
              width: 16, height: 16, borderRadius: '50%', background: `${tk.accent}22`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 8, fontWeight: 700, color: tk.accent, flexShrink: 0,
            }}>
              {(step.assigneeName ?? step.approverLabel ?? '?').charAt(0).toUpperCase()}
            </div>
            {step.assigneeName ?? step.approverLabel}
          </div>
        )}

        {/* Deadline (live, in progress) */}
        {!compact && step.status === 'IN_PROGRESS' && step.deadlineAt && (
          <div style={{ marginTop: 4, fontSize: 11, color: '#D97706', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Clock size={10} />
            Hạn: {fmtDate(step.deadlineAt)}
          </div>
        )}

        {/* acted_at */}
        {!compact && step.actedAt && (
          <div style={{ marginTop: 3, fontSize: 10.5, color: tk.muted }}>
            {step.actedByName ? `${step.actedByName} · ` : ''}{fmtDate(step.actedAt)}
          </div>
        )}

        {/* Comment */}
        {!compact && step.comment && (
          <div style={{
            marginTop: 7, padding: '6px 10px',
            background: `${tk.accent}0E`, borderLeft: `2px solid ${tk.accent}50`,
            borderRadius: '0 6px 6px 0',
            fontSize: 11.5, color: tk.text, fontStyle: 'italic', lineHeight: 1.5,
          }}>
            "{step.comment}"
          </div>
        )}

        {/* Branch conditions (template mode) */}
        {!compact && mode === 'template' && hasBranch && (
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {step.branchConditions!.map((c, i) => {
              const bt = BRANCH_TOKEN[c.action] ?? BRANCH_TOKEN.SKIP;
              const fieldPart = c.field.replace('form_data.', '');
              return (
                <span key={i} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  fontSize: 10, fontWeight: 600, padding: '2px 7px',
                  borderRadius: 6, background: bt.bg, color: bt.color,
                }}>
                  <GitBranch size={8} />
                  {fieldPart} {c.op} {String(c.value)}
                  {' → '}{c.action === 'GOTO' ? `B${c.goto_order}` : bt.label}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Parallel group block ─────────────────────────────────────────────────────

function ParallelBlock({ steps, mode, compact }: {
  steps: DiagramStep[];
  mode: 'template' | 'live';
  compact: boolean;
}) {
  const requireAll = steps[0]?.requireAll !== false;
  const anyActive  = mode === 'live' && steps.some(s => s.status === 'IN_PROGRESS');
  const allDone    = mode === 'live' && steps.every(s =>
    ['APPROVED', 'SKIPPED', 'CANCELLED'].includes(s.status ?? ''));

  const borderColor = anyActive ? '#BFDBFE' : allDone ? '#86EFAC' : '#E2E8F4';
  const bgColor     = anyActive ? '#F5F9FF' : allDone ? '#F5FFF8' : '#FAFBFD';

  return (
    <div style={{
      border: `1.5px dashed ${borderColor}`,
      borderRadius: 12,
      background: bgColor,
      padding: compact ? '8px' : '10px',
      width: '100%',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        marginBottom: 10, paddingBottom: 8,
        borderBottom: `1px solid ${borderColor}`,
      }}>
        <div style={{
          fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px',
          color: anyActive ? '#3B82F6' : allDone ? '#16A34A' : '#94A3B8',
        }}>
          ⇄ Song song
        </div>
        <div style={{
          fontSize: 10, padding: '1px 8px', borderRadius: 20,
          background: anyActive ? '#DBEAFE' : allDone ? '#DCFCE7' : '#F1F5F9',
          color: anyActive ? '#1D4ED8' : allDone ? '#15803D' : '#64748B',
          fontWeight: 600,
        }}>
          {requireAll ? 'Tất cả phải duyệt' : 'Chỉ cần 1 người'}
        </div>
      </div>

      {/* Steps side by side */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.min(steps.length, 3)}, 1fr)`,
        gap: 8,
      }}>
        {steps.map((step) => (
          <StepRow key={step.id} step={step} mode={mode} compact={compact} stepNum={step.order} />
        ))}
      </div>
    </div>
  );
}

// ─── Terminal node (start/end) ────────────────────────────────────────────────

function TerminalNode({ type, label, sub }: { type: 'start' | 'end' | 'rejected' | 'cancelled'; label: string; sub?: string }) {
  const colors: Record<string, { dot: string; text: string; bg: string }> = {
    start:     { dot: '#6B7280', text: '#4B5563', bg: '#F3F4F6' },
    end:       { dot: '#C8952A', text: '#92400E', bg: '#FEF3C7' },
    rejected:  { dot: '#DC2626', text: '#B91C1C', bg: '#FEE2E2' },
    cancelled: { dot: '#6B7280', text: '#4B5563', bg: '#F3F4F6' },
  };
  const c = colors[type];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 30, height: 30, borderRadius: '50%', background: c.bg, border: `2px solid ${c.dot}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.dot }} />
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: c.text }}>{label}</div>
        {sub && <div style={{ fontSize: 10.5, color: '#94A3B8', marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function WorkflowDiagram({ steps, mode = 'template', compact = false }: WorkflowDiagramProps) {
  if (!steps || steps.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: '#8896B0', fontSize: 13 }}>
        Chưa có bước nào trong workflow
      </div>
    );
  }

  const levels = groupLevels(steps);
  let stepCounter = 0;

  // Determine rail color for each segment (color = status of the FROM level)
  const getRailColor = (levelIndex: number): string => {
    if (mode === 'template') return '#E2E8F4';
    const levelSteps = levels[levelIndex];
    if (!levelSteps) return '#E2E8F4';
    // Use the "worst" status in the level for color
    const st = levelSteps.find(s => s.status === 'IN_PROGRESS')?.status
            ?? levelSteps.find(s => s.status === 'REJECTED')?.status
            ?? levelSteps.find(s => s.status === 'APPROVED')?.status
            ?? levelSteps[0]?.status;
    return TOKEN[st ?? 'PENDING']?.rail ?? '#E2E8F4';
  };

  // Determine if request is fully done / rejected
  const isDone      = mode === 'live' && steps.every(s => ['APPROVED', 'SKIPPED', 'CANCELLED'].includes(s.status ?? ''));
  const isRejected  = mode === 'live' && steps.some(s => s.status === 'REJECTED');
  const isCancelled = mode === 'live' && steps.some(s => s.status === 'CANCELLED');

  return (
    <div style={{ padding: compact ? '8px 12px' : '16px 20px' }}>
      <style>{`
        @keyframes wd-pulse {
          0%   { opacity: 1;  transform: scale(1); }
          50%  { opacity: .35; transform: scale(1.15); }
          100% { opacity: 1;  transform: scale(1); }
        }
      `}</style>

      {/* Track + steps */}
      <div style={{ position: 'relative' }}>
        {/* Continuous vertical rail line (behind everything) */}
        <div style={{
          position: 'absolute', left: 15, top: 16, bottom: mode === 'live' ? 0 : 16,
          width: 2, background: '#E2E8F4', borderRadius: 1, zIndex: 0,
        }} />

        {levels.map((levelSteps, idx) => {
          const isParallel = levelSteps.length > 1;
          const railColor  = getRailColor(idx);
          const isLast     = idx === levels.length - 1;

          // Count step numbers
          const stepNums = levelSteps.map(() => ++stepCounter);

          return (
            <div key={idx} style={{ position: 'relative', zIndex: 1 }}>
              {/* Step(s) */}
              {isParallel ? (
                <div style={{ display: 'flex', gap: 12 }}>
                  {/* Parallel indicator bubble on rail */}
                  <div style={{
                    width: 30, flexShrink: 0, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', paddingTop: 4,
                  }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%',
                      background: '#F0F9FF', border: '2px solid #BFDBFE',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, color: '#3B82F6', fontWeight: 700,
                    }}>
                      ⇄
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <ParallelBlock steps={levelSteps} mode={mode} compact={compact} />
                  </div>
                </div>
              ) : (
                <StepRow step={levelSteps[0]} mode={mode} compact={compact} stepNum={stepNums[0]} />
              )}

              {/* Rail segment connector */}
              {!isLast && (
                <div style={{ display: 'flex', alignItems: 'stretch', marginTop: 0 }}>
                  <div style={{
                    width: 30, flexShrink: 0,
                    display: 'flex', justifyContent: 'center',
                  }}>
                    <div style={{
                      width: 2, height: 28,
                      background: `linear-gradient(to bottom, ${railColor}, ${getRailColor(idx + 1)})`,
                      borderRadius: 1,
                    }} />
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Terminal: End node (live only) */}
        {mode === 'live' && (
          <div style={{ position: 'relative', zIndex: 1, marginTop: 4 }}>
            {isDone && !isRejected && !isCancelled && (
              <TerminalNode type="end" label="Hoàn thành" sub="Yêu cầu đã được phê duyệt" />
            )}
            {isRejected && (
              <TerminalNode type="rejected" label="Từ chối" sub="Yêu cầu đã bị từ chối" />
            )}
            {isCancelled && !isRejected && (
              <TerminalNode type="cancelled" label="Đã hủy" />
            )}
            {!isDone && !isRejected && !isCancelled && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 30, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', border: '2px dashed #CBD5E1', background: '#F8FAFC' }} />
                </div>
                <span style={{ fontSize: 11, color: '#94A3B8', fontStyle: 'italic' }}>Đang xử lý...</span>
              </div>
            )}
          </div>
        )}

        {/* Template mode: "End" marker */}
        {mode === 'template' && (
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 12, position: 'relative', zIndex: 1 }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: 'linear-gradient(135deg, #C8952A, #E8B84B)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              boxShadow: '0 2px 8px rgba(200,149,42,.35)',
            }}>
              <Check size={13} color="#fff" strokeWidth={2.5} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#92400E' }}>Phê duyệt hoàn tất</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Export helpers ───────────────────────────────────────────────────────────

export function stepInstancesToDiagram(instances: StepInstance[]): DiagramStep[] {
  return instances.map(s => ({
    id:           s.id,
    order:        s.step_order,
    name:         s.step_name,
    parallelGroup: undefined,
    requireAll:   undefined,
    status:       s.status,
    assigneeName: s.assigned_to_name ?? (s.assigned_role ? `[${s.assigned_role}]` : undefined),
    actedByName:  s.acted_by_name,
    comment:      s.comment ?? undefined,
    actedAt:      s.acted_at ?? undefined,
    deadlineAt:   s.deadline_at ?? undefined,
  }));
}

export function workflowStepsToDiagram(steps: WorkflowStep[]): DiagramStep[] {
  return steps.map(s => ({
    id:               s.id,
    order:            s.step_order,
    name:             s.step_name,
    approverLabel:    s.approver_type === 'FIXED_ROLE'        ? `Role: ${s.approver_value}` :
                      s.approver_type === 'FIXED_USER'        ? `User ID: ${s.approver_value}` :
                      s.approver_type === 'DYNAMIC_MANAGER'   ? 'Quản lý trực tiếp' :
                      s.approver_type === 'DYNAMIC_DEPT_HEAD' ? 'Trưởng bộ phận' :
                      'Người tạo tự chọn',
    parallelGroup:    s.parallel_group ?? undefined,
    requireAll:       s.require_all,
    branchConditions: s.branch_conditions ?? [],
  }));
}

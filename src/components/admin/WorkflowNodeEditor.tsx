// ============================================================
// WorkflowNodeEditor — Visual node-based workflow editor
// Inspired by Lark Process Design
// ============================================================

import React, { useState, useRef, useEffect } from 'react';
import type {
  WorkflowGraph, GraphNode, ApproverGraphNode, BranchGraphNode,
  BranchArm, GraphConditionGroup, GraphConditionItem,
  ApproverType, OnTimeoutAction, OnRejectAction,
  FormType, WorkflowStep,
} from '../../types';

// ─── Internal Types ────────────────────────────────────────────────────────────

type FlatStep = Omit<WorkflowStep, 'id' | 'template_id'>;

type SelectedItem =
  | { type: 'node'; nodeId: string }
  | { type: 'arm'; branchNodeId: string; armIndex: number };

interface FieldOption { value: string; label: string; }

// ─── Utilities ─────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

function invertOp(op: string): string {
  return (
    { '<': '>=', '<=': '>', '>': '<=', '>=': '<', '=': '!=', '!=': '=' } as Record<string, string>
  )[op] ?? '!=';
}

// ─── Graph Manipulation (pure functions) ──────────────────────────────────────

function insertNodeAfter(
  nodes: GraphNode[],
  afterId: string | null,
  armId: string | null,
  newNode: GraphNode,
): GraphNode[] {
  // Insert into specific arm
  if (armId !== null) {
    return nodes.map(n => {
      if (n.type !== 'branch') return n;
      return {
        ...n,
        branches: n.branches.map(arm => {
          if (arm.id === armId) {
            if (afterId === null) return { ...arm, nodes: [newNode, ...arm.nodes] };
            const idx = arm.nodes.findIndex(x => x.id === afterId);
            if (idx >= 0) return { ...arm, nodes: [...arm.nodes.slice(0, idx + 1), newNode, ...arm.nodes.slice(idx + 1)] };
          }
          // Recurse into nested branches in this arm
          return { ...arm, nodes: insertNodeAfter(arm.nodes, afterId, armId, newNode) };
        }),
      };
    });
  }
  // Top-level
  if (afterId === null) return [newNode, ...nodes];
  const idx = nodes.findIndex(n => n.id === afterId);
  if (idx >= 0) return [...nodes.slice(0, idx + 1), newNode, ...nodes.slice(idx + 1)];
  // Recurse
  return nodes.map(n => {
    if (n.type !== 'branch') return n;
    return { ...n, branches: n.branches.map(arm => ({ ...arm, nodes: insertNodeAfter(arm.nodes, afterId, null, newNode) })) };
  });
}

function removeNode(nodes: GraphNode[], id: string): GraphNode[] {
  const filtered = nodes.filter(n => n.id !== id);
  if (filtered.length < nodes.length) return filtered;
  return nodes.map(n => {
    if (n.type !== 'branch') return n;
    return { ...n, branches: n.branches.map(arm => ({ ...arm, nodes: removeNode(arm.nodes, id) })) };
  });
}

function updateNodeInTree(
  nodes: GraphNode[],
  id: string,
  updater: (n: GraphNode) => GraphNode,
): GraphNode[] {
  return nodes.map(n => {
    if (n.id === id) return updater(n);
    if (n.type !== 'branch') return n;
    return { ...n, branches: n.branches.map(arm => ({ ...arm, nodes: updateNodeInTree(arm.nodes, id, updater) })) };
  });
}

function findNodeById(nodes: GraphNode[], id: string): GraphNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.type === 'branch') {
      for (const arm of n.branches) {
        const found = findNodeById(arm.nodes, id);
        if (found) return found;
      }
    }
  }
  return null;
}

function updateBranchArmInTree(
  nodes: GraphNode[],
  branchId: string,
  armIndex: number,
  updater: (arm: BranchArm) => BranchArm,
): GraphNode[] {
  return nodes.map(n => {
    if (n.id === branchId && n.type === 'branch') {
      return { ...n, branches: n.branches.map((arm, i) => i === armIndex ? updater(arm) : arm) };
    }
    if (n.type !== 'branch') return n;
    return { ...n, branches: n.branches.map(arm => ({ ...arm, nodes: updateBranchArmInTree(arm.nodes, branchId, armIndex, updater) })) };
  });
}

// ─── Graph → Flat Steps Conversion ────────────────────────────────────────────

export function graphToFlatSteps(graph: WorkflowGraph): FlatStep[] {
  let counter = 0;
  const nextOrder = () => ++counter;

  function condGroupsToRaw(groups: GraphConditionGroup[]) {
    return groups.map(g => ({
      conditions: g.conditions.map(c => ({ field: c.field, op: c.op, value: c.value })),
    }));
  }

  function process(nodes: GraphNode[], output: FlatStep[]): void {
    for (const node of nodes) {
      if (node.type === 'approver') {
        output.push({
          step_order: nextOrder(),
          step_name: node.label,
          approver_type: node.approver_type,
          approver_value: node.approver_value,
          require_all: node.require_all,
          deadline_hours: node.deadline_hours,
          on_timeout: node.on_timeout,
          on_reject: node.on_reject,
          parallel_group: undefined,
          branch_conditions: [],
        });
      } else {
        // Branch node:
        // Layout: [gateway, default_arm_steps..., cond_arm0_steps..., cond_arm1_steps..., ...]
        // Gateway: GOTO for each conditional arm, SKIP for default (always-match)
        // Default arm comes first → GOTO jumps OVER it to reach conditional arms
        // Conditional arm steps get skip conditions (own inverse + preceding arms)
        // Default arm steps get skip conditions (each conditional arm's condition)

        const gatewayOrder = nextOrder();
        const defArmIdx = node.branches.length - 1;
        const defArm = node.branches[defArmIdx];
        const condArms = node.branches.slice(0, defArmIdx);

        // Process arms (advances shared counter)
        const defSteps: FlatStep[] = [];
        process(defArm.nodes, defSteps);

        const condArmSteps: FlatStep[][] = condArms.map(arm => {
          const s: FlatStep[] = [];
          process(arm.nodes, s);
          return s;
        });

        // Gateway conditions: check conditional arms first, then default (always match)
        const gatewayConds: object[] = condArms.map((arm, i) => ({
          condition_groups: condGroupsToRaw(arm.condition_groups),
          action: condArmSteps[i].length > 0 ? 'GOTO' : 'SKIP',
          goto_order: condArmSteps[i].length > 0 ? condArmSteps[i][0].step_order : undefined,
          label: arm.label,
        }));
        // Default arm: empty condition_groups = always match → SKIP gateway
        gatewayConds.push({ condition_groups: [], action: 'SKIP', label: defArm.label });

        // Skip conditions for default arm steps: skip if any conditional arm is active
        const defSkipConds: object[] = condArms
          .map(arm => {
            const c = arm.condition_groups[0]?.conditions[0];
            return c ? { condition_groups: [{ conditions: [{ field: c.field, op: c.op, value: c.value }] }], action: 'SKIP' } : null;
          })
          .filter(Boolean) as object[];

        if (defSkipConds.length > 0) {
          for (const s of defSteps) (s as any).branch_conditions = defSkipConds;
        }

        // Skip conditions for each conditional arm's steps
        for (let i = 0; i < condArms.length; i++) {
          const arm = condArms[i];
          const firstCond = arm.condition_groups[0]?.conditions[0];
          const skipConds: object[] = [];

          // Skip if any preceding conditional arm is active (its condition matches)
          for (let j = 0; j < i; j++) {
            const prev = condArms[j].condition_groups[0]?.conditions[0];
            if (prev) {
              skipConds.push({
                condition_groups: [{ conditions: [{ field: prev.field, op: prev.op, value: prev.value }] }],
                action: 'SKIP',
              });
            }
          }

          // Skip if this arm's own condition doesn't match (inverse)
          if (firstCond) {
            skipConds.push({
              condition_groups: [{ conditions: [{ field: firstCond.field, op: invertOp(firstCond.op), value: firstCond.value }] }],
              action: 'SKIP',
            });
          }

          if (skipConds.length > 0) {
            for (const s of condArmSteps[i]) (s as any).branch_conditions = skipConds;
          }
        }

        // Push: gateway, default arm steps, then each conditional arm
        output.push({
          step_order: gatewayOrder,
          step_name: '__GATEWAY__',
          approver_type: 'FIXED_ROLE',
          approver_value: '__GATEWAY__',
          require_all: true,
          deadline_hours: 1,
          on_timeout: 'AUTO_APPROVE',
          on_reject: 'RETURN_REQUESTER',
          parallel_group: undefined,
          branch_conditions: gatewayConds as any,
        });
        output.push(...defSteps);
        for (const armSteps of condArmSteps) output.push(...armSteps);
      }
    }
  }

  const result: FlatStep[] = [];
  process(graph.nodes, result);
  return result;
}

/** Convert flat steps → approximate graph (for loading legacy templates) */
export function flatStepsToGraph(steps: WorkflowStep[]): WorkflowGraph {
  return {
    nodes: steps
      .filter(s => s.approver_value !== '__GATEWAY__' && (s.branch_conditions as any[])?.length === 0)
      .map(s => ({
        id: uid(),
        type: 'approver' as const,
        label: s.step_name,
        approver_type: s.approver_type,
        approver_value: s.approver_value,
        require_all: s.require_all ?? true,
        deadline_hours: s.deadline_hours ?? 48,
        on_timeout: (s.on_timeout ?? 'ESCALATE') as OnTimeoutAction,
        on_reject: (s.on_reject ?? 'RETURN_REQUESTER') as OnRejectAction,
      })),
  };
}

// ─── Factory Functions ─────────────────────────────────────────────────────────

function newApproverNode(): ApproverGraphNode {
  return {
    id: uid(), type: 'approver', label: 'Bước phê duyệt',
    approver_type: 'DYNAMIC_MANAGER', require_all: true,
    deadline_hours: 48, on_timeout: 'ESCALATE', on_reject: 'RETURN_REQUESTER',
  };
}

function newBranchNode(): BranchGraphNode {
  return {
    id: uid(), type: 'branch',
    branches: [
      { id: uid(), label: 'Nhánh điều kiện', condition_groups: [{ id: uid(), conditions: [] }], nodes: [] },
      { id: uid(), label: 'Còn lại', condition_groups: [], nodes: [] },
    ],
  };
}

function newConditionGroup(): GraphConditionGroup {
  return { id: uid(), conditions: [] };
}

// ─── Form Fields Helper ────────────────────────────────────────────────────────

function getFormFields(formTypes: FormType[], formTypeCode?: string): FieldOption[] {
  const base: FieldOption[] = [
    { value: 'amount', label: 'Số tiền (amount)' },
    { value: 'is_urgent', label: 'Khẩn cấp (is_urgent)' },
    { value: 'department', label: 'Phòng ban (department)' },
    { value: 'form_type', label: 'Loại biểu mẫu (form_type)' },
  ];
  if (!formTypeCode) return base;
  const ft = formTypes.find(f => f.code === formTypeCode);
  if (!ft) return base;
  const extra: FieldOption[] = [];
  for (const section of ft.field_schema?.sections ?? []) {
    for (const field of section.fields ?? []) {
      if (['text', 'number', 'boolean', 'select'].includes(field.type)) {
        extra.push({ value: `form_data.${field.key}`, label: `${field.label} (${field.key})` });
      }
    }
  }
  return [...base, ...extra];
}

// ─── Shared Styles ─────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: '#64748B',
  display: 'block', marginBottom: 5,
  textTransform: 'uppercase', letterSpacing: '0.5px',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', fontSize: 13,
  border: '1px solid #E2E8F0', borderRadius: 7,
  outline: 'none', background: 'white', color: '#1E293B', boxSizing: 'border-box',
};

// ─── Canvas Components ─────────────────────────────────────────────────────────

function Connector() {
  return <div style={{ width: 2, height: 20, background: '#CBD5E1', flexShrink: 0 }} />;
}

function AddBtn({
  afterId, armId, activeKey, onToggle, onAdd,
}: {
  afterId: string | null; armId: string | null;
  activeKey: string | null;
  onToggle: (key: string) => void;
  onAdd: (afterId: string | null, armId: string | null, type: 'approver' | 'branch') => void;
}) {
  const key = `${afterId ?? 'null'}_${armId ?? 'null'}`;
  const open = activeKey === key;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 10, flexShrink: 0 }}>
      <Connector />
      <div
        onClick={e => { e.stopPropagation(); onToggle(key); }}
        title="Thêm node"
        style={{
          width: 28, height: 28, borderRadius: '50%',
          background: open ? '#3B82F6' : 'white',
          border: `2px solid ${open ? '#3B82F6' : '#CBD5E1'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: open ? 'white' : '#94A3B8',
          fontSize: 18, fontWeight: 700, lineHeight: 1,
          boxShadow: open ? '0 2px 8px rgba(59,130,246,0.35)' : '0 1px 3px rgba(0,0,0,0.1)',
          transition: 'all 0.12s', userSelect: 'none',
        }}
      >+</div>
      {open && (
        <div style={{
          position: 'absolute', top: 52, left: '50%', transform: 'translateX(-50%)',
          background: 'white', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.14)', border: '1px solid #E2E8F0',
          width: 200, overflow: 'hidden', zIndex: 300,
        }}>
          {[
            { type: 'approver' as const, icon: '👤', title: 'Người phê duyệt', sub: 'Bước phê duyệt thông thường', hover: '#EFF6FF' },
            { type: 'branch' as const, icon: '⑂', title: 'Nhánh điều kiện', sub: 'Rẽ nhánh theo điều kiện', hover: '#FFF7ED' },
          ].map((opt, i) => (
            <React.Fragment key={opt.type}>
              {i > 0 && <div style={{ borderTop: '1px solid #F1F5F9' }} />}
              <div
                onClick={() => onAdd(afterId, armId, opt.type)}
                style={{ padding: '11px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                onMouseEnter={e => (e.currentTarget.style.background = opt.hover)}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
              >
                <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>{opt.icon}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{opt.title}</div>
                  <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{opt.sub}</div>
                </div>
              </div>
            </React.Fragment>
          ))}
        </div>
      )}
      <Connector />
    </div>
  );
}

function TerminalNode({ type }: { type: 'start' | 'end' }) {
  const isStart = type === 'start';
  return (
    <div style={{
      padding: '8px 22px', borderRadius: 20,
      background: isStart ? '#F1F5F9' : '#FEF9C3',
      border: `1.5px solid ${isStart ? '#CBD5E1' : '#FDE047'}`,
      fontSize: 12, fontWeight: 700,
      color: isStart ? '#64748B' : '#92400E', letterSpacing: '0.5px',
    }}>
      {isStart ? '● Bắt đầu' : '● Kết thúc'}
    </div>
  );
}

function ApproverCard({ node, selected, onSelect, onDelete }: {
  node: ApproverGraphNode; selected: boolean;
  onSelect: () => void; onDelete: () => void;
}) {
  const typeLabel: Record<string, string> = {
    DYNAMIC_MANAGER: 'Quản lý TT', DYNAMIC_DEPT_HEAD: 'Trưởng bộ phận',
    FIXED_ROLE: node.approver_value ? `Role: ${node.approver_value}` : 'Role cố định',
    FIXED_USER: `User #${node.approver_value ?? '?'}`, REQUESTER_SELECT: 'Người tạo chọn',
  };
  return (
    <div
      onClick={onSelect}
      style={{
        width: 240, background: 'white', borderRadius: 10,
        border: `2px solid ${selected ? '#3B82F6' : '#E2E8F0'}`,
        boxShadow: selected ? '0 0 0 3px rgba(59,130,246,0.15)' : '0 1px 4px rgba(0,0,0,0.07)',
        overflow: 'hidden', cursor: 'pointer', transition: 'border-color 0.12s, box-shadow 0.12s',
      }}
    >
      <div style={{
        background: selected ? '#EFF6FF' : '#F8FAFF',
        borderBottom: `1px solid ${selected ? '#DBEAFE' : '#E2E8F0'}`,
        padding: '7px 10px 7px 12px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12 }}>👤</span>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#3B82F6' }}>Phê duyệt</span>
        </div>
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#CBD5E1', padding: '1px 4px', borderRadius: 4, fontSize: 13 }}
          onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
          onMouseLeave={e => (e.currentTarget.style.color = '#CBD5E1')}
        >✕</button>
      </div>
      <div style={{ padding: '9px 12px 10px' }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: '#1E293B', marginBottom: 7, lineHeight: 1.3, wordBreak: 'break-word' }}>
          {node.label}
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 20, background: '#F1F5F9', color: '#475569' }}>
            {typeLabel[node.approver_type] ?? node.approver_type}
          </span>
          <span style={{
            fontSize: 11, padding: '2px 7px', borderRadius: 20,
            background: node.require_all ? '#EFF6FF' : '#F0FDF4',
            color: node.require_all ? '#2563EB' : '#16A34A',
          }}>
            {node.require_all ? 'Tất cả duyệt' : 'Chỉ cần 1'}
          </span>
        </div>
      </div>
    </div>
  );
}

// Recursive node renderer
function NodeRenderer(props: {
  node: GraphNode; selectedItem: SelectedItem | null; addMenuKey: string | null;
  onSelectNode: (id: string) => void;
  onSelectArm: (branchNodeId: string, armIndex: number) => void;
  onDeleteNode: (id: string) => void;
  onAddNode: (afterId: string | null, armId: string | null, type: 'approver' | 'branch') => void;
  onToggleMenu: (key: string) => void;
}) {
  const { node, selectedItem, addMenuKey, onSelectNode, onSelectArm, onDeleteNode, onAddNode, onToggleMenu } = props;

  if (node.type === 'approver') {
    return (
      <ApproverCard
        node={node}
        selected={selectedItem?.type === 'node' && selectedItem.nodeId === node.id}
        onSelect={() => onSelectNode(node.id)}
        onDelete={() => onDeleteNode(node.id)}
      />
    );
  }

  // Branch node
  const isNodeSelected = selectedItem?.type === 'node' && selectedItem.nodeId === node.id;
  return (
    <div style={{ width: '100%', maxWidth: 720 }}>
      {/* Branch header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: isNodeSelected ? '#FFF7ED' : '#FFFBF5',
        border: `2px solid ${isNodeSelected ? '#F97316' : '#FED7AA'}`,
        borderRadius: 10, padding: '8px 12px', marginBottom: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16, color: '#EA580C' }}>⑂</span>
          <span style={{ fontWeight: 700, fontSize: 11, color: '#C2410C', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Điều kiện rẽ nhánh
          </span>
          <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 20, background: '#FED7AA', color: '#9A3412', fontWeight: 600 }}>
            {node.branches.length} nhánh
          </span>
        </div>
        <button
          onClick={e => { e.stopPropagation(); onDeleteNode(node.id); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FDBA74', padding: '1px 4px', borderRadius: 4, fontSize: 13 }}
          onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
          onMouseLeave={e => (e.currentTarget.style.color = '#FDBA74')}
        >✕</button>
      </div>

      {/* Arms horizontal layout */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        {node.branches.map((arm, armIdx) => {
          const isDefault = arm.condition_groups.length === 0;
          const isArmSelected = selectedItem?.type === 'arm'
            && selectedItem.branchNodeId === node.id
            && selectedItem.armIndex === armIdx;

          return (
            <div key={arm.id} style={{
              flex: 1, minWidth: 180,
              border: `1.5px dashed ${isArmSelected ? '#3B82F6' : isDefault ? '#CBD5E1' : '#FCA5A5'}`,
              borderRadius: 10, padding: 10,
              background: isArmSelected ? '#F0F7FF' : isDefault ? '#FAFAFA' : '#FFF5F5',
              transition: 'border-color 0.12s',
            }}>
              {/* Arm header - click to edit conditions */}
              <div
                onClick={() => onSelectArm(node.id, armIdx)}
                style={{
                  cursor: 'pointer', marginBottom: 8, paddingBottom: 7,
                  borderBottom: `1px solid ${isDefault ? '#E2E8F0' : '#FCA5A5'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: isDefault ? '#64748B' : '#DC2626' }}>
                    {arm.label}
                  </span>
                  {isDefault && (
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 20, background: '#E2E8F0', color: '#64748B' }}>
                      mặc định
                    </span>
                  )}
                </div>
                {!isDefault && <span style={{ fontSize: 11, color: '#94A3B8' }}>✎</span>}
              </div>

              {/* Condition summary chips */}
              {!isDefault && (
                <div style={{ marginBottom: 8 }}>
                  {arm.condition_groups.length === 0 ? (
                    <div
                      onClick={() => onSelectArm(node.id, armIdx)}
                      style={{ fontSize: 11, color: '#EF4444', cursor: 'pointer', fontStyle: 'italic' }}>
                      ⚠ Chưa có điều kiện — nhấn để thêm
                    </div>
                  ) : (
                    arm.condition_groups.map((g, gi) => (
                      <div key={g.id}>
                        {gi > 0 && <div style={{ fontSize: 10, color: '#A855F7', fontWeight: 700, margin: '3px 0', textAlign: 'center' }}>HOẶC</div>}
                        <div style={{ background: 'white', border: '1px solid #FECACA', borderRadius: 6, padding: '4px 8px', fontSize: 11, color: '#B91C1C' }}>
                          {g.conditions.length === 0 ? (
                            <span style={{ color: '#94A3B8', fontStyle: 'italic' }}>Nhóm trống</span>
                          ) : (
                            g.conditions.map((c, ci) => (
                              <div key={c.id}>
                                {ci > 0 && <span style={{ color: '#64748B' }}>VÀ </span>}
                                <code style={{ fontSize: 11 }}>{c.field} {c.op} {String(c.value)}</code>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Recursive arm nodes */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <AddBtn afterId={null} armId={arm.id} activeKey={addMenuKey} onToggle={onToggleMenu} onAdd={onAddNode} />
                {arm.nodes.map(armNode => (
                  <React.Fragment key={armNode.id}>
                    <NodeRenderer
                      node={armNode} selectedItem={selectedItem} addMenuKey={addMenuKey}
                      onSelectNode={onSelectNode} onSelectArm={onSelectArm}
                      onDeleteNode={onDeleteNode} onAddNode={onAddNode} onToggleMenu={onToggleMenu}
                    />
                    <AddBtn afterId={armNode.id} armId={arm.id} activeKey={addMenuKey} onToggle={onToggleMenu} onAdd={onAddNode} />
                  </React.Fragment>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Config Panel ──────────────────────────────────────────────────────────────

const APPROVER_TYPES: { value: ApproverType; label: string }[] = [
  { value: 'DYNAMIC_MANAGER', label: 'Quản lý trực tiếp' },
  { value: 'DYNAMIC_DEPT_HEAD', label: 'Trưởng bộ phận' },
  { value: 'FIXED_ROLE', label: 'Role cố định' },
  { value: 'FIXED_USER', label: 'Người dùng cụ thể' },
  { value: 'REQUESTER_SELECT', label: 'Người tạo tự chọn' },
];

const FIXED_ROLES = ['MANAGER', 'CFO', 'COO', 'ADMIN'];
const OPS = ['<', '<=', '>', '>=', '=', '!='] as const;

function ApproverConfig({ node, onUpdate }: {
  node: ApproverGraphNode;
  onUpdate: (updater: (n: GraphNode) => GraphNode) => void;
}) {
  const set = (patch: Partial<ApproverGraphNode>) => onUpdate(n => ({ ...n, ...patch } as GraphNode));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <label style={labelStyle}>Tên bước</label>
        <input value={node.label} onChange={e => set({ label: e.target.value })} style={inputStyle} placeholder="VD: Trưởng phòng phê duyệt" />
      </div>
      <div>
        <label style={labelStyle}>Người phê duyệt</label>
        <select value={node.approver_type} onChange={e => set({ approver_type: e.target.value as ApproverType })} style={inputStyle}>
          {APPROVER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      {node.approver_type === 'FIXED_ROLE' && (
        <div>
          <label style={labelStyle}>Role</label>
          <select value={node.approver_value ?? ''} onChange={e => set({ approver_value: e.target.value })} style={inputStyle}>
            <option value="">-- Chọn role --</option>
            {FIXED_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      )}
      {node.approver_type === 'FIXED_USER' && (
        <div>
          <label style={labelStyle}>User ID</label>
          <input value={node.approver_value ?? ''} onChange={e => set({ approver_value: e.target.value })} style={inputStyle} placeholder="Nhập user ID" />
        </div>
      )}
      <div>
        <label style={labelStyle}>Phương thức phê duyệt</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { val: true, label: 'Tất cả phải duyệt', icon: '⊕' },
            { val: false, label: 'Chỉ cần 1 người', icon: '⊙' },
          ].map(opt => (
            <div
              key={String(opt.val)}
              onClick={() => set({ require_all: opt.val })}
              style={{
                flex: 1, padding: '9px 8px', borderRadius: 8, cursor: 'pointer', textAlign: 'center',
                border: `2px solid ${node.require_all === opt.val ? '#3B82F6' : '#E2E8F0'}`,
                background: node.require_all === opt.val ? '#EFF6FF' : 'white',
                transition: 'all 0.12s',
              }}
            >
              <div style={{ fontSize: 16 }}>{opt.icon}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: node.require_all === opt.val ? '#2563EB' : '#64748B', marginTop: 2 }}>{opt.label}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={labelStyle}>Hạn xử lý (giờ)</label>
          <input type="number" value={node.deadline_hours} min={1}
            onChange={e => set({ deadline_hours: Number(e.target.value) })} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Hết hạn</label>
          <select value={node.on_timeout} onChange={e => set({ on_timeout: e.target.value as OnTimeoutAction })} style={inputStyle}>
            <option value="ESCALATE">Leo thang</option>
            <option value="AUTO_APPROVE">Tự duyệt</option>
            <option value="AUTO_REJECT">Tự từ chối</option>
          </select>
        </div>
      </div>
      <div>
        <label style={labelStyle}>Khi từ chối</label>
        <select value={node.on_reject} onChange={e => set({ on_reject: e.target.value as OnRejectAction })} style={inputStyle}>
          <option value="RETURN_REQUESTER">Trả về người tạo</option>
          <option value="RETURN_PREV_STEP">Trả về bước trước</option>
          <option value="CANCEL_REQUEST">Hủy yêu cầu</option>
        </select>
      </div>
    </div>
  );
}

function BranchArmConfig({ branchNode, armIndex, formFields, onUpdateArm }: {
  branchNode: BranchGraphNode; armIndex: number;
  formFields: FieldOption[];
  onUpdateArm: (updater: (arm: BranchArm) => BranchArm) => void;
}) {
  const arm = branchNode.branches[armIndex];
  const isDefault = armIndex === branchNode.branches.length - 1;

  const setLabel = (label: string) => onUpdateArm(a => ({ ...a, label }));
  const addGroup = () => onUpdateArm(a => ({ ...a, condition_groups: [...a.condition_groups, newConditionGroup()] }));
  const removeGroup = (gid: string) => onUpdateArm(a => ({ ...a, condition_groups: a.condition_groups.filter(g => g.id !== gid) }));
  const updateGroup = (gid: string, updater: (g: GraphConditionGroup) => GraphConditionGroup) =>
    onUpdateArm(a => ({ ...a, condition_groups: a.condition_groups.map(g => g.id === gid ? updater(g) : g) }));
  const addCond = (gid: string) =>
    updateGroup(gid, g => ({ ...g, conditions: [...g.conditions, { id: uid(), field: formFields[0]?.value ?? 'amount', op: '>=', value: '' }] }));
  const removeCond = (gid: string, cid: string) =>
    updateGroup(gid, g => ({ ...g, conditions: g.conditions.filter(c => c.id !== cid) }));
  const updateCond = (gid: string, cid: string, patch: Partial<GraphConditionItem>) =>
    updateGroup(gid, g => ({ ...g, conditions: g.conditions.map(c => c.id === cid ? { ...c, ...patch } : c) }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <label style={labelStyle}>Tên nhánh</label>
        <input value={arm.label} onChange={e => setLabel(e.target.value)} style={inputStyle} />
      </div>

      {isDefault ? (
        <div style={{ background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: 8, padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 22, marginBottom: 6 }}>↩</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Nhánh mặc định</div>
          <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4, lineHeight: 1.5 }}>
            Nhánh này được kích hoạt khi không có nhánh nào khác phù hợp điều kiện
          </div>
        </div>
      ) : (
        <>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Điều kiện</label>
              <button onClick={addGroup}
                style={{ fontSize: 11, color: '#3B82F6', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                + Thêm nhóm (OR)
              </button>
            </div>

            <div style={{ fontSize: 11, color: '#64748B', marginBottom: 10, padding: '6px 10px', background: '#F8FAFC', borderRadius: 6 }}>
              <strong>AND</strong> giữa điều kiện trong nhóm · <strong>OR</strong> giữa các nhóm
            </div>

            {arm.condition_groups.length === 0 ? (
              <div onClick={addGroup} style={{
                background: '#FFF5F5', border: '1.5px dashed #FCA5A5', borderRadius: 8,
                padding: 14, textAlign: 'center', cursor: 'pointer',
              }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>+</div>
                <div style={{ fontSize: 12, color: '#EF4444' }}>Nhấn để thêm điều kiện đầu tiên</div>
              </div>
            ) : (
              arm.condition_groups.map((group, gi) => (
                <div key={group.id}>
                  {gi > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0' }}>
                      <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#A855F7', padding: '2px 10px', background: '#F3E8FF', border: '1px solid #DDD6FE', borderRadius: 20 }}>HOẶC</span>
                      <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
                    </div>
                  )}
                  <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', padding: '6px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#64748B' }}>Nhóm {gi + 1}</span>
                      <button onClick={() => removeGroup(group.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 11 }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#94A3B8')}>
                        ✕ Xóa nhóm
                      </button>
                    </div>
                    <div style={{ padding: 8 }}>
                      {group.conditions.map((cond, ci) => (
                        <div key={cond.id}>
                          {ci > 0 && (
                            <div style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#64748B', margin: '5px 0', letterSpacing: '1px' }}>VÀ</div>
                          )}
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <select value={cond.field} onChange={e => updateCond(group.id, cond.id, { field: e.target.value })}
                              style={{ flex: 2, padding: '5px 4px', fontSize: 12, border: '1px solid #E2E8F0', borderRadius: 6, minWidth: 0 }}>
                              {formFields.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                            </select>
                            <select value={cond.op} onChange={e => updateCond(group.id, cond.id, { op: e.target.value as GraphConditionItem['op'] })}
                              style={{ width: 46, padding: '5px 2px', fontSize: 12, border: '1px solid #E2E8F0', borderRadius: 6, textAlign: 'center' }}>
                              {OPS.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                            <input value={String(cond.value)} onChange={e => updateCond(group.id, cond.id, { value: e.target.value })}
                              placeholder="Giá trị"
                              style={{ flex: 1, padding: '5px 6px', fontSize: 12, border: '1px solid #E2E8F0', borderRadius: 6, minWidth: 0 }} />
                            <button onClick={() => removeCond(group.id, cond.id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#CBD5E1', fontSize: 14, padding: '0 2px', flexShrink: 0 }}
                              onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                              onMouseLeave={e => (e.currentTarget.style.color = '#CBD5E1')}>✕</button>
                          </div>
                        </div>
                      ))}
                      <button onClick={() => addCond(group.id)}
                        style={{ marginTop: 8, fontSize: 11, color: '#3B82F6', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: '3px 0' }}>
                        + Thêm điều kiện VÀ
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ConfigPanel({ selectedItem, graph, formFields, onUpdateNode, onUpdateBranchArm, onClose }: {
  selectedItem: SelectedItem; graph: WorkflowGraph; formFields: FieldOption[];
  onUpdateNode: (id: string, updater: (n: GraphNode) => GraphNode) => void;
  onUpdateBranchArm: (branchId: string, armIndex: number, updater: (arm: BranchArm) => BranchArm) => void;
  onClose: () => void;
}) {
  const targetId = selectedItem.type === 'node' ? selectedItem.nodeId : selectedItem.branchNodeId;
  const targetNode = findNodeById(graph.nodes, targetId);
  if (!targetNode) return null;

  const title = selectedItem.type === 'node'
    ? (targetNode.type === 'approver' ? 'Cấu hình bước phê duyệt' : 'Cấu hình nhánh')
    : `Điều kiện: ${(targetNode as BranchGraphNode).branches[selectedItem.armIndex]?.label ?? ''}`;

  return (
    <div style={{ width: 320, flexShrink: 0, background: 'white', borderLeft: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '13px 16px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F8FAFC', flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: '#1E293B' }}>{title}</span>
        <button onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 16, padding: '2px 6px', borderRadius: 6 }}
          onMouseEnter={e => (e.currentTarget.style.color = '#1E293B')}
          onMouseLeave={e => (e.currentTarget.style.color = '#94A3B8')}>✕</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {selectedItem.type === 'node' && targetNode.type === 'approver' && (
          <ApproverConfig node={targetNode} onUpdate={u => onUpdateNode(selectedItem.nodeId, u)} />
        )}
        {selectedItem.type === 'arm' && targetNode.type === 'branch' && (
          <BranchArmConfig
            branchNode={targetNode} armIndex={selectedItem.armIndex}
            formFields={formFields}
            onUpdateArm={u => onUpdateBranchArm(selectedItem.branchNodeId, selectedItem.armIndex, u)}
          />
        )}
      </div>
    </div>
  );
}

// ─── Main Export ───────────────────────────────────────────────────────────────

export interface WorkflowNodeEditorProps {
  initialGraph: WorkflowGraph;
  formTypes: FormType[];
  formTypeCode?: string;
  onChange: (graph: WorkflowGraph) => void;
}

export default function WorkflowNodeEditor({ initialGraph, formTypes, formTypeCode, onChange }: WorkflowNodeEditorProps) {
  const [graph, setGraph] = useState<WorkflowGraph>(initialGraph);
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [addMenuKey, setAddMenuKey] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Sync if initialGraph changes externally (e.g. loading a different template)
  useEffect(() => {
    setGraph(initialGraph);
    setSelectedItem(null);
    setAddMenuKey(null);
  }, [initialGraph]);

  const updateGraph = (updater: (g: WorkflowGraph) => WorkflowGraph) => {
    setGraph(prev => {
      const next = updater(prev);
      onChange(next);
      return next;
    });
  };

  const handleToggleMenu = (key: string) => setAddMenuKey(prev => prev === key ? null : key);

  const handleAddNode = (afterId: string | null, armId: string | null, type: 'approver' | 'branch') => {
    const newNode = type === 'approver' ? newApproverNode() : newBranchNode();
    updateGraph(g => ({ nodes: insertNodeAfter(g.nodes, afterId, armId, newNode) }));
    setAddMenuKey(null);
    if (type === 'approver') setSelectedItem({ type: 'node', nodeId: newNode.id });
  };

  const handleDeleteNode = (id: string) => {
    updateGraph(g => ({ nodes: removeNode(g.nodes, id) }));
    if (selectedItem?.type === 'node' && selectedItem.nodeId === id) setSelectedItem(null);
    if (selectedItem?.type === 'arm' && selectedItem.branchNodeId === id) setSelectedItem(null);
  };

  const handleUpdateNode = (id: string, updater: (n: GraphNode) => GraphNode) =>
    updateGraph(g => ({ nodes: updateNodeInTree(g.nodes, id, updater) }));

  const handleUpdateBranchArm = (branchId: string, armIndex: number, updater: (arm: BranchArm) => BranchArm) =>
    updateGraph(g => ({ nodes: updateBranchArmInTree(g.nodes, branchId, armIndex, updater) }));

  const formFields = getFormFields(formTypes, formTypeCode);

  // Close add menu on outside click
  useEffect(() => {
    if (!addMenuKey) return;
    const handler = (e: MouseEvent) => {
      if (!canvasRef.current?.contains(e.target as Node)) setAddMenuKey(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [addMenuKey]);

  return (
    <div style={{ display: 'flex', height: '100%', background: '#F0F2F5', overflow: 'hidden' }}>
      {/* Canvas */}
      <div
        ref={canvasRef}
        onClick={e => { if (e.target === e.currentTarget) { setSelectedItem(null); setAddMenuKey(null); } }}
        style={{ flex: 1, overflow: 'auto', padding: '32px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
      >
        <TerminalNode type="start" />
        <AddBtn afterId={null} armId={null} activeKey={addMenuKey} onToggle={handleToggleMenu} onAdd={handleAddNode} />

        {graph.nodes.map(node => (
          <React.Fragment key={node.id}>
            <NodeRenderer
              node={node} selectedItem={selectedItem} addMenuKey={addMenuKey}
              onSelectNode={id => { setSelectedItem({ type: 'node', nodeId: id }); setAddMenuKey(null); }}
              onSelectArm={(branchNodeId, armIndex) => { setSelectedItem({ type: 'arm', branchNodeId, armIndex }); setAddMenuKey(null); }}
              onDeleteNode={handleDeleteNode}
              onAddNode={handleAddNode}
              onToggleMenu={handleToggleMenu}
            />
            <AddBtn afterId={node.id} armId={null} activeKey={addMenuKey} onToggle={handleToggleMenu} onAdd={handleAddNode} />
          </React.Fragment>
        ))}

        <TerminalNode type="end" />

        {graph.nodes.length === 0 && (
          <div style={{ marginTop: -8, marginBottom: 8, padding: '16px 24px', background: 'white', borderRadius: 12, border: '1.5px dashed #CBD5E1', textAlign: 'center', maxWidth: 280 }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>🏗️</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Chưa có bước nào</div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>Nhấn dấu + để thêm bước phê duyệt hoặc nhánh điều kiện</div>
          </div>
        )}
      </div>

      {/* Config panel */}
      {selectedItem && (
        <ConfigPanel
          selectedItem={selectedItem} graph={graph} formFields={formFields}
          onUpdateNode={handleUpdateNode}
          onUpdateBranchArm={handleUpdateBranchArm}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  );
}

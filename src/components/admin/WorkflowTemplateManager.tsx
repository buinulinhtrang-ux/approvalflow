import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, GitBranch, Layers, Eye, Edit3 } from 'lucide-react';
import type { WorkflowTemplate, FormType, BranchCondition, BranchAction, WorkflowGraph } from '../../types';
import * as api from '../../lib/api';
import WorkflowDiagram from './WorkflowDiagram';
import type { DiagramStep } from './WorkflowDiagram';
import WorkflowNodeEditor, { graphToFlatSteps } from './WorkflowNodeEditor';

// ─── Local types ──────────────────────────────────────────────────────────────

interface BranchConditionForm {
  _key:       string;
  field:      string;
  op:         string;
  value:      string;
  action:     BranchAction;
  goto_order: string;
  label:      string;
}

interface StepForm {
  _key:              string;
  step_order:        number;
  step_name:         string;
  approver_type:     string;
  approver_value:    string;
  parallel_group:    string;   // '' = no parallel
  require_all:       boolean;
  deadline_hours:    number;
  on_timeout:        string;
  on_reject:         string;
  branch_conditions: BranchConditionForm[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const APPROVER_TYPES = [
  { value: 'DYNAMIC_DEPT_HEAD', label: 'Trưởng bộ phận (tự động)' },
  { value: 'DYNAMIC_MANAGER',   label: 'Quản lý trực tiếp (tự động)' },
  { value: 'FIXED_ROLE',        label: 'Theo role cố định' },
  { value: 'FIXED_USER',        label: 'Người dùng cụ thể (ID)' },
  { value: 'REQUESTER_SELECT',  label: 'Người tạo tự chọn' },
];

const FIXED_ROLES = ['MANAGER', 'CFO', 'COO', 'ADMIN'];

const ON_REJECT = [
  { value: 'RETURN_REQUESTER', label: 'Trả về người tạo' },
  { value: 'RETURN_PREV_STEP', label: 'Trả về bước trước' },
  { value: 'CANCEL_REQUEST',   label: 'Hủy yêu cầu' },
];

const ON_TIMEOUT = [
  { value: 'ESCALATE',     label: 'Leo thang cấp trên' },
  { value: 'AUTO_APPROVE', label: 'Tự động duyệt' },
  { value: 'AUTO_REJECT',  label: 'Tự động từ chối' },
];

const OPS = ['<', '<=', '>', '>=', '=', '!='] as const;

const BRANCH_ACTIONS: { value: BranchAction; label: string; color: string }[] = [
  { value: 'SKIP',    label: 'Bỏ qua bước này',       color: '#D97706' },
  { value: 'GOTO',    label: 'Chuyển tới bước...',    color: '#7C3AED' },
  { value: 'APPROVE', label: 'Tự động PHÊ DUYỆT',    color: '#059669' },
  { value: 'REJECT',  label: 'Tự động TỪ CHỐI',      color: '#DC2626' },
];

// Built-in condition fields (always available)
const BUILTIN_FIELDS: { key: string; label: string }[] = [
  { key: 'amount',      label: 'Giá trị yêu cầu (amount)' },
  { key: 'is_urgent',   label: 'Khẩn cấp (is_urgent)' },
  { key: 'department',  label: 'Phòng ban (department)' },
  { key: 'form_type',   label: 'Loại biểu mẫu (form_type)' },
];

let _keyCounter = 0;
const genKey = () => `k_${++_keyCounter}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function templateToSteps(t: WorkflowTemplate): StepForm[] {
  return [...(t.workflow_steps || [])]
    .sort((a, b) => a.step_order - b.step_order)
    .map(s => ({
      _key:           genKey(),
      step_order:     s.step_order,
      step_name:      s.step_name,
      approver_type:  s.approver_type,
      approver_value: s.approver_value ?? '',
      parallel_group: s.parallel_group != null ? String(s.parallel_group) : '',
      require_all:    s.require_all,
      deadline_hours: s.deadline_hours,
      on_timeout:     s.on_timeout,
      on_reject:      s.on_reject,
      branch_conditions: (s.branch_conditions ?? []).map(c => ({
        _key:       genKey(),
        field:      c.field,
        op:         c.op,
        value:      String(c.value),
        action:     c.action,
        goto_order: c.goto_order != null ? String(c.goto_order) : '',
        label:      c.label ?? '',
      })),
    }));
}

function reorder(steps: StepForm[]): StepForm[] {
  return steps.map((s, i) => ({ ...s, step_order: i + 1 }));
}

function stepsToPreview(steps: StepForm[]): DiagramStep[] {
  return steps.map(s => ({
    id:           s._key,
    order:        s.step_order,
    name:         s.step_name || `Bước ${s.step_order}`,
    approverLabel: APPROVER_TYPES.find(t => t.value === s.approver_type)?.label ?? s.approver_type,
    parallelGroup: s.parallel_group ? Number(s.parallel_group) : undefined,
    requireAll:    s.require_all,
    branchConditions: s.branch_conditions
      .filter(c => c.field && c.value)
      .map(c => ({
        field:      c.field,
        op:         c.op as any,
        value:      isNaN(Number(c.value)) ? c.value : Number(c.value),
        action:     c.action,
        goto_order: c.goto_order ? Number(c.goto_order) : undefined,
        label:      c.label || undefined,
      })),
  }));
}

function getFormFields(formType: FormType | null): { key: string; label: string }[] {
  const fields: { key: string; label: string }[] = [...BUILTIN_FIELDS];
  if (!formType?.field_schema?.sections) return fields;
  for (const section of formType.field_schema.sections) {
    for (const field of section.fields) {
      if (['number', 'boolean', 'select', 'text'].includes(field.type)) {
        fields.push({ key: `form_data.${field.key}`, label: `${field.label} (${field.key})` });
      }
    }
  }
  return fields;
}

// ─── Shared style ─────────────────────────────────────────────────────────────

const INP: React.CSSProperties = {
  width: '100%', padding: '7px 10px', border: '1px solid #E2E8F4',
  borderRadius: 7, fontSize: 12.5, fontFamily: 'inherit',
  outline: 'none', background: '#FAFAFA', boxSizing: 'border-box',
};
const SEL: React.CSSProperties = { ...INP };

function Lbl({ children }: { children: React.ReactNode }) {
  return <label style={{ fontSize: 10.5, color: '#8896B0', fontWeight: 600, display: 'block', marginBottom: 4 }}>{children}</label>;
}

function IBtn({ children, onClick, title, disabled, danger }: {
  children: React.ReactNode; onClick: () => void;
  title?: string; disabled?: boolean; danger?: boolean;
}) {
  return (
    <button onClick={onClick} title={title} disabled={disabled} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 26, height: 26, borderRadius: 6, border: '1px solid #E2E8F4',
      background: disabled ? '#F8FAFC' : '#fff',
      color: disabled ? '#CBD5E1' : danger ? '#DC2626' : '#64748B',
      cursor: disabled ? 'not-allowed' : 'pointer',
    }}>
      {children}
    </button>
  );
}

// ─── BranchConditionRow ───────────────────────────────────────────────────────

function BranchConditionRow({ cond, fields, steps, totalSteps, onChange, onRemove }: {
  cond: BranchConditionForm;
  fields: { key: string; label: string }[];
  steps: StepForm[];
  totalSteps: number;
  onChange: (patch: Partial<BranchConditionForm>) => void;
  onRemove: () => void;
}) {
  const actionCfg = BRANCH_ACTIONS.find(a => a.value === cond.action);

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', padding: '7px 8px', background: '#F8FAFC', borderRadius: 8, border: '1px solid #E2E8F4' }}>
      {/* Field */}
      <div style={{ flex: '0 0 160px' }}>
        <Lbl>FIELD</Lbl>
        <select style={SEL} value={cond.field} onChange={e => onChange({ field: e.target.value })}>
          <option value="">-- Chọn field --</option>
          {fields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
      </div>

      {/* Op */}
      <div style={{ flex: '0 0 68px' }}>
        <Lbl>PHÉP SO</Lbl>
        <select style={SEL} value={cond.op} onChange={e => onChange({ op: e.target.value })}>
          {OPS.map(op => <option key={op} value={op}>{op}</option>)}
        </select>
      </div>

      {/* Value */}
      <div style={{ flex: '0 0 100px' }}>
        <Lbl>GIÁ TRỊ</Lbl>
        <input style={INP} value={cond.value}
          onChange={e => onChange({ value: e.target.value })}
          placeholder="5000000" />
      </div>

      {/* Action */}
      <div style={{ flex: '0 0 140px' }}>
        <Lbl>HÀNH ĐỘNG</Lbl>
        <select style={{ ...SEL, color: actionCfg?.color ?? 'inherit', fontWeight: 600 }}
          value={cond.action} onChange={e => onChange({ action: e.target.value as BranchAction })}>
          {BRANCH_ACTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
      </div>

      {/* Goto order (only when GOTO) */}
      {cond.action === 'GOTO' && (
        <div style={{ flex: '0 0 80px' }}>
          <Lbl>TỚI BƯỚC</Lbl>
          <select style={SEL} value={cond.goto_order} onChange={e => onChange({ goto_order: e.target.value })}>
            <option value="">-- Chọn --</option>
            {steps.map(s => (
              <option key={s._key} value={String(s.step_order)}>
                Bước {s.step_order}{s.step_name ? ` — ${s.step_name}` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Label */}
      <div style={{ flex: 1 }}>
        <Lbl>NHÃN (tùy chọn)</Lbl>
        <input style={INP} value={cond.label}
          onChange={e => onChange({ label: e.target.value })}
          placeholder="Mô tả điều kiện..." />
      </div>

      {/* Remove */}
      <div style={{ paddingBottom: 2 }}>
        <IBtn onClick={onRemove} danger title="Xóa điều kiện"><Trash2 size={11} /></IBtn>
      </div>
    </div>
  );
}

// ─── StepCard ─────────────────────────────────────────────────────────────────

function StepCard({ step, index, total, allSteps, formFields, onChange, onRemove, onMove }: {
  step: StepForm;
  index: number;
  total: number;
  allSteps: StepForm[];
  formFields: { key: string; label: string }[];
  onChange: (patch: Partial<StepForm>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [showBranch, setShowBranch] = useState(step.branch_conditions.length > 0);
  const [showParallel, setShowParallel] = useState(!!step.parallel_group);
  const needsValue = step.approver_type === 'FIXED_ROLE' || step.approver_type === 'FIXED_USER';

  const addCondition = () => {
    onChange({
      branch_conditions: [
        ...step.branch_conditions,
        { _key: genKey(), field: 'amount', op: '<', value: '', action: 'SKIP', goto_order: '', label: '' },
      ],
    });
  };

  const updateCondition = (key: string, patch: Partial<BranchConditionForm>) => {
    onChange({
      branch_conditions: step.branch_conditions.map(c => c._key === key ? { ...c, ...patch } : c),
    });
  };

  const removeCondition = (key: string) => {
    onChange({ branch_conditions: step.branch_conditions.filter(c => c._key !== key) });
  };

  const parallelGroupColor = step.parallel_group
    ? ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981'][
        (Number(step.parallel_group) - 1) % 5
      ]
    : undefined;

  return (
    <div style={{
      background: '#fff', border: '1px solid #E2E8F4', borderRadius: 10, marginBottom: 10, overflow: 'hidden',
      borderLeft: parallelGroupColor ? `3px solid ${parallelGroupColor}` : undefined,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '7px 12px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F4', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#0E1F40', background: '#EFF4FF', padding: '2px 10px', borderRadius: 12 }}>
          Bước {step.step_order}
        </span>
        {step.step_name && (
          <span style={{ fontSize: 12, color: '#64748B' }}>{step.step_name}</span>
        )}
        {step.parallel_group && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 8px', borderRadius: 9, color: parallelGroupColor, background: `${parallelGroupColor}18` }}>
            ⇄ Nhóm song song {step.parallel_group}
          </span>
        )}
        {step.branch_conditions.length > 0 && (
          <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 8px', borderRadius: 9, color: '#7C3AED', background: '#EDE9FE' }}>
            <GitBranch size={9} style={{ display: 'inline', marginRight: 3 }} />
            {step.branch_conditions.length} điều kiện
          </span>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 4 }}>
          <IBtn title="Lên"    onClick={() => onMove(-1)} disabled={index === 0}><ChevronUp   size={12} /></IBtn>
          <IBtn title="Xuống"  onClick={() => onMove(1)}  disabled={index === total - 1}><ChevronDown size={12} /></IBtn>
          <IBtn title="Xóa"    onClick={onRemove} danger><Trash2 size={12} /></IBtn>
        </div>
      </div>

      {/* Main fields */}
      <div style={{ padding: '11px 12px', display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr', gap: '9px 11px' }}>
        <div style={{ gridColumn: '1 / 3' }}>
          <Lbl>TÊN BƯỚC</Lbl>
          <input style={INP} value={step.step_name}
            onChange={e => onChange({ step_name: e.target.value })}
            placeholder="VD: Trưởng bộ phận, CFO, COO..." />
        </div>

        <div>
          <Lbl>LOẠI APPROVER</Lbl>
          <select style={SEL} value={step.approver_type}
            onChange={e => onChange({ approver_type: e.target.value, approver_value: '' })}>
            {APPROVER_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div>
          <Lbl>GIÁ TRỊ APPROVER</Lbl>
          {step.approver_type === 'FIXED_ROLE' ? (
            <select style={SEL} value={step.approver_value}
              onChange={e => onChange({ approver_value: e.target.value })}>
              <option value="">-- Chọn role --</option>
              {FIXED_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          ) : step.approver_type === 'FIXED_USER' ? (
            <input style={INP} type="number" value={step.approver_value}
              onChange={e => onChange({ approver_value: e.target.value })}
              placeholder="User ID" />
          ) : (
            <div style={{ padding: '7px 10px', fontSize: 12, color: '#94A3B8', background: '#F8FAFC', borderRadius: 7, border: '1px solid #E2E8F4' }}>
              Tự động
            </div>
          )}
        </div>

        <div>
          <Lbl>DEADLINE (giờ)</Lbl>
          <input style={INP} type="number" min={1}
            value={step.deadline_hours}
            onChange={e => onChange({ deadline_hours: Math.max(1, Number(e.target.value)) })} />
        </div>

        <div>
          <Lbl>KHI QUÁ HẠN</Lbl>
          <select style={SEL} value={step.on_timeout} onChange={e => onChange({ on_timeout: e.target.value })}>
            {ON_TIMEOUT.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div>
          <Lbl>KHI TỪ CHỐI</Lbl>
          <select style={SEL} value={step.on_reject} onChange={e => onChange({ on_reject: e.target.value })}>
            {ON_REJECT.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* Parallel group config */}
      <div style={{ borderTop: '1px solid #F1F5F9', padding: '7px 12px' }}>
        <button
          onClick={() => {
            const next = !showParallel;
            setShowParallel(next);
            if (!next) onChange({ parallel_group: '', require_all: true });
          }}
          style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none',
                   cursor: 'pointer', fontSize: 11.5, color: showParallel ? '#3B82F6' : '#94A3B8',
                   fontWeight: 600, fontFamily: 'inherit', padding: 0 }}
        >
          <Layers size={12} />
          Chạy song song với bước khác
          {showParallel && step.parallel_group && (
            <span style={{ fontSize: 10, background: '#EFF6FF', color: '#3B82F6', padding: '1px 7px', borderRadius: 8, marginLeft: 4 }}>
              Nhóm {step.parallel_group}
            </span>
          )}
        </button>

        {showParallel && (
          <div style={{ display: 'flex', gap: 12, marginTop: 8, alignItems: 'center' }}>
            <div style={{ flex: '0 0 140px' }}>
              <Lbl>SỐ NHÓM SONG SONG</Lbl>
              <input style={INP} type="number" min={1} max={99}
                value={step.parallel_group}
                onChange={e => onChange({ parallel_group: e.target.value })}
                placeholder="VD: 1, 2, 3..." />
            </div>
            <div style={{ flex: 1 }}>
              <Lbl>YÊU CẦU PHÊ DUYỆT</Lbl>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                {[
                  { val: true,  label: 'Tất cả phải duyệt' },
                  { val: false, label: 'Chỉ cần 1 người' },
                ].map(opt => (
                  <button
                    key={String(opt.val)}
                    onClick={() => onChange({ require_all: opt.val })}
                    style={{
                      padding: '5px 12px', borderRadius: 7, border: '1px solid',
                      borderColor: step.require_all === opt.val ? '#3B82F6' : '#E2E8F4',
                      background: step.require_all === opt.val ? '#EFF6FF' : '#fff',
                      color: step.require_all === opt.val ? '#1D4ED8' : '#64748B',
                      fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#8896B0', maxWidth: 220 }}>
              Các bước có cùng số nhóm sẽ chạy đồng thời. Bước tiếp theo chỉ kích hoạt khi toàn bộ nhóm hoàn thành.
            </div>
          </div>
        )}
      </div>

      {/* Branch conditions */}
      <div style={{ borderTop: '1px solid #F1F5F9', padding: '7px 12px' }}>
        <button
          onClick={() => setShowBranch(p => !p)}
          style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none',
                   cursor: 'pointer', fontSize: 11.5, color: showBranch ? '#7C3AED' : '#94A3B8',
                   fontWeight: 600, fontFamily: 'inherit', padding: 0 }}
        >
          <GitBranch size={12} />
          Điều kiện rẽ nhánh (branch conditions)
          {step.branch_conditions.length > 0 && (
            <span style={{ fontSize: 10, background: '#EDE9FE', color: '#7C3AED', padding: '1px 7px', borderRadius: 8, marginLeft: 4 }}>
              {step.branch_conditions.length} điều kiện
            </span>
          )}
        </button>

        {showBranch && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 11, color: '#8896B0', marginBottom: 2 }}>
              Điều kiện được đánh giá theo thứ tự — điều kiện đầu tiên khớp sẽ được áp dụng.
              Nếu không có điều kiện nào khớp, bước này chạy bình thường.
            </div>

            {step.branch_conditions.map(cond => (
              <BranchConditionRow
                key={cond._key}
                cond={cond}
                fields={formFields}
                steps={allSteps.filter(s => s._key !== step._key)}
                totalSteps={total}
                onChange={patch => updateCondition(cond._key, patch)}
                onRemove={() => removeCondition(cond._key)}
              />
            ))}

            <button
              onClick={addCondition}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px',
                       border: '1.5px dashed #C4B5FD', borderRadius: 8, background: '#FAFAFF',
                       color: '#7C3AED', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <Plus size={11} /> Thêm điều kiện
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function WorkflowTemplateManager() {
  const [templates,   setTemplates]   = useState<WorkflowTemplate[]>([]);
  const [formTypes,   setFormTypes]   = useState<FormType[]>([]);
  const [selectedId,  setSelectedId]  = useState<number | null>(null);
  const [isNew,       setIsNew]       = useState(false);
  const [tName,       setTName]       = useState('');
  const [tDesc,       setTDesc]       = useState('');
  const [tFormType,   setTFormType]   = useState('');  // form_type_code
  const [steps,       setSteps]       = useState<StepForm[]>([]);
  const [graph,       setGraph]       = useState<WorkflowGraph>({ nodes: [] });
  const [saving,      setSaving]      = useState(false);
  const [loading,     setLoading]     = useState(true);
  const [msg,         setMsg]         = useState<{ ok: boolean; text: string } | null>(null);
  const [editorTab,   setEditorTab]   = useState<'edit' | 'diagram' | 'visual'>('edit');

  const selectedFormType = formTypes.find(f => f.code === tFormType) ?? null;
  const formFields       = getFormFields(selectedFormType);

  const loadTemplates = useCallback(async () => {
    try {
      const [tmplData, ftData] = await Promise.all([
        api.getWorkflowTemplates(),
        api.adminGetAllFormTypes(),
      ]);
      setTemplates(tmplData);
      setFormTypes(ftData);
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const selectTemplate = (t: WorkflowTemplate) => {
    setIsNew(false);
    setSelectedId(t.id);
    setTName(t.name);
    setTDesc(t.description ?? '');
    setTFormType(t.form_type_code ?? '');
    setSteps(templateToSteps(t));
    setGraph(t.nodes ?? { nodes: [] });
    setMsg(null);
    setEditorTab(t.nodes ? 'visual' : 'edit');
  };

  const startNew = () => {
    setIsNew(true);
    setSelectedId(null);
    setTName('');
    setTDesc('');
    setTFormType('');
    setSteps([]);
    setGraph({ nodes: [] });
    setMsg(null);
    setEditorTab('visual');
  };

  const addStep = () => {
    setSteps(prev => reorder([...prev, {
      _key: genKey(), step_order: prev.length + 1,
      step_name: '', approver_type: 'DYNAMIC_DEPT_HEAD', approver_value: '',
      parallel_group: '', require_all: true,
      deadline_hours: 48, on_timeout: 'ESCALATE', on_reject: 'RETURN_REQUESTER',
      branch_conditions: [],
    }]));
  };

  const removeStep = (key: string) =>
    setSteps(prev => reorder(prev.filter(s => s._key !== key)));

  const moveStep = (key: string, dir: -1 | 1) =>
    setSteps(prev => {
      const i = prev.findIndex(s => s._key === key);
      if (i + dir < 0 || i + dir >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[i + dir]] = [next[i + dir], next[i]];
      return reorder(next);
    });

  const updateStep = (key: string, patch: Partial<StepForm>) =>
    setSteps(prev => prev.map(s => s._key === key ? { ...s, ...patch } : s));

  const handleSave = async () => {
    if (!tName.trim()) { setMsg({ ok: false, text: 'Vui lòng nhập tên template' }); return; }

    // Determine steps + nodes based on current editing mode
    const isVisual = editorTab === 'visual';
    const flatSteps = isVisual ? graphToFlatSteps(graph) : steps;
    const saveNodes = isVisual ? graph : undefined;

    if (flatSteps.length === 0) { setMsg({ ok: false, text: 'Template phải có ít nhất 1 bước' }); return; }

    if (!isVisual) {
      for (const s of steps) {
        if (!s.step_name.trim()) {
          setMsg({ ok: false, text: `Bước ${s.step_order}: chưa nhập tên bước` }); return;
        }
        if (['FIXED_ROLE', 'FIXED_USER'].includes(s.approver_type) && !s.approver_value.trim()) {
          setMsg({ ok: false, text: `Bước ${s.step_order}: cần nhập giá trị approver` }); return;
        }
        for (const c of s.branch_conditions) {
          if (!c.field || !c.value) {
            setMsg({ ok: false, text: `Bước ${s.step_order}: điều kiện rẽ nhánh chưa đầy đủ` }); return;
          }
          if (c.action === 'GOTO' && !c.goto_order) {
            setMsg({ ok: false, text: `Bước ${s.step_order}: điều kiện GOTO cần chọn bước đích` }); return;
          }
        }
      }
    }

    setSaving(true);
    setMsg(null);
    try {
      const stepsPayload = isVisual
        ? flatSteps as any[]
        : steps.map(s => ({
            step_order:     s.step_order,
            step_name:      s.step_name.trim(),
            approver_type:  s.approver_type as any,
            approver_value: ['FIXED_ROLE', 'FIXED_USER'].includes(s.approver_type)
                              ? s.approver_value.trim() : undefined,
            parallel_group: s.parallel_group ? Number(s.parallel_group) : undefined,
            require_all:    s.require_all,
            deadline_hours: s.deadline_hours,
            on_timeout:     s.on_timeout as any,
            on_reject:      s.on_reject as any,
            branch_conditions: s.branch_conditions
              .filter(c => c.field && c.value)
              .map(c => ({
                field:      c.field,
                op:         c.op as any,
                value:      isNaN(Number(c.value)) ? c.value : Number(c.value),
                action:     c.action,
                goto_order: c.action === 'GOTO' && c.goto_order ? Number(c.goto_order) : undefined,
                label:      c.label || undefined,
              })),
          }));

      const result = await api.adminSaveTemplate({
        template: {
          id:             isNew ? undefined : (selectedId ?? undefined),
          name:           tName.trim(),
          description:    tDesc.trim() || undefined,
          form_type_code: tFormType || undefined,
        },
        steps: stepsPayload,
        nodes: saveNodes,
      });

      if (result.warning) {
        setMsg({ ok: false, text: result.warning });
      } else {
        setMsg({ ok: true, text: 'Lưu template thành công!' });
        if (isNew) { setIsNew(false); setSelectedId(result.id); }
      }
      await loadTemplates();
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setSaving(false);
    }
  };

  const hasEditor = isNew || selectedId !== null;
  const diagramSteps = stepsToPreview(steps);

  return (
    <div style={{
      display: 'flex', height: 'calc(100vh - 160px)',
      border: '1px solid #E2E8F4', borderRadius: 10,
      background: '#F7F9FC', overflow: 'hidden',
    }}>
      {/* ── Left: Template List ── */}
      <div style={{ width: 256, borderRight: '1px solid #E2E8F4', display: 'flex', flexDirection: 'column', background: '#fff', flexShrink: 0 }}>
        <div style={{ padding: '10px 10px', borderBottom: '1px solid #E2E8F4' }}>
          <button
            onClick={startNew}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              width: '100%', padding: '8px', borderRadius: 8,
              border: '1.5px dashed #0E1F40', background: 'transparent',
              color: '#0E1F40', fontSize: 12.5, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <Plus size={13} /> Tạo Template Mới
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
          {loading ? (
            <div style={{ padding: 20, textAlign: 'center', color: '#8896B0', fontSize: 12 }}>Đang tải...</div>
          ) : templates.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: '#8896B0', fontSize: 12 }}>Chưa có template</div>
          ) : templates.map(t => {
            const active = !isNew && selectedId === t.id;
            const ft = formTypes.find(f => f.code === (t as any).form_type_code);
            return (
              <button key={t.id} onClick={() => selectTemplate(t)} style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '9px 12px', borderRadius: 8, border: 'none',
                cursor: 'pointer', fontFamily: 'inherit', marginBottom: 3,
                background: active ? '#EFF4FF' : 'transparent',
                borderLeft: `3px solid ${active ? '#0E1F40' : 'transparent'}`,
                transition: '.1s',
              }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1C2333' }}>{t.name}</div>
                <div style={{ fontSize: 11, color: '#8896B0', marginTop: 2 }}>
                  {t.workflow_steps?.length ?? 0} bước
                  {ft && <span style={{ marginLeft: 6, color: '#7C3AED' }}>· {ft.name}</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Right: Editor ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!hasEditor ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8896B0', fontSize: 13 }}>
            Chọn một template bên trái hoặc nhấn "Tạo Template Mới"
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ padding: '12px 18px', borderBottom: '1px solid #E2E8F4', background: '#fff', flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                {/* Template metadata */}
                <div style={{ flex: 1, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ flex: '0 0 240px' }}>
                    <Lbl>TÊN TEMPLATE</Lbl>
                    <input value={tName} onChange={e => setTName(e.target.value)}
                      placeholder="VD: Luồng phê duyệt chuẩn 3 bước" style={INP} />
                  </div>
                  <div style={{ flex: '0 0 180px' }}>
                    <Lbl>LOẠI BIỂU MẪU ÁP DỤNG</Lbl>
                    <select style={SEL} value={tFormType} onChange={e => setTFormType(e.target.value)}>
                      <option value="">-- Tất cả biểu mẫu --</option>
                      {formTypes.map(f => <option key={f.code} value={f.code}>{f.name}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <Lbl>MÔ TẢ</Lbl>
                    <input value={tDesc} onChange={e => setTDesc(e.target.value)}
                      placeholder="Mô tả ngắn..." style={INP} />
                  </div>
                </div>

                {/* Save button */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
                  <button onClick={handleSave} disabled={saving} style={{
                    padding: '7px 18px', borderRadius: 8, border: 'none',
                    background: saving ? '#94A3B8' : '#0E1F40',
                    color: '#fff', fontSize: 12.5, fontWeight: 600,
                    cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                  }}>
                    {saving ? 'Đang lưu...' : 'Lưu Template'}
                  </button>
                  {msg && (
                    <div style={{ fontSize: 11.5, color: msg.ok ? '#16A34A' : '#DC2626', maxWidth: 260, textAlign: 'right' }}>
                      {msg.text}
                    </div>
                  )}
                </div>
              </div>

              {/* Tab switcher: Edit / Diagram / Visual */}
              <div style={{ display: 'flex', gap: 2, marginTop: 10 }}>
                {([
                  { key: 'visual',  icon: GitBranch, label: 'Thiết kế trực quan' },
                  { key: 'edit',    icon: Edit3,     label: 'Chỉnh sửa bước' },
                  { key: 'diagram', icon: Eye,       label: 'Xem sơ đồ luồng' },
                ] as const).map(tab => (
                  <button key={tab.key} onClick={() => setEditorTab(tab.key)} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '5px 14px', borderRadius: 7, border: 'none',
                    cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                    background: editorTab === tab.key ? '#0E1F40' : 'transparent',
                    color: editorTab === tab.key ? '#fff' : '#64748B',
                    transition: '.15s',
                  }}>
                    <tab.icon size={13} />
                    {tab.label}
                  </button>
                ))}
                {tFormType && (
                  <span style={{ fontSize: 11, color: '#7C3AED', alignSelf: 'center', marginLeft: 8 }}>
                    Field dropdown được lấy từ: <strong>{selectedFormType?.name ?? tFormType}</strong>
                  </span>
                )}
              </div>
            </div>

            {/* Body: Visual tab */}
            {editorTab === 'visual' && (
              <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
                <WorkflowNodeEditor
                  initialGraph={graph}
                  formTypes={formTypes}
                  formTypeCode={tFormType || undefined}
                  onChange={setGraph}
                />
              </div>
            )}

            {/* Body: Edit tab */}
            {editorTab === 'edit' && (
              <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
                {steps.length === 0 && (
                  <div style={{ textAlign: 'center', padding: 40, color: '#8896B0', fontSize: 13,
                                border: '1.5px dashed #E2E8F4', borderRadius: 10 }}>
                    Chưa có bước nào. Nhấn "Thêm bước" bên dưới để bắt đầu.
                  </div>
                )}

                {steps.map((step, idx) => (
                  <StepCard
                    key={step._key}
                    step={step}
                    index={idx}
                    total={steps.length}
                    allSteps={steps}
                    formFields={formFields}
                    onChange={patch => updateStep(step._key, patch)}
                    onRemove={() => removeStep(step._key)}
                    onMove={dir => moveStep(step._key, dir)}
                  />
                ))}

                <button onClick={addStep} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  width: '100%', padding: '10px', marginTop: 8, borderRadius: 8,
                  border: '1.5px dashed #CBD5E1', background: 'transparent',
                  color: '#64748B', fontSize: 12.5, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  <Plus size={13} /> Thêm bước
                </button>

                {/* Parallel group legend */}
                {steps.some(s => s.parallel_group) && (
                  <div style={{ marginTop: 16, padding: '10px 14px', background: '#F0F9FF', borderRadius: 8, border: '1px solid #BFDBFE', fontSize: 11.5, color: '#1D4ED8' }}>
                    <strong>Nhóm song song:</strong> Các bước có cùng số nhóm sẽ được kích hoạt đồng thời.
                    Bước tiếp theo chỉ được kích hoạt khi toàn bộ nhóm hoàn thành (hoặc ít nhất 1 nếu "Chỉ cần 1 người").
                  </div>
                )}
              </div>
            )}

            {/* Body: Diagram tab */}
            {editorTab === 'diagram' && (
              <div style={{ flex: 1, overflowY: 'auto', background: '#F7F9FC' }}>
                {steps.length === 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#8896B0', fontSize: 13 }}>
                    Thêm bước để xem sơ đồ luồng
                  </div>
                ) : (
                  <div style={{ padding: '20px', display: 'flex', justifyContent: 'center' }}>
                    <div style={{ width: '100%', maxWidth: 640 }}>
                      <WorkflowDiagram steps={diagramSteps} mode="template" />
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

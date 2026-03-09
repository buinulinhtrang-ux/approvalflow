import React, { useState, useEffect } from 'react';
import { Check, X, MessageSquare, Clock, ShieldCheck, Calculator, Info } from 'lucide-react';
import type { Request, StepInstance, FormType, User, RequestItem } from '../types';
import * as api from '../lib/api';
import WorkflowDiagram, { stepInstancesToDiagram } from './admin/WorkflowDiagram';

interface RequestDetailProps {
  requestId: number;
  currentUser: User;
  onApprove: () => void;
  onBack: () => void;
}

const STATUS_CFG: Record<string, { label: string; dot: string; bg: string; color: string }> = {
  DRAFT:     { label: 'Nháp',        dot: '#9CA3AF', bg: '#F3F4F6', color: '#374151' },
  PENDING:   { label: 'Đang chờ',   dot: '#F59E0B', bg: '#FEF3C7', color: '#B45309' },
  IN_REVIEW: { label: 'Đang xét',   dot: '#3B82F6', bg: '#DBEAFE', color: '#1D4ED8' },
  APPROVED:  { label: 'Đã duyệt',  dot: '#10B981', bg: '#D1FAE5', color: '#065F46' },
  REJECTED:  { label: 'Từ chối',   dot: '#EF4444', bg: '#FEE2E2', color: '#991B1B' },
  CANCELLED: { label: 'Đã hủy',    dot: '#6B7280', bg: '#F3F4F6', color: '#374151' },
};


export default function RequestDetail({
  requestId,
  currentUser,
  onApprove,
  onBack,
}: RequestDetailProps) {
  const [request, setRequest]             = useState<Request | null>(null);
  const [stepInstances, setStepInstances] = useState<StepInstance[]>([]);
  const [items, setItems]                 = useState<RequestItem[]>([]);
  const [formType, setFormType]           = useState<FormType | null>(null);
  const [comment, setComment]             = useState('');
  const [loading, setLoading]             = useState(true);
  const [approving, setApproving]         = useState(false);
  const [error, setError]                 = useState<string | null>(null);

  useEffect(() => { fetchData(); }, [requestId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [req, steps, its] = await Promise.all([
        api.getRequestById(requestId),
        api.getStepInstances(requestId),
        api.getRequestItems(requestId),
      ]);
      setRequest(req);
      setStepInstances(steps);
      setItems(its);
      if (req.form_type) {
        const ft = await api.getFormType(req.form_type).catch(() => null);
        setFormType(ft);
      }
    } catch (err) {
      console.error('Error fetching request details:', err);
    } finally {
      setLoading(false);
    }
  };

  // Find the step this user can act on
  const myPendingStep = stepInstances.find(
    s =>
      s.status === 'IN_PROGRESS' &&
      (s.assigned_to_id === currentUser.id ||
        (!s.assigned_to_id && s.assigned_role === currentUser.role))
  );

  const handleApproveAction = async (action: 'APPROVED' | 'REJECTED') => {
    if (!myPendingStep) return;
    setError(null);
    setApproving(true);
    try {
      await api.approveStep({
        step_instance_id: myPendingStep.id,
        approver_id:      currentUser.id,
        action,
        comment:          comment.trim() || undefined,
      });
      onApprove();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra khi phê duyệt');
    } finally {
      setApproving(false);
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

  if (loading || !request) {
    return (
      <div style={{ textAlign: 'center', padding: 48, color: '#8896B0' }}>
        <div
          style={{
            width: 32, height: 32,
            border: '3px solid #E2E8F4', borderTopColor: '#0E1F40',
            borderRadius: '50%', animation: 'spin .7s linear infinite',
            margin: '0 auto 12px',
          }}
        />
        Đang tải...
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  const sCfg = STATUS_CFG[request.status] ?? STATUS_CFG.PENDING;

  // Shared styles
  const labelStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, color: '#8896B0',
    textTransform: 'uppercase', letterSpacing: '.4px',
    display: 'block', marginBottom: 4,
  };
  const valueStyle: React.CSSProperties = { fontSize: 12.5, color: '#1C2333', fontWeight: 500 };
  const secTitleStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, color: '#8896B0',
    letterSpacing: 1, textTransform: 'uppercase',
    marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid #E2E8F4',
  };
  const thStyle: React.CSSProperties = {
    padding: '9px 12px', fontSize: 9.5, fontWeight: 700, color: '#8896B0',
    textTransform: 'uppercase', letterSpacing: '.4px',
    background: '#F7F9FC', borderBottom: '1px solid #E2E8F4',
  };
  const tdStyle: React.CSSProperties = {
    padding: '10px 12px', fontSize: 12.5, color: '#1C2333', borderBottom: '1px solid #F0F4FA',
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button
          onClick={onBack}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
            color: '#8896B0', fontSize: 13, fontWeight: 500,
            fontFamily: 'inherit', padding: 0, transition: '.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = '#0E1F40')}
          onMouseLeave={e => (e.currentTarget.style.color = '#8896B0')}
        >
          ← Quay lại danh sách
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
              background: sCfg.bg, color: sCfg.color,
            }}
          >
            <span
              style={{ width: 5, height: 5, borderRadius: '50%', background: sCfg.dot, display: 'inline-block' }}
            />
            {sCfg.label}
          </span>
          <span
            style={{
              padding: '3px 10px', background: '#F7F9FC', color: '#4A5568',
              borderRadius: 20, fontSize: 11, fontWeight: 600, border: '1px solid #E2E8F4',
            }}
          >
            {formType?.name ?? request.form_type} #{request.id}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20 }}>
        {/* ── LEFT ── */}
        <div>
          <div
            style={{
              background: '#fff', border: '1px solid #E2E8F4', borderRadius: 12,
              overflow: 'hidden', boxShadow: '0 1px 4px rgba(14,31,64,.07)', marginBottom: 16,
            }}
          >
            {/* Doc header */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #E2E8F4', background: '#F7F9FC' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}>
                <div>
                  <p
                    style={{
                      fontSize: 10, fontWeight: 700, color: '#8896B0',
                      textTransform: 'uppercase', letterSpacing: '.2em', marginBottom: 4,
                    }}
                  >
                    {formType?.name ?? request.form_type}
                  </p>
                  <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0E1F40', margin: 0 }}>
                    {request.title}
                  </h2>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={labelStyle}>Ngày yêu cầu</p>
                  <p style={{ fontWeight: 700, fontSize: 13, color: '#1C2333' }}>
                    {new Date(request.created_at).toLocaleDateString('vi-VN')}
                  </p>
                </div>
              </div>
            </div>

            {/* Info grid */}
            <div
              style={{
                padding: '16px 24px',
                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '12px 20px', borderBottom: '1px solid #E2E8F4',
              }}
            >
              {[
                { l: 'Người yêu cầu', v: request.requester_name },
                { l: 'Phòng ban',     v: request.department },
                { l: 'Khẩn cấp',     v: request.is_urgent ? '🔴 Có' : 'Không' },
                { l: 'Tổng giá trị', v: formatCurrency(request.amount), big: true },
                ...(request.budget_plan ? [{ l: 'Budget Plan', v: request.budget_plan }] : []),
                ...(request.budget_code ? [{ l: 'Budget Code', v: request.budget_code }] : []),
                ...(request.po_number   ? [{ l: 'PO Number',   v: request.po_number   }] : []),
              ].map(({ l, v, big }) => (
                <div key={l}>
                  <label style={labelStyle}>{l}</label>
                  <span
                    style={{
                      ...valueStyle,
                      fontSize: big ? 16 : 12.5,
                      fontWeight: big ? 700 : 500,
                      color: big ? '#0E1F40' : '#1C2333',
                    }}
                  >
                    {v as string}
                  </span>
                </div>
              ))}
            </div>

            {/* Resource booking info */}
            {request.resource && (
              <div
                style={{
                  padding: '12px 24px', borderBottom: '1px solid #E2E8F4', background: '#F0F7FF',
                }}
              >
                <p style={secTitleStyle}>Tài nguyên đặt</p>
                <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
                  <div>
                    <label style={labelStyle}>
                      {request.resource.type === 'ROOM' ? 'Phòng họp' : 'Xe'}
                    </label>
                    <span style={valueStyle}>{request.resource.name}</span>
                  </div>
                  {request.start_datetime && (
                    <div>
                      <label style={labelStyle}>Bắt đầu</label>
                      <span style={valueStyle}>
                        {new Date(request.start_datetime).toLocaleString('vi-VN')}
                      </span>
                    </div>
                  )}
                  {request.end_datetime && (
                    <div>
                      <label style={labelStyle}>Kết thúc</label>
                      <span style={valueStyle}>
                        {new Date(request.end_datetime).toLocaleString('vi-VN')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Dynamic form_data sections */}
            {formType?.field_schema?.sections?.map(section => (
              <div
                key={section.title}
                style={{ padding: '16px 24px', borderBottom: '1px solid #E2E8F4' }}
              >
                <p style={secTitleStyle}>{section.title}</p>
                <div
                  style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px' }}
                >
                  {section.fields.map(field => {
                    const fd = request.form_data as Record<string, unknown>;
                    const val = fd?.[field.key];
                    if (val === undefined || val === null || val === '') return null;

                    if (field.type === 'dept_support_table') {
                      const rows = Array.isArray(val) ? val as { dept_name: string; content: string }[] : [];
                      return (
                        <div key={field.key} style={{ gridColumn: 'span 2' }}>
                          <label style={labelStyle}>{field.label}</label>
                          <div style={{ overflowX: 'auto', border: '1px solid #E2E8F4', borderRadius: 8 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                              <thead>
                                <tr>
                                  {['STT', 'Bộ phận', 'Nội dung'].map(h => (
                                    <th key={h} style={thStyle}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map((row, i) => (
                                  <tr key={i}>
                                    <td style={{ ...tdStyle, textAlign: 'center', width: 48 }}>{i + 1}</td>
                                    <td style={{ ...tdStyle, fontWeight: 600 }}>{row.dept_name}</td>
                                    <td style={tdStyle}>{row.content}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    }

                    if (field.type === 'cost_table') {
                      const rows = Array.isArray(val)
                        ? val as { product_name: string; content: string; quantity: number; unit_price: number; amount: number }[]
                        : [];
                      return (
                        <div key={field.key} style={{ gridColumn: 'span 2' }}>
                          <label style={labelStyle}>{field.label}</label>
                          <div style={{ overflowX: 'auto', border: '1px solid #E2E8F4', borderRadius: 8 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                              <thead>
                                <tr>
                                  {['TT', 'Tên', 'Nội dung', 'SL', 'Đơn giá', 'Thành tiền'].map(h => (
                                    <th
                                      key={h}
                                      style={{
                                        ...thStyle,
                                        textAlign: ['Đơn giá', 'Thành tiền'].includes(h) ? 'right' : 'left',
                                      }}
                                    >
                                      {h}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map((row, i) => (
                                  <tr key={i}>
                                    <td style={{ ...tdStyle, textAlign: 'center', width: 48 }}>{i + 1}</td>
                                    <td style={{ ...tdStyle, fontWeight: 600 }}>{row.product_name}</td>
                                    <td style={tdStyle}>{row.content}</td>
                                    <td style={{ ...tdStyle, textAlign: 'center' }}>{row.quantity}</td>
                                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                                      {row.unit_price?.toLocaleString()}
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>
                                      {row.amount?.toLocaleString()}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    }

                    if (Array.isArray(val)) {
                      const isWide = ['text_list', 'person_list', 'checkbox_group'].includes(field.type);
                      return (
                        <div key={field.key} style={isWide ? { gridColumn: 'span 2' } : {}}>
                          <label style={labelStyle}>{field.label}</label>
                          <span style={valueStyle}>
                            {field.type === 'person_list'
                              ? (val as { name: string; employee_id?: string }[])
                                  .map(p => p.name + (p.employee_id ? ` (${p.employee_id})` : ''))
                                  .join(', ')
                              : (val as string[]).join(', ')}
                          </span>
                        </div>
                      );
                    }

                    return (
                      <div key={field.key}>
                        <label style={labelStyle}>{field.label}</label>
                        <span
                          style={{
                            ...valueStyle,
                            ...(field.type === 'textarea'
                              ? { whiteSpace: 'pre-wrap', lineHeight: 1.7 }
                              : {}),
                          }}
                        >
                          {field.type === 'boolean' ? (val ? 'Có' : 'Không') : String(val)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Items table (PR) */}
            {items.length > 0 && (
              <div style={{ padding: '16px 24px' }}>
                <p style={secTitleStyle}>
                  <Calculator size={12} style={{ display: 'inline', marginRight: 5 }} />
                  Chi tiết hàng hoá / dịch vụ
                </p>
                <div style={{ overflowX: 'auto', border: '1px solid #E2E8F4', borderRadius: 8 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr>
                        {['STT', 'Tên hàng hoá', 'Quy cách', 'Đơn vị', 'SL mua', 'Đơn giá', 'Thành tiền'].map(h => (
                          <th
                            key={h}
                            style={{
                              ...thStyle,
                              textAlign: ['Đơn giá', 'Thành tiền'].includes(h)
                                ? 'right'
                                : ['STT', 'SL mua', 'Đơn vị'].includes(h)
                                ? 'center'
                                : 'left',
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, i) => (
                        <tr key={i}>
                          <td style={{ ...tdStyle, textAlign: 'center', color: '#8896B0', fontWeight: 700 }}>
                            {i + 1}
                          </td>
                          <td style={{ ...tdStyle, fontWeight: 600 }}>{item.item_name}</td>
                          <td style={{ ...tdStyle, color: '#4A5568' }}>{item.specs}</td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>{item.unit}</td>
                          <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600 }}>
                            {item.purchase_qty}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            {item.unit_price?.toLocaleString()}
                          </td>
                          <td
                            style={{
                              ...tdStyle, textAlign: 'right',
                              fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {item.amount?.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#F7F9FC', fontWeight: 700 }}>
                        <td
                          colSpan={6}
                          style={{
                            padding: '10px 12px', textAlign: 'right',
                            fontSize: 10, textTransform: 'uppercase',
                            letterSpacing: '.5px', color: '#8896B0',
                          }}
                        >
                          Tổng cộng
                        </td>
                        <td
                          style={{
                            padding: '10px 12px', textAlign: 'right',
                            fontSize: 14, fontWeight: 700,
                            color: '#0E1F40', fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {formatCurrency(request.amount)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Notes section */}
            <div
              style={{
                padding: '16px 24px', background: '#F7F9FC',
                borderTop: '1px solid #E2E8F4',
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20,
              }}
            >
              <div>
                <p style={secTitleStyle}>
                  <Info size={11} style={{ display: 'inline', marginRight: 4 }} />
                  Mô tả chi tiết
                </p>
                <p style={{ fontSize: 12.5, color: '#4A5568', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {request.description || 'Không có mô tả.'}
                </p>
              </div>
              <div>
                <p style={secTitleStyle}>
                  <MessageSquare size={11} style={{ display: 'inline', marginRight: 4 }} />
                  Ghi chú bổ sung
                </p>
                <p style={{ fontSize: 12.5, color: '#4A5568', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {request.notes || 'Không có ghi chú.'}
                </p>
              </div>
            </div>
          </div>

          {/* Approval action panel */}
          {myPendingStep && (
            <div
              style={{
                background: '#fff', border: '2px solid rgba(14,31,64,.12)',
                borderRadius: 12, padding: '20px 24px',
                boxShadow: '0 4px 20px rgba(14,31,64,.08)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                <div
                  style={{
                    width: 44, height: 44, background: '#0E1F40', borderRadius: 10,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}
                >
                  <ShieldCheck size={24} style={{ color: '#C8952A' }} />
                </div>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0E1F40', margin: 0 }}>
                    Xử lý phê duyệt
                  </h3>
                  <p style={{ fontSize: 12, color: '#8896B0', margin: '2px 0 0' }}>
                    Bước:{' '}
                    <span style={{ fontWeight: 700, color: '#C8952A' }}>
                      {myPendingStep.step_name}
                    </span>
                    {myPendingStep.deadline_at && (
                      <>
                        {' '}· Hạn:{' '}
                        <span style={{ fontWeight: 600 }}>
                          {new Date(myPendingStep.deadline_at).toLocaleString('vi-VN')}
                        </span>
                      </>
                    )}
                  </p>
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label
                  style={{
                    ...labelStyle, marginBottom: 6,
                    fontSize: 10, fontWeight: 700, color: '#8896B0',
                    textTransform: 'uppercase', letterSpacing: '.4px',
                    display: 'block',
                  }}
                >
                  Ý kiến phê duyệt
                </label>
                <textarea
                  rows={3}
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="Nhập ý kiến hoặc lý do từ chối..."
                  style={{
                    width: '100%', padding: '8px 10px', border: '1px solid #E2E8F4',
                    borderRadius: 7, fontFamily: 'inherit', fontSize: 12.5,
                    color: '#1C2333', outline: 'none', resize: 'vertical', background: '#F7F9FC',
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = '#0E1F40')}
                  onBlur={e => (e.currentTarget.style.borderColor = '#E2E8F4')}
                />
              </div>

              {error && (
                <div
                  style={{
                    padding: '8px 12px', background: '#FEE2E2', color: '#DC2626',
                    borderRadius: 7, fontSize: 12, fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14,
                  }}
                >
                  <X size={14} /> {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => handleApproveAction('REJECTED')}
                  disabled={approving}
                  style={{
                    flex: 1, padding: '9px 14px', borderRadius: 8,
                    fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
                    cursor: approving ? 'not-allowed' : 'pointer',
                    opacity: approving ? 0.5 : 1,
                    background: '#fff', border: '1px solid #FECACA', color: '#DC2626',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    transition: '.15s',
                  }}
                  onMouseEnter={e => { if (!approving) e.currentTarget.style.background = '#FEE2E2'; }}
                  onMouseLeave={e => { if (!approving) e.currentTarget.style.background = '#fff'; }}
                >
                  <X size={15} /> Từ chối
                </button>
                <button
                  onClick={() => handleApproveAction('APPROVED')}
                  disabled={approving}
                  style={{
                    flex: 1, padding: '9px 14px', borderRadius: 8,
                    fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
                    cursor: approving ? 'not-allowed' : 'pointer',
                    opacity: approving ? 0.5 : 1,
                    background: '#0E1F40', border: 'none', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    transition: '.15s',
                  }}
                  onMouseEnter={e => { if (!approving) e.currentTarget.style.background = '#162845'; }}
                  onMouseLeave={e => { if (!approving) e.currentTarget.style.background = '#0E1F40'; }}
                >
                  {approving ? (
                    <div
                      style={{
                        width: 14, height: 14,
                        border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff',
                        borderRadius: '50%', animation: 'spin .6s linear infinite',
                      }}
                    />
                  ) : (
                    <Check size={15} />
                  )}
                  Phê duyệt
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: Workflow Diagram ── */}
        <div style={{ position: 'sticky', top: 0, alignSelf: 'start', maxHeight: 'calc(100vh - 140px)', overflowY: 'auto' }}>
          <div style={{ background: '#fff', border: '1px solid #E2E8F4', borderRadius: 12, boxShadow: '0 1px 4px rgba(14,31,64,.07)' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #E2E8F4', display: 'flex', alignItems: 'center', gap: 7 }}>
              <Clock size={14} style={{ color: '#8896B0' }} />
              <h3 style={{ fontSize: 13, fontWeight: 700, color: '#1C2333', margin: 0 }}>
                Sơ đồ phê duyệt
              </h3>
              <span style={{ fontSize: 11, color: '#8896B0', marginLeft: 'auto' }}>
                {stepInstances.filter(s => s.status === 'APPROVED').length}/{stepInstances.filter(s => s.status !== 'SKIPPED' && s.status !== 'CANCELLED').length} bước
              </span>
            </div>

            {/* Requester info */}
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: 8, background: '#FAFBFD' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#6B7280', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 10, color: '#8896B0' }}>Người yêu cầu</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1C2333' }}>{request.requester_name}</div>
              </div>
              <div style={{ marginLeft: 'auto', fontSize: 10.5, color: '#8896B0' }}>
                {new Date(request.created_at).toLocaleDateString('vi-VN')}
              </div>
            </div>

            {/* Diagram */}
            <WorkflowDiagram
              steps={stepInstancesToDiagram(stepInstances)}
              mode="live"
              compact
            />

            {/* Cancellation reason */}
            {request.status === 'CANCELLED' && request.cancelled_reason && (
              <div style={{ padding: '10px 16px', borderTop: '1px solid #F1F5F9', background: '#FFF7F7', fontSize: 11.5, color: '#6B7280' }}>
                <strong>Lý do hủy:</strong> {request.cancelled_reason}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

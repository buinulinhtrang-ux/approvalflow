import React, { useState, useEffect } from 'react';
import { Check, X, MessageSquare, Clock, ShieldCheck, Calculator, Info } from 'lucide-react';
import { ApprovalRequest, ApprovalHistory, User, RequestItem } from '../types';
import * as api from '../lib/api';

interface RequestDetailProps {
  requestId: number;
  currentUser: User;
  onApprove: () => void;
  onBack: () => void;
}

const STATUS_CFG = {
  PENDING:  { label: 'Đang chờ',   dot: '#F59E0B', bg: '#FEF3C7', color: '#B45309' },
  APPROVED: { label: 'Đã duyệt',  dot: '#10B981', bg: '#D1FAE5', color: '#065F46' },
  REJECTED: { label: 'Đã từ chối', dot: '#EF4444', bg: '#FEE2E2', color: '#991B1B' },
};

export default function RequestDetail({ requestId, currentUser, onApprove, onBack }: RequestDetailProps) {
  const [request, setRequest] = useState<ApprovalRequest | null>(null);
  const [history, setHistory] = useState<ApprovalHistory[]>([]);
  const [items,   setItems]   = useState<RequestItem[]>([]);
  const [comment, setComment] = useState('');
  const [loading,  setLoading]  = useState(true);
  const [approving, setApproving] = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => { fetchRequestData(); }, [requestId]);

  const fetchRequestData = async () => {
    setLoading(true);
    try {
      const [req, hist, its] = await Promise.all([
        api.getRequest(requestId),
        api.getRequestHistory(requestId),
        api.getRequestItems(requestId),
      ]);
      setRequest(req);
      setHistory(hist);
      setItems(its);
    } catch (err) {
      console.error('Error fetching request details:', err);
    } finally {
      setLoading(false);
    }
  };

  const isCorrectApprover = () => {
    if (!request || !currentUser) return false;
    if (request.status !== 'PENDING') return false;
    if (request.current_approver_role === 'MANAGER')
      return currentUser.role === 'MANAGER' && currentUser.department === request.department;
    return currentUser.role === request.current_approver_role;
  };

  const handleApproveAction = async (status: 'APPROVED' | 'REJECTED') => {
    setError(null);
    setApproving(true);
    try {
      await api.approveRequest(requestId, currentUser.id, status, comment);
      onApprove();
    } catch (err: any) {
      setError(err.message || 'Có lỗi xảy ra khi phê duyệt');
    } finally {
      setApproving(false);
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

  const parseJSON = (jsonString: any, fallback: any = []) => {
    if (!jsonString || typeof jsonString !== 'string') return fallback;
    try { return JSON.parse(jsonString); } catch { return fallback; }
  };

  if (loading || !request) return (
    <div style={{ textAlign: 'center', padding: 48, color: '#8896B0' }}>
      <div style={{ width: 32, height: 32, border: '3px solid #E2E8F4', borderTopColor: '#0E1F40', borderRadius: '50%', animation: 'spin .7s linear infinite', margin: '0 auto 12px' }} />
      Đang tải...
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const sCfg = STATUS_CFG[request.status];
  const methodSupport = request.type === 'PROPOSAL' ? parseJSON(request.proposal_method_support) : [];
  const proposalCosts = request.type === 'PROPOSAL' ? parseJSON(request.proposal_costs)          : [];

  // ── Shared label style ──
  const labelStyle: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: '#8896B0', textTransform: 'uppercase', letterSpacing: '.4px', display: 'block', marginBottom: 4 };
  const valueStyle: React.CSSProperties = { fontSize: 12.5, color: '#1C2333', fontWeight: 500 };
  const secTitleStyle: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: '#8896B0', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid #E2E8F4' };
  const thStyle: React.CSSProperties = { padding: '9px 12px', fontSize: 9.5, fontWeight: 700, color: '#8896B0', textTransform: 'uppercase', letterSpacing: '.4px', background: '#F7F9FC', borderBottom: '1px solid #E2E8F4' };
  const tdStyle: React.CSSProperties = { padding: '10px 12px', fontSize: 12.5, color: '#1C2333', borderBottom: '1px solid #F0F4FA' };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: '#8896B0', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', padding: 0, transition: '.15s' }}
          onMouseEnter={e => e.currentTarget.style.color = '#0E1F40'}
          onMouseLeave={e => e.currentTarget.style.color = '#8896B0'}
        >
          ← Quay lại danh sách
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: sCfg.bg, color: sCfg.color }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: sCfg.dot, display: 'inline-block' }} />
            {sCfg.label}
          </span>
          <span style={{ padding: '3px 10px', background: '#F7F9FC', color: '#4A5568', borderRadius: 20, fontSize: 11, fontWeight: 600, border: '1px solid #E2E8F4' }}>
            {request.type} #{request.id}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20 }}>
        {/* ── LEFT: Document ── */}
        <div>
          {/* Document card */}
          <div style={{ background: '#fff', border: '1px solid #E2E8F4', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(14,31,64,.07)', marginBottom: 16 }}>
            {/* Doc header */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #E2E8F4', background: '#F7F9FC' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}>
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#8896B0', textTransform: 'uppercase', letterSpacing: '.2em', marginBottom: 4 }}>
                    {request.type === 'PR' ? 'Purchase Request Form' : 'Proposal Form'}
                  </p>
                  <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0E1F40', margin: 0 }}>{request.title}</h2>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={labelStyle}>Ngày yêu cầu</p>
                  <p style={{ fontWeight: 700, fontSize: 13, color: '#1C2333' }}>{new Date(request.created_at).toLocaleDateString('vi-VN')}</p>
                </div>
              </div>
            </div>

            {/* Info grid */}
            <div style={{ padding: '16px 24px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px 20px', borderBottom: '1px solid #E2E8F4' }}>
              {[
                { l: 'Người yêu cầu', v: request.requester_name },
                { l: 'Phòng ban',     v: request.department },
                { l: 'Nhóm yêu cầu', v: request.request_group || '—' },
                { l: 'Thời hạn (ngày)', v: request.deadline_days || '—' },
                { l: 'Leadtime',     v: request.leadtime    || '—' },
                { l: 'PO Number',    v: request.po_number   || '—' },
                { l: 'Budget Plan',  v: request.budget_plan || '—' },
                { l: 'Budget Code',  v: request.budget_code || '—' },
              ].map(({ l, v }) => (
                <div key={l}>
                  <label style={labelStyle}>{l}</label>
                  <span style={valueStyle}>{v as string}</span>
                </div>
              ))}
              <div>
                <label style={labelStyle}>Tổng giá trị</label>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#0E1F40', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(request.amount)}</span>
              </div>
            </div>

            {/* Items / Proposal content */}
            {request.type === 'PR' ? (
              <div style={{ padding: '16px 24px' }}>
                <p style={secTitleStyle}><Calculator size={12} style={{ display: 'inline', marginRight: 5 }} />Chi tiết hàng hoá / dịch vụ</p>
                <div style={{ overflowX: 'auto', border: '1px solid #E2E8F4', borderRadius: 8 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr>
                        {['STT','Tên hàng hoá','Quy cách','Đơn vị','SL mua','Đơn giá','Thành tiền'].map(h => (
                          <th key={h} style={{ ...thStyle, textAlign: h === 'Đơn giá' || h === 'Thành tiền' ? 'right' : h === 'STT' || h === 'SL mua' || h === 'Đơn vị' ? 'center' : 'left' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, i) => (
                        <tr key={i}>
                          <td style={{ ...tdStyle, textAlign: 'center', color: '#8896B0', fontWeight: 700 }}>{i + 1}</td>
                          <td style={{ ...tdStyle, fontWeight: 600 }}>{item.item_name}</td>
                          <td style={{ ...tdStyle, color: '#4A5568' }}>{item.specs}</td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>{item.unit}</td>
                          <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600 }}>{item.purchase_qty}</td>
                          <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{item.unit_price?.toLocaleString()}</td>
                          <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{item.amount?.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#F7F9FC', fontWeight: 700 }}>
                        <td colSpan={6} style={{ padding: '10px 12px', textAlign: 'right', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px', color: '#8896B0' }}>Tổng cộng</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 14, fontWeight: 700, color: '#0E1F40', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(request.amount)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            ) : (
              <div style={{ padding: '16px 24px' }}>
                {[
                  { title: '1. Tổng quan', content: <p style={{ fontSize: 13, color: '#4A5568', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{request.proposal_overview || '—'}</p> },
                ].map(s => (
                  <div key={s.title} style={{ marginBottom: 20 }}>
                    <p style={secTitleStyle}>{s.title}</p>
                    {s.content}
                  </div>
                ))}

                <div style={{ marginBottom: 20 }}>
                  <p style={secTitleStyle}>2. Thông tin chính</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px' }}>
                    {[
                      ['Thời gian', request.proposal_time || '—'],
                      ['Địa điểm', request.proposal_location || '—'],
                      ['Người chủ trì', request.proposal_chairperson || '—'],
                      ['Hình thức', request.proposal_form || '—'],
                    ].map(([l, v]) => (
                      <div key={l}>
                        <label style={labelStyle}>{l}</label>
                        <span style={valueStyle}>{v}</span>
                      </div>
                    ))}
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={labelStyle}>Đối tượng áp dụng</label>
                      <span style={valueStyle}>{request.proposal_target || '—'}</span>
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: 20 }}>
                  <p style={secTitleStyle}>3. Yêu cầu cụ thể</p>
                  <p style={{ fontSize: 13, color: '#4A5568', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{request.proposal_requirements || '—'}</p>
                </div>

                <div style={{ marginBottom: 20 }}>
                  <p style={secTitleStyle}>4. Cách thức tổ chức & Hỗ trợ bộ phận</p>
                  <div style={{ overflowX: 'auto', border: '1px solid #E2E8F4', borderRadius: 8 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr>
                        {['STT','Tên bộ phận','Nội dung'].map(h => <th key={h} style={thStyle}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {methodSupport.length ? methodSupport.map((item: any, i: number) => (
                          <tr key={i}>
                            <td style={{ ...tdStyle, textAlign: 'center', color: '#8896B0', width: 48 }}>{i + 1}</td>
                            <td style={{ ...tdStyle, fontWeight: 600, width: '30%' }}>{item.dept_name || '—'}</td>
                            <td style={{ ...tdStyle, color: '#4A5568', whiteSpace: 'pre-wrap' }}>{item.content || '—'}</td>
                          </tr>
                        )) : (
                          <tr><td colSpan={3} style={{ ...tdStyle, textAlign: 'center', color: '#8896B0', fontStyle: 'italic' }}>Không có dữ liệu</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div style={{ marginBottom: 20 }}>
                  <p style={secTitleStyle}>5. Chi phí tổ chức</p>
                  <div style={{ overflowX: 'auto', border: '1px solid #E2E8F4', borderRadius: 8 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr>
                        {['TT','Tên sản phẩm','Nội dung','Số lượng','Đơn giá','Thành tiền'].map(h => <th key={h} style={{ ...thStyle, textAlign: h === 'Đơn giá' || h === 'Thành tiền' ? 'right' : h === 'Số lượng' || h === 'TT' ? 'center' : 'left' }}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {proposalCosts.length ? proposalCosts.map((item: any, i: number) => (
                          <tr key={i}>
                            <td style={{ ...tdStyle, textAlign: 'center', color: '#8896B0', width: 48 }}>{i + 1}</td>
                            <td style={{ ...tdStyle, fontWeight: 600 }}>{item.product_name || '—'}</td>
                            <td style={{ ...tdStyle, color: '#4A5568' }}>{item.content || '—'}</td>
                            <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600 }}>{item.quantity || 0}</td>
                            <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{item.unit_price?.toLocaleString()}</td>
                            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{item.amount?.toLocaleString()}</td>
                          </tr>
                        )) : (
                          <tr><td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: '#8896B0', fontStyle: 'italic' }}>Không có dữ liệu</td></tr>
                        )}
                      </tbody>
                      {proposalCosts.length > 0 && (
                        <tfoot>
                          <tr style={{ background: '#F7F9FC' }}>
                            <td colSpan={5} style={{ padding: '10px 12px', textAlign: 'right', fontSize: 10, textTransform: 'uppercase', color: '#8896B0' }}>Tổng chi phí</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#0E1F40', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(request.amount)}</td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>

                <div>
                  <p style={secTitleStyle}>6. Kết quả dự kiến</p>
                  <p style={{ fontSize: 13, color: '#4A5568', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{request.proposal_results || '—'}</p>
                </div>
              </div>
            )}

            {/* Notes section */}
            <div style={{ padding: '16px 24px', background: '#F7F9FC', borderTop: '1px solid #E2E8F4', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div>
                <p style={secTitleStyle}><Info size={11} style={{ display: 'inline', marginRight: 4 }} />Mô tả chi tiết</p>
                <p style={{ fontSize: 12.5, color: '#4A5568', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{request.description || 'Không có mô tả.'}</p>
              </div>
              <div>
                <p style={secTitleStyle}><MessageSquare size={11} style={{ display: 'inline', marginRight: 4 }} />Ghi chú bổ sung</p>
                <p style={{ fontSize: 12.5, color: '#4A5568', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{request.notes || 'Không có ghi chú.'}</p>
              </div>
            </div>
          </div>

          {/* Approval action */}
          {isCorrectApprover() && (
            <div style={{ background: '#fff', border: '2px solid rgba(14,31,64,.12)', borderRadius: 12, padding: '20px 24px', boxShadow: '0 4px 20px rgba(14,31,64,.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                <div style={{ width: 44, height: 44, background: '#0E1F40', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <ShieldCheck size={24} style={{ color: '#C8952A' }} />
                </div>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0E1F40', margin: 0 }}>Xử lý phê duyệt</h3>
                  <p style={{ fontSize: 12, color: '#8896B0', margin: '2px 0 0' }}>
                    Vai trò: <span style={{ fontWeight: 700, color: '#C8952A' }}>{currentUser.title || currentUser.role}</span>
                  </p>
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ ...labelStyle, marginBottom: 6 }}>Ý kiến phê duyệt</label>
                <textarea
                  rows={3}
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="Nhập ý kiến hoặc lý do từ chối..."
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E8F4', borderRadius: 7, fontFamily: 'inherit', fontSize: 12.5, color: '#1C2333', outline: 'none', resize: 'vertical', background: '#F7F9FC' }}
                  onFocus={e => e.currentTarget.style.borderColor = '#0E1F40'}
                  onBlur={e => e.currentTarget.style.borderColor = '#E2E8F4'}
                />
              </div>

              {error && (
                <div style={{ padding: '8px 12px', background: '#FEE2E2', color: '#DC2626', borderRadius: 7, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                  <X size={14} />{error}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => handleApproveAction('REJECTED')}
                  disabled={approving}
                  style={{ flex: 1, padding: '9px 14px', borderRadius: 8, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: approving ? 'not-allowed' : 'pointer', opacity: approving ? .5 : 1, background: '#fff', border: '1px solid #FECACA', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: '.15s' }}
                  onMouseEnter={e => { if (!approving) e.currentTarget.style.background = '#FEE2E2'; }}
                  onMouseLeave={e => { if (!approving) e.currentTarget.style.background = '#fff'; }}
                >
                  <X size={15} />
                  Từ chối
                </button>
                <button
                  onClick={() => handleApproveAction('APPROVED')}
                  disabled={approving}
                  style={{ flex: 1, padding: '9px 14px', borderRadius: 8, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: approving ? 'not-allowed' : 'pointer', opacity: approving ? .5 : 1, background: '#0E1F40', border: 'none', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: '.15s' }}
                  onMouseEnter={e => { if (!approving) e.currentTarget.style.background = '#162845'; }}
                  onMouseLeave={e => { if (!approving) e.currentTarget.style.background = '#0E1F40'; }}
                >
                  {approving
                    ? <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .6s linear infinite' }} />
                    : <Check size={15} />
                  }
                  Phê duyệt
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: Timeline ── */}
        <div style={{ position: 'sticky', top: 0, alignSelf: 'start' }}>
          <div style={{ background: '#fff', border: '1px solid #E2E8F4', borderRadius: 12, padding: '20px', boxShadow: '0 1px 4px rgba(14,31,64,.07)' }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: '#1C2333', margin: '0 0 20px', display: 'flex', alignItems: 'center', gap: 7 }}>
              <Clock size={15} style={{ color: '#8896B0' }} />
              Tiến độ phê duyệt
            </h3>

            <div style={{ position: 'relative', paddingLeft: 16 }}>
              <div style={{ position: 'absolute', left: 4, top: 6, bottom: 6, width: 1, background: '#E2E8F4' }} />

              {/* Requester */}
              <div style={{ position: 'relative', paddingLeft: 12, marginBottom: 20 }}>
                <div style={{ position: 'absolute', left: -12, top: 3, width: 10, height: 10, borderRadius: '50%', border: '2px solid #fff', background: '#6B7280', boxShadow: '0 0 0 2px #6B7280' }} />
                <p style={{ fontSize: 10, color: '#8896B0', marginBottom: 1 }}>Khởi tạo</p>
                <p style={{ fontSize: 12.5, fontWeight: 600, color: '#1C2333' }}>{request.requester_name}</p>
                <p style={{ fontSize: 10.5, color: '#8896B0', marginTop: 2 }}>{new Date(request.created_at).toLocaleString('vi-VN')}</p>
              </div>

              {/* History */}
              {history.map(step => (
                <div key={step.id} style={{ position: 'relative', paddingLeft: 12, marginBottom: 20 }}>
                  <div style={{ position: 'absolute', left: -12, top: 3, width: 10, height: 10, borderRadius: '50%', border: '2px solid #fff', background: step.status === 'APPROVED' ? '#10B981' : '#EF4444', boxShadow: `0 0 0 2px ${step.status === 'APPROVED' ? '#10B981' : '#EF4444'}` }} />
                  <p style={{ fontSize: 10, color: '#8896B0', marginBottom: 1 }}>{step.approver_role}</p>
                  <p style={{ fontSize: 12.5, fontWeight: 600, color: '#1C2333' }}>{step.approver_name}</p>
                  {step.comment && (
                    <div style={{ marginTop: 6, padding: '6px 10px', background: '#F7F9FC', borderRadius: 7, fontSize: 11.5, color: '#4A5568', fontStyle: 'italic', display: 'flex', gap: 6, border: '1px solid #E2E8F4' }}>
                      <MessageSquare size={12} style={{ color: '#8896B0', flexShrink: 0, marginTop: 1 }} />
                      "{step.comment}"
                    </div>
                  )}
                  <p style={{ fontSize: 10.5, color: '#8896B0', marginTop: 4 }}>{new Date(step.created_at).toLocaleString('vi-VN')}</p>
                </div>
              ))}

              {/* Pending next step */}
              {request.status === 'PENDING' && (
                <div style={{ position: 'relative', paddingLeft: 12, marginBottom: 20 }}>
                  <div style={{ position: 'absolute', left: -12, top: 3, width: 10, height: 10, borderRadius: '50%', border: '2px dashed #CBD5E1', background: '#fff' }} />
                  <p style={{ fontSize: 10, color: '#8896B0', marginBottom: 1 }}>Đang chờ duyệt</p>
                  <p style={{ fontSize: 12.5, fontWeight: 600, color: '#8896B0' }}>
                    {request.current_approver_role === 'MANAGER' ? `Quản lý ${request.department}` : request.current_approver_role}
                  </p>
                </div>
              )}

              {/* Completed */}
              {request.status === 'APPROVED' && (
                <div style={{ position: 'relative', paddingLeft: 12 }}>
                  <div style={{ position: 'absolute', left: -12, top: 3, width: 10, height: 10, borderRadius: '50%', border: '2px solid #fff', background: '#C8952A', boxShadow: '0 0 0 2px #C8952A' }} />
                  <p style={{ fontSize: 10, color: '#C8952A', fontWeight: 700, marginBottom: 1 }}>Hoàn thành</p>
                  <p style={{ fontSize: 12.5, fontWeight: 600, color: '#1C2333' }}>Yêu cầu đã được phê duyệt</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

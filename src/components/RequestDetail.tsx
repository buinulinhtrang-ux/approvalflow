import React, { useState, useEffect } from 'react';
import { ArrowLeft, Check, X, MessageSquare, Clock, User as UserIcon, ShieldCheck, FileText, Calculator, Info } from 'lucide-react';
import { ApprovalRequest, ApprovalHistory, User, RequestItem } from '../types';
import * as api from '../lib/api';

interface RequestDetailProps {
  requestId: number;
  currentUser: User;
  onApprove: () => void;
  onBack: () => void;
}

export default function RequestDetail({ requestId, currentUser, onApprove, onBack }: RequestDetailProps) {
  const [request, setRequest] = useState<ApprovalRequest | null>(null);
  const [history, setHistory] = useState<ApprovalHistory[]>([]);
  const [items, setItems] = useState<RequestItem[]>([]);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRequestData();
  }, [requestId]);

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
    } catch (error) {
      console.error('Error fetching request details:', error);
    } finally {
      setLoading(false);
    }
  };

  const isCorrectApprover = () => {
    if (!request || !currentUser) return false;
    if (request.status !== 'PENDING') return false;

    if (request.current_approver_role === 'MANAGER') {
      return currentUser.role === 'MANAGER' && currentUser.department === request.department;
    }
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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  const parseJSON = (jsonString: any, fallback: any = []) => {
    if (!jsonString || typeof jsonString !== 'string') return fallback;
    try {
      return JSON.parse(jsonString);
    } catch (e) {
      return fallback;
    }
  };

  if (loading || !request) return <div className="p-8 text-center">Đang tải...</div>;

  const methodSupport = request.type === 'PROPOSAL' ? parseJSON(request.proposal_method_support) : [];
  const proposalCosts = request.type === 'PROPOSAL' ? parseJSON(request.proposal_costs) : [];

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-stone-500 hover:text-[#141414] transition-colors font-medium"
        >
          <ArrowLeft size={20} />
          Quay lại danh sách
        </button>
        <div className="flex gap-2">
          <span className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest border ${
            request.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
            request.status === 'REJECTED' ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-amber-50 text-amber-600 border-amber-100'
          }`}>
            {request.status === 'APPROVED' ? 'Đã duyệt' : request.status === 'REJECTED' ? 'Từ chối' : 'Đang chờ'}
          </span>
          <span className="px-4 py-1.5 bg-stone-100 text-stone-600 rounded-full text-xs font-bold uppercase tracking-widest border border-stone-200">
            {request.type} #{request.id}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
        {/* Main Document */}
        <div className="xl:col-span-3 space-y-8">
          <div className="bg-white border border-[#141414]/10 rounded-[2rem] overflow-hidden shadow-sm">
            {/* Document Header */}
            <div className="p-10 border-b border-stone-100 bg-stone-50/30">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-[0.2em]">
                    {request.type === 'PR' ? 'Purchase Request Form' : 'Proposal Form'}
                  </p>
                  <h2 className="text-4xl font-bold tracking-tight text-[#141414]">{request.title}</h2>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Ngày yêu cầu</p>
                  <p className="font-bold text-lg">{new Date(request.created_at).toLocaleDateString('vi-VN')}</p>
                </div>
              </div>
            </div>

            {/* General Info Grid */}
            <div className="p-10 grid grid-cols-2 md:grid-cols-4 gap-y-8 gap-x-12 border-b border-stone-100">
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1.5">Người yêu cầu</p>
                <p className="font-bold text-stone-900">{request.requester_name}</p>
                <p className="text-[10px] text-stone-500 uppercase font-bold mt-0.5">{request.department}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1.5">Nhóm yêu cầu</p>
                <p className="font-bold text-stone-900">{request.request_group || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1.5">Thời hạn (ngày)</p>
                <p className="font-bold text-stone-900">{request.deadline_days || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1.5">Leadtime</p>
                <p className="font-bold text-stone-900">{request.leadtime || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1.5">PO Number</p>
                <p className="font-bold text-stone-900">{request.po_number || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1.5">Budget Plan</p>
                <p className="font-bold text-stone-900">{request.budget_plan || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1.5">Budget Code</p>
                <p className="font-bold text-stone-900">{request.budget_code || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1.5">Tổng giá trị</p>
                <p className="text-xl font-mono font-bold text-indigo-600">{formatCurrency(request.amount)}</p>
              </div>
            </div>

            {/* Items Table or Proposal Content */}
            {request.type === 'PR' ? (
              <div className="p-10 space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-widest text-stone-400 flex items-center gap-2">
                  <Calculator size={16} />
                  Chi tiết hàng hoá / dịch vụ
                </h3>
                <div className="overflow-x-auto border border-stone-100 rounded-2xl">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-stone-50/50 border-b border-stone-100">
                        <th className="px-4 py-3 text-[9px] font-bold text-stone-400 uppercase tracking-widest w-12 text-center">STT</th>
                        <th className="px-4 py-3 text-[9px] font-bold text-stone-400 uppercase tracking-widest">Tên hàng hoá</th>
                        <th className="px-4 py-3 text-[9px] font-bold text-stone-400 uppercase tracking-widest">Quy cách</th>
                        <th className="px-4 py-3 text-[9px] font-bold text-stone-400 uppercase tracking-widest w-20 text-center">Đơn vị</th>
                        <th className="px-4 py-3 text-[9px] font-bold text-stone-400 uppercase tracking-widest w-20 text-center">SL</th>
                        <th className="px-4 py-3 text-[9px] font-bold text-stone-400 uppercase tracking-widest w-32 text-right">Đơn giá</th>
                        <th className="px-4 py-3 text-[9px] font-bold text-stone-400 uppercase tracking-widest w-32 text-right">Thành tiền</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-50">
                      {items.map((item, index) => (
                        <tr key={index} className="text-sm">
                          <td className="px-4 py-3 text-center font-bold text-stone-300">{index + 1}</td>
                          <td className="px-4 py-3 font-bold text-stone-900">{item.item_name}</td>
                          <td className="px-4 py-3 text-stone-500">{item.specs}</td>
                          <td className="px-4 py-3 text-center">{item.unit}</td>
                          <td className="px-4 py-3 text-center font-bold">{item.purchase_qty}</td>
                          <td className="px-4 py-3 text-right font-mono">{item.unit_price?.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-stone-900">{item.amount?.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-stone-50/30 font-bold">
                        <td colSpan={6} className="px-4 py-4 text-right text-[10px] uppercase tracking-widest text-stone-400">Tổng cộng</td>
                        <td className="px-4 py-4 text-right text-lg font-mono text-indigo-600">{formatCurrency(request.amount)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            ) : (
              <div className="p-10 space-y-10">
                <div className="space-y-4">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-stone-400 border-b border-stone-100 pb-2">1. Tổng quan</h3>
                  <p className="text-stone-700 leading-relaxed whitespace-pre-wrap">{request.proposal_overview || '—'}</p>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-stone-400 border-b border-stone-100 pb-2">2. Thông tin chính</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Thời gian dự kiến áp dụng</p>
                      <p className="font-bold text-stone-900">{request.proposal_time || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Địa điểm</p>
                      <p className="font-bold text-stone-900">{request.proposal_location || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Người chủ trì</p>
                      <p className="font-bold text-stone-900">{request.proposal_chairperson || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Hình thức tổ chức</p>
                      <p className="font-bold text-stone-900">{request.proposal_form || '—'}</p>
                    </div>
                    <div className="md:col-span-2">
                      <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Đối tượng áp dụng</p>
                      <p className="font-bold text-stone-900">{request.proposal_target || '—'}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-stone-400 border-b border-stone-100 pb-2">3. Yêu cầu cụ thể</h3>
                  <p className="text-stone-700 leading-relaxed whitespace-pre-wrap">{request.proposal_requirements || '—'}</p>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-stone-400 border-b border-stone-100 pb-2">4. Cách thức tổ chức & Đề nghị hỗ trợ từ các bộ phận:</h3>
                  <div className="overflow-x-auto border border-stone-100 rounded-2xl">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-stone-50/50 border-b border-stone-100">
                          <th className="px-4 py-3 text-[9px] font-bold text-stone-400 uppercase tracking-widest w-12 text-center">STT</th>
                          <th className="px-4 py-3 text-[9px] font-bold text-stone-400 uppercase tracking-widest w-1/3">Tên bộ phận</th>
                          <th className="px-4 py-3 text-[9px] font-bold text-stone-400 uppercase tracking-widest">Nội dung</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-50">
                        {methodSupport.map((item: any, index: number) => (
                          <tr key={index} className="text-sm">
                            <td className="px-4 py-3 text-center font-bold text-stone-300">{index + 1}</td>
                            <td className="px-4 py-3 font-bold text-stone-900">{item.dept_name || '—'}</td>
                            <td className="px-4 py-3 text-stone-600 whitespace-pre-wrap">{item.content || '—'}</td>
                          </tr>
                        ))}
                        {methodSupport.length === 0 && (
                          <tr>
                            <td colSpan={3} className="px-4 py-8 text-center text-stone-400 italic">Không có thông tin hỗ trợ</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-stone-400 border-b border-stone-100 pb-2">5. Chi phí tổ chức</h3>
                  <div className="overflow-x-auto border border-stone-100 rounded-2xl">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-stone-50/50 border-b border-stone-100">
                          <th className="px-4 py-3 text-[9px] font-bold text-stone-400 uppercase tracking-widest w-12 text-center">TT</th>
                          <th className="px-4 py-3 text-[9px] font-bold text-stone-400 uppercase tracking-widest">Tên sản phẩm</th>
                          <th className="px-4 py-3 text-[9px] font-bold text-stone-400 uppercase tracking-widest">Nội dung</th>
                          <th className="px-4 py-3 text-[9px] font-bold text-stone-400 uppercase tracking-widest w-20 text-center">Số lượng</th>
                          <th className="px-4 py-3 text-[9px] font-bold text-stone-400 uppercase tracking-widest w-32 text-right">Đơn giá dự kiến</th>
                          <th className="px-4 py-3 text-[9px] font-bold text-stone-400 uppercase tracking-widest w-32 text-right">Thành tiền (VND)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-50">
                        {proposalCosts.map((item: any, index: number) => (
                          <tr key={index} className="text-sm">
                            <td className="px-4 py-3 text-center font-bold text-stone-300">{index + 1}</td>
                            <td className="px-4 py-3 font-bold text-stone-900">{item.product_name || '—'}</td>
                            <td className="px-4 py-3 text-stone-500">{item.content || '—'}</td>
                            <td className="px-4 py-3 text-center font-bold">{item.quantity || 0}</td>
                            <td className="px-4 py-3 text-right font-mono">{item.unit_price?.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-stone-900">{item.amount?.toLocaleString()}</td>
                          </tr>
                        ))}
                        {proposalCosts.length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-4 py-8 text-center text-stone-400 italic">Không có thông tin chi phí</td>
                          </tr>
                        )}
                      </tbody>
                      {proposalCosts.length > 0 && (
                        <tfoot>
                          <tr className="bg-stone-50/30 font-bold">
                            <td colSpan={5} className="px-4 py-4 text-right text-[10px] uppercase tracking-widest text-stone-400">Tổng cộng chi phí</td>
                            <td className="px-4 py-4 text-right text-lg font-mono text-indigo-600">{formatCurrency(request.amount)}</td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-stone-400 border-b border-stone-100 pb-2">6. Kết quả dự kiến</h3>
                  <p className="text-stone-700 leading-relaxed whitespace-pre-wrap">{request.proposal_results || '—'}</p>
                </div>
              </div>
            )}

            {/* Notes Section */}
            <div className="p-10 bg-stone-50/30 border-t border-stone-100 grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest flex items-center gap-2">
                  <Info size={14} />
                  Mô tả chi tiết
                </h4>
                <p className="text-sm text-stone-600 leading-relaxed whitespace-pre-wrap">
                  {request.description || 'Không có mô tả chi tiết.'}
                </p>
              </div>
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest flex items-center gap-2">
                  <MessageSquare size={14} />
                  Ghi chú / Giải trình bổ sung
                </h4>
                <p className="text-sm text-stone-600 leading-relaxed whitespace-pre-wrap">
                  {request.notes || 'Không có ghi chú bổ sung.'}
                </p>
              </div>
            </div>
          </div>

          {/* Approval Action */}
          {isCorrectApprover() && (
            <div className="bg-white border-2 border-indigo-100 rounded-[2rem] p-10 shadow-xl shadow-indigo-500/5">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                  <ShieldCheck size={32} />
                </div>
                <div>
                  <h3 className="text-2xl font-bold tracking-tight">Xử lý phê duyệt trực tuyến</h3>
                  <p className="text-sm text-stone-500">
                    Vai trò hiện tại: <span className="font-bold text-indigo-600 uppercase tracking-wider">{currentUser.title || currentUser.role}</span>
                  </p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Ý kiến phê duyệt</label>
                  <textarea
                    rows={4}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Nhập ý kiến phê duyệt hoặc lý do từ chối..."
                    className="w-full px-6 py-4 rounded-2xl border border-stone-200 focus:border-indigo-600 focus:ring-0 transition-all outline-none resize-none bg-stone-50/50"
                  />
                </div>

                {error && (
                  <div className="p-4 bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl text-xs font-bold flex items-center gap-2">
                    <X size={16} />
                    {error}
                  </div>
                )}

                <div className="flex gap-4">
                  <button
                    onClick={() => handleApproveAction('REJECTED')}
                    disabled={approving}
                    className="flex-1 px-8 py-4 rounded-full border border-rose-200 text-rose-600 font-bold hover:bg-rose-50 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                  >
                    <X size={20} />
                    Từ chối yêu cầu
                  </button>
                  <button
                    onClick={() => handleApproveAction('APPROVED')}
                    disabled={approving}
                    className="flex-1 px-8 py-4 rounded-full bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-3 shadow-lg shadow-indigo-200 disabled:opacity-50"
                  >
                    {approving ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Check size={20} />
                    )}
                    Phê duyệt yêu cầu
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar: History */}
        <div className="space-y-8">
          <div className="bg-white border border-[#141414]/10 rounded-[2rem] p-8 sticky top-24">
            <h3 className="text-lg font-bold mb-8 flex items-center gap-2">
              <Clock size={20} className="text-stone-400" />
              Tiến độ phê duyệt
            </h3>

            <div className="space-y-10 relative">
              {/* Timeline Line */}
              <div className="absolute left-[13px] top-2 bottom-2 w-0.5 bg-stone-100"></div>

              {/* Requester Step */}
              <div className="relative pl-10">
                <div className="absolute left-0 top-1 w-7 h-7 rounded-full bg-stone-900 border-4 border-white flex items-center justify-center z-10 shadow-sm">
                  <div className="w-2 h-2 bg-white rounded-full"></div>
                </div>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Khởi tạo</p>
                <p className="font-bold text-sm text-stone-900">{request.requester_name}</p>
                <p className="text-[10px] text-stone-400 mt-0.5">{new Date(request.created_at).toLocaleString('vi-VN')}</p>
              </div>

              {/* Approval Steps */}
              {history.map((step) => (
                <div key={step.id} className="relative pl-10">
                  <div className={`absolute left-0 top-1 w-7 h-7 rounded-full border-4 border-white flex items-center justify-center z-10 shadow-sm ${
                    step.status === 'APPROVED' ? 'bg-emerald-500' : 'bg-rose-500'
                  }`}>
                    {step.status === 'APPROVED' ? <Check size={12} className="text-white" /> : <X size={12} className="text-white" />}
                  </div>
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">{step.approver_role}</p>
                  <p className="font-bold text-sm text-stone-900">{step.approver_name}</p>
                  {step.comment && (
                    <div className="mt-3 p-3 bg-stone-50 rounded-xl text-xs text-stone-600 italic flex gap-2 border border-stone-100">
                      <MessageSquare size={14} className="shrink-0 mt-0.5 text-stone-300" />
                      "{step.comment}"
                    </div>
                  )}
                  <p className="text-[10px] text-stone-400 mt-1.5">{new Date(step.created_at).toLocaleString('vi-VN')}</p>
                </div>
              ))}

              {/* Next Step */}
              {request.status === 'PENDING' && (
                <div className="relative pl-10">
                  <div className="absolute left-0 top-1 w-7 h-7 rounded-full bg-white border-2 border-dashed border-stone-300 flex items-center justify-center z-10">
                    <div className="w-2 h-2 bg-stone-200 rounded-full animate-pulse"></div>
                  </div>
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Đang chờ duyệt</p>
                  <p className="font-bold text-sm text-stone-400">
                    {request.current_approver_role === 'MANAGER' ? `Quản lý ${request.department}` : request.current_approver_role}
                  </p>
                </div>
              )}

              {/* Completed Step */}
              {request.status === 'APPROVED' && (
                <div className="relative pl-10">
                  <div className="absolute left-0 top-1 w-7 h-7 rounded-full bg-emerald-100 border-4 border-white flex items-center justify-center z-10">
                    <Check size={12} className="text-emerald-600" />
                  </div>
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Hoàn thành</p>
                  <p className="font-bold text-sm text-stone-900">Yêu cầu đã được phê duyệt</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

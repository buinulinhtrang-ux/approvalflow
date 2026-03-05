import React, { useState, useEffect } from 'react';
import { X, Send, AlertCircle, Plus, Trash2, Calculator } from 'lucide-react';
import { RequestType, RequestItem } from '../types';

interface CreateRequestProps {
  onSubmit: (data: any) => void;
  onCancel: () => void;
}

const emptyItem: RequestItem = {
  item_name: '',
  specs: '',
  unit: '',
  total_qty: 0,
  available_qty: 0,
  purchase_qty: 0,
  unit_price: 0,
  amount: 0,
  reason: ''
};

interface ProposalMethodSupport {
  dept_name: string;
  content: string;
}

interface ProposalCost {
  product_name: string;
  content: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

export default function CreateRequest({ onSubmit, onCancel }: CreateRequestProps) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'PR' as RequestType,
    request_group: '',
    deadline_days: '',
    leadtime: '',
    po_number: '',
    budget_plan: '',
    budget_code: '',
    notes: '',
    proposal_overview: '',
    proposal_time: '',
    proposal_location: '',
    proposal_chairperson: '',
    proposal_form: '',
    proposal_target: '',
    proposal_requirements: '',
    proposal_method_support: [] as ProposalMethodSupport[],
    proposal_costs: [] as ProposalCost[],
    proposal_results: '',
    items: [{ ...emptyItem }] as RequestItem[]
  });

  // Initialize proposal tables if empty when switching to PROPOSAL
  useEffect(() => {
    if (formData.type === 'PROPOSAL') {
      if (formData.proposal_method_support.length === 0) {
        setFormData(prev => ({
          ...prev,
          proposal_method_support: [{ dept_name: '', content: '' }]
        }));
      }
      if (formData.proposal_costs.length === 0) {
        setFormData(prev => ({
          ...prev,
          proposal_costs: [{ product_name: '', content: '', quantity: 0, unit_price: 0, amount: 0 }]
        }));
      }
    }
  }, [formData.type]);

  const calculateTotal = () => {
    if (formData.type === 'PR') {
      return formData.items.reduce((sum, item) => sum + (item.amount || 0), 0);
    }
    return formData.proposal_costs.reduce((sum, item) => sum + (item.amount || 0), 0);
  };

  const handleItemChange = (index: number, field: keyof RequestItem, value: any) => {
    const newItems = [...formData.items];
    const item = { ...newItems[index], [field]: value };
    
    // Auto-calculate purchase_qty and amount
    if (field === 'total_qty' || field === 'available_qty') {
      item.purchase_qty = Math.max(0, (item.total_qty || 0) - (item.available_qty || 0));
      item.amount = item.purchase_qty * (item.unit_price || 0);
    } else if (field === 'unit_price') {
      item.amount = (item.purchase_qty || 0) * (value || 0);
    } else if (field === 'purchase_qty') {
      item.amount = (value || 0) * (item.unit_price || 0);
    }
    
    newItems[index] = item;
    setFormData({ ...formData, items: newItems });
  };

  const addItem = () => {
    setFormData({ ...formData, items: [...formData.items, { ...emptyItem }] });
  };

  const removeItem = (index: number) => {
    if (formData.items.length === 1) return;
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: newItems });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title) return;
    
    onSubmit({
      ...formData,
      amount: calculateTotal(),
      deadline_days: parseInt(formData.deadline_days) || 0,
      // Convert arrays to JSON strings for storage if needed, 
      // but the parent onSubmit might handle it or the server might handle it.
      // Based on previous turn, server expects strings for these columns.
      proposal_method_support: JSON.stringify(formData.proposal_method_support),
      proposal_costs: JSON.stringify(formData.proposal_costs)
    });
  };

  const handleMethodSupportChange = (index: number, field: keyof ProposalMethodSupport, value: string) => {
    const newList = [...formData.proposal_method_support];
    newList[index] = { ...newList[index], [field]: value };
    setFormData({ ...formData, proposal_method_support: newList });
  };

  const addMethodSupport = () => {
    setFormData({
      ...formData,
      proposal_method_support: [...formData.proposal_method_support, { dept_name: '', content: '' }]
    });
  };

  const removeMethodSupport = (index: number) => {
    if (formData.proposal_method_support.length === 1) return;
    setFormData({
      ...formData,
      proposal_method_support: formData.proposal_method_support.filter((_, i) => i !== index)
    });
  };

  const handleProposalCostChange = (index: number, field: keyof ProposalCost, value: any) => {
    const newList = [...formData.proposal_costs];
    const item = { ...newList[index], [field]: value };
    
    if (field === 'quantity' || field === 'unit_price') {
      item.amount = (item.quantity || 0) * (item.unit_price || 0);
    }
    
    newList[index] = item;
    setFormData({ ...formData, proposal_costs: newList });
  };

  const addProposalCost = () => {
    setFormData({
      ...formData,
      proposal_costs: [...formData.proposal_costs, { product_name: '', content: '', quantity: 0, unit_price: 0, amount: 0 }]
    });
  };

  const removeProposalCost = (index: number) => {
    if (formData.proposal_costs.length === 1) return;
    setFormData({
      ...formData,
      proposal_costs: formData.proposal_costs.filter((_, i) => i !== index)
    });
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="bg-white border border-[#141414]/10 rounded-3xl overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-[#141414]/5 flex items-center justify-between bg-stone-50">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              {formData.type === 'PR' ? 'Tạo yêu cầu mua sắm' : 'Tạo tờ trình phê duyệt'}
            </h2>
            <p className="text-xs text-stone-500 font-medium uppercase tracking-widest mt-1">
              {formData.type === 'PR' ? 'Purchase Request Form' : 'Proposal Form'}
            </p>
          </div>
          <button onClick={onCancel} className="p-2 hover:bg-stone-200 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-8">
          {/* Type Selection */}
          <div className="grid grid-cols-2 gap-6">
            <button
              type="button"
              onClick={() => setFormData({ ...formData, type: 'PR' })}
              className={`p-6 rounded-2xl border-2 transition-all text-left relative overflow-hidden ${
                formData.type === 'PR' 
                  ? 'border-[#141414] bg-stone-50' 
                  : 'border-stone-100 hover:border-stone-200'
              }`}
            >
              <span className="block text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">Form Type 01</span>
              <span className="block font-bold text-xl">Yêu cầu mua sắm (PR)</span>
              {formData.type === 'PR' && <div className="absolute top-2 right-2 w-2 h-2 bg-[#141414] rounded-full" />}
            </button>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, type: 'PROPOSAL' })}
              className={`p-6 rounded-2xl border-2 transition-all text-left relative overflow-hidden ${
                formData.type === 'PROPOSAL' 
                  ? 'border-[#141414] bg-stone-50' 
                  : 'border-stone-100 hover:border-stone-200'
              }`}
            >
              <span className="block text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">Form Type 02</span>
              <span className="block font-bold text-xl">Tờ trình phê duyệt</span>
              {formData.type === 'PROPOSAL' && <div className="absolute top-2 right-2 w-2 h-2 bg-[#141414] rounded-full" />}
            </button>
          </div>

          {formData.type === 'PR' ? (
            <>
              {/* PR Specific Fields */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-stone-50/50 p-6 rounded-3xl border border-stone-100">
                <div className="md:col-span-3">
                  <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Tên PR / Tiêu đề</label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Ví dụ: Mua sắm máy tính xách tay cho phòng IT..."
                    className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:border-[#141414] focus:ring-0 transition-all outline-none bg-white font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Nhóm yêu cầu</label>
                  <input
                    type="text"
                    value={formData.request_group}
                    onChange={(e) => setFormData({ ...formData, request_group: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:border-[#141414] focus:ring-0 transition-all outline-none bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Thời hạn thực hiện (ngày)</label>
                  <input
                    type="number"
                    value={formData.deadline_days}
                    onChange={(e) => setFormData({ ...formData, deadline_days: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:border-[#141414] focus:ring-0 transition-all outline-none bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Leadtime</label>
                  <input
                    type="text"
                    value={formData.leadtime}
                    onChange={(e) => setFormData({ ...formData, leadtime: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:border-[#141414] focus:ring-0 transition-all outline-none bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">PO Number</label>
                  <input
                    type="text"
                    value={formData.po_number}
                    onChange={(e) => setFormData({ ...formData, po_number: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:border-[#141414] focus:ring-0 transition-all outline-none bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Budget Plan</label>
                  <input
                    type="text"
                    value={formData.budget_plan}
                    onChange={(e) => setFormData({ ...formData, budget_plan: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:border-[#141414] focus:ring-0 transition-all outline-none bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Budget Code</label>
                  <input
                    type="text"
                    value={formData.budget_code}
                    onChange={(e) => setFormData({ ...formData, budget_code: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:border-[#141414] focus:ring-0 transition-all outline-none bg-white"
                  />
                </div>
              </div>

              {/* Items Table */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <Calculator size={20} className="text-stone-400" />
                    Danh sách hàng hoá / dịch vụ
                  </h3>
                  <button
                    type="button"
                    onClick={addItem}
                    className="px-4 py-2 rounded-full border border-[#141414] text-[#141414] text-xs font-bold hover:bg-[#141414] hover:text-white transition-all flex items-center gap-2"
                  >
                    <Plus size={14} />
                    Thêm dòng
                  </button>
                </div>

                <div className="overflow-x-auto border border-stone-200 rounded-2xl">
                  <table className="w-full text-left border-collapse min-w-[1200px]">
                    <thead>
                      <tr className="bg-stone-50 border-b border-stone-200">
                        <th className="px-4 py-3 text-[10px] font-bold text-stone-400 uppercase tracking-widest w-12 text-center">STT</th>
                        <th className="px-4 py-3 text-[10px] font-bold text-stone-400 uppercase tracking-widest min-w-[200px]">Tên hàng hoá</th>
                        <th className="px-4 py-3 text-[10px] font-bold text-stone-400 uppercase tracking-widest min-w-[150px]">Quy cách</th>
                        <th className="px-4 py-3 text-[10px] font-bold text-stone-400 uppercase tracking-widest w-24">Đơn vị</th>
                        <th className="px-4 py-3 text-[10px] font-bold text-stone-400 uppercase tracking-widest w-24">Tổng yêu cầu</th>
                        <th className="px-4 py-3 text-[10px] font-bold text-stone-400 uppercase tracking-widest w-24">Sẵn có</th>
                        <th className="px-4 py-3 text-[10px] font-bold text-stone-400 uppercase tracking-widest w-24">Mua bổ sung</th>
                        <th className="px-4 py-3 text-[10px] font-bold text-stone-400 uppercase tracking-widest w-32">Đơn giá</th>
                        <th className="px-4 py-3 text-[10px] font-bold text-stone-400 uppercase tracking-widest w-32">Thành tiền</th>
                        <th className="px-4 py-3 text-[10px] font-bold text-stone-400 uppercase tracking-widest min-w-[150px]">Lý do</th>
                        <th className="px-4 py-3 text-[10px] font-bold text-stone-400 uppercase tracking-widest w-12"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {formData.items.map((item, index) => (
                        <tr key={index} className="hover:bg-stone-50/50 transition-colors">
                          <td className="px-4 py-2 text-center text-sm font-bold text-stone-400">{index + 1}</td>
                          <td className="px-2 py-2">
                            <input
                              type="text"
                              value={item.item_name}
                              onChange={(e) => handleItemChange(index, 'item_name', e.target.value)}
                              className="w-full px-2 py-1.5 rounded-lg border border-transparent hover:border-stone-200 focus:border-[#141414] outline-none transition-all text-sm"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="text"
                              value={item.specs}
                              onChange={(e) => handleItemChange(index, 'specs', e.target.value)}
                              className="w-full px-2 py-1.5 rounded-lg border border-transparent hover:border-stone-200 focus:border-[#141414] outline-none transition-all text-sm"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="text"
                              value={item.unit}
                              onChange={(e) => handleItemChange(index, 'unit', e.target.value)}
                              className="w-full px-2 py-1.5 rounded-lg border border-transparent hover:border-stone-200 focus:border-[#141414] outline-none transition-all text-sm"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="number"
                              value={item.total_qty}
                              onChange={(e) => handleItemChange(index, 'total_qty', parseFloat(e.target.value))}
                              className="w-full px-2 py-1.5 rounded-lg border border-transparent hover:border-stone-200 focus:border-[#141414] outline-none transition-all text-sm text-right"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="number"
                              value={item.available_qty}
                              onChange={(e) => handleItemChange(index, 'available_qty', parseFloat(e.target.value))}
                              className="w-full px-2 py-1.5 rounded-lg border border-transparent hover:border-stone-200 focus:border-[#141414] outline-none transition-all text-sm text-right"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="number"
                              value={item.purchase_qty}
                              onChange={(e) => handleItemChange(index, 'purchase_qty', parseFloat(e.target.value))}
                              className="w-full px-2 py-1.5 rounded-lg border border-transparent hover:border-stone-200 focus:border-[#141414] outline-none transition-all text-sm text-right bg-stone-50 font-bold"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="number"
                              value={item.unit_price}
                              onChange={(e) => handleItemChange(index, 'unit_price', parseFloat(e.target.value))}
                              className="w-full px-2 py-1.5 rounded-lg border border-transparent hover:border-stone-200 focus:border-[#141414] outline-none transition-all text-sm text-right"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <div className="w-full px-2 py-1.5 text-sm text-right font-bold text-[#141414]">
                              {item.amount?.toLocaleString()}
                            </div>
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="text"
                              value={item.reason}
                              onChange={(e) => handleItemChange(index, 'reason', e.target.value)}
                              className="w-full px-2 py-1.5 rounded-lg border border-transparent hover:border-stone-200 focus:border-[#141414] outline-none transition-all text-sm"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <button
                              type="button"
                              onClick={() => removeItem(index)}
                              className="p-1.5 text-stone-300 hover:text-rose-500 transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-stone-50/50 font-bold border-t border-stone-200">
                        <td colSpan={8} className="px-4 py-4 text-right text-sm uppercase tracking-widest text-stone-400">Tổng cộng (VND)</td>
                        <td className="px-4 py-4 text-right text-lg text-[#141414]">{calculateTotal().toLocaleString()}</td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Notes & Description */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Mô tả chi tiết / Mục đích</label>
                  <textarea
                    rows={4}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Nhập mô tả chi tiết cho tờ trình hoặc yêu cầu..."
                    className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:border-[#141414] focus:ring-0 transition-all outline-none resize-none bg-stone-50/30"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Ghi chú / Giải trình bổ sung</label>
                  <textarea
                    rows={4}
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Các ghi chú khác cho người phê duyệt..."
                    className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:border-[#141414] focus:ring-0 transition-all outline-none resize-none bg-stone-50/30"
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Proposal Specific Fields */}
              <div className="space-y-8">
                <div>
                  <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Tên tờ trình / Tiêu đề</label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Ví dụ: Tờ trình về việc tổ chức đào tạo nội bộ..."
                    className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:border-[#141414] focus:ring-0 transition-all outline-none font-bold text-xl"
                  />
                </div>

                <div className="grid grid-cols-1 gap-6 bg-stone-50/50 p-8 rounded-3xl border border-stone-100">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-stone-400 border-b border-stone-200 pb-2">1. Tổng quan</h3>
                  <textarea
                    rows={3}
                    value={formData.proposal_overview}
                    onChange={(e) => setFormData({ ...formData, proposal_overview: e.target.value })}
                    placeholder="Nhập tổng quan nội dung tờ trình..."
                    className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:border-[#141414] focus:ring-0 transition-all outline-none resize-none bg-white"
                  />

                  <h3 className="text-sm font-bold uppercase tracking-widest text-stone-400 border-b border-stone-200 pb-2 mt-4">2. Thông tin chính</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1.5">Thời gian dự kiến áp dụng</label>
                      <input
                        type="text"
                        value={formData.proposal_time}
                        onChange={(e) => setFormData({ ...formData, proposal_time: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl border border-stone-200 focus:border-[#141414] outline-none bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1.5">Địa điểm</label>
                      <input
                        type="text"
                        value={formData.proposal_location}
                        onChange={(e) => setFormData({ ...formData, proposal_location: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl border border-stone-200 focus:border-[#141414] outline-none bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1.5">Người chủ trì</label>
                      <input
                        type="text"
                        value={formData.proposal_chairperson}
                        onChange={(e) => setFormData({ ...formData, proposal_chairperson: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl border border-stone-200 focus:border-[#141414] outline-none bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1.5">Hình thức tổ chức</label>
                      <input
                        type="text"
                        value={formData.proposal_form}
                        onChange={(e) => setFormData({ ...formData, proposal_form: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl border border-stone-200 focus:border-[#141414] outline-none bg-white"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1.5">Đối tượng áp dụng</label>
                      <input
                        type="text"
                        value={formData.proposal_target}
                        onChange={(e) => setFormData({ ...formData, proposal_target: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl border border-stone-200 focus:border-[#141414] outline-none bg-white"
                      />
                    </div>
                  </div>

                  <h3 className="text-sm font-bold uppercase tracking-widest text-stone-400 border-b border-stone-200 pb-2 mt-4">3. Yêu cầu cụ thể</h3>
                  <textarea
                    rows={3}
                    value={formData.proposal_requirements}
                    onChange={(e) => setFormData({ ...formData, proposal_requirements: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:border-[#141414] outline-none bg-white"
                  />

                  <h3 className="text-sm font-bold uppercase tracking-widest text-stone-400 border-b border-stone-200 pb-2 mt-4">4. Cách thức tổ chức & Đề nghị hỗ trợ từ các bộ phận:</h3>
                  <div className="overflow-x-auto border border-stone-100 rounded-2xl bg-white">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-stone-50 border-b border-stone-100">
                          <th className="px-4 py-3 text-[9px] font-bold text-stone-400 uppercase tracking-widest w-12 text-center">STT</th>
                          <th className="px-4 py-3 text-[9px] font-bold text-stone-400 uppercase tracking-widest">Tên bộ phận</th>
                          <th className="px-4 py-3 text-[9px] font-bold text-stone-400 uppercase tracking-widest">Nội dung</th>
                          <th className="px-4 py-3 text-[9px] font-bold text-stone-400 uppercase tracking-widest w-12 text-center"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-50">
                        {formData.proposal_method_support.map((item, index) => (
                          <tr key={index}>
                            <td className="px-4 py-2 text-center text-stone-400 font-mono text-xs">{index + 1}</td>
                            <td className="px-2 py-2">
                              <input
                                type="text"
                                value={item.dept_name}
                                onChange={(e) => handleMethodSupportChange(index, 'dept_name', e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-stone-100 focus:border-[#141414] outline-none text-sm"
                                placeholder="Tên bộ phận..."
                              />
                            </td>
                            <td className="px-2 py-2">
                              <textarea
                                rows={1}
                                value={item.content}
                                onChange={(e) => handleMethodSupportChange(index, 'content', e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-stone-100 focus:border-[#141414] outline-none text-sm resize-none"
                                placeholder="Nội dung hỗ trợ..."
                              />
                            </td>
                            <td className="px-4 py-2 text-center">
                              <button
                                type="button"
                                onClick={() => removeMethodSupport(index)}
                                className="p-1.5 text-stone-300 hover:text-red-500 transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="p-3 bg-stone-50/50 border-t border-stone-100">
                      <button
                        type="button"
                        onClick={addMethodSupport}
                        className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#141414] hover:opacity-70 transition-all"
                      >
                        <Plus size={14} />
                        Thêm bộ phận
                      </button>
                    </div>
                  </div>

                  <h3 className="text-sm font-bold uppercase tracking-widest text-stone-400 border-b border-stone-200 pb-2 mt-4">5. Chi phí tổ chức</h3>
                  <div className="overflow-x-auto border border-stone-100 rounded-2xl bg-white">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-stone-50 border-b border-stone-100">
                          <th className="px-4 py-3 text-[9px] font-bold text-stone-400 uppercase tracking-widest w-12 text-center">TT</th>
                          <th className="px-4 py-3 text-[9px] font-bold text-stone-400 uppercase tracking-widest">Tên sản phẩm</th>
                          <th className="px-4 py-3 text-[9px] font-bold text-stone-400 uppercase tracking-widest">Nội dung</th>
                          <th className="px-4 py-3 text-[9px] font-bold text-stone-400 uppercase tracking-widest w-20 text-center">Số lượng</th>
                          <th className="px-4 py-3 text-[9px] font-bold text-stone-400 uppercase tracking-widest w-32 text-right">Đơn giá dự kiến</th>
                          <th className="px-4 py-3 text-[9px] font-bold text-stone-400 uppercase tracking-widest w-32 text-right">Thành tiền (VND)</th>
                          <th className="px-4 py-3 text-[9px] font-bold text-stone-400 uppercase tracking-widest w-12 text-center"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-50">
                        {formData.proposal_costs.map((item, index) => (
                          <tr key={index}>
                            <td className="px-4 py-2 text-center text-stone-400 font-mono text-xs">{index + 1}</td>
                            <td className="px-2 py-2">
                              <input
                                type="text"
                                value={item.product_name}
                                onChange={(e) => handleProposalCostChange(index, 'product_name', e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-stone-100 focus:border-[#141414] outline-none text-sm"
                                placeholder="Tên sản phẩm..."
                              />
                            </td>
                            <td className="px-2 py-2">
                              <input
                                type="text"
                                value={item.content}
                                onChange={(e) => handleProposalCostChange(index, 'content', e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-stone-100 focus:border-[#141414] outline-none text-sm"
                                placeholder="Nội dung..."
                              />
                            </td>
                            <td className="px-2 py-2">
                              <input
                                type="number"
                                value={item.quantity}
                                onChange={(e) => handleProposalCostChange(index, 'quantity', parseFloat(e.target.value))}
                                className="w-full px-3 py-2 rounded-lg border border-stone-100 focus:border-[#141414] outline-none text-sm text-center"
                              />
                            </td>
                            <td className="px-2 py-2">
                              <input
                                type="number"
                                value={item.unit_price}
                                onChange={(e) => handleProposalCostChange(index, 'unit_price', parseFloat(e.target.value))}
                                className="w-full px-3 py-2 rounded-lg border border-stone-100 focus:border-[#141414] outline-none text-sm text-right"
                              />
                            </td>
                            <td className="px-4 py-2 text-right font-mono text-sm font-bold">
                              {(item.amount || 0).toLocaleString()}
                            </td>
                            <td className="px-4 py-2 text-center">
                              <button
                                type="button"
                                onClick={() => removeProposalCost(index)}
                                className="p-1.5 text-stone-300 hover:text-red-500 transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-stone-50/30 font-bold">
                          <td colSpan={5} className="px-4 py-3 text-right text-[9px] uppercase tracking-widest text-stone-400">Tổng cộng chi phí</td>
                          <td className="px-4 py-3 text-right text-sm font-mono text-indigo-600">
                            {calculateTotal().toLocaleString()}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                    <div className="p-3 bg-stone-50/50 border-t border-stone-100">
                      <button
                        type="button"
                        onClick={addProposalCost}
                        className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#141414] hover:opacity-70 transition-all"
                      >
                        <Plus size={14} />
                        Thêm chi phí
                      </button>
                    </div>
                  </div>

                  <h3 className="text-sm font-bold uppercase tracking-widest text-stone-400 border-b border-stone-200 pb-2 mt-4">6. Kết quả dự kiến</h3>
                  <textarea
                    rows={3}
                    value={formData.proposal_results}
                    onChange={(e) => setFormData({ ...formData, proposal_results: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:border-[#141414] outline-none bg-white"
                  />
                </div>
              </div>
            </>
          )}

          {/* Approval Info */}
          <div className="bg-stone-900 text-white rounded-3xl p-8 flex flex-col md:flex-row items-center gap-8">
            <div className="bg-white/10 p-4 rounded-2xl shrink-0">
              <AlertCircle className="text-white" size={32} />
            </div>
            <div className="flex-1 text-center md:text-left">
              <h4 className="text-lg font-bold mb-1">Luồng phê duyệt trực tuyến</h4>
              <p className="text-white/60 text-sm leading-relaxed">
                Yêu cầu của bạn sẽ được gửi tuần tự qua: 
                <span className="text-white font-bold"> Trưởng bộ phận</span>
                <span className="mx-2 opacity-30">→</span>
                <span className="text-white font-bold"> Giám đốc tài chính (CFO)</span>
                <span className="mx-2 opacity-30">→</span>
                <span className="text-white font-bold"> Phó tổng giám đốc (COO)</span>.
              </p>
            </div>
            <div className="flex gap-3 w-full md:w-auto">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 md:flex-none px-8 py-4 rounded-full border border-white/20 font-bold hover:bg-white/10 transition-all"
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                className="flex-1 md:flex-none px-8 py-4 rounded-full bg-white text-[#141414] font-bold hover:bg-white/90 transition-all flex items-center justify-center gap-2"
              >
                <Send size={18} />
                Gửi phê duyệt
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

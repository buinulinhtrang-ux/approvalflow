import React, { useState, useEffect } from 'react';
import { X, Send, AlertCircle, Plus, Trash2, Calculator, ChevronLeft } from 'lucide-react';
import type { FormType, User, RequestItem, CreateRequestPayload } from '../types';
import * as api from '../lib/api';
import FieldRenderer from './forms/FieldRenderer';
import ResourcePicker, { type ResourcePickerValue } from './forms/ResourcePicker';

interface CreateRequestProps {
  currentUser: User;
  onSuccess: () => void;
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
  reason: '',
};

export default function CreateRequest({ currentUser, onSuccess, onCancel }: CreateRequestProps) {
  const [step, setStep]               = useState<1 | 2>(1);
  const [formTypes, setFormTypes]     = useState<FormType[]>([]);
  const [selectedFt, setSelectedFt]   = useState<FormType | null>(null);
  const [loadingFt, setLoadingFt]     = useState(true);

  // Common fields
  const [title, setTitle]             = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes]             = useState('');
  const [isUrgent, setIsUrgent]       = useState(false);
  const [budgetPlan, setBudgetPlan]   = useState('');
  const [budgetCode, setBudgetCode]   = useState('');
  const [poNumber, setPoNumber]       = useState('');

  // Resource picker
  const [resourceValue, setResourceValue] = useState<ResourcePickerValue>({});

  // Dynamic form_data
  const [formData, setFormData] = useState<Record<string, unknown>>({});

  // Items table (PR only)
  const [items, setItems] = useState<RequestItem[]>([{ ...emptyItem }]);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    api
      .getFormTypes()
      .then(setFormTypes)
      .catch(console.error)
      .finally(() => setLoadingFt(false));
  }, []);

  const handleSelectFormType = (ft: FormType) => {
    setSelectedFt(ft);
    setFormData({});
    setStep(2);
  };

  const handleFieldChange = (key: string, value: unknown) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const calculateTotal = (): number => {
    if (selectedFt?.code === 'PR') {
      return items.reduce((sum, item) => sum + (item.amount || 0), 0);
    }
    for (const section of selectedFt?.field_schema?.sections ?? []) {
      for (const field of section.fields) {
        if (field.type === 'cost_table' && Array.isArray(formData[field.key])) {
          return (formData[field.key] as { amount?: number }[]).reduce(
            (sum, r) => sum + (r.amount || 0),
            0
          );
        }
      }
    }
    return 0;
  };

  const handleItemChange = (index: number, field: keyof RequestItem, value: unknown) => {
    const newItems = [...items];
    const item = { ...newItems[index], [field]: value } as RequestItem;
    if (field === 'total_qty' || field === 'available_qty') {
      item.purchase_qty = Math.max(0, (item.total_qty || 0) - (item.available_qty || 0));
      item.amount = item.purchase_qty * (item.unit_price || 0);
    } else if (field === 'unit_price') {
      item.amount = (item.purchase_qty || 0) * ((value as number) || 0);
    } else if (field === 'purchase_qty') {
      item.amount = ((value as number) || 0) * (item.unit_price || 0);
    }
    newItems[index] = item;
    setItems(newItems);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFt || !title.trim()) return;
    setError(null);
    setSubmitting(true);

    try {
      const payload: CreateRequestPayload = {
        title:          title.trim(),
        form_type:      selectedFt.code,
        amount:         calculateTotal(),
        requester_id:   currentUser.id,
        description:    description.trim() || undefined,
        notes:          notes.trim()       || undefined,
        is_urgent:      isUrgent,
        budget_plan:    budgetPlan.trim()  || undefined,
        budget_code:    budgetCode.trim()  || undefined,
        po_number:      poNumber.trim()    || undefined,
        resource_id:    resourceValue.resourceId,
        start_datetime: resourceValue.startDatetime,
        end_datetime:   resourceValue.endDatetime,
        form_data:      formData,
        items:          selectedFt.code === 'PR' ? items : undefined,
      };
      await api.createRequestNew(payload);
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra khi gửi yêu cầu');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full px-4 py-3 rounded-xl border border-stone-200 focus:border-[#0E1F40] focus:ring-0 transition-all outline-none bg-white font-medium text-sm';
  const labelClass =
    'block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2';

  // ── Step 1: Select form type ──────────────────────────────────────────────
  if (step === 1) {
    return (
      <div className="max-w-4xl mx-auto">
        <div
          className="bg-white border border-[#E2E8F4] rounded-2xl overflow-hidden"
          style={{ boxShadow: '0 4px 20px rgba(14,31,64,.1)' }}
        >
          <div className="p-6 border-b border-[#0E1F40]/5 flex items-center justify-between bg-stone-50">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Tạo yêu cầu mới</h2>
              <p className="text-xs text-stone-500 font-medium uppercase tracking-widest mt-1">
                Chọn loại biểu mẫu
              </p>
            </div>
            <button onClick={onCancel} className="p-2 hover:bg-stone-200 rounded-full transition-colors">
              <X size={24} />
            </button>
          </div>

          <div className="p-8">
            {loadingFt ? (
              <div className="text-center py-16 text-stone-400">
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
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {formTypes.map((ft, i) => (
                  <button
                    key={ft.id}
                    type="button"
                    onClick={() => handleSelectFormType(ft)}
                    className="p-6 rounded-2xl border-2 border-[#E2E8F4] hover:border-[#0E1F40] text-left transition-all relative overflow-hidden"
                  >
                    <span className="block text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">
                      Form Type {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="block text-2xl mb-2">{ft.icon ?? '📄'}</span>
                    <span className="block font-bold text-base text-[#0E1F40]">{ft.name}</span>
                    {ft.description && (
                      <span className="block text-xs text-stone-400 mt-1">{ft.description}</span>
                    )}
                    {(ft.requires_resource || ft.requires_time_range) && (
                      <div className="flex gap-1 mt-3 flex-wrap">
                        {ft.requires_resource && (
                          <span className="text-[9px] font-bold uppercase tracking-wider bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                            Tài nguyên
                          </span>
                        )}
                        {ft.requires_time_range && (
                          <span className="text-[9px] font-bold uppercase tracking-wider bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full">
                            Thời gian
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Step 2: Fill form ─────────────────────────────────────────────────────
  const ft = selectedFt!;
  const hasItems     = ft.field_schema?.has_items_table;
  const hasFinancial = ft.field_schema?.has_financial_fields;
  const promoted     = ft.field_schema?.promoted_fields;

  return (
    <div className="max-w-6xl mx-auto">
      <div
        className="bg-white border border-[#E2E8F4] rounded-2xl overflow-hidden"
        style={{ boxShadow: '0 4px 20px rgba(14,31,64,.1)' }}
      >
        {/* Header */}
        <div className="p-6 border-b border-[#0E1F40]/5 flex items-center justify-between bg-stone-50">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="p-2 hover:bg-stone-200 rounded-full transition-colors text-stone-500"
            >
              <ChevronLeft size={20} />
            </button>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">{ft.name}</h2>
              <p className="text-xs text-stone-500 font-medium uppercase tracking-widest mt-1">{ft.code}</p>
            </div>
          </div>
          <button onClick={onCancel} className="p-2 hover:bg-stone-200 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-8">
          {/* Title + urgent toggle */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-stone-50/50 p-6 rounded-3xl border border-stone-100">
            <div className="md:col-span-2">
              <label className={labelClass}>
                Tiêu đề <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Nhập tiêu đề yêu cầu..."
                className={inputClass}
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-3 cursor-pointer">
                <button
                  type="button"
                  onClick={() => setIsUrgent(!isUrgent)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    isUrgent ? 'bg-red-500' : 'bg-stone-200'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                      isUrgent ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <span className="text-sm font-medium text-stone-600">Khẩn cấp</span>
              </label>
            </div>
          </div>

          {/* Resource picker */}
          {ft.requires_resource && (
            <ResourcePicker
              resourceType={promoted?.resource_type ?? 'ROOM'}
              label={promoted?.resource_label}
              startLabel={promoted?.start_label}
              endLabel={promoted?.end_label}
              value={resourceValue}
              onChange={setResourceValue}
            />
          )}

          {/* Financial fields */}
          {hasFinancial && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-stone-50/50 p-6 rounded-3xl border border-stone-100">
              <h3 className="md:col-span-3 text-xs font-bold uppercase tracking-widest text-stone-400 border-b border-stone-200 pb-2">
                Thông tin tài chính
              </h3>
              {[
                { label: 'PO Number',  value: poNumber,   set: setPoNumber },
                { label: 'Budget Plan', value: budgetPlan, set: setBudgetPlan },
                { label: 'Budget Code', value: budgetCode, set: setBudgetCode },
              ].map(({ label, value, set }) => (
                <div key={label}>
                  <label className={labelClass}>{label}</label>
                  <input
                    type="text"
                    value={value}
                    onChange={e => set(e.target.value)}
                    className={inputClass}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Dynamic sections */}
          {ft.field_schema?.sections?.map(section => (
            <div key={section.title} className="space-y-6 bg-stone-50/50 p-6 rounded-3xl border border-stone-100">
              <h3 className="text-xs font-bold uppercase tracking-widest text-stone-400 border-b border-stone-200 pb-2">
                {section.title}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {section.fields.map(field => {
                  const isWide = [
                    'textarea', 'dept_support_table', 'cost_table',
                    'text_list', 'person_list', 'checkbox_group',
                  ].includes(field.type);
                  return (
                    <div key={field.key} className={isWide ? 'md:col-span-2' : ''}>
                      <label className={labelClass}>
                        {field.label}{' '}
                        {field.required && <span className="text-red-400">*</span>}
                      </label>
                      <FieldRenderer
                        field={field}
                        value={formData[field.key]}
                        onChange={v => handleFieldChange(field.key, v)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* PR Items table */}
          {hasItems && ft.code === 'PR' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Calculator size={20} className="text-stone-400" />
                  Danh sách hàng hoá / dịch vụ
                </h3>
                <button
                  type="button"
                  onClick={() => setItems([...items, { ...emptyItem }])}
                  className="px-4 py-2 rounded-full border border-[#0E1F40] text-[#0E1F40] text-xs font-bold hover:bg-[#0E1F40] hover:text-white transition-all flex items-center gap-2"
                >
                  <Plus size={14} /> Thêm dòng
                </button>
              </div>

              <div className="overflow-x-auto border border-stone-200 rounded-2xl">
                <table className="w-full text-left border-collapse min-w-[1100px]">
                  <thead>
                    <tr className="bg-stone-50 border-b border-stone-200">
                      {['STT','Tên hàng hoá','Quy cách','Đơn vị','Tổng yêu cầu','Sẵn có','Mua bổ sung','Đơn giá','Thành tiền','Lý do',''].map(h => (
                        <th key={h} className="px-4 py-3 text-[10px] font-bold text-stone-400 uppercase tracking-widest">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {items.map((item, index) => (
                      <tr key={index} className="hover:bg-stone-50/50 transition-colors">
                        <td className="px-4 py-2 text-center text-sm font-bold text-stone-400">{index + 1}</td>
                        {(
                          [
                            { f: 'item_name'    as keyof RequestItem, type: 'text'   },
                            { f: 'specs'        as keyof RequestItem, type: 'text'   },
                            { f: 'unit'         as keyof RequestItem, type: 'text'   },
                            { f: 'total_qty'    as keyof RequestItem, type: 'number' },
                            { f: 'available_qty'as keyof RequestItem, type: 'number' },
                          ] as { f: keyof RequestItem; type: string }[]
                        ).map(({ f, type }) => (
                          <td key={f as string} className="px-2 py-2">
                            <input
                              type={type}
                              value={item[f] as string | number}
                              onChange={e =>
                                handleItemChange(
                                  index, f,
                                  type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value
                                )
                              }
                              className="w-full px-2 py-1.5 rounded-lg border border-transparent hover:border-stone-200 focus:border-[#0E1F40] outline-none text-sm"
                            />
                          </td>
                        ))}
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            value={item.purchase_qty}
                            onChange={e => handleItemChange(index, 'purchase_qty', parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1.5 rounded-lg border border-transparent hover:border-stone-200 focus:border-[#0E1F40] outline-none text-sm text-right bg-stone-50 font-bold"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            value={item.unit_price}
                            onChange={e => handleItemChange(index, 'unit_price', parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1.5 rounded-lg border border-transparent hover:border-stone-200 focus:border-[#0E1F40] outline-none text-sm text-right"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <div className="w-full px-2 py-1.5 text-sm text-right font-bold text-[#0E1F40]">
                            {(item.amount ?? 0).toLocaleString()}
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            value={item.reason}
                            onChange={e => handleItemChange(index, 'reason', e.target.value)}
                            className="w-full px-2 py-1.5 rounded-lg border border-transparent hover:border-stone-200 focus:border-[#0E1F40] outline-none text-sm"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={() => items.length > 1 && setItems(items.filter((_, i) => i !== index))}
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
                      <td colSpan={8} className="px-4 py-4 text-right text-sm uppercase tracking-widest text-stone-400">
                        Tổng cộng (VND)
                      </td>
                      <td className="px-4 py-4 text-right text-lg text-[#0E1F40]">
                        {calculateTotal().toLocaleString()}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Description + Notes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <label className={labelClass}>Mô tả chi tiết / Mục đích</label>
              <textarea
                rows={4}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Nhập mô tả chi tiết..."
                className={`${inputClass} resize-none`}
              />
            </div>
            <div>
              <label className={labelClass}>Ghi chú bổ sung</label>
              <textarea
                rows={4}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Các ghi chú khác cho người phê duyệt..."
                className={`${inputClass} resize-none`}
              />
            </div>
          </div>

          {/* Submit bar */}
          <div
            className="text-white rounded-3xl p-8 flex flex-col md:flex-row items-center gap-8"
            style={{ background: '#0E1F40' }}
          >
            <div className="bg-white/10 p-4 rounded-2xl shrink-0">
              <AlertCircle className="text-white" size={32} />
            </div>
            <div className="flex-1 text-center md:text-left">
              <h4 className="text-lg font-bold mb-1">Luồng phê duyệt trực tuyến</h4>
              <p className="text-white/60 text-sm">
                Yêu cầu sẽ được gửi qua các cấp phê duyệt theo workflow được cấu hình.
              </p>
              {error && (
                <p className="mt-2 text-red-300 text-sm font-medium">⚠ {error}</p>
              )}
            </div>
            <div className="flex gap-3 w-full md:w-auto">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 md:flex-none px-8 py-4 rounded-xl border border-white/20 font-bold hover:bg-white/10 transition-all"
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 md:flex-none px-8 py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: '#C8952A', color: '#0E1F40' }}
              >
                {submitting ? (
                  <div
                    style={{
                      width: 18, height: 18,
                      border: '2px solid rgba(14,31,64,.3)', borderTopColor: '#0E1F40',
                      borderRadius: '50%', animation: 'spin .6s linear infinite',
                    }}
                  />
                ) : (
                  <Send size={18} />
                )}
                Gửi phê duyệt
              </button>
            </div>
          </div>
        </form>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

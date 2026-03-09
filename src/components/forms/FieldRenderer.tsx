import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { FieldDefinition } from '../../types';

interface FieldRendererProps {
  field: FieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}

const inputClass =
  'w-full px-4 py-3 rounded-xl border border-stone-200 focus:border-[#0E1F40] focus:ring-0 transition-all outline-none bg-white text-sm';

export default function FieldRenderer({ field, value, onChange }: FieldRendererProps) {
  switch (field.type) {
    case 'text':
      return (
        <input
          type="text"
          value={(value as string) ?? ''}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={inputClass}
        />
      );

    case 'textarea':
      return (
        <textarea
          rows={3}
          value={(value as string) ?? ''}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={`${inputClass} resize-none`}
        />
      );

    case 'number':
      return (
        <input
          type="number"
          value={(value as number) ?? ''}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          min={field.min}
          max={field.max}
          placeholder={field.placeholder}
          className={inputClass}
        />
      );

    case 'date':
      return (
        <input
          type="date"
          value={(value as string) ?? ''}
          onChange={e => onChange(e.target.value)}
          className={inputClass}
        />
      );

    case 'time':
      return (
        <input
          type="time"
          value={(value as string) ?? ''}
          onChange={e => onChange(e.target.value)}
          className={inputClass}
        />
      );

    case 'boolean': {
      const checked = Boolean(value);
      return (
        <div className="flex items-center gap-3 py-2">
          <button
            type="button"
            onClick={() => onChange(!checked)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              checked ? 'bg-[#0E1F40]' : 'bg-stone-200'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                checked ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
          <span className="text-sm text-stone-600">{checked ? 'Có' : 'Không'}</span>
        </div>
      );
    }

    case 'select':
      return (
        <select
          value={(value as string) ?? ''}
          onChange={e => onChange(e.target.value)}
          className={inputClass}
        >
          <option value="">{field.placeholder ?? '-- Chọn --'}</option>
          {(field.options ?? []).map(opt => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );

    case 'checkbox_group': {
      const selected: string[] = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="grid grid-cols-2 gap-2 py-1">
          {(field.options ?? []).map(opt => (
            <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={e => {
                  if (e.target.checked) onChange([...selected, opt]);
                  else onChange(selected.filter(v => v !== opt));
                }}
                className="w-4 h-4 rounded border-stone-300"
              />
              {opt}
            </label>
          ))}
        </div>
      );
    }

    case 'text_list': {
      const list: string[] = Array.isArray(value) ? (value as string[]) : [''];
      return (
        <div className="space-y-2">
          {list.map((item, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="text"
                value={item}
                onChange={e => {
                  const n = [...list];
                  n[i] = e.target.value;
                  onChange(n);
                }}
                placeholder={field.placeholder}
                className="flex-1 px-3 py-2 rounded-lg border border-stone-200 focus:border-[#0E1F40] outline-none text-sm"
              />
              {list.length > 1 && (
                <button
                  type="button"
                  onClick={() => onChange(list.filter((_, j) => j !== i))}
                  className="p-2 text-stone-300 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange([...list, ''])}
            className="flex items-center gap-1 text-xs font-bold text-[#0E1F40] hover:opacity-70 transition-opacity"
          >
            <Plus size={13} /> Thêm
          </button>
        </div>
      );
    }

    case 'person_list': {
      type PersonRow = { name: string; employee_id?: string };
      const list: PersonRow[] = Array.isArray(value) ? (value as PersonRow[]) : [{ name: '' }];
      return (
        <div className="space-y-2">
          {list.map((person, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="text"
                value={person.name}
                onChange={e => {
                  const n = [...list];
                  n[i] = { ...person, name: e.target.value };
                  onChange(n);
                }}
                placeholder="Họ tên"
                className="flex-1 px-3 py-2 rounded-lg border border-stone-200 focus:border-[#0E1F40] outline-none text-sm"
              />
              <input
                type="text"
                value={person.employee_id ?? ''}
                onChange={e => {
                  const n = [...list];
                  n[i] = { ...person, employee_id: e.target.value };
                  onChange(n);
                }}
                placeholder="Mã NV (tùy chọn)"
                className="w-32 px-3 py-2 rounded-lg border border-stone-200 focus:border-[#0E1F40] outline-none text-sm"
              />
              {list.length > 1 && (
                <button
                  type="button"
                  onClick={() => onChange(list.filter((_, j) => j !== i))}
                  className="p-2 text-stone-300 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange([...list, { name: '' }])}
            className="flex items-center gap-1 text-xs font-bold text-[#0E1F40] hover:opacity-70 transition-opacity"
          >
            <Plus size={13} /> Thêm người
          </button>
        </div>
      );
    }

    case 'dept_support_table': {
      type DeptRow = { dept_name: string; content: string };
      const rows: DeptRow[] = Array.isArray(value)
        ? (value as DeptRow[])
        : [{ dept_name: '', content: '' }];
      return (
        <div className="border border-stone-100 rounded-2xl bg-white overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-100">
                <th className="px-4 py-3 text-[9px] font-bold text-stone-400 uppercase tracking-widest w-10 text-center">STT</th>
                <th className="px-4 py-3 text-[9px] font-bold text-stone-400 uppercase tracking-widest w-1/3">Tên bộ phận</th>
                <th className="px-4 py-3 text-[9px] font-bold text-stone-400 uppercase tracking-widest">Nội dung</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50">
              {rows.map((row, i) => (
                <tr key={i}>
                  <td className="px-4 py-2 text-center text-stone-400 font-mono text-xs">{i + 1}</td>
                  <td className="px-2 py-2">
                    <input
                      type="text"
                      value={row.dept_name}
                      onChange={e => {
                        const n = [...rows];
                        n[i] = { ...row, dept_name: e.target.value };
                        onChange(n);
                      }}
                      placeholder="Tên bộ phận..."
                      className="w-full px-3 py-2 rounded-lg border border-stone-100 focus:border-[#0E1F40] outline-none text-sm"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <textarea
                      rows={1}
                      value={row.content}
                      onChange={e => {
                        const n = [...rows];
                        n[i] = { ...row, content: e.target.value };
                        onChange(n);
                      }}
                      placeholder="Nội dung hỗ trợ..."
                      className="w-full px-3 py-2 rounded-lg border border-stone-100 focus:border-[#0E1F40] outline-none text-sm resize-none"
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => rows.length > 1 && onChange(rows.filter((_, j) => j !== i))}
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
              onClick={() => onChange([...rows, { dept_name: '', content: '' }])}
              className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#0E1F40] hover:opacity-70 transition-opacity"
            >
              <Plus size={14} /> Thêm bộ phận
            </button>
          </div>
        </div>
      );
    }

    case 'cost_table': {
      type CostRow = { product_name: string; content: string; quantity: number; unit_price: number; amount: number };
      const rows: CostRow[] = Array.isArray(value)
        ? (value as CostRow[])
        : [{ product_name: '', content: '', quantity: 0, unit_price: 0, amount: 0 }];
      const updateRow = (i: number, f: keyof CostRow, v: unknown) => {
        const n = [...rows];
        const row = { ...n[i], [f]: v };
        if (f === 'quantity' || f === 'unit_price') {
          row.amount = (row.quantity || 0) * (row.unit_price || 0);
        }
        n[i] = row;
        onChange(n);
      };
      const total = rows.reduce((sum, r) => sum + (r.amount || 0), 0);
      return (
        <div className="border border-stone-100 rounded-2xl bg-white overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-100">
                {['TT', 'Tên sản phẩm', 'Nội dung', 'SL', 'Đơn giá', 'Thành tiền', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-[9px] font-bold text-stone-400 uppercase tracking-widest">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50">
              {rows.map((row, i) => (
                <tr key={i}>
                  <td className="px-4 py-2 text-center text-stone-400 font-mono text-xs">{i + 1}</td>
                  <td className="px-2 py-2">
                    <input type="text" value={row.product_name} onChange={e => updateRow(i, 'product_name', e.target.value)}
                      placeholder="Tên..." className="w-full px-3 py-2 rounded-lg border border-stone-100 focus:border-[#0E1F40] outline-none text-sm" />
                  </td>
                  <td className="px-2 py-2">
                    <input type="text" value={row.content} onChange={e => updateRow(i, 'content', e.target.value)}
                      placeholder="Nội dung..." className="w-full px-3 py-2 rounded-lg border border-stone-100 focus:border-[#0E1F40] outline-none text-sm" />
                  </td>
                  <td className="px-2 py-2">
                    <input type="number" value={row.quantity} onChange={e => updateRow(i, 'quantity', parseFloat(e.target.value) || 0)}
                      className="w-20 px-3 py-2 rounded-lg border border-stone-100 focus:border-[#0E1F40] outline-none text-sm text-center" />
                  </td>
                  <td className="px-2 py-2">
                    <input type="number" value={row.unit_price} onChange={e => updateRow(i, 'unit_price', parseFloat(e.target.value) || 0)}
                      className="w-28 px-3 py-2 rounded-lg border border-stone-100 focus:border-[#0E1F40] outline-none text-sm text-right" />
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-sm font-bold">{(row.amount || 0).toLocaleString()}</td>
                  <td className="px-2 py-2 text-center">
                    <button type="button" onClick={() => rows.length > 1 && onChange(rows.filter((_, j) => j !== i))}
                      className="p-1.5 text-stone-300 hover:text-red-500 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-stone-50/30 font-bold">
                <td colSpan={5} className="px-4 py-3 text-right text-[9px] uppercase tracking-widest text-stone-400">Tổng cộng</td>
                <td className="px-4 py-3 text-right text-sm font-mono text-[#0E1F40]">{total.toLocaleString()}</td>
                <td />
              </tr>
            </tfoot>
          </table>
          <div className="p-3 bg-stone-50/50 border-t border-stone-100">
            <button
              type="button"
              onClick={() => onChange([...rows, { product_name: '', content: '', quantity: 0, unit_price: 0, amount: 0 }])}
              className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#0E1F40] hover:opacity-70 transition-opacity"
            >
              <Plus size={14} /> Thêm chi phí
            </button>
          </div>
        </div>
      );
    }

    default:
      return (
        <input
          type="text"
          value={(value as string) ?? ''}
          onChange={e => onChange(e.target.value)}
          className={inputClass}
        />
      );
  }
}

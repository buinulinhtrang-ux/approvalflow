import React, { useState, useEffect } from 'react';
import type { FormType } from '../../types';
import * as api from '../../lib/api';

interface TemplateOption {
  id: number;
  name: string;
  step_count: number;
}

const FORM_ICONS: Record<string, string> = {
  ShoppingCart: '🛒',
  FileText:     '📄',
  DoorOpen:     '🚪',
  Car:          '🚗',
  Hotel:        '🏨',
};

export default function FormTypeManager() {
  const [formTypes,  setFormTypes]  = useState<FormType[]>([]);
  const [templates,  setTemplates]  = useState<TemplateOption[]>([]);
  const [selections, setSelections] = useState<Record<string, number | ''>>({});
  const [saving,     setSaving]     = useState<Record<string, boolean>>({});
  const [messages,   setMessages]   = useState<Record<string, { ok: boolean; text: string }>>({});
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    Promise.all([
      api.adminGetAllFormTypes(),
      api.adminGetAllTemplates(),
    ])
      .then(([fts, tpls]) => {
        setFormTypes(fts);
        setTemplates(tpls as TemplateOption[]);

        const init: Record<string, number | ''> = {};
        fts.forEach(ft => { init[ft.code] = ft.active_template_id ?? ''; });
        setSelections(init);
      })
      .catch(e => console.error(e))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (code: string) => {
    const val = selections[code];
    setSaving(p => ({ ...p, [code]: true }));
    setMessages(p => ({ ...p, [code]: undefined as any }));
    try {
      await api.adminUpdateFormTypeTemplate(code, val ? Number(val) : null);
      setMessages(p => ({ ...p, [code]: { ok: true, text: 'Đã lưu' } }));
    } catch (e: any) {
      setMessages(p => ({ ...p, [code]: { ok: false, text: e.message } }));
    } finally {
      setSaving(p => ({ ...p, [code]: false }));
    }
  };

  if (loading) {
    return <div style={{ padding: 32, textAlign: 'center', color: '#8896B0' }}>Đang tải...</div>;
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F4', borderRadius: 10, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F4', background: '#F8FAFC' }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1C2333' }}>
          Gán Workflow Template cho từng Loại biểu mẫu
        </div>
        <div style={{ fontSize: 12, color: '#8896B0', marginTop: 3 }}>
          Khi tạo yêu cầu mới, hệ thống sẽ tự động dùng template đang được chọn để khởi tạo luồng phê duyệt.
        </div>
      </div>

      {/* Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#F8FAFC' }}>
            <th style={TH}></th>
            <th style={TH}>LOẠI BIỂU MẪU</th>
            <th style={TH}>WORKFLOW TEMPLATE ĐANG ÁP DỤNG</th>
            <th style={TH}>CẦU HÌNH</th>
            <th style={TH}></th>
          </tr>
        </thead>
        <tbody>
          {formTypes.map(ft => {
            const isSaving = saving[ft.code];
            const msg      = messages[ft.code];
            const curTpl   = templates.find(t => t.id === ft.active_template_id);

            return (
              <tr key={ft.code} style={{ borderTop: '1px solid #F1F5F9' }}>
                {/* Icon */}
                <td style={{ ...TD, width: 48, textAlign: 'center', fontSize: 20 }}>
                  {FORM_ICONS[ft.icon ?? ''] ?? '📋'}
                </td>

                {/* Name + code */}
                <td style={TD}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1C2333' }}>{ft.name}</div>
                  <div style={{ fontSize: 11, color: '#8896B0', marginTop: 2 }}>
                    <code style={{ background: '#F1F5F9', padding: '1px 5px', borderRadius: 4 }}>{ft.code}</code>
                    {ft.requires_resource   && <Tag color="#EFF4FF" text="Tài nguyên" />}
                    {ft.requires_time_range && <Tag color="#FFF7ED" text="Thời gian" />}
                  </div>
                </td>

                {/* Template dropdown */}
                <td style={TD}>
                  <select
                    value={selections[ft.code] ?? ''}
                    onChange={e => setSelections(p => ({ ...p, [ft.code]: e.target.value as any }))}
                    style={{
                      padding: '7px 10px', border: '1px solid #E2E8F4',
                      borderRadius: 7, fontSize: 12.5, fontFamily: 'inherit',
                      outline: 'none', minWidth: 280, background: '#fff',
                    }}
                  >
                    <option value="">-- Không có template --</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.step_count} bước)
                      </option>
                    ))}
                  </select>
                </td>

                {/* Cấu hình phòng/thời gian */}
                <td style={TD}>
                  <div style={{ fontSize: 11.5, color: '#64748B', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span>{ft.requires_resource   ? '✓ Chọn tài nguyên' : '— Không cần tài nguyên'}</span>
                    <span>{ft.requires_time_range ? '✓ Chọn thời gian'  : '— Không cần thời gian'}</span>
                  </div>
                </td>

                {/* Action */}
                <td style={{ ...TD, width: 120 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      onClick={() => handleSave(ft.code)}
                      disabled={isSaving}
                      style={{
                        padding: '7px 16px', borderRadius: 7, border: 'none',
                        background: isSaving ? '#94A3B8' : '#0E1F40',
                        color: '#fff', fontSize: 12, fontWeight: 600,
                        cursor: isSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      {isSaving ? '...' : 'Lưu'}
                    </button>
                    {msg && (
                      <span style={{ fontSize: 11, color: msg.ok ? '#16A34A' : '#DC2626' }}>
                        {msg.text}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Info note */}
      <div style={{ padding: '12px 20px', borderTop: '1px solid #F1F5F9', background: '#FFFBEB' }}>
        <div style={{ fontSize: 11.5, color: '#856404' }}>
          Lưu ý: chỉ các Workflow Template đang active mới xuất hiện trong danh sách.
          Khi template đang có yêu cầu đang xử lý, hệ thống chỉ cập nhật metadata — cấu hình bước không thay đổi.
        </div>
      </div>
    </div>
  );
}

const TH: React.CSSProperties = {
  padding: '10px 16px', textAlign: 'left',
  fontSize: 11, fontWeight: 700, color: '#8896B0',
  borderBottom: '1px solid #E2E8F4',
};

const TD: React.CSSProperties = {
  padding: '12px 16px', fontSize: 12.5,
  color: '#374151', verticalAlign: 'middle',
};

function Tag({ color, text }: { color: string; text: string }) {
  return (
    <span style={{
      display: 'inline-block', marginLeft: 5,
      background: color, fontSize: 10, padding: '1px 6px',
      borderRadius: 6, color: '#4A5568', fontWeight: 600,
    }}>
      {text}
    </span>
  );
}

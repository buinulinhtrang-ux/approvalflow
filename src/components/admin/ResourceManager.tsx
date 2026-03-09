import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Power, PowerOff } from 'lucide-react';
import type { Resource } from '../../types';
import * as api from '../../lib/api';

type ResTab = 'ROOM' | 'VEHICLE';

// ─── Property types ────────────────────────────────────────────────────────────
interface RoomProps {
  has_projector:  boolean;
  has_whiteboard: boolean;
  has_tv:         boolean;
  has_micro:      boolean;
  has_webcam:     boolean;
  has_private_ac: boolean;
}

interface VehicleProps {
  plate:     string;
  seats:     number;
  brand:     string;
  model:     string;
  color:     string;
  fuel_type: string;
}

const defaultRoom    = (): RoomProps    => ({ has_projector: false, has_whiteboard: false, has_tv: false, has_micro: false, has_webcam: false, has_private_ac: false });
const defaultVehicle = (): VehicleProps => ({ plate: '', seats: 5, brand: '', model: '', color: '', fuel_type: 'Xăng' });

// ─── Form state ────────────────────────────────────────────────────────────────
interface ResForm {
  id?:         number;
  type:        string;
  name:        string;
  code:        string;
  capacity:    string;
  location:    string;
  description: string;
  properties:  RoomProps | VehicleProps;
  is_active:   boolean;
}

function resourceToForm(r: Resource | null, type: ResTab): ResForm {
  if (!r) return {
    type, name: '', code: '', capacity: '', location: '', description: '',
    properties: type === 'ROOM' ? defaultRoom() : defaultVehicle(),
    is_active: true,
  };
  return {
    id:          r.id,
    type:        r.type,
    name:        r.name,
    code:        r.code        ?? '',
    capacity:    r.capacity    != null ? String(r.capacity) : '',
    location:    r.location    ?? '',
    description: r.description ?? '',
    properties:  { ...(r.properties as any) },
    is_active:   r.is_active,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ResourceManager() {
  const [tab,       setTab]       = useState<ResTab>('ROOM');
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [form,      setForm]      = useState<ResForm>(resourceToForm(null, 'ROOM'));
  const [saving,    setSaving]    = useState(false);
  const [msg,       setMsg]       = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.adminGetAllResources();
      setResources(data);
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setForm(resourceToForm(null, tab));
    setShowForm(true);
    setMsg(null);
  };

  const openEdit = (r: Resource) => {
    setForm(resourceToForm(r, tab));
    setShowForm(true);
    setMsg(null);
  };

  const cancelForm = () => {
    setShowForm(false);
    setMsg(null);
  };

  const handleToggle = async (r: Resource) => {
    try {
      await api.adminToggleResource(r.id, !r.is_active);
      await load();
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setMsg({ ok: false, text: 'Tên không được để trống' }); return; }
    setSaving(true);
    setMsg(null);
    try {
      await api.adminSaveResource({
        id:          form.id,
        type:        form.type,
        name:        form.name.trim(),
        code:        form.code.trim()        || undefined,
        capacity:    form.capacity !== '' ? Number(form.capacity) : undefined,
        location:    form.location.trim()    || undefined,
        description: form.description.trim() || undefined,
        properties:  form.properties,
        is_active:   form.is_active,
      });
      setMsg({ ok: true, text: form.id ? 'Cập nhật thành công!' : 'Thêm thành công!' });
      setShowForm(false);
      await load();
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setSaving(false);
    }
  };

  const displayed = resources.filter(r => r.type === tab);
  const room = form.properties as RoomProps;
  const veh  = form.properties as VehicleProps;

  const setProp = (patch: Partial<RoomProps> | Partial<VehicleProps>) =>
    setForm(f => ({ ...f, properties: { ...f.properties, ...patch } }));

  return (
    <div>
      {/* Tabs + Add button */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, alignItems: 'center' }}>
        {(['ROOM', 'VEHICLE'] as ResTab[]).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setShowForm(false); setMsg(null); }}
            style={{
              padding: '8px 20px', borderRadius: 8,
              border: tab === t ? 'none' : '1px solid #E2E8F4',
              background: tab === t ? '#0E1F40' : '#fff',
              color: tab === t ? '#fff' : '#64748B',
              fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {t === 'ROOM' ? '🚪 Phòng họp' : '🚗 Xe công ty'}
          </button>
        ))}
        <button
          onClick={openAdd}
          style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 8, border: 'none',
            background: '#C8952A', color: '#fff',
            fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <Plus size={13} />
          {tab === 'ROOM' ? 'Thêm phòng họp' : 'Thêm xe'}
        </button>
      </div>

      {/* Global message */}
      {msg && !showForm && (
        <div style={{
          padding: '9px 14px', marginBottom: 12, borderRadius: 8,
          background: msg.ok ? '#F0FDF4' : '#FEF2F2',
          color: msg.ok ? '#16A34A' : '#DC2626',
          fontSize: 12.5, border: `1px solid ${msg.ok ? '#BBF7D0' : '#FECACA'}`,
        }}>
          {msg.text}
        </div>
      )}

      {/* Add / Edit Form */}
      {showForm && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F4', borderRadius: 10, padding: '16px 20px', marginBottom: 16 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1C2333', marginBottom: 16 }}>
            {form.id ? 'Chỉnh sửa' : 'Thêm mới'} — {tab === 'ROOM' ? 'Phòng họp' : 'Xe công ty'}
          </div>

          {/* Common fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '10px 12px', marginBottom: 14 }}>
            <div>
              <Lbl>TÊN *</Lbl>
              <input style={INP} value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder={tab === 'ROOM' ? 'Phòng họp A' : 'Toyota Innova 2022 — 30A-00001'} />
            </div>
            <div>
              <Lbl>MÃ NỘI BỘ</Lbl>
              <input style={INP} value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                placeholder={tab === 'ROOM' ? 'ROOM-A' : 'VEH-001'} />
            </div>
            <div>
              <Lbl>SỨC CHỨA (người / chỗ)</Lbl>
              <input style={INP} type="number" min={1} value={form.capacity}
                onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} />
            </div>
            <div style={{ gridColumn: '1 / 4' }}>
              <Lbl>VỊ TRÍ</Lbl>
              <input style={INP} value={form.location}
                onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                placeholder="VD: Tầng 3, Tòa nhà chính" />
            </div>
            <div style={{ gridColumn: '1 / 4' }}>
              <Lbl>MÔ TẢ</Lbl>
              <input style={INP} value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Mô tả ngắn về tài nguyên..." />
            </div>
          </div>

          {/* Type-specific properties */}
          {tab === 'ROOM' ? (
            <div style={{ marginBottom: 14 }}>
              <Lbl>TRANG THIẾT BỊ</Lbl>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 6 }}>
                {([
                  ['has_projector',  'Máy chiếu'],
                  ['has_whiteboard', 'Bảng trắng'],
                  ['has_tv',         'TV màn hình lớn'],
                  ['has_micro',      'Micro'],
                  ['has_webcam',     'Webcam'],
                  ['has_private_ac', 'Điều hoà riêng'],
                ] as [keyof RoomProps, string][]).map(([key, label]) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12.5, color: '#374151' }}>
                    <input
                      type="checkbox"
                      checked={room[key] as boolean}
                      onChange={e => setProp({ [key]: e.target.checked })}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px 12px', marginBottom: 14 }}>
              <div>
                <Lbl>BIỂN SỐ</Lbl>
                <input style={INP} value={veh.plate}
                  onChange={e => setProp({ plate: e.target.value })} placeholder="30A-00001" />
              </div>
              <div>
                <Lbl>THƯƠNG HIỆU</Lbl>
                <input style={INP} value={veh.brand}
                  onChange={e => setProp({ brand: e.target.value })} placeholder="Toyota" />
              </div>
              <div>
                <Lbl>MODEL</Lbl>
                <input style={INP} value={veh.model}
                  onChange={e => setProp({ model: e.target.value })} placeholder="Innova 2022" />
              </div>
              <div>
                <Lbl>SỐ CHỖ NGỒI</Lbl>
                <input style={INP} type="number" min={1} value={veh.seats}
                  onChange={e => setProp({ seats: Number(e.target.value) })} />
              </div>
              <div>
                <Lbl>MÀU SẮC</Lbl>
                <input style={INP} value={veh.color}
                  onChange={e => setProp({ color: e.target.value })} placeholder="Trắng, Đen..." />
              </div>
              <div>
                <Lbl>NHIÊN LIỆU</Lbl>
                <select style={INP} value={veh.fuel_type}
                  onChange={e => setProp({ fuel_type: e.target.value })}>
                  {['Xăng', 'Diesel', 'Điện', 'Hybrid'].map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Form error */}
          {msg && (
            <div style={{ fontSize: 12, color: msg.ok ? '#16A34A' : '#DC2626', marginBottom: 10 }}>
              {msg.text}
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={cancelForm}
              style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #E2E8F4', background: '#fff', color: '#64748B', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Hủy
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: saving ? '#94A3B8' : '#0E1F40', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
            >
              {saving ? 'Đang lưu...' : 'Lưu'}
            </button>
          </div>
        </div>
      )}

      {/* Resource Table */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F4', borderRadius: 10, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#8896B0' }}>Đang tải...</div>
        ) : displayed.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#8896B0', fontSize: 13 }}>
            Chưa có {tab === 'ROOM' ? 'phòng họp' : 'xe'} nào. Nhấn "Thêm" để tạo mới.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                <th style={TH}>TÊN</th>
                <th style={TH}>MÃ</th>
                <th style={TH}>SỨC CHỨA</th>
                <th style={TH}>VỊ TRÍ</th>
                {tab === 'VEHICLE' && <th style={TH}>BIỂN SỐ</th>}
                {tab === 'ROOM'    && <th style={TH}>THIẾT BỊ</th>}
                <th style={TH}>TRẠNG THÁI</th>
                <th style={TH}></th>
              </tr>
            </thead>
            <tbody>
              {displayed.map(r => {
                const rp = r.properties as Record<string, unknown>;
                const equipments = [
                  rp.has_projector  && 'Máy chiếu',
                  rp.has_whiteboard && 'Bảng trắng',
                  rp.has_tv         && 'TV',
                  rp.has_micro      && 'Micro',
                  rp.has_webcam     && 'Webcam',
                  rp.has_private_ac && 'Điều hoà',
                ].filter(Boolean) as string[];

                return (
                  <tr key={r.id} style={{ borderTop: '1px solid #F1F5F9', opacity: r.is_active ? 1 : 0.55 }}>
                    <td style={TD}>
                      <div style={{ fontWeight: 600, color: '#1C2333', fontSize: 13 }}>{r.name}</div>
                      {r.description && (
                        <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.description}
                        </div>
                      )}
                    </td>
                    <td style={TD}>
                      {r.code && <code style={{ fontSize: 11, background: '#F1F5F9', padding: '2px 6px', borderRadius: 4 }}>{r.code}</code>}
                    </td>
                    <td style={TD}>{r.capacity ? `${r.capacity} người` : '—'}</td>
                    <td style={TD}>{r.location ?? '—'}</td>

                    {tab === 'VEHICLE' && (
                      <td style={TD}>
                        <div style={{ fontWeight: 600, fontSize: 12 }}>{(rp.plate as string) || '—'}</div>
                        <div style={{ fontSize: 11, color: '#8896B0' }}>
                          {[rp.brand, rp.model].filter(Boolean).join(' ')}
                        </div>
                      </td>
                    )}
                    {tab === 'ROOM' && (
                      <td style={TD}>
                        {equipments.length > 0 ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {equipments.map(eq => (
                              <span key={eq} style={{ fontSize: 10, background: '#EFF4FF', color: '#3B5BDB', padding: '1px 6px', borderRadius: 6 }}>
                                {eq}
                              </span>
                            ))}
                          </div>
                        ) : <span style={{ color: '#CBD5E1', fontSize: 12 }}>—</span>}
                      </td>
                    )}

                    <td style={TD}>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 8,
                        background: r.is_active ? '#F0FDF4' : '#F8FAFC',
                        color:      r.is_active ? '#16A34A' : '#94A3B8',
                      }}>
                        {r.is_active ? 'Hoạt động' : 'Vô hiệu'}
                      </span>
                    </td>

                    <td style={TD}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <ABtn title="Chỉnh sửa" onClick={() => openEdit(r)} color="#0E1F40">
                          <Edit2 size={12} />
                        </ABtn>
                        <ABtn
                          title={r.is_active ? 'Vô hiệu hoá' : 'Kích hoạt lại'}
                          onClick={() => handleToggle(r)}
                          color={r.is_active ? '#DC2626' : '#16A34A'}
                        >
                          {r.is_active ? <PowerOff size={12} /> : <Power size={12} />}
                        </ABtn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Style helpers ─────────────────────────────────────────────────────────────

const INP: React.CSSProperties = {
  width: '100%', padding: '7px 10px',
  border: '1px solid #E2E8F4', borderRadius: 7,
  fontSize: 12.5, fontFamily: 'inherit', outline: 'none',
  background: '#FAFAFA', boxSizing: 'border-box',
};

const TH: React.CSSProperties = {
  padding: '10px 16px', textAlign: 'left',
  fontSize: 11, fontWeight: 700, color: '#8896B0',
  borderBottom: '1px solid #E2E8F4',
};

const TD: React.CSSProperties = {
  padding: '10px 16px', fontSize: 12.5,
  color: '#374151', verticalAlign: 'middle',
};

function Lbl({ children }: { children: React.ReactNode }) {
  return <label style={{ fontSize: 10.5, color: '#8896B0', fontWeight: 600, display: 'block', marginBottom: 4 }}>{children}</label>;
}

function ABtn({ children, onClick, title, color }: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
  color: string;
}) {
  return (
    <button
      onClick={onClick} title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 28, height: 28, borderRadius: 7,
        border: '1px solid #E2E8F4',
        background: '#F8FAFC', color,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

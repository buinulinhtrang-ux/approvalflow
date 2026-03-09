import React, { useState, useEffect } from 'react';
import { Plus, Trash2, UserCheck, Clock, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import type { User, Delegation } from '../types';
import * as api from '../lib/api';
import { supabase } from '../lib/supabase';

interface DelegationManagerProps {
  currentUser: User;
}

interface NewDelegationForm {
  delegatee_id: string;
  valid_from: string;
  valid_until: string;
  max_amount: string;
  reason: string;
}

const emptyForm: NewDelegationForm = {
  delegatee_id: '',
  valid_from:   '',
  valid_until:  '',
  max_amount:   '',
  reason:       '',
};

function formatDatetime(iso: string) {
  return new Date(iso).toLocaleString('vi-VN');
}

function isActive(d: Delegation) {
  const now = new Date();
  return d.is_active && new Date(d.valid_from) <= now && new Date(d.valid_until) >= now;
}

export default function DelegationManager({ currentUser }: DelegationManagerProps) {
  const [delegations, setDelegations]   = useState<Delegation[]>([]);
  const [users, setUsers]               = useState<User[]>([]);
  const [loading, setLoading]           = useState(true);
  const [showForm, setShowForm]         = useState(false);
  const [form, setForm]                 = useState<NewDelegationForm>(emptyForm);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [success, setSuccess]           = useState<string | null>(null);
  const [revoking, setRevoking]         = useState<number | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [dels, usersData] = await Promise.all([
        api.getDelegations(currentUser.id),
        supabase
          .from('users')
          .select('id, name, role, department, title, employee_id')
          .eq('is_active', true)
          .neq('id', currentUser.id)
          .order('name')
          .then(({ data }) => (data ?? []) as User[]),
      ]);
      setDelegations(dels);
      setUsers(usersData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.delegatee_id || !form.valid_from || !form.valid_until) {
      setError('Vui lòng điền đầy đủ: người nhận, thời gian từ, thời gian đến');
      return;
    }
    if (new Date(form.valid_from) >= new Date(form.valid_until)) {
      setError('Thời gian bắt đầu phải trước thời gian kết thúc');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await api.createDelegation({
        delegator_id: currentUser.id,
        delegatee_id: parseInt(form.delegatee_id),
        valid_from:   form.valid_from,
        valid_until:  form.valid_until,
        max_amount:   form.max_amount ? parseFloat(form.max_amount) : undefined,
        reason:       form.reason.trim() || undefined,
        is_active:    true,
      });
      setSuccess('Đã tạo ủy quyền thành công');
      setShowForm(false);
      setForm(emptyForm);
      await fetchData();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi tạo ủy quyền');
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (id: number) => {
    setRevoking(id);
    try {
      await api.revokeDelegation(id);
      setDelegations(prev =>
        prev.map(d => (d.id === id ? { ...d, is_active: false } : d))
      );
    } catch (err: unknown) {
      alert('Lỗi thu hồi: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setRevoking(null);
    }
  };

  const inputClass =
    'w-full px-3 py-2.5 rounded-xl border border-stone-200 focus:border-[#0E1F40] outline-none bg-white text-sm transition-colors';
  const labelClass =
    'block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1.5';

  const myDelegations      = delegations.filter(d => d.delegator_id === currentUser.id);
  const receivedDelegations = delegations.filter(d => d.delegatee_id === currentUser.id);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#0E1F40]">Quản lý ủy quyền</h2>
          <p className="text-xs text-stone-400 mt-1">
            Ủy quyền phê duyệt cho người khác khi bạn vắng mặt
          </p>
        </div>
        <button
          onClick={() => { setShowForm(v => !v); setError(null); }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0E1F40] text-white text-xs font-bold hover:bg-[#162845] transition-colors"
        >
          <Plus size={14} />
          Tạo ủy quyền mới
          {showForm ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      {/* Alerts */}
      {success && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 font-medium">
          <UserCheck size={15} /> {success}
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div className="bg-white border border-[#E2E8F4] rounded-2xl p-6 shadow-sm space-y-5">
          <h3 className="text-sm font-bold text-[#0E1F40] border-b border-stone-100 pb-3">
            Tạo ủy quyền mới
          </h3>
          <form onSubmit={handleCreate} className="space-y-4">
            {/* Delegatee */}
            <div>
              <label className={labelClass}>
                Người nhận ủy quyền <span className="text-red-400">*</span>
              </label>
              <select
                value={form.delegatee_id}
                onChange={e => setForm(p => ({ ...p, delegatee_id: e.target.value }))}
                className={inputClass}
                required
              >
                <option value="">-- Chọn nhân viên --</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                    {u.title ? ` — ${u.title}` : ''}
                    {u.department ? ` (${u.department})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Date range */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>
                  Hiệu lực từ <span className="text-red-400">*</span>
                </label>
                <input
                  type="datetime-local"
                  value={form.valid_from}
                  onChange={e => setForm(p => ({ ...p, valid_from: e.target.value }))}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label className={labelClass}>
                  Đến ngày <span className="text-red-400">*</span>
                </label>
                <input
                  type="datetime-local"
                  value={form.valid_until}
                  onChange={e => setForm(p => ({ ...p, valid_until: e.target.value }))}
                  className={inputClass}
                  required
                />
              </div>
            </div>

            {/* Max amount + reason */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Hạn mức tối đa (VND)</label>
                <input
                  type="number"
                  value={form.max_amount}
                  onChange={e => setForm(p => ({ ...p, max_amount: e.target.value }))}
                  placeholder="Để trống = không giới hạn"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Lý do ủy quyền</label>
                <input
                  type="text"
                  value={form.reason}
                  onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
                  placeholder="Công tác, nghỉ phép..."
                  className={inputClass}
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
                <AlertCircle size={14} /> {error}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setShowForm(false); setForm(emptyForm); setError(null); }}
                className="px-5 py-2.5 rounded-xl border border-stone-200 text-stone-600 text-xs font-bold hover:bg-stone-50 transition-colors"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-[#0E1F40] text-white text-xs font-bold hover:bg-[#162845] disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {saving ? (
                  <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .6s linear infinite' }} />
                ) : (
                  <UserCheck size={14} />
                )}
                Tạo ủy quyền
              </button>
            </div>
          </form>
        </div>
      )}

      {/* My delegations */}
      <div className="bg-white border border-[#E2E8F4] rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-[#0E1F40] flex items-center gap-2">
            <UserCheck size={15} className="text-stone-400" />
            Ủy quyền tôi đã tạo
            <span className="text-xs font-normal text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full ml-1">
              {myDelegations.length}
            </span>
          </h3>
        </div>

        {loading ? (
          <div className="p-8 text-center text-stone-400 text-sm">Đang tải...</div>
        ) : myDelegations.length === 0 ? (
          <div className="p-8 text-center text-stone-400 text-sm">Chưa có ủy quyền nào</div>
        ) : (
          <div className="divide-y divide-stone-50">
            {myDelegations.map(d => {
              const active = isActive(d);
              const expired = new Date(d.valid_until) < new Date();
              return (
                <div key={d.id} className={`px-5 py-4 flex items-start justify-between gap-4 ${!active ? 'opacity-55' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          active
                            ? 'bg-emerald-50 text-emerald-700'
                            : expired
                            ? 'bg-stone-100 text-stone-500'
                            : 'bg-yellow-50 text-yellow-700'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500' : expired ? 'bg-stone-400' : 'bg-yellow-500'}`} />
                        {active ? 'Đang hoạt động' : expired ? 'Đã hết hạn' : 'Đã thu hồi'}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-[#1C2333]">
                      Người nhận: <span className="text-[#0E1F40]">{d.delegatee_name ?? `#${d.delegatee_id}`}</span>
                    </p>
                    <div className="flex items-center gap-1 mt-1 text-xs text-stone-400">
                      <Clock size={11} />
                      {formatDatetime(d.valid_from)} → {formatDatetime(d.valid_until)}
                    </div>
                    {d.max_amount && (
                      <p className="text-xs text-stone-400 mt-0.5">
                        Hạn mức: {d.max_amount.toLocaleString()} VND
                      </p>
                    )}
                    {d.reason && (
                      <p className="text-xs text-stone-500 mt-0.5 italic">{d.reason}</p>
                    )}
                  </div>
                  {active && (
                    <button
                      onClick={() => handleRevoke(d.id)}
                      disabled={revoking === d.id}
                      title="Thu hồi ủy quyền"
                      className="p-2 text-stone-300 hover:text-red-500 transition-colors disabled:opacity-50 shrink-0"
                    >
                      {revoking === d.id ? (
                        <div style={{ width: 14, height: 14, border: '2px solid #ccc', borderTopColor: '#EF4444', borderRadius: '50%', animation: 'spin .6s linear infinite' }} />
                      ) : (
                        <Trash2 size={15} />
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Received delegations */}
      {receivedDelegations.length > 0 && (
        <div className="bg-white border border-[#E2E8F4] rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-stone-100">
            <h3 className="text-sm font-bold text-[#0E1F40] flex items-center gap-2">
              <UserCheck size={15} className="text-blue-400" />
              Ủy quyền tôi nhận được
              <span className="text-xs font-normal text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full ml-1">
                {receivedDelegations.length}
              </span>
            </h3>
          </div>
          <div className="divide-y divide-stone-50">
            {receivedDelegations.map(d => {
              const active = isActive(d);
              return (
                <div key={d.id} className={`px-5 py-4 ${!active ? 'opacity-55' : ''}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        active ? 'bg-blue-50 text-blue-700' : 'bg-stone-100 text-stone-500'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-blue-500' : 'bg-stone-400'}`} />
                      {active ? 'Đang hoạt động' : 'Không còn hiệu lực'}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-[#1C2333]">
                    Từ: <span className="text-[#0E1F40]">{d.delegator_name ?? `#${d.delegator_id}`}</span>
                  </p>
                  <div className="flex items-center gap-1 mt-1 text-xs text-stone-400">
                    <Clock size={11} />
                    {formatDatetime(d.valid_from)} → {formatDatetime(d.valid_until)}
                  </div>
                  {d.max_amount && (
                    <p className="text-xs text-stone-400 mt-0.5">
                      Hạn mức: {d.max_amount.toLocaleString()} VND
                    </p>
                  )}
                  {d.reason && (
                    <p className="text-xs text-stone-500 mt-0.5 italic">{d.reason}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

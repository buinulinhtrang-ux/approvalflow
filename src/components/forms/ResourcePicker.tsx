import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, Search } from 'lucide-react';
import type { Resource, ResourceConflict } from '../../types';
import * as api from '../../lib/api';

export interface ResourcePickerValue {
  resourceId?: number;
  startDatetime?: string;
  endDatetime?: string;
}

interface ResourcePickerProps {
  resourceType: string;
  label?: string;
  startLabel?: string;
  endLabel?: string;
  value: ResourcePickerValue;
  onChange: (value: ResourcePickerValue) => void;
}

export default function ResourcePicker({
  resourceType,
  label,
  startLabel,
  endLabel,
  value,
  onChange,
}: ResourcePickerProps) {
  const [resources, setResources] = useState<Resource[]>([]);
  // null = unchecked, 'ok' = clear, ResourceConflict object = has conflict
  const [conflict, setConflict] = useState<ResourceConflict | 'ok' | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    api.getResources(resourceType).then(setResources).catch(console.error);
  }, [resourceType]);

  // Reset conflict status when any input changes
  useEffect(() => {
    setConflict(null);
  }, [value.resourceId, value.startDatetime, value.endDatetime]);

  const handleCheck = async () => {
    if (!value.resourceId || !value.startDatetime || !value.endDatetime) return;
    setChecking(true);
    try {
      const result = await api.checkResourceConflict(
        value.resourceId,
        value.startDatetime,
        value.endDatetime
      );
      setConflict(result ?? 'ok');
    } catch (e: unknown) {
      alert('Lỗi kiểm tra lịch: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setChecking(false);
    }
  };

  const inputClass =
    'w-full px-4 py-3 rounded-xl border border-stone-200 focus:border-[#0E1F40] outline-none bg-white text-sm transition-colors';
  const labelClass =
    'block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2';

  const hasConflict = conflict !== null && conflict !== 'ok';
  const isOk = conflict === 'ok';

  return (
    <div className="bg-stone-50/50 p-6 rounded-3xl border border-stone-100 space-y-4">
      <h3 className="text-xs font-bold uppercase tracking-widest text-stone-500">
        {label ?? (resourceType === 'ROOM' ? 'Chọn phòng họp' : 'Chọn xe')}
      </h3>

      {/* Resource select */}
      <div>
        <label className={labelClass}>
          {resourceType === 'ROOM' ? 'Phòng họp' : 'Xe'}
        </label>
        <select
          value={value.resourceId ?? ''}
          onChange={e =>
            onChange({
              ...value,
              resourceId: e.target.value ? parseInt(e.target.value) : undefined,
            })
          }
          className={inputClass}
        >
          <option value="">
            -- Chọn {resourceType === 'ROOM' ? 'phòng' : 'xe'} --
          </option>
          {resources.map(r => (
            <option key={r.id} value={r.id}>
              {r.name}
              {r.capacity ? ` (${r.capacity} người)` : ''}
              {r.location ? ` — ${r.location}` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Date/time range */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>{startLabel ?? 'Bắt đầu'}</label>
          <input
            type="datetime-local"
            value={value.startDatetime ?? ''}
            onChange={e => onChange({ ...value, startDatetime: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>{endLabel ?? 'Kết thúc'}</label>
          <input
            type="datetime-local"
            value={value.endDatetime ?? ''}
            onChange={e => onChange({ ...value, endDatetime: e.target.value })}
            className={inputClass}
          />
        </div>
      </div>

      {/* Check button + status */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={handleCheck}
          disabled={
            !value.resourceId ||
            !value.startDatetime ||
            !value.endDatetime ||
            checking
          }
          className="px-4 py-2 rounded-lg border border-[#0E1F40] text-[#0E1F40] text-xs font-bold hover:bg-[#0E1F40] hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <Search size={13} />
          {checking ? 'Đang kiểm tra...' : 'Kiểm tra lịch'}
        </button>

        {isOk && (
          <div className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
            <CheckCircle size={14} />
            Trống trong khung giờ này
          </div>
        )}
        {hasConflict && (
          <div className="flex items-center gap-1.5 text-sm text-red-600 font-medium">
            <AlertCircle size={14} />
            Đã có lịch: &quot;{(conflict as ResourceConflict).conflict_title}&quot;
          </div>
        )}
      </div>

      {/* Conflict detail */}
      {hasConflict && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-100 p-3 rounded-xl">
          Trùng với yêu cầu <strong>#{(conflict as ResourceConflict).conflict_request_id}</strong>
          {' — '}
          {new Date((conflict as ResourceConflict).conflict_start).toLocaleString('vi-VN')}
          {' → '}
          {new Date((conflict as ResourceConflict).conflict_end).toLocaleString('vi-VN')}
        </div>
      )}
    </div>
  );
}

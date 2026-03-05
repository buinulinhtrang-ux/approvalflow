import React, { useState } from 'react';
import { RefreshCw, CheckCircle, AlertCircle, ExternalLink, Users, UserPlus, UserCheck, UserX } from 'lucide-react';
import * as api from '../lib/api';
import type { SheetEmployee, SyncResult } from '../types';

interface SyncPanelProps {}

type SyncState = 'idle' | 'fetching' | 'previewing' | 'syncing' | 'done' | 'error';

const labelStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: '#8896B0',
  textTransform: 'uppercase', letterSpacing: '.4px', display: 'block', marginBottom: 4,
};
const secTitleStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: '#8896B0', letterSpacing: 1,
  textTransform: 'uppercase', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid #E2E8F4',
};

export default function SyncPanel(_props: SyncPanelProps) {
  const [sheetUrl, setSheetUrl]   = useState('');
  const [state, setState]         = useState<SyncState>('idle');
  const [preview, setPreview]     = useState<SheetEmployee[]>([]);
  const [result, setResult]       = useState<SyncResult | null>(null);
  const [errorMsg, setErrorMsg]   = useState('');

  const savedUrl = localStorage.getItem('hr_sheet_url') ?? '';
  const [urlValue, setUrlValue]   = useState(sheetUrl || savedUrl);

  const handleFetch = async () => {
    const url = urlValue.trim();
    if (!url) { setErrorMsg('Vui lòng nhập URL Google Sheet'); setState('error'); return; }
    setErrorMsg('');
    setState('fetching');
    try {
      const employees = await api.fetchGoogleSheetEmployees(url);
      setPreview(employees);
      setSheetUrl(url);
      localStorage.setItem('hr_sheet_url', url);
      setState('previewing');
    } catch (err: any) {
      setErrorMsg(err.message || 'Không thể tải dữ liệu từ Google Sheet');
      setState('error');
    }
  };

  const handleSync = async () => {
    setState('syncing');
    setErrorMsg('');
    try {
      const syncResult = await api.syncEmployees(preview);
      setResult(syncResult);
      setState('done');
    } catch (err: any) {
      setErrorMsg(err.message || 'Đồng bộ thất bại');
      setState('error');
    }
  };

  const reset = () => {
    setState('idle');
    setPreview([]);
    setResult(null);
    setErrorMsg('');
  };

  const activeCount    = preview.filter(e => e.is_active).length;
  const inactiveCount  = preview.filter(e => !e.is_active).length;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Header card */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F4', borderRadius: 12, padding: '20px 24px', marginBottom: 16, boxShadow: '0 1px 4px rgba(14,31,64,.07)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ width: 44, height: 44, background: '#0E1F40', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Users size={22} style={{ color: '#C8952A' }} />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0E1F40', margin: '0 0 4px' }}>Đồng bộ nhân sự từ Google Sheets</h3>
            <p style={{ fontSize: 12.5, color: '#8896B0', margin: 0, lineHeight: 1.6 }}>
              Paste link Google Sheet (bất kỳ dạng URL nào). Sheet phải được chia sẻ công khai và cần có các cột:
              <span style={{ fontWeight: 700, color: '#1C2333' }}> employee_id, name, email, department, role, title, level, is_active</span>
            </p>
          </div>
          <a
            href="https://support.google.com/docs/answer/37579"
            target="_blank"
            rel="noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#2563EB', textDecoration: 'none', flexShrink: 0 }}
          >
            <ExternalLink size={12} />
            Cách publish sheet
          </a>
        </div>

        {/* URL input */}
        <div style={{ marginTop: 20 }}>
          <label style={labelStyle}>URL Google Sheet</label>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              value={urlValue}
              onChange={e => setUrlValue(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              disabled={state === 'fetching' || state === 'syncing'}
              style={{
                flex: 1, padding: '8px 10px', border: '1px solid #E2E8F4', borderRadius: 7,
                fontFamily: 'inherit', fontSize: 12.5, color: '#1C2333', outline: 'none',
                background: state === 'fetching' || state === 'syncing' ? '#F7F9FC' : '#fff',
              }}
              onFocus={e => e.currentTarget.style.borderColor = '#0E1F40'}
              onBlur={e => e.currentTarget.style.borderColor = '#E2E8F4'}
              onKeyDown={e => { if (e.key === 'Enter') handleFetch(); }}
            />
            <button
              onClick={handleFetch}
              disabled={state === 'fetching' || state === 'syncing'}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 16px',
                borderRadius: 8, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
                cursor: state === 'fetching' ? 'not-allowed' : 'pointer',
                background: '#0E1F40', color: '#fff', border: 'none',
                opacity: state === 'fetching' ? .6 : 1, transition: '.15s',
              }}
            >
              {state === 'fetching'
                ? <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .6s linear infinite' }} />
                : <RefreshCw size={14} />
              }
              Tải dữ liệu
            </button>
          </div>
          <p style={{ fontSize: 11, color: '#8896B0', marginTop: 6 }}>
            Tip: Paste bất kỳ URL Google Sheet nào (link chia sẻ, link chỉnh sửa, link CSV). Sheet phải được chia sẻ công khai — <strong style={{ color: '#4A5568' }}>Anyone with the link → Viewer</strong>.
          </p>
        </div>
      </div>

      {/* Error message */}
      {state === 'error' && errorMsg && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#DC2626', fontWeight: 500 }}>
          <AlertCircle size={16} />
          {errorMsg}
        </div>
      )}

      {/* Preview table */}
      {(state === 'previewing' || state === 'syncing' || state === 'done') && preview.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F4', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(14,31,64,.07)', marginBottom: 16 }}>
          {/* Preview header */}
          <div style={{ padding: '14px 20px', background: '#F7F9FC', borderBottom: '1px solid #E2E8F4', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ ...secTitleStyle, margin: 0, border: 'none', padding: 0 }}>Xem trước dữ liệu từ Google Sheet</p>
              <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                <span style={{ fontSize: 11.5, color: '#059669', fontWeight: 600 }}>
                  ● {activeCount} đang hoạt động
                </span>
                {inactiveCount > 0 && (
                  <span style={{ fontSize: 11.5, color: '#DC2626', fontWeight: 600 }}>
                    ● {inactiveCount} sẽ bị vô hiệu hoá
                  </span>
                )}
                <span style={{ fontSize: 11.5, color: '#8896B0' }}>
                  Tổng: {preview.length} nhân viên
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={reset}
                disabled={state === 'syncing'}
                style={{ padding: '7px 12px', borderRadius: 7, fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: '#fff', border: '1px solid #E2E8F4', color: '#4A5568', transition: '.15s' }}
              >
                Tải lại
              </button>
              {state !== 'done' && (
                <button
                  onClick={handleSync}
                  disabled={state === 'syncing'}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 14px',
                    borderRadius: 7, fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                    cursor: state === 'syncing' ? 'not-allowed' : 'pointer',
                    background: '#C8952A', color: '#0E1F40', border: 'none',
                    opacity: state === 'syncing' ? .6 : 1,
                  }}
                >
                  {state === 'syncing'
                    ? <div style={{ width: 12, height: 12, border: '2px solid rgba(14,31,64,.3)', borderTopColor: '#0E1F40', borderRadius: '50%', animation: 'spin .6s linear infinite' }} />
                    : <RefreshCw size={13} />
                  }
                  {state === 'syncing' ? 'Đang đồng bộ...' : 'Xác nhận đồng bộ'}
                </button>
              )}
            </div>
          </div>

          {/* Preview data table */}
          <div style={{ overflowX: 'auto', maxHeight: 400, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12.5 }}>
              <thead style={{ position: 'sticky', top: 0 }}>
                <tr>
                  {['Mã NV','Họ tên','Email','Phòng ban','Vai trò','Chức danh','Trạng thái'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', fontSize: 10, fontWeight: 700, color: '#8896B0', textTransform: 'uppercase', letterSpacing: '.4px', background: '#F7F9FC', borderBottom: '1px solid #E2E8F4', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((emp, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #F0F4FA' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#F5F8FF'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '8px 12px', fontWeight: 700, color: '#0E1F40', whiteSpace: 'nowrap' }}>{emp.employee_id}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 600, color: '#1C2333' }}>{emp.name}</td>
                    <td style={{ padding: '8px 12px', color: '#4A5568', fontSize: 11.5 }}>{emp.email || '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#4A5568' }}>{emp.department || '—'}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#DBEAFE', color: '#1D4ED8' }}>{emp.role}</span>
                    </td>
                    <td style={{ padding: '8px 12px', color: '#4A5568' }}>{emp.title || '—'}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600,
                        padding: '2px 8px', borderRadius: 20,
                        background: emp.is_active ? '#D1FAE5' : '#FEE2E2',
                        color: emp.is_active ? '#065F46' : '#991B1B',
                      }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: emp.is_active ? '#10B981' : '#EF4444', display: 'inline-block' }} />
                        {emp.is_active ? 'Hoạt động' : 'Vô hiệu'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Result summary */}
      {state === 'done' && result && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F4', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 4px rgba(14,31,64,.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <CheckCircle size={20} style={{ color: '#059669' }} />
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#059669', margin: 0 }}>Đồng bộ hoàn thành</h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { icon: UserPlus, label: 'Nhân viên mới',       value: result.new_count,     accent: '#059669', bg: '#D1FAE5' },
              { icon: UserCheck, label: 'Cập nhật thông tin', value: result.updated_count, accent: '#2563EB', bg: '#DBEAFE' },
              { icon: UserX,    label: 'Vô hiệu hoá',         value: result.deact_count,   accent: '#DC2626', bg: '#FEE2E2' },
            ].map(s => (
              <div key={s.label} style={{ background: s.bg, borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <s.icon size={20} style={{ color: s.accent, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: s.accent, lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: s.accent, fontWeight: 500, marginTop: 2 }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          {result.new_count === 0 && result.updated_count === 0 && result.deact_count === 0 && (
            <p style={{ fontSize: 12.5, color: '#8896B0', textAlign: 'center', padding: '8px 0' }}>
              Không có thay đổi — dữ liệu đã đồng bộ.
            </p>
          )}

          <button
            onClick={reset}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 8, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: '#0E1F40', color: '#fff', border: 'none' }}
          >
            <RefreshCw size={13} />
            Đồng bộ lại
          </button>
        </div>
      )}

      {/* Instructions */}
      {state === 'idle' && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F4', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 4px rgba(14,31,64,.07)' }}>
          <p style={secTitleStyle}>Cấu trúc Google Sheet</p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr>
                  {['Cột','Tên cột','Bắt buộc','Mô tả','Ví dụ'].map(h => (
                    <th key={h} style={{ padding: '7px 12px', fontSize: 10, fontWeight: 700, color: '#8896B0', textTransform: 'uppercase', letterSpacing: '.4px', background: '#F7F9FC', borderBottom: '1px solid #E2E8F4', textAlign: 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ['A','employee_id','✓','Mã nhân viên, dùng làm username + mật khẩu mặc định','WT01DT'],
                  ['B','name','✓','Họ và tên đầy đủ','Nguyễn Văn A'],
                  ['C','email','','Email công ty','a@company.com'],
                  ['D','department','','Tên phòng ban (phải khớp để phân quyền MANAGER đúng)','Phòng Kinh Doanh'],
                  ['E','role','','REQUESTER / MANAGER / CFO / COO (mặc định: REQUESTER)','REQUESTER'],
                  ['F','title','','Chức danh','Nhân viên kinh doanh'],
                  ['G','level','','Cấp độ / bậc lương','1'],
                  ['H','is_active','','TRUE = đang làm việc, FALSE = đã nghỉ','TRUE'],
                ].map(([col, name, req, desc, ex]) => (
                  <tr key={col} style={{ borderBottom: '1px solid #F0F4FA' }}>
                    <td style={{ padding: '7px 12px', fontWeight: 700, color: '#C8952A', fontVariantNumeric: 'tabular-nums' }}>{col}</td>
                    <td style={{ padding: '7px 12px', fontWeight: 700, color: '#0E1F40', fontFamily: 'monospace' }}>{name}</td>
                    <td style={{ padding: '7px 12px', textAlign: 'center', color: req ? '#059669' : '#8896B0' }}>{req || '—'}</td>
                    <td style={{ padding: '7px 12px', color: '#4A5568' }}>{desc}</td>
                    <td style={{ padding: '7px 12px', color: '#8896B0', fontFamily: 'monospace', fontSize: 11.5 }}>{ex}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 16, padding: '10px 14px', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 8, fontSize: 12, color: '#92400E' }}>
            <strong>Lưu ý:</strong> Mật khẩu mặc định của nhân viên mới = <code>employee_id</code>. Nhân viên có thể đổi mật khẩu sau khi đăng nhập lần đầu. Dữ liệu cũ không bao giờ bị xoá, chỉ cập nhật trạng thái.
          </div>
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

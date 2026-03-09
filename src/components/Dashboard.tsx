import React, { useMemo } from 'react';
import { FileText, TrendingUp, Clock, CheckCircle, XCircle } from 'lucide-react';
import { ApprovalRequest } from '../types';

type FilterType = 'all' | 'pending' | 'approved' | 'rejected';

interface DashboardProps {
  requests: ApprovalRequest[];
  filter: FilterType;
  search: string;
  onSelectRequest: (id: number) => void;
}

const STATUS_CFG: Record<string, { label: string; dot: string; bg: string; color: string }> = {
  DRAFT:     { label: 'Nháp',       dot: '#9CA3AF', bg: '#F3F4F6', color: '#374151' },
  PENDING:   { label: 'Đang chờ',  dot: '#F59E0B', bg: '#FEF3C7', color: '#B45309' },
  IN_REVIEW: { label: 'Đang xét',  dot: '#3B82F6', bg: '#DBEAFE', color: '#1D4ED8' },
  APPROVED:  { label: 'Đã duyệt', dot: '#10B981', bg: '#D1FAE5', color: '#065F46' },
  REJECTED:  { label: 'Từ chối',  dot: '#EF4444', bg: '#FEE2E2', color: '#991B1B' },
  CANCELLED: { label: 'Đã hủy',   dot: '#6B7280', bg: '#F3F4F6', color: '#374151' },
};

const TYPE_CFG: Record<string, { label: string; color: string; bg: string }> = {
  PR:               { label: 'PR',          color: '#1D4ED8', bg: '#DBEAFE' },
  PROPOSAL:         { label: 'Tờ trình',    color: '#6D28D9', bg: '#EDE9FE' },
  ROOM_BOOKING:     { label: 'Phòng họp',   color: '#0891B2', bg: '#CFFAFE' },
  VEHICLE_BOOKING:  { label: 'Đặt xe',      color: '#059669', bg: '#D1FAE5' },
  ACCOMMODATION:    { label: 'Phòng CT',    color: '#D97706', bg: '#FEF3C7' },
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

export default function Dashboard({ requests, filter, search, onSelectRequest }: DashboardProps) {
  const filtered = useMemo(() => {
    let list = requests;
    if (filter === 'pending')  list = list.filter(r => r.status === 'PENDING');
    if (filter === 'approved') list = list.filter(r => r.status === 'APPROVED');
    if (filter === 'rejected') list = list.filter(r => r.status === 'REJECTED');
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.title.toLowerCase().includes(q) ||
        (r.requester_name || '').toLowerCase().includes(q) ||
        (r.department || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [requests, filter, search]);

  const total    = requests.length;
  const pending  = requests.filter(r => r.status === 'PENDING' || r.status === 'IN_REVIEW').length;
  const approved = requests.filter(r => r.status === 'APPROVED').length;
  const rejected = requests.filter(r => r.status === 'REJECTED').length;
  const cancelled = requests.filter(r => r.status === 'CANCELLED').length;

  const STATS = [
    { label: 'Tổng yêu cầu',  value: total,     icon: TrendingUp,  accent: '#2563EB' },
    { label: 'Đang chờ duyệt', value: pending,   icon: Clock,       accent: '#D97706' },
    { label: 'Đã phê duyệt',  value: approved,  icon: CheckCircle, accent: '#059669' },
    { label: 'Đã từ chối',    value: rejected,  icon: XCircle,     accent: '#DC2626' },
    { label: 'Đã hủy',        value: cancelled, icon: FileText,    accent: '#6B7280' },
  ];

  return (
    <div>
      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 11, marginBottom: 18 }}>
        {STATS.map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #E2E8F4', borderRadius: 11, padding: '14px 16px', boxShadow: '0 1px 4px rgba(14,31,64,.07)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 24, fontWeight: 700, lineHeight: 1, color: s.accent }}>{s.value}</span>
              <s.icon size={16} style={{ color: s.accent, opacity: .7, marginTop: 4 }} />
            </div>
            <div style={{ fontSize: 11, color: '#8896B0', fontWeight: 500 }}>{s.label}</div>
            <div style={{ height: 2, borderRadius: 2, marginTop: 9, background: '#E2E8F4', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 2, background: s.accent, width: total > 0 ? `${Math.round((s.value / total) * 100)}%` : '0%', transition: '.6s' }} />
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E2E8F4', overflow: 'hidden', boxShadow: '0 1px 4px rgba(14,31,64,.07)' }}>
        {/* Table header */}
        <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 110px 140px 100px', padding: '9px 16px', background: '#F7F9FC', borderBottom: '1px solid #E2E8F4', fontSize: 10.5, fontWeight: 700, color: '#8896B0', letterSpacing: '.5px', textTransform: 'uppercase' }}>
          <span>Loại</span>
          <span>Tiêu đề / Người tạo</span>
          <span>Phòng ban</span>
          <span style={{ textAlign: 'right' }}>Giá trị</span>
          <span style={{ textAlign: 'center' }}>Trạng thái</span>
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '56px 20px', color: '#8896B0' }}>
            <FileText size={32} style={{ margin: '0 auto 10px', opacity: .4 }} />
            <div style={{ fontSize: 13, fontWeight: 500 }}>Không có yêu cầu nào</div>
          </div>
        ) : (
          filtered.map((req) => {
            const sCfg = STATUS_CFG[req.status] ?? STATUS_CFG.PENDING;
            const tCfg = TYPE_CFG[req.type] ?? { label: req.type, color: '#374151', bg: '#F3F4F6' };
            return (
              <div
                key={req.id}
                onClick={() => onSelectRequest(req.id)}
                style={{
                  display: 'grid', gridTemplateColumns: '80px 1fr 110px 140px 100px',
                  padding: '12px 16px', borderBottom: '1px solid #E2E8F4',
                  alignItems: 'center', cursor: 'pointer', transition: '.1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#F5F8FF'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {/* Type badge */}
                <span style={{ display: 'inline-flex', padding: '2px 7px', borderRadius: 4, fontSize: 10.5, fontWeight: 700, background: tCfg.bg, color: tCfg.color }}>
                  {tCfg.label}
                </span>

                {/* Title + requester */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1C2333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{req.title}</div>
                  <div style={{ fontSize: 11, color: '#8896B0', marginTop: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span>{req.requester_name}</span>
                    <span style={{ opacity: .4 }}>·</span>
                    <span>{new Date(req.created_at).toLocaleDateString('vi-VN')}</span>
                  </div>
                </div>

                {/* Department */}
                <div style={{ fontSize: 12, color: '#4A5568', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {req.department || '—'}
                </div>

                {/* Amount */}
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0E1F40', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(req.amount)}
                </div>

                {/* Status badge */}
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: sCfg.bg, color: sCfg.color, whiteSpace: 'nowrap' }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: sCfg.dot, flexShrink: 0, display: 'inline-block' }} />
                    {sCfg.label}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

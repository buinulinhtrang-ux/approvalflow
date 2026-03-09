import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, FileText, LogOut, Clock, CheckCircle, XCircle,
  LayoutDashboard, Search, Users, Settings, Bell, UserCheck, X,
} from 'lucide-react';
import { User, ApprovalRequest } from './types';
import * as api from './lib/api';
import { useRealtimeNotifications, getPendingApprovalCount, type Notification } from './hooks/useRealtimeNotifications';

import Dashboard from './components/Dashboard';
import CreateRequest from './components/CreateRequest';
import RequestDetail from './components/RequestDetail';
import Login from './components/Login';
import SyncPanel from './components/SyncPanel';
import AdminHub from './components/admin/AdminHub';
import DelegationManager from './components/DelegationManager';

type FilterType = 'all' | 'pending' | 'approved' | 'rejected';
type View = 'dashboard' | 'create' | 'detail' | 'sync' | 'admin' | 'delegation';

const NAV_ITEMS: { filter: FilterType; label: string; icon: React.ElementType }[] = [
  { filter: 'all',      label: 'Tất cả yêu cầu',  icon: LayoutDashboard },
  { filter: 'pending',  label: 'Đang chờ duyệt',   icon: Clock },
  { filter: 'approved', label: 'Đã phê duyệt',      icon: CheckCircle },
  { filter: 'rejected', label: 'Đã từ chối',        icon: XCircle },
];

// ── Toast component ──────────────────────────────────────────────────────────
function Toast({
  notification,
  onClose,
  onNavigate,
}: {
  notification: Notification;
  onClose: () => void;
  onNavigate?: (requestId: number) => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
        background: '#0E1F40', color: '#fff', borderRadius: 12,
        padding: '14px 18px', maxWidth: 340, boxShadow: '0 8px 32px rgba(14,31,64,.35)',
        display: 'flex', alignItems: 'flex-start', gap: 12, animation: 'slideUp .3s ease',
      }}
    >
      <Bell size={16} style={{ color: '#C8952A', flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, margin: 0, lineHeight: 1.4 }}>
          {notification.message}
        </p>
        {notification.requestId && onNavigate && (
          <button
            onClick={() => { onNavigate(notification.requestId!); onClose(); }}
            style={{
              marginTop: 6, fontSize: 11, color: '#C8952A', background: 'none',
              border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0,
              fontWeight: 600,
            }}
          >
            Xem chi tiết →
          </button>
        )}
      </div>
      <button
        onClick={onClose}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.5)', padding: 0, flexShrink: 0 }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

// ── Sidebar button helper ────────────────────────────────────────────────────
function SidebarBtn({
  active, onClick, icon: Icon, label, badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 7,
        cursor: 'pointer', width: '100%', border: 'none',
        background: active ? 'rgba(200,149,42,.18)' : 'transparent',
        color: active ? '#F0C060' : '#7A8EAA',
        fontSize: 12.5, fontWeight: 500, transition: '.15s', marginBottom: 1,
        textAlign: 'left', fontFamily: 'inherit',
      }}
      onMouseEnter={e => {
        if (!active) {
          e.currentTarget.style.background = 'rgba(255,255,255,.06)';
          e.currentTarget.style.color = '#C0D0E8';
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = '#7A8EAA';
        }
      }}
    >
      <Icon size={14} />
      <span style={{ flex: 1 }}>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span
          style={{
            background: '#DC2626', color: '#fff',
            fontSize: 10, fontWeight: 700, padding: '1px 6px',
            borderRadius: 9, minWidth: 18, textAlign: 'center',
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

// ── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('approval_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [requests, setRequests]             = useState<ApprovalRequest[]>([]);
  const [view, setView]                     = useState<View>('dashboard');
  const [filter, setFilter]                 = useState<FilterType>('all');
  const [search, setSearch]                 = useState('');
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
  const [loading, setLoading]               = useState(false);
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  const [toast, setToast]                   = useState<Notification | null>(null);

  useEffect(() => {
    if (currentUser) {
      fetchRequests();
      refreshApprovalBadge();
    }
  }, [currentUser]);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const data = await api.getRequests();
      setRequests(data);
    } catch (error) {
      console.error('Error fetching requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshApprovalBadge = useCallback(async () => {
    if (!currentUser) return;
    const count = await getPendingApprovalCount(currentUser);
    setPendingApprovalCount(count);
  }, [currentUser]);

  const handleRefreshAll = useCallback(async () => {
    await fetchRequests();
    await refreshApprovalBadge();
  }, [refreshApprovalBadge]);

  // Realtime notifications
  useRealtimeNotifications({
    currentUser,
    onNewStep: n => setToast(n),
    onStatusChange: n => setToast(n),
    onRefresh: handleRefreshAll,
  });

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    localStorage.setItem('approval_user', JSON.stringify(user));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('approval_user');
    setView('dashboard');
  };

  const handleCreateSuccess = async () => {
    await handleRefreshAll();
    setView('dashboard');
  };

  const handleApprove = async () => {
    await handleRefreshAll();
    setView('dashboard');
  };

  const navigateToRequest = (requestId: number) => {
    setSelectedRequestId(requestId);
    setView('detail');
  };

  if (!currentUser) return <Login onLogin={handleLogin} />;

  if (loading && requests.length === 0) {
    return (
      <div style={{ background: '#F7F9FC', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 36, height: 36, border: '3px solid #E2E8F4', borderTopColor: '#0E1F40', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  const pendingCount  = requests.filter(r => r.status === 'PENDING' || r.status === 'IN_REVIEW').length;
  const approvedCount = requests.filter(r => r.status === 'APPROVED').length;
  const rejectedCount = requests.filter(r => r.status === 'REJECTED').length;

  const badgeCount: Record<FilterType, number> = {
    all: requests.length, pending: pendingCount, approved: approvedCount, rejected: rejectedCount,
  };

  const viewTitle =
    view === 'create'     ? 'Tạo yêu cầu mới' :
    view === 'detail'     ? 'Chi tiết yêu cầu' :
    view === 'sync'       ? 'Đồng bộ nhân sự' :
    view === 'admin'      ? 'Quản trị Workflow' :
    view === 'delegation' ? 'Quản lý ủy quyền' :
    NAV_ITEMS.find(n => n.filter === filter)?.label ?? 'Tất cả yêu cầu';

  const avatarInitial = currentUser.name.split(' ').pop()?.charAt(0) ?? 'U';
  const isNonDashboard = ['create', 'detail', 'sync', 'admin', 'delegation'].includes(view);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#F7F9FC', fontFamily: 'Lexend, sans-serif', color: '#1C2333' }}>
      {/* ── SIDEBAR ── */}
      <aside style={{ width: 244, background: '#0E1F40', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        {/* Logo */}
        <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <img
              src={import.meta.env.BASE_URL + 'logo.png'}
              alt="Wellspring"
              style={{ height: 30, objectFit: 'contain', objectPosition: 'left', filter: 'brightness(0) invert(1)' }}
            />
            <div style={{ color: '#5A6E90', fontSize: 10, letterSpacing: '.7px', textTransform: 'uppercase' }}>
              Hệ thống phê duyệt
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto' }}>
          <div style={{ color: '#4A6080', fontSize: 10, fontWeight: 600, letterSpacing: '1.1px', textTransform: 'uppercase', padding: '8px 10px 4px' }}>
            Danh sách
          </div>

          {NAV_ITEMS.map(item => (
            <SidebarBtn
              key={item.filter}
              active={view === 'dashboard' && filter === item.filter}
              onClick={() => { setFilter(item.filter); setView('dashboard'); setSearch(''); }}
              icon={item.icon}
              label={item.label}
              badge={item.filter === 'pending' ? badgeCount.pending : undefined}
            />
          ))}

          <div style={{ color: '#4A6080', fontSize: 10, fontWeight: 600, letterSpacing: '1.1px', textTransform: 'uppercase', padding: '12px 10px 4px' }}>
            Thao tác
          </div>

          <SidebarBtn
            active={view === 'create'}
            onClick={() => setView('create')}
            icon={Plus}
            label="Tạo yêu cầu mới"
          />

          <SidebarBtn
            active={view === 'delegation'}
            onClick={() => setView('delegation')}
            icon={UserCheck}
            label="Ủy quyền phê duyệt"
          />

          {/* Admin section */}
          {currentUser?.role === 'ADMIN' && (
            <>
              <div style={{ color: '#4A6080', fontSize: 10, fontWeight: 600, letterSpacing: '1.1px', textTransform: 'uppercase', padding: '12px 10px 4px', marginTop: 4 }}>
                Quản trị
              </div>
              <SidebarBtn
                active={view === 'sync'}
                onClick={() => setView('sync')}
                icon={Users}
                label="Đồng bộ nhân sự"
              />
              <SidebarBtn
                active={view === 'admin'}
                onClick={() => setView('admin')}
                icon={Settings}
                label="Quản trị Workflow"
              />
            </>
          )}
        </nav>

        {/* User footer */}
        <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 30, height: 30, background: '#C8952A', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0E1F40', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
            {avatarInitial}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#fff', fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentUser.name}
            </div>
            <div style={{ color: '#5A6E90', fontSize: 10.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentUser.department || currentUser.role}
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="Đăng xuất"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5A6E90', padding: 4, borderRadius: 6, display: 'flex', transition: '.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
            onMouseLeave={e => (e.currentTarget.style.color = '#5A6E90')}
          >
            <LogOut size={15} />
          </button>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Toolbar */}
        <div style={{ background: '#fff', borderBottom: '1px solid #E2E8F4', height: 56, padding: '0 24px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, boxShadow: '0 1px 4px rgba(14,31,64,.07)' }}>
          <h2 style={{ fontSize: 15.5, fontWeight: 700, color: '#1C2333', flex: 1 }}>{viewTitle}</h2>

          {view === 'dashboard' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#F7F9FC', border: '1px solid #E2E8F4', borderRadius: 8, padding: '7px 12px', width: 240 }}>
                <Search size={13} style={{ color: '#8896B0', flexShrink: 0 }} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Tìm kiếm yêu cầu..."
                  style={{ border: 'none', background: 'none', fontFamily: 'inherit', fontSize: 12.5, color: '#1C2333', outline: 'none', width: '100%' }}
                />
              </div>
              <button
                onClick={() => setView('create')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 8, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', border: 'none', background: '#0E1F40', color: '#fff', transition: '.15s', whiteSpace: 'nowrap' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#162845'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#0E1F40'; }}
              >
                <Plus size={14} />
                Tạo yêu cầu
              </button>
            </>
          )}

          {isNonDashboard && (
            <button
              onClick={() => setView('dashboard')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: 8, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: '#fff', border: '1px solid #E2E8F4', color: '#4A5568', transition: '.15s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#0E1F40'; e.currentTarget.style.color = '#0E1F40'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#E2E8F4'; e.currentTarget.style.color = '#4A5568'; }}
            >
              <FileText size={13} />
              Danh sách
            </button>
          )}

          {/* Notification bell — chỉ hiện khi có bước chờ duyệt */}
          {pendingApprovalCount > 0 && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => { setFilter('pending'); setView('dashboard'); }}
                title={`${pendingApprovalCount} bước đang chờ bạn phê duyệt`}
                style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, color: '#B45309', fontSize: 12, fontWeight: 600, transition: '.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#FDE68A'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#FEF3C7'; }}
              >
                <Bell size={14} />
                {pendingApprovalCount} chờ duyệt
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {view === 'dashboard' && (
            <Dashboard
              requests={requests}
              filter={filter}
              search={search}
              onSelectRequest={id => { setSelectedRequestId(id); setView('detail'); }}
            />
          )}
          {view === 'create' && (
            <CreateRequest
              currentUser={currentUser!}
              onSuccess={handleCreateSuccess}
              onCancel={() => setView('dashboard')}
            />
          )}
          {view === 'detail' && selectedRequestId && (
            <RequestDetail
              requestId={selectedRequestId}
              currentUser={currentUser!}
              onApprove={handleApprove}
              onBack={() => setView('dashboard')}
            />
          )}
          {view === 'sync' && currentUser?.role === 'ADMIN' && <SyncPanel />}
          {view === 'admin' && currentUser?.role === 'ADMIN' && <AdminHub />}
          {view === 'delegation' && (
            <DelegationManager currentUser={currentUser!} />
          )}
        </div>
      </div>

      {/* Toast notification */}
      {toast && (
        <Toast
          notification={toast}
          onClose={() => setToast(null)}
          onNavigate={navigateToRequest}
        />
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { Plus, FileText, LogOut, Clock, CheckCircle, XCircle, LayoutDashboard, Search, Users } from 'lucide-react';
import { User, ApprovalRequest } from './types';
import * as api from './lib/api';

import Dashboard from './components/Dashboard';
import CreateRequest from './components/CreateRequest';
import RequestDetail from './components/RequestDetail';
import Login from './components/Login';
import SyncPanel from './components/SyncPanel';

type FilterType = 'all' | 'pending' | 'approved' | 'rejected';

const NAV_ITEMS: { filter: FilterType; label: string; icon: React.ElementType }[] = [
  { filter: 'all',      label: 'Tất cả yêu cầu',  icon: LayoutDashboard },
  { filter: 'pending',  label: 'Đang chờ duyệt',   icon: Clock },
  { filter: 'approved', label: 'Đã phê duyệt',      icon: CheckCircle },
  { filter: 'rejected', label: 'Đã từ chối',        icon: XCircle },
];

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('approval_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [requests, setRequests]   = useState<ApprovalRequest[]>([]);
  const [view, setView]           = useState<'dashboard' | 'create' | 'detail' | 'sync'>('dashboard');
  const [filter, setFilter]       = useState<FilterType>('all');
  const [search, setSearch]       = useState('');
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
  const [loading, setLoading]     = useState(false);

  useEffect(() => {
    if (currentUser) fetchRequests();
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

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    localStorage.setItem('approval_user', JSON.stringify(user));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('approval_user');
    setView('dashboard');
  };

  const handleCreateRequest = async (data: any) => {
    try {
      await api.createRequest({ ...data, requester_id: currentUser?.id });
      await fetchRequests();
      setView('dashboard');
    } catch (error: any) {
      alert('Lỗi khi tạo yêu cầu: ' + (error.message || 'Không xác định'));
    }
  };

  const handleApprove = async () => {
    await fetchRequests();
    setView('dashboard');
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

  const pendingCount  = requests.filter(r => r.status === 'PENDING').length;
  const approvedCount = requests.filter(r => r.status === 'APPROVED').length;
  const rejectedCount = requests.filter(r => r.status === 'REJECTED').length;

  const badgeCount: Record<FilterType, number> = {
    all: requests.length, pending: pendingCount, approved: approvedCount, rejected: rejectedCount,
  };

  const viewTitle =
    view === 'create' ? 'Tạo yêu cầu mới' :
    view === 'detail' ? 'Chi tiết yêu cầu' :
    view === 'sync'   ? 'Đồng bộ nhân sự' :
    NAV_ITEMS.find(n => n.filter === filter)?.label ?? 'Tất cả yêu cầu';

  const avatarInitial = currentUser.name.split(' ').pop()?.charAt(0) ?? 'U';

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#F7F9FC', fontFamily: 'Lexend, sans-serif', color: '#1C2333' }}>
      {/* ── SIDEBAR ── */}
      <aside style={{ width: 244, background: '#0E1F40', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        {/* Logo */}
        <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, background: '#C8952A', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, color: '#0E1F40', flexShrink: 0 }}>
              AF
            </div>
            <div>
              <div style={{ color: '#fff', fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>ApprovalFlow</div>
              <div style={{ color: '#5A6E90', fontSize: 10, letterSpacing: '.7px', textTransform: 'uppercase', marginTop: 1 }}>Hệ thống phê duyệt</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto' }}>
          <div style={{ color: '#4A6080', fontSize: 10, fontWeight: 600, letterSpacing: '1.1px', textTransform: 'uppercase', padding: '8px 10px 4px' }}>
            Danh sách
          </div>
          {NAV_ITEMS.map(item => {
            const active = view === 'dashboard' && filter === item.filter;
            const count  = badgeCount[item.filter];
            return (
              <button
                key={item.filter}
                onClick={() => { setFilter(item.filter); setView('dashboard'); setSearch(''); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 7,
                  cursor: 'pointer', width: '100%', border: 'none',
                  background: active ? 'rgba(200,149,42,.18)' : 'transparent',
                  color: active ? '#F0C060' : '#7A8EAA',
                  fontSize: 12.5, fontWeight: 500, transition: '.15s', marginBottom: 1,
                  textAlign: 'left', fontFamily: 'inherit',
                }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,.06)'; e.currentTarget.style.color = '#C0D0E8'; } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#7A8EAA'; } }}
              >
                <item.icon size={14} />
                <span style={{ flex: 1 }}>{item.label}</span>
                {count > 0 && (
                  <span style={{
                    background: item.filter === 'pending' ? '#DC2626' : '#C8952A',
                    color: item.filter === 'pending' ? '#fff' : '#0E1F40',
                    fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 9, minWidth: 18, textAlign: 'center',
                  }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}

          <div style={{ color: '#4A6080', fontSize: 10, fontWeight: 600, letterSpacing: '1.1px', textTransform: 'uppercase', padding: '12px 10px 4px' }}>
            Thao tác
          </div>
          <button
            onClick={() => setView('create')}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 7,
              cursor: 'pointer', width: '100%', border: 'none',
              background: view === 'create' ? 'rgba(200,149,42,.18)' : 'transparent',
              color: view === 'create' ? '#F0C060' : '#7A8EAA',
              fontSize: 12.5, fontWeight: 500, transition: '.15s', textAlign: 'left', fontFamily: 'inherit',
            }}
            onMouseEnter={e => { if (view !== 'create') { e.currentTarget.style.background = 'rgba(255,255,255,.06)'; e.currentTarget.style.color = '#C0D0E8'; } }}
            onMouseLeave={e => { if (view !== 'create') { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#7A8EAA'; } }}
          >
            <Plus size={14} />
            Tạo yêu cầu mới
          </button>

          {/* Admin section — chỉ hiện với ADMIN */}
          {currentUser?.role === 'ADMIN' && (
            <>
              <div style={{ color: '#4A6080', fontSize: 10, fontWeight: 600, letterSpacing: '1.1px', textTransform: 'uppercase', padding: '12px 10px 4px', marginTop: 4 }}>
                Quản trị
              </div>
              <button
                onClick={() => setView('sync')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 7,
                  cursor: 'pointer', width: '100%', border: 'none',
                  background: view === 'sync' ? 'rgba(200,149,42,.18)' : 'transparent',
                  color: view === 'sync' ? '#F0C060' : '#7A8EAA',
                  fontSize: 12.5, fontWeight: 500, transition: '.15s', textAlign: 'left', fontFamily: 'inherit',
                }}
                onMouseEnter={e => { if (view !== 'sync') { e.currentTarget.style.background = 'rgba(255,255,255,.06)'; e.currentTarget.style.color = '#C0D0E8'; } }}
                onMouseLeave={e => { if (view !== 'sync') { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#7A8EAA'; } }}
              >
                <Users size={14} />
                Đồng bộ nhân sự
              </button>
            </>
          )}
        </nav>

        {/* User footer */}
        <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 30, height: 30, background: '#C8952A', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0E1F40', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
            {avatarInitial}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#fff', fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentUser.name}</div>
            <div style={{ color: '#5A6E90', fontSize: 10.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentUser.department || currentUser.role}</div>
          </div>
          <button
            onClick={handleLogout}
            title="Đăng xuất"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5A6E90', padding: 4, borderRadius: 6, display: 'flex', transition: '.15s' }}
            onMouseEnter={e => e.currentTarget.style.color = '#EF4444'}
            onMouseLeave={e => e.currentTarget.style.color = '#5A6E90'}
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

          {(view === 'create' || view === 'detail' || view === 'sync') && (
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
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {view === 'dashboard' && (
            <Dashboard
              requests={requests}
              filter={filter}
              search={search}
              onSelectRequest={(id) => { setSelectedRequestId(id); setView('detail'); }}
            />
          )}
          {view === 'create' && (
            <CreateRequest
              onSubmit={handleCreateRequest}
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
          {view === 'sync' && currentUser?.role === 'ADMIN' && (
            <SyncPanel />
          )}
        </div>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

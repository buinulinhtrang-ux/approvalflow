import React, { useState, useEffect } from 'react';
import { Plus, FileText, LogOut, User as UserIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { User, ApprovalRequest } from './types';
import * as api from './lib/api';

// Components
import Dashboard from './components/Dashboard';
import CreateRequest from './components/CreateRequest';
import RequestDetail from './components/RequestDetail';
import Login from './components/Login';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('approval_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [view, setView] = useState<'dashboard' | 'create' | 'detail'>('dashboard');
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (currentUser) {
      fetchRequests();
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
      console.error('Error creating request:', error);
      alert('Lỗi khi tạo yêu cầu: ' + (error.message || 'Không xác định'));
    }
  };

  const handleApprove = async () => {
    await fetchRequests();
    setView('dashboard');
  };

  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  if (loading && requests.length === 0) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-stone-900"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F0] text-[#141414] font-sans">
      {/* Header */}
      <header className="border-b border-[#141414]/10 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('dashboard')}>
            <div className="w-8 h-8 bg-[#141414] rounded-lg flex items-center justify-center">
              <FileText className="text-white w-5 h-5" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">ApprovalFlow</h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 px-3 py-1.5 bg-stone-50 rounded-full border border-stone-100">
              <div className="w-7 h-7 bg-white rounded-full flex items-center justify-center border border-stone-200">
                <UserIcon size={14} className="text-stone-600" />
              </div>
              <div className="hidden sm:block">
                <p className="text-[10px] font-bold text-stone-400 uppercase leading-none mb-0.5">{currentUser.title || currentUser.role}</p>
                <p className="text-xs font-bold leading-none">{currentUser.name}</p>
                {currentUser.department && (
                  <p className="text-[9px] text-stone-400 mt-0.5">{currentUser.department}</p>
                )}
              </div>
              <button
                onClick={handleLogout}
                className="p-1.5 hover:bg-stone-200 rounded-full text-stone-400 hover:text-rose-500 transition-colors"
                title="Đăng xuất"
              >
                <LogOut size={16} />
              </button>
            </div>

            <button
              onClick={() => setView('create')}
              className="bg-[#141414] text-white px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 hover:bg-[#141414]/90 transition-all active:scale-95"
            >
              <Plus size={18} />
              Tạo yêu cầu
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AnimatePresence mode="wait">
          {view === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Dashboard
                requests={requests}
                onSelectRequest={(id) => {
                  setSelectedRequestId(id);
                  setView('detail');
                }}
              />
            </motion.div>
          )}

          {view === 'create' && (
            <motion.div
              key="create"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <CreateRequest
                onSubmit={handleCreateRequest}
                onCancel={() => setView('dashboard')}
              />
            </motion.div>
          )}

          {view === 'detail' && selectedRequestId && (
            <motion.div
              key="detail"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <RequestDetail
                requestId={selectedRequestId}
                currentUser={currentUser!}
                onApprove={handleApprove}
                onBack={() => setView('dashboard')}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

import React, { useState } from 'react';
import { FileText, LogIn, AlertCircle } from 'lucide-react';
import { User } from '../types';
import * as api from '../lib/api';

interface LoginProps {
  onLogin: (user: User) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const user = await api.login(employeeId, password);
      onLogin(user);
    } catch (err: any) {
      setError(err.message || 'Đăng nhập thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F0] flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#141414] rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl">
            <FileText className="text-white w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">ApprovalFlow</h1>
          <p className="text-stone-500 mt-2">Hệ thống phê duyệt PR & Tờ trình</p>
        </div>

        <div className="bg-white border border-[#141414]/10 rounded-3xl p-8 shadow-xl">
          <h2 className="text-xl font-bold mb-6">Đăng nhập hệ thống</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-stone-700 mb-1.5">Mã nhân viên</label>
              <input
                type="text"
                required
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                placeholder="VD: WF01IT"
                className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:border-[#141414] focus:ring-0 transition-all outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-stone-700 mb-1.5">Mật khẩu</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mặc định là mã nhân viên"
                className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:border-[#141414] focus:ring-0 transition-all outline-none"
              />
            </div>

            {error && (
              <div className="bg-rose-50 border border-rose-100 text-rose-600 p-3 rounded-xl text-sm flex items-center gap-2">
                <AlertCircle size={18} />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#141414] text-white py-3 rounded-xl font-bold hover:bg-[#141414]/90 transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  <LogIn size={18} />
                  Đăng nhập
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-stone-100">
            <p className="text-xs text-stone-400 text-center">
              Mật khẩu mặc định trùng mã nhân viên
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

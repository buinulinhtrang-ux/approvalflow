import React, { useState } from 'react';
import { LogIn, AlertCircle } from 'lucide-react';
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
    <div style={{ background: '#0E1F40' }} className="h-screen flex items-center justify-center p-4">
      <div className="w-[360px]">
        <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 16px 56px rgba(14,31,64,.22)' }} className="p-9">
          {/* Logo */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 20 }}>
            <img
              src={import.meta.env.BASE_URL + 'logo.png'}
              alt="Wellspring"
              style={{ height: 56, objectFit: 'contain', marginBottom: 12 }}
            />
            <div style={{ width: 32, height: 2, background: '#C8952A', borderRadius: 1 }} />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label style={{ color: '#4A5568', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.3px' }} className="block mb-1.5">
                Mã nhân viên
              </label>
              <input
                type="text"
                required
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                placeholder="VD: WT12DT"
                style={{ border: '1px solid #E2E8F4', borderRadius: 7, fontFamily: 'inherit', fontSize: 12.5, color: '#1C2333', background: '#fff', width: '100%', padding: '8px 10px', outline: 'none', transition: '.15s' }}
                onFocus={e => e.currentTarget.style.borderColor = '#0E1F40'}
                onBlur={e => e.currentTarget.style.borderColor = '#E2E8F4'}
              />
            </div>

            <div>
              <label style={{ color: '#4A5568', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.3px' }} className="block mb-1.5">
                Mật khẩu
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mặc định là mã nhân viên"
                style={{ border: '1px solid #E2E8F4', borderRadius: 7, fontFamily: 'inherit', fontSize: 12.5, color: '#1C2333', background: '#fff', width: '100%', padding: '8px 10px', outline: 'none', transition: '.15s' }}
                onFocus={e => e.currentTarget.style.borderColor = '#0E1F40'}
                onBlur={e => e.currentTarget.style.borderColor = '#E2E8F4'}
              />
            </div>

            {error && (
              <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 7, padding: '8px 12px', fontSize: 12 }} className="flex items-center gap-2">
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{ background: '#0E1F40', color: '#fff', borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? .7 : 1, width: '100%', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: '.15s' }}
            >
              {loading ? (
                <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .6s linear infinite' }} />
              ) : (
                <>
                  <LogIn size={15} />
                  Đăng nhập
                </>
              )}
            </button>
          </form>

          <p style={{ color: '#8896B0', fontSize: 11, textAlign: 'center', marginTop: 20 }}>
            Mật khẩu mặc định trùng mã nhân viên
          </p>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

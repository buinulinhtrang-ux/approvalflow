import React from 'react';
import { CheckCircle, XCircle, Clock, ChevronRight, FileText, DollarSign } from 'lucide-react';
import { ApprovalRequest } from '../types';

interface DashboardProps {
  requests: ApprovalRequest[];
  onSelectRequest: (id: number) => void;
}

export default function Dashboard({ requests, onSelectRequest }: DashboardProps) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'APPROVED': return <CheckCircle className="text-emerald-500" size={18} />;
      case 'REJECTED': return <XCircle className="text-rose-500" size={18} />;
      default: return <Clock className="text-amber-500" size={18} />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'APPROVED': return 'Đã duyệt';
      case 'REJECTED': return 'Từ chối';
      default: return 'Đang chờ';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Danh sách yêu cầu</h2>
          <p className="text-stone-500">Quản lý và theo dõi các PR, Tờ trình của bạn.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {requests.length === 0 ? (
          <div className="bg-white border border-[#141414]/10 rounded-2xl p-12 text-center">
            <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="text-stone-400" size={32} />
            </div>
            <h3 className="text-lg font-medium">Chưa có yêu cầu nào</h3>
            <p className="text-stone-500">Hãy tạo yêu cầu đầu tiên của bạn.</p>
          </div>
        ) : (
          requests.map((request) => (
            <div 
              key={request.id}
              onClick={() => onSelectRequest(request.id)}
              className="bg-white border border-[#141414]/10 rounded-2xl p-5 flex items-center justify-between hover:shadow-lg hover:border-[#141414]/20 transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  request.type === 'PR' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'
                }`}>
                  <FileText size={24} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-stone-400">{request.type}</span>
                    <span className="text-xs text-stone-300">•</span>
                    <span className="text-xs text-stone-500">{new Date(request.created_at).toLocaleDateString('vi-VN')}</span>
                  </div>
                  <h3 className="text-lg font-semibold group-hover:text-indigo-600 transition-colors">{request.title}</h3>
                  <div className="flex items-center gap-4 mt-1">
                    <div className="flex items-center gap-1 text-sm text-stone-600">
                      <DollarSign size={14} />
                      <span className="font-medium">{formatCurrency(request.amount)}</span>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-stone-500">
                      <span className="w-1 h-1 bg-stone-300 rounded-full"></span>
                      <span>Người yêu cầu: {request.requester_name}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="text-right hidden sm:block">
                  <div className="flex items-center justify-end gap-1.5">
                    {getStatusIcon(request.status)}
                    <span className={`text-sm font-bold ${
                      request.status === 'APPROVED' ? 'text-emerald-600' : 
                      request.status === 'REJECTED' ? 'text-rose-600' : 'text-amber-600'
                    }`}>
                      {getStatusText(request.status)}
                    </span>
                  </div>
                  {request.status === 'PENDING' && (
                    <p className="text-xs text-stone-400 mt-0.5">Chờ: {request.current_approver_role}</p>
                  )}
                </div>
                <ChevronRight className="text-stone-300 group-hover:text-[#141414] transition-colors" />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

import { supabase } from './supabase';
import type { User, ApprovalRequest, ApprovalHistory, RequestItem, SheetEmployee, SyncResult } from '../types';

export async function login(employee_id: string, password: string): Promise<User> {
  const { data, error } = await supabase
    .from('users')
    .select('id, employee_id, name, role, email, department, level, title')
    .eq('employee_id', employee_id)
    .eq('password', password)
    .single();

  if (error || !data) throw new Error('Mã nhân viên hoặc mật khẩu không đúng');
  const user = data as any;
  if (user.is_active === false) throw new Error('Tài khoản đã bị vô hiệu hoá. Vui lòng liên hệ quản trị.');
  return user as User;
}

// ── HR Sync ───────────────────────────────────────────────────

/**
 * Đọc CSV từ Google Sheets (sheet phải được publish to web dưới dạng CSV)
 * URL format: https://docs.google.com/spreadsheets/d/{ID}/export?format=csv
 * Cột bắt buộc (theo thứ tự, có header row):
 *   employee_id, name, email, department, role, title, level, is_active
 */
/** Chuyển đổi mọi dạng URL Google Sheet sang URL export CSV */
function toGoogleSheetCsvUrl(input: string): string {
  const trimmed = input.trim();

  // Đã là URL CSV export hoặc pub → giữ nguyên
  if (trimmed.includes('export?format=csv') || trimmed.includes('/pub?output=csv')) {
    return trimmed;
  }

  // Trích sheet ID từ URL dạng: /spreadsheets/d/{ID}/...
  const match = trimmed.match(/\/spreadsheets\/d\/([^/]+)/);
  if (!match) throw new Error('URL không hợp lệ. Vui lòng dùng URL từ Google Sheets.');

  const sheetId = match[1];
  // Lấy gid nếu có (ví dụ: #gid=12345 hoặc ?gid=12345)
  const gidMatch = trimmed.match(/[?&#]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : '0';

  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

export async function fetchGoogleSheetEmployees(csvUrl: string): Promise<SheetEmployee[]> {
  let exportUrl: string;
  try {
    exportUrl = toGoogleSheetCsvUrl(csvUrl);
  } catch (e: any) {
    throw new Error(e.message);
  }

  let res: Response;
  try {
    res = await fetch(exportUrl);
  } catch {
    throw new Error('Không thể kết nối tới Google Sheets. Kiểm tra kết nối mạng hoặc sheet phải được public.');
  }

  if (res.status === 401 || res.status === 403 || res.status === 406) {
    throw new Error(
      'Google Sheet chưa được công khai. Vào File → Share → Publish to web → chọn sheet → CSV → Publish, rồi dùng URL đó.'
    );
  }
  if (!res.ok) {
    throw new Error(`Không thể tải Google Sheet (HTTP ${res.status}). Kiểm tra lại URL.`);
  }

  const raw = await res.text();

  // Kiểm tra nếu nhận về HTML thay vì CSV
  if (raw.trimStart().startsWith('<!')) {
    throw new Error(
      'Google Sheet trả về HTML thay vì CSV. Sheet chưa được publish public, hoặc URL sai định dạng.'
    );
  }

  // Xử lý BOM và chuẩn hóa line endings (\r\n → \n)
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = text.trim().split('\n');
  if (lines.length < 2) throw new Error('Google Sheet trống hoặc không có dữ liệu');

  // Đọc header để map cột linh hoạt (trim, lowercase, bỏ quotes)
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^"|"$/g, '').trim());
  const idx = (name: string) => headers.indexOf(name);

  const requiredCols = ['employee_id', 'name'];
  for (const col of requiredCols) {
    if (idx(col) === -1) throw new Error(`Google Sheet thiếu cột bắt buộc: "${col}"`);
  }

  const employees: SheetEmployee[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Xử lý CSV đơn giản (không handle quoted commas phức tạp)
    const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));

    const getCol = (name: string) => (idx(name) >= 0 ? cols[idx(name)] ?? '' : '');

    const empId = getCol('employee_id');
    if (!empId) continue;

    const isActiveRaw = getCol('is_active').toLowerCase();
    const is_active = isActiveRaw !== 'false' && isActiveRaw !== '0' && isActiveRaw !== 'không' && isActiveRaw !== 'no';

    employees.push({
      employee_id: empId,
      name:        getCol('name'),
      email:       getCol('email'),
      department:  getCol('department'),
      role:        (getCol('role') || 'REQUESTER') as any,
      title:       getCol('title'),
      level:       getCol('level'),
      is_active,
    });
  }

  if (employees.length === 0) throw new Error('Không tìm thấy dữ liệu nhân viên hợp lệ trong sheet');
  return employees;
}

export async function syncEmployees(employees: SheetEmployee[]): Promise<SyncResult> {
  const { data, error } = await supabase.rpc('sync_employees', {
    p_employees: employees as any,
  });

  if (error) throw new Error('Lỗi đồng bộ: ' + error.message);
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as SyncResult;
}

export async function getRequests(): Promise<ApprovalRequest[]> {
  const { data, error } = await supabase
    .from('requests')
    .select('*, requester:users!requester_id(name)')
    .order('created_at', { ascending: false });

  if (error) throw new Error('Không thể tải danh sách yêu cầu');
  return (data || []).map((r: any) => {
    const { requester, ...rest } = r;
    return { ...rest, requester_name: requester?.name };
  });
}

export async function getRequest(id: number): Promise<ApprovalRequest> {
  const { data, error } = await supabase
    .from('requests')
    .select('*, requester:users!requester_id(name)')
    .eq('id', id)
    .single();

  if (error || !data) throw new Error('Không tìm thấy yêu cầu');
  const { requester, ...rest } = data as any;
  return { ...rest, requester_name: requester?.name };
}

export async function getRequestHistory(requestId: number): Promise<ApprovalHistory[]> {
  const { data, error } = await supabase
    .from('approvals')
    .select('*, approver:users!approver_id(name, role)')
    .eq('request_id', requestId)
    .order('created_at', { ascending: true });

  if (error) throw new Error('Không thể tải lịch sử phê duyệt');
  return (data || []).map((a: any) => {
    const { approver, ...rest } = a;
    return { ...rest, approver_name: approver?.name, approver_role: approver?.role };
  });
}

export async function getRequestItems(requestId: number): Promise<RequestItem[]> {
  const { data, error } = await supabase
    .from('request_items')
    .select('*')
    .eq('request_id', requestId);

  if (error) throw new Error('Không thể tải danh sách hàng hoá');
  return (data || []) as RequestItem[];
}

export async function createRequest(payload: any): Promise<{ id: number }> {
  const { data, error } = await supabase.rpc('create_request', {
    p_title: payload.title,
    p_description: payload.description || null,
    p_amount: payload.amount,
    p_type: payload.type,
    p_requester_id: payload.requester_id,
    p_request_group: payload.request_group || null,
    p_deadline_days: payload.deadline_days || null,
    p_leadtime: payload.leadtime || null,
    p_po_number: payload.po_number || null,
    p_budget_plan: payload.budget_plan || null,
    p_budget_code: payload.budget_code || null,
    p_notes: payload.notes || null,
    p_proposal_overview: payload.proposal_overview || null,
    p_proposal_time: payload.proposal_time || null,
    p_proposal_location: payload.proposal_location || null,
    p_proposal_chairperson: payload.proposal_chairperson || null,
    p_proposal_form: payload.proposal_form || null,
    p_proposal_target: payload.proposal_target || null,
    p_proposal_requirements: payload.proposal_requirements || null,
    p_proposal_method_support: payload.proposal_method_support || null,
    p_proposal_costs: payload.proposal_costs || null,
    p_proposal_results: payload.proposal_results || null,
    p_items: payload.items ? payload.items : null,
  });

  if (error) throw new Error('Lỗi hệ thống khi tạo yêu cầu: ' + error.message);
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as { id: number };
}

export async function approveRequest(
  requestId: number,
  approverId: number,
  status: 'APPROVED' | 'REJECTED',
  comment: string
): Promise<void> {
  const { data, error } = await supabase.rpc('approve_request', {
    p_request_id: requestId,
    p_approver_id: approverId,
    p_status: status,
    p_comment: comment,
  });

  if (error) throw new Error('Lỗi hệ thống khi xử lý phê duyệt: ' + error.message);
  if ((data as any)?.error) throw new Error((data as any).error);
}

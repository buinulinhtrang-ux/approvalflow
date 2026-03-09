import { supabase } from './supabase';
import type {
  User,
  Request,
  RequestItem,
  StepInstance,
  FormType,
  Resource,
  WorkflowTemplate,
  Delegation,
  AuditLogEntry,
  SheetEmployee,
  SyncResult,
  CreateRequestPayload,
  ApproveStepPayload,
  SaveTemplatePayload,
  ResourceConflict,
  BranchCondition,
  // Legacy (dùng cho components chưa migrate Phase 4)
  ApprovalRequest,
  ApprovalHistory,
} from '../types';

// Re-export for convenience
export type { BranchCondition };


// ─────────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────────

export async function login(employee_id: string, password: string): Promise<User> {
  const { data, error } = await supabase
    .from('users')
    .select('id, employee_id, name, role, email, department, level, title, manager_id, is_active')
    .eq('employee_id', employee_id)
    .eq('password', password)
    .single();

  if (error || !data) throw new Error('Mã nhân viên hoặc mật khẩu không đúng');
  const user = data as any;
  if (user.is_active === false)
    throw new Error('Tài khoản đã bị vô hiệu hoá. Vui lòng liên hệ quản trị.');
  return user as User;
}


// ─────────────────────────────────────────────────────────────
// HR SYNC
// ─────────────────────────────────────────────────────────────

/** Chuyển đổi mọi dạng URL Google Sheet sang URL export CSV */
function toGoogleSheetCsvUrl(input: string): string {
  const trimmed = input.trim();

  if (trimmed.includes('export?format=csv') || trimmed.includes('/pub?output=csv')) {
    return trimmed;
  }

  const match = trimmed.match(/\/spreadsheets\/d\/([^/]+)/);
  if (!match) throw new Error('URL không hợp lệ. Vui lòng dùng URL từ Google Sheets.');

  const sheetId = match[1];
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

  if (raw.trimStart().startsWith('<!')) {
    throw new Error(
      'Google Sheet trả về HTML thay vì CSV. Sheet chưa được publish public, hoặc URL sai định dạng.'
    );
  }

  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = text.trim().split('\n');
  if (lines.length < 2) throw new Error('Google Sheet trống hoặc không có dữ liệu');

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

    const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const getCol = (name: string) => (idx(name) >= 0 ? cols[idx(name)] ?? '' : '');

    const empId = getCol('employee_id');
    if (!empId) continue;

    const isActiveRaw = getCol('is_active').toLowerCase();
    const is_active =
      isActiveRaw !== 'false' && isActiveRaw !== '0' && isActiveRaw !== 'không' && isActiveRaw !== 'no';

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


// ─────────────────────────────────────────────────────────────
// FORM TYPES (new)
// ─────────────────────────────────────────────────────────────

export async function getFormTypes(): Promise<FormType[]> {
  const { data, error } = await supabase
    .from('form_types')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) throw new Error('Không thể tải danh sách loại biểu mẫu');
  return (data || []) as FormType[];
}

export async function getFormType(code: string): Promise<FormType> {
  const { data, error } = await supabase
    .from('form_types')
    .select('*')
    .eq('code', code)
    .single();

  if (error || !data) throw new Error(`Không tìm thấy loại biểu mẫu: ${code}`);
  return data as FormType;
}


// ─────────────────────────────────────────────────────────────
// RESOURCES (new)
// ─────────────────────────────────────────────────────────────

export async function getResources(type?: string): Promise<Resource[]> {
  let query = supabase
    .from('resources')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (type) {
    query = query.eq('type', type);
  }

  const { data, error } = await query;
  if (error) throw new Error('Không thể tải danh sách tài nguyên');
  return (data || []) as Resource[];
}

export async function checkResourceConflict(
  resourceId: number,
  startDatetime: string,
  endDatetime: string,
  excludeRequestId?: number
): Promise<ResourceConflict | null> {
  const { data, error } = await supabase.rpc('check_resource_conflict', {
    p_resource_id:        resourceId,
    p_start:              startDatetime,
    p_end:                endDatetime,
    p_exclude_request_id: excludeRequestId ?? null,
  });

  if (error) throw new Error('Lỗi kiểm tra lịch: ' + error.message);
  return data as ResourceConflict | null;
}


// ─────────────────────────────────────────────────────────────
// REQUESTS — New typed API (Phase 4+)
// ─────────────────────────────────────────────────────────────

export async function getRequestList(): Promise<Request[]> {
  const { data, error } = await supabase
    .from('requests')
    .select('*, requester:users!requester_id(name), resource:resources(name, type, code)')
    .order('created_at', { ascending: false });

  if (error) throw new Error('Không thể tải danh sách yêu cầu');
  return (data || []).map((r: any) => {
    const { requester, resource, ...rest } = r;
    return {
      ...rest,
      requester_name: requester?.name,
      resource: resource ?? undefined,
    };
  }) as Request[];
}

export async function getRequestById(id: number): Promise<Request> {
  const { data, error } = await supabase
    .from('requests')
    .select(`
      *,
      requester:users!requester_id(name),
      resource:resources(id, type, name, code, capacity, location, description, properties, is_active)
    `)
    .eq('id', id)
    .single();

  if (error || !data) throw new Error('Không tìm thấy yêu cầu');
  const { requester, resource, ...rest } = data as any;
  return {
    ...rest,
    requester_name: requester?.name,
    resource: resource ?? undefined,
  } as Request;
}

export async function getStepInstances(requestId: number): Promise<StepInstance[]> {
  const { data, error } = await supabase
    .from('request_step_instances')
    .select(`
      *,
      assigned_user:users!assigned_to_id(name),
      acted_user:users!acted_by_id(name)
    `)
    .eq('request_id', requestId)
    .order('step_order', { ascending: true });

  if (error) throw new Error('Không thể tải các bước phê duyệt');
  return (data || []).map((s: any) => ({
    ...s,
    assigned_to_name: s.assigned_user?.name,
    acted_by_name:    s.acted_user?.name,
  })) as StepInstance[];
}

/** Tạo yêu cầu mới — dùng cho Phase 4+ UI */
export async function createRequestNew(payload: CreateRequestPayload): Promise<{ id: number }> {
  const { data, error } = await supabase.rpc('create_request', {
    p_payload: payload as any,
  });

  if (error) throw new Error('Lỗi hệ thống khi tạo yêu cầu: ' + error.message);
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as { id: number };
}

/** Phê duyệt / từ chối bước workflow */
export async function approveStep(payload: ApproveStepPayload): Promise<void> {
  const { data, error } = await supabase.rpc('approve_step', {
    p_step_instance_id: payload.step_instance_id,
    p_approver_id:      payload.approver_id,
    p_action:           payload.action,
    p_comment:          payload.comment ?? null,
  });

  if (error) throw new Error('Lỗi hệ thống khi xử lý phê duyệt: ' + error.message);
  if ((data as any)?.error) throw new Error((data as any).error);
}

/** Lấy audit log của một request */
export async function getAuditLog(requestId: number): Promise<AuditLogEntry[]> {
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .eq('request_id', requestId)
    .order('created_at', { ascending: true });

  if (error) throw new Error('Không thể tải audit log');
  return (data || []) as AuditLogEntry[];
}


// ─────────────────────────────────────────────────────────────
// WORKFLOW TEMPLATES — Admin
// ─────────────────────────────────────────────────────────────

export async function getWorkflowTemplates(): Promise<WorkflowTemplate[]> {
  const { data, error } = await supabase
    .from('workflow_templates')
    .select('*, workflow_steps(*)')
    .eq('is_active', true)
    .order('id', { ascending: true });

  if (error) throw new Error('Không thể tải danh sách workflow template');
  return (data || []) as WorkflowTemplate[];
}

export async function getWorkflowTemplate(id: number): Promise<WorkflowTemplate> {
  const { data, error } = await supabase
    .from('workflow_templates')
    .select('*, workflow_steps(*)')
    .eq('id', id)
    .single();

  if (error || !data) throw new Error('Không tìm thấy workflow template');
  return data as WorkflowTemplate;
}

export async function adminSaveTemplate(payload: SaveTemplatePayload): Promise<{ id: number; warning?: string }> {
  const { data, error } = await supabase.rpc('admin_save_template', {
    p_template: payload.template as any,
    p_steps:    payload.steps    as any,
    p_nodes:    payload.nodes    ?? null,
  });

  if (error) throw new Error('Lỗi lưu workflow template: ' + error.message);
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as { id: number; warning?: string };
}


// ─────────────────────────────────────────────────────────────
// DELEGATIONS
// ─────────────────────────────────────────────────────────────

export async function getDelegations(userId: number): Promise<Delegation[]> {
  const { data, error } = await supabase
    .from('delegations')
    .select(`
      *,
      delegator:users!delegator_id(name),
      delegatee:users!delegatee_id(name)
    `)
    .or(`delegator_id.eq.${userId},delegatee_id.eq.${userId}`)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) throw new Error('Không thể tải danh sách ủy quyền');
  return (data || []).map((d: any) => ({
    ...d,
    delegator_name: d.delegator?.name,
    delegatee_name: d.delegatee?.name,
  })) as Delegation[];
}

export async function createDelegation(
  delegation: Omit<Delegation, 'id' | 'created_at' | 'delegator_name' | 'delegatee_name'>
): Promise<void> {
  const { error } = await supabase.from('delegations').insert(delegation);
  if (error) throw new Error('Lỗi tạo ủy quyền: ' + error.message);
}

export async function revokeDelegation(delegationId: number): Promise<void> {
  const { error } = await supabase
    .from('delegations')
    .update({ is_active: false })
    .eq('id', delegationId);
  if (error) throw new Error('Lỗi thu hồi ủy quyền: ' + error.message);
}


// ─────────────────────────────────────────────────────────────
// LEGACY — Giữ tương thích với components chưa migrate (Phase 4)
// Các function này map dữ liệu từ schema mới về dạng cũ
// ─────────────────────────────────────────────────────────────

/** @deprecated Dùng getRequestList() sau Phase 4 */
export async function getRequests(): Promise<ApprovalRequest[]> {
  const { data, error } = await supabase
    .from('requests')
    .select('*, requester:users!requester_id(name)')
    .order('created_at', { ascending: false });

  if (error) throw new Error('Không thể tải danh sách yêu cầu');

  return (data || []).map((r: any) => {
    const { requester, form_data, ...rest } = r;
    // Map schema mới → legacy ApprovalRequest
    return {
      ...rest,
      type:               r.form_type,
      requester_name:     requester?.name,
      // Trường từ form_data (PR)
      request_group:      form_data?.request_group,
      deadline_days:      form_data?.deadline_days,
      leadtime:           form_data?.leadtime,
      // Trường từ form_data (PROPOSAL)
      proposal_overview:          form_data?.overview,
      proposal_time:              form_data?.event_time,
      proposal_location:          form_data?.location,
      proposal_chairperson:       form_data?.chairperson,
      proposal_form:              form_data?.format,
      proposal_target:            form_data?.target_audience,
      proposal_requirements:      form_data?.requirements,
      proposal_method_support:    form_data?.method_support
        ? JSON.stringify(form_data.method_support) : undefined,
      proposal_costs:             form_data?.costs
        ? JSON.stringify(form_data.costs) : undefined,
      proposal_results:           form_data?.expected_results,
      // current_approver_role không còn trong schema mới — để undefined
      current_approver_role:      undefined,
    } as any as ApprovalRequest;
  });
}

/** @deprecated Dùng getRequestById() sau Phase 4 */
export async function getRequest(id: number): Promise<ApprovalRequest> {
  const { data, error } = await supabase
    .from('requests')
    .select('*, requester:users!requester_id(name)')
    .eq('id', id)
    .single();

  if (error || !data) throw new Error('Không tìm thấy yêu cầu');
  const { requester, form_data, ...rest } = data as any;

  return {
    ...rest,
    type:               rest.form_type,
    requester_name:     requester?.name,
    request_group:      form_data?.request_group,
    deadline_days:      form_data?.deadline_days,
    leadtime:           form_data?.leadtime,
    proposal_overview:          form_data?.overview,
    proposal_time:              form_data?.event_time,
    proposal_location:          form_data?.location,
    proposal_chairperson:       form_data?.chairperson,
    proposal_form:              form_data?.format,
    proposal_target:            form_data?.target_audience,
    proposal_requirements:      form_data?.requirements,
    proposal_method_support:    form_data?.method_support
      ? JSON.stringify(form_data.method_support) : undefined,
    proposal_costs:             form_data?.costs
      ? JSON.stringify(form_data.costs) : undefined,
    proposal_results:           form_data?.expected_results,
    current_approver_role:      undefined,
  } as any as ApprovalRequest;
}

/** @deprecated Dùng getStepInstances() sau Phase 4 */
export async function getRequestHistory(requestId: number): Promise<ApprovalHistory[]> {
  const { data, error } = await supabase
    .from('request_step_instances')
    .select('*, acted_user:users!acted_by_id(name, role)')
    .eq('request_id', requestId)
    .in('status', ['APPROVED', 'REJECTED'])
    .order('step_order', { ascending: true });

  if (error) throw new Error('Không thể tải lịch sử phê duyệt');

  return (data || []).map((s: any) => ({
    id:            s.id,
    request_id:    s.request_id,
    approver_id:   s.acted_by_id ?? s.assigned_to_id ?? 0,
    approver_name: s.acted_user?.name ?? s.assigned_to_name ?? '—',
    approver_role: s.acted_user?.role ?? s.assigned_role ?? '—',
    status:        s.status as 'APPROVED' | 'REJECTED',
    comment:       s.comment ?? '',
    created_at:    s.acted_at ?? s.created_at,
  })) as ApprovalHistory[];
}

export async function getRequestItems(requestId: number): Promise<RequestItem[]> {
  const { data, error } = await supabase
    .from('request_items')
    .select('*')
    .eq('request_id', requestId)
    .order('sort_order', { ascending: true });

  if (error) throw new Error('Không thể tải danh sách hàng hoá');
  return (data || []) as RequestItem[];
}

/**
 * @deprecated Dùng createRequestNew() sau Phase 4
 * Wrapper giữ tương thích với CreateRequest.tsx cũ — chuyển đổi
 * payload format cũ (individual fields) sang JSONB payload mới.
 */
export async function createRequest(payload: any): Promise<{ id: number }> {
  // Tái cấu trúc form_data từ các trường cũ theo form_type
  let form_data: Record<string, unknown> = {};
  const formType: string = payload.type || payload.form_type || 'PR';

  if (formType === 'PR') {
    form_data = {
      request_group: payload.request_group  || undefined,
      deadline_days: payload.deadline_days  || undefined,
      leadtime:      payload.leadtime       || undefined,
    };
  } else if (formType === 'PROPOSAL') {
    form_data = {
      overview:        payload.proposal_overview      || undefined,
      event_time:      payload.proposal_time          || undefined,
      location:        payload.proposal_location      || undefined,
      chairperson:     payload.proposal_chairperson   || undefined,
      format:          payload.proposal_form          || undefined,
      target_audience: payload.proposal_target        || undefined,
      requirements:    payload.proposal_requirements  || undefined,
      method_support:  payload.proposal_method_support
        ? safeJsonParse(payload.proposal_method_support) : undefined,
      costs:           payload.proposal_costs
        ? safeJsonParse(payload.proposal_costs) : undefined,
      expected_results: payload.proposal_results || undefined,
    };
  } else {
    // Form types mới (ROOM_BOOKING, VEHICLE_BOOKING, ACCOMMODATION, ...)
    form_data = payload.form_data || {};
  }

  const newPayload = {
    title:        payload.title,
    form_type:    formType,
    amount:       payload.amount       ?? 0,
    requester_id: payload.requester_id,
    description:  payload.description  || undefined,
    notes:        payload.notes        || undefined,
    is_urgent:    payload.is_urgent    ?? false,
    budget_plan:  payload.budget_plan  || undefined,
    budget_code:  payload.budget_code  || undefined,
    po_number:    payload.po_number    || undefined,
    resource_id:  payload.resource_id  || undefined,
    start_datetime: payload.start_datetime || undefined,
    end_datetime:   payload.end_datetime   || undefined,
    form_data,
    items: payload.items || undefined,
  };

  const { data, error } = await supabase.rpc('create_request', {
    p_payload: newPayload as any,
  });

  if (error) throw new Error('Lỗi hệ thống khi tạo yêu cầu: ' + error.message);
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as { id: number };
}

/**
 * @deprecated Dùng approveStep() sau Phase 4
 * Wrapper giữ tương thích — tìm step instance hiện tại rồi gọi approve_step.
 */
export async function approveRequest(
  requestId: number,
  approverId: number,
  status: 'APPROVED' | 'REJECTED',
  comment: string
): Promise<void> {
  // Tìm bước đang IN_PROGRESS của request này
  const { data: step, error: stepError } = await supabase
    .from('request_step_instances')
    .select('id')
    .eq('request_id', requestId)
    .eq('status', 'IN_PROGRESS')
    .limit(1)
    .single();

  if (stepError || !step) {
    throw new Error('Không tìm thấy bước phê duyệt đang chờ xử lý');
  }

  const { data, error } = await supabase.rpc('approve_step', {
    p_step_instance_id: step.id,
    p_approver_id:      approverId,
    p_action:           status,
    p_comment:          comment || null,
  });

  if (error) throw new Error('Lỗi hệ thống khi xử lý phê duyệt: ' + error.message);
  if ((data as any)?.error) throw new Error((data as any).error);
}


// ─────────────────────────────────────────────────────────────
// ADMIN UTILS (Phase 3)
// ─────────────────────────────────────────────────────────────

/** Đổi workflow template đang áp dụng cho một loại biểu mẫu */
export async function adminUpdateFormTypeTemplate(
  code: string,
  templateId: number | null
): Promise<void> {
  const { error } = await supabase.rpc('admin_update_form_type_template', {
    p_code:        code,
    p_template_id: templateId,
  });
  if (error) throw new Error('Lỗi cập nhật workflow template: ' + error.message);
}

/** Tạo mới hoặc cập nhật tài nguyên */
export async function adminSaveResource(
  resource: Record<string, unknown>
): Promise<{ id: number }> {
  const { data, error } = await supabase.rpc('admin_save_resource', {
    p_resource: resource as any,
  });
  if (error) throw new Error('Lỗi lưu tài nguyên: ' + error.message);
  return data as { id: number };
}

/** Bật / tắt tài nguyên */
export async function adminToggleResource(id: number, isActive: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_toggle_resource', {
    p_id:        id,
    p_is_active: isActive,
  });
  if (error) throw new Error('Lỗi cập nhật trạng thái tài nguyên: ' + error.message);
}

/** Lấy toàn bộ resources kể cả inactive (bypass RLS) */
export async function adminGetAllResources(): Promise<Resource[]> {
  const { data, error } = await supabase.rpc('admin_get_all_resources');
  if (error) throw new Error('Không thể tải tài nguyên: ' + error.message);
  return (data || []) as Resource[];
}

/** Lấy toàn bộ form types kể cả inactive */
export async function adminGetAllFormTypes(): Promise<FormType[]> {
  const { data, error } = await supabase.rpc('admin_get_all_form_types');
  if (error) throw new Error('Không thể tải loại biểu mẫu: ' + error.message);
  return (data || []) as FormType[];
}

/** Lấy toàn bộ workflow templates với step count */
export async function adminGetAllTemplates(): Promise<
  { id: number; name: string; description?: string; is_active: boolean; step_count: number; nodes?: import('../types').WorkflowGraph }[]
> {
  const { data, error } = await supabase.rpc('admin_get_all_templates');
  if (error) throw new Error('Không thể tải workflow templates: ' + error.message);
  return (data || []) as any[];
}


// ─────────────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────────────

function safeJsonParse(value: string | unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

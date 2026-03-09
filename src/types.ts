// ============================================================
// Types cho hệ thống phê duyệt linh hoạt
// Schema: Supabase PostgreSQL (DB mới)
// ============================================================


// ─────────────────────────────────────────────────────────────
// USERS
// ─────────────────────────────────────────────────────────────

export type UserRole = 'REQUESTER' | 'MANAGER' | 'CFO' | 'COO' | 'ADMIN';

export interface User {
  id: number;
  employee_id: string;
  name: string;
  role: UserRole;
  email: string;
  department?: string;
  level?: string;
  title?: string;
  manager_id?: number;
  is_active?: boolean;
}

export interface SheetEmployee {
  employee_id: string;
  name: string;
  email: string;
  department: string;
  role: UserRole;
  title: string;
  level: string;
  is_active: boolean;
}

export interface SyncResult {
  new_count: number;
  updated_count: number;
  deact_count: number;
}


// ─────────────────────────────────────────────────────────────
// RESOURCES — phòng họp, xe, tài nguyên đặt theo lịch
// ─────────────────────────────────────────────────────────────

export type ResourceType = 'ROOM' | 'VEHICLE' | 'OTHER';

export interface Resource {
  id: number;
  type: ResourceType;
  name: string;
  code?: string;
  capacity?: number;
  location?: string;
  description?: string;
  properties: Record<string, unknown>;
  is_active: boolean;
}

export interface ResourceConflict {
  conflict_request_id: number;
  conflict_title: string;
  conflict_start: string;
  conflict_end: string;
}


// ─────────────────────────────────────────────────────────────
// WORKFLOW TEMPLATES & STEPS
// ─────────────────────────────────────────────────────────────

export type ApproverType =
  | 'FIXED_ROLE'
  | 'FIXED_USER'
  | 'DYNAMIC_MANAGER'
  | 'DYNAMIC_DEPT_HEAD'
  | 'REQUESTER_SELECT';

export type OnRejectAction  = 'RETURN_REQUESTER' | 'RETURN_PREV_STEP' | 'CANCEL_REQUEST';
export type OnTimeoutAction = 'ESCALATE' | 'AUTO_APPROVE' | 'AUTO_REJECT';

export type BranchAction = 'SKIP' | 'GOTO' | 'APPROVE' | 'REJECT';

export interface SkipCondition {
  field: string;
  op: '<' | '<=' | '>' | '>=' | '=' | '!=';
  value: number | boolean | string;
}

/** Điều kiện rẽ nhánh trong workflow — thay thế SkipCondition với nhiều action hơn */
export interface BranchCondition {
  field: string;                                    // 'amount' | 'is_urgent' | 'department' | 'form_data.xxx'
  op: '<' | '<=' | '>' | '>=' | '=' | '!=';
  value: number | boolean | string;
  action: BranchAction;                             // SKIP | GOTO | APPROVE | REJECT
  goto_order?: number;                              // bắt buộc khi action = 'GOTO'
  label?: string;                                   // nhãn hiển thị trong sơ đồ
}

export interface WorkflowStep {
  id: number;
  template_id: number;
  step_order: number;
  step_name: string;
  approver_type: ApproverType;
  approver_value?: string;
  parallel_group?: number;
  require_all: boolean;
  deadline_hours: number;
  reminder_hours?: number;
  on_timeout: OnTimeoutAction;
  escalate_to_role?: string;
  skip_condition?: SkipCondition;
  branch_conditions?: BranchCondition[];            // V2: thay thế skip_condition
  on_reject: OnRejectAction;
}

export interface WorkflowTemplate {
  id: number;
  name: string;
  description?: string;
  form_type_code?: string;
  is_active: boolean;
  created_by?: number;
  created_at: string;
  updated_at: string;
  nodes?: WorkflowGraph;                            // V3: visual graph
  workflow_steps?: WorkflowStep[];
}


// ─────────────────────────────────────────────────────────────
// FORM TYPES — schema registry
// ─────────────────────────────────────────────────────────────

export type FormTypeCode =
  | 'PR'
  | 'PROPOSAL'
  | 'ROOM_BOOKING'
  | 'VEHICLE_BOOKING'
  | 'ACCOMMODATION'
  | string;

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'time'
  | 'boolean'
  | 'checkbox_group'
  | 'text_list'
  | 'person_list'
  | 'select'
  | 'dept_support_table'
  | 'cost_table';

export interface FieldDefinition {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  min?: number;
  max?: number;
  options?: string[];
}

export interface FormSection {
  title: string;
  fields: FieldDefinition[];
}

export interface PromotedFields {
  resource_type?: ResourceType;
  resource_label?: string;
  start_label?: string;
  end_label?: string;
}

export interface FieldSchema {
  sections: FormSection[];
  has_items_table?: boolean;
  has_financial_fields?: boolean;
  promoted_fields?: PromotedFields;
}

export interface FormType {
  id: number;
  code: FormTypeCode;
  name: string;
  description?: string;
  icon?: string;
  active_template_id?: number;
  field_schema: FieldSchema;
  requires_resource: boolean;
  requires_time_range: boolean;
  sort_order: number;
  is_active: boolean;
}


// ─────────────────────────────────────────────────────────────
// REQUESTS
// ─────────────────────────────────────────────────────────────

export type RequestStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

// form_data shapes theo từng form_type
export interface PrFormData {
  request_group?: string;
  deadline_days?: number;
  leadtime?: string;
}

export interface ProposalMethodSupport {
  dept_name: string;
  content: string;
}

export interface ProposalCost {
  product_name: string;
  content: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

export interface ProposalFormData {
  overview?: string;
  event_time?: string;
  location?: string;
  chairperson?: string;
  format?: string;
  target_audience?: string;
  requirements?: string;
  method_support?: ProposalMethodSupport[];
  costs?: ProposalCost[];
  expected_results?: string;
}

export interface RoomBookingFormData {
  attendees_count?: number;
  purpose?: string;
  equipment_needed?: string[];
  setup_notes?: string;
  external_guests?: boolean;
}

export interface VehicleBookingFormData {
  departure_location?: string;
  destination?: string;
  purpose?: string;
  passengers_count?: number;
  passengers?: string[];
  return_expected_time?: string;
  note_for_driver?: string;
}

export interface AccommodationFormData {
  city?: string;
  hotel_preference?: string;
  num_rooms?: number;
  guests?: { name: string; employee_id?: string }[];
  business_trip_purpose?: string;
  special_requirements?: string;
}

export type FormData =
  | PrFormData
  | ProposalFormData
  | RoomBookingFormData
  | VehicleBookingFormData
  | AccommodationFormData
  | Record<string, unknown>;

export interface Request {
  id: number;
  title: string;
  form_type: FormTypeCode;
  status: RequestStatus;
  requester_id: number;
  requester_name?: string;
  department: string;
  description?: string;
  notes?: string;
  is_urgent: boolean;
  amount: number;
  budget_plan?: string;
  budget_code?: string;
  po_number?: string;
  resource_id?: number;
  resource?: Resource;
  start_datetime?: string;
  end_datetime?: string;
  workflow_template_id?: number;
  current_step_order: number;
  form_data: FormData;
  created_at: string;
  updated_at: string;
  cancelled_at?: string;
  cancelled_reason?: string;
  step_instances?: StepInstance[];
}


// ─────────────────────────────────────────────────────────────
// REQUEST ITEMS — chỉ dùng cho PR
// ─────────────────────────────────────────────────────────────

export interface RequestItem {
  id?: number;
  request_id?: number;
  item_name: string;
  specs: string;
  unit: string;
  total_qty: number;
  available_qty: number;
  purchase_qty: number;
  unit_price: number;
  amount: number;
  reason: string;
  sort_order?: number;
}


// ─────────────────────────────────────────────────────────────
// STEP INSTANCES — trạng thái từng bước phê duyệt
// ─────────────────────────────────────────────────────────────

export type StepStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'APPROVED'
  | 'REJECTED'
  | 'SKIPPED'
  | 'ESCALATED'
  | 'CANCELLED';

export interface StepInstance {
  id: number;
  request_id: number;
  step_id: number;
  step_order: number;
  step_name: string;
  status: StepStatus;
  assigned_to_id?: number;
  assigned_to_name?: string;
  assigned_role?: string;
  assigned_at?: string;
  deadline_at?: string;
  acted_at?: string;
  escalated_at?: string;
  comment?: string;
  acted_by_id?: number;
  acted_by_name?: string;
  is_delegated: boolean;
  created_at: string;
}


// ─────────────────────────────────────────────────────────────
// DELEGATIONS
// ─────────────────────────────────────────────────────────────

export interface Delegation {
  id: number;
  delegator_id: number;
  delegator_name?: string;
  delegatee_id: number;
  delegatee_name?: string;
  valid_from: string;
  valid_until: string;
  scope_form_types?: string[];
  max_amount?: number;
  reason?: string;
  is_active: boolean;
  created_at: string;
}


// ─────────────────────────────────────────────────────────────
// AUDIT LOG
// ─────────────────────────────────────────────────────────────

export type AuditEventType =
  | 'SUBMIT'
  | 'APPROVE'
  | 'REJECT'
  | 'ESCALATE'
  | 'DELEGATE'
  | 'CANCEL'
  | 'COMPLETE'
  | 'SKIP';

export interface AuditLogEntry {
  id: number;
  request_id?: number;
  event_type: AuditEventType;
  actor_id?: number;
  actor_name: string;
  target_id?: number;
  old_value?: Record<string, unknown>;
  new_value?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  created_at: string;
}


// ─────────────────────────────────────────────────────────────
// RPC PAYLOAD TYPES
// ─────────────────────────────────────────────────────────────

export interface CreateRequestPayload {
  title: string;
  form_type: FormTypeCode;
  amount: number;
  requester_id: number;
  description?: string;
  notes?: string;
  is_urgent?: boolean;
  budget_plan?: string;
  budget_code?: string;
  po_number?: string;
  resource_id?: number;
  start_datetime?: string;
  end_datetime?: string;
  form_data: FormData;
  items?: RequestItem[];
}

export interface ApproveStepPayload {
  step_instance_id: number;
  approver_id: number;
  action: 'APPROVED' | 'REJECTED';
  comment?: string;
}

export interface SaveTemplatePayload {
  template: { id?: number; name: string; description?: string; form_type_code?: string };
  steps: Omit<WorkflowStep, 'id' | 'template_id'>[];
  nodes?: WorkflowGraph;                            // V3: visual graph
}


// ─────────────────────────────────────────────────────────────
// WORKFLOW GRAPH — Visual node editor (V3)
// ─────────────────────────────────────────────────────────────

/** Điều kiện đơn trong visual editor */
export interface GraphConditionItem {
  id: string;
  field: string;
  op: '<' | '<=' | '>' | '>=' | '=' | '!=';
  value: string | number | boolean;
}

/** Nhóm điều kiện — AND giữa các conditions, OR giữa các groups */
export interface GraphConditionGroup {
  id: string;
  conditions: GraphConditionItem[];
}

/** Node phê duyệt trong đồ thị */
export interface ApproverGraphNode {
  id: string;
  type: 'approver';
  label: string;
  approver_type: ApproverType;
  approver_value?: string;
  require_all: boolean;
  deadline_hours: number;
  on_timeout: OnTimeoutAction;
  on_reject: OnRejectAction;
}

/** Một nhánh trong branch node — [] condition_groups = mặc định/else */
export interface BranchArm {
  id: string;
  label: string;
  condition_groups: GraphConditionGroup[];
  nodes: GraphNode[];
}

/** Node điều kiện rẽ nhánh */
export interface BranchGraphNode {
  id: string;
  type: 'branch';
  branches: BranchArm[];
}

export type GraphNode = ApproverGraphNode | BranchGraphNode;

/** Đồ thị workflow — lưu trong workflow_templates.nodes */
export interface WorkflowGraph {
  nodes: GraphNode[];
}


// ─────────────────────────────────────────────────────────────
// LEGACY — giữ tương thích với component chưa migrate (Phase 4)
// ─────────────────────────────────────────────────────────────

/** @deprecated Dùng Request thay thế sau Phase 4 */
export type RequestType = 'PR' | 'PROPOSAL';

/** @deprecated Dùng Request thay thế sau Phase 4 */
export interface ApprovalRequest {
  id: number;
  title: string;
  description: string;
  amount: number;
  type: RequestType;
  status: RequestStatus;
  current_approver_role: UserRole | 'COMPLETED';
  requester_id: number;
  requester_name?: string;
  department: string;
  request_group?: string;
  deadline_days?: number;
  leadtime?: string;
  po_number?: string;
  budget_plan?: string;
  budget_code?: string;
  notes?: string;
  proposal_overview?: string;
  proposal_time?: string;
  proposal_location?: string;
  proposal_chairperson?: string;
  proposal_form?: string;
  proposal_target?: string;
  proposal_requirements?: string;
  proposal_method_support?: string;
  proposal_costs?: string;
  proposal_results?: string;
  created_at: string;
  items?: RequestItem[];
}

/** @deprecated Dùng StepInstance thay thế sau Phase 4 */
export interface ApprovalHistory {
  id: number;
  request_id: number;
  approver_id: number;
  approver_name: string;
  approver_role: UserRole;
  status: 'APPROVED' | 'REJECTED';
  comment: string;
  created_at: string;
}

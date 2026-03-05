export type UserRole = 'REQUESTER' | 'MANAGER' | 'CFO' | 'COO';

export interface User {
  id: number;
  employee_id: string;
  name: string;
  role: UserRole;
  email: string;
  department?: string;
  level?: string;
  title?: string;
}

export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type RequestType = 'PR' | 'PROPOSAL';

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
}

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

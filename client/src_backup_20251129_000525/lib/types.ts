export interface Doctor {
  _id: string;
  firstName: string;
  lastName: string;
  specialization: string;
  isOnline: boolean;
}

export interface Message {
  id: string;
  text: string;
  sender: string;
  timestamp: Date;
}

export interface User {
  _id: string;
  firstName: string;
  lastName: string;
}

export interface AuthContextType {
  currentUser: User | null;
  currentDoctor: Doctor | null;
  userType: "user" | "doctor" | null;
}

// ===== Order & Task Management Types =====
export type OrderStatus = 'open' | 'processing' | 'completed' | 'cancelled';
export type TaskStatus = 'open' | 'in_progress' | 'completed' | 'cancelled';

export interface OrderItem {
  name: string;
  quantity: number;
}

export interface OrderTaskNote {
  id: string;
  text: string;
  by: string; // user id
  ts: number; // timestamp ms
}

export interface OrderTask {
  id: string;
  title: string;
  description: string;
  assignedTo: string | null; // user id
  status: TaskStatus;
  notes: OrderTaskNote[];
  createdAt: string;
  updatedAt: string;
  orderId?: string; // present when aggregated across orders
}

export interface OrderActivityEntry {
  ts: number;
  type: string;
  message: string;
  meta?: Record<string, unknown>;
}

export interface OrderRecord {
  id: string;
  createdAt: string;
  createdBy: string;
  status: OrderStatus;
  items: OrderItem[];
  metadata?: Record<string, unknown>;
  tasks: OrderTask[];
  activity: OrderActivityEntry[];
}

export interface CreateOrderPayload {
  items: { name: string; quantity?: number }[];
  metadata?: Record<string, unknown>;
}

export interface CreateTaskPayload {
  title: string;
  description?: string;
  assignedTo?: string | null;
}

export interface UpdateTaskPayload {
  status?: TaskStatus;
  assignedTo?: string | null;
  title?: string;
  description?: string;
}

export interface AddTaskNotePayload {
  note: string;
}

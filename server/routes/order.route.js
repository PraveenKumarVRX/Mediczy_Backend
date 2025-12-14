import express from 'express';
// Use correct exported auth middleware (was misnamed causing 404 / invalid router mount)
import { authUser, requireRole } from '../middleware/auth.middleware.js';

// In-memory stores for prototype (replace with Intelligent DB models later)
const ordersStore = new Map(); // orderId -> order

// Permission check middleware
const canCreateOrder = (req, res, next) => {
  const allowedRoles = ['admin', 'super_admin', 'assistant'];
  if (!allowedRoles.includes(req.userRole)) {
    return res.status(403).json({ 
      success: false, 
      message: 'Forbidden: Only admins and assistants can create orders' 
    });
  }
  next();
};

const canAssignTask = (req, res, next) => {
  const allowedRoles = ['admin', 'super_admin', 'assistant'];
  if (!allowedRoles.includes(req.userRole)) {
    return res.status(403).json({ 
      success: false, 
      message: 'Forbidden: Only admins and assistants can assign tasks' 
    });
  }
  next();
};

const canUpdateTask = (req, res, next) => {
  const order = ordersStore.get(req.params.id);
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
  
  const task = order.tasks.find(t => t.id === req.params.taskId);
  if (!task) return res.status(404).json({ success: false, message: 'Task not found' });
  
  const allowedRoles = ['admin', 'super_admin', 'assistant'];
  const isAssignee = task.assignedTo === req.user?.id;
  
  // Admin/Assistant can update any task; assignees can only update status of their own tasks
  if (!allowedRoles.includes(req.userRole) && !isAssignee) {
    return res.status(403).json({ 
      success: false, 
      message: 'Forbidden: You can only update tasks assigned to you' 
    });
  }
  
  // If user is only an assignee (not admin/assistant), restrict to status updates only
  if (isAssignee && !allowedRoles.includes(req.userRole)) {
    const { status, assignedTo, title, description } = req.body;
    if (assignedTo !== undefined || title || description !== undefined) {
      return res.status(403).json({ 
        success: false, 
        message: 'Forbidden: You can only update the status of your assigned tasks' 
      });
    }
  }
  
  next();
};

// Utility to generate IDs
const genId = (prefix='ord') => prefix + '_' + Math.random().toString(36).slice(2,10);

// Order schema prototype
// {
//   id, createdAt, createdBy, status: 'open'|'processing'|'completed'|'cancelled',
//   items: [{ name, quantity }],
//   tasks: [{ id, title, description, assignedTo, status: 'open'|'in_progress'|'completed'|'cancelled', notes: [], createdAt, updatedAt }],
//   activity: [{ ts, type, message, meta }]
// }

const router = express.Router();

// Middleware for all order routes (authentication required)
router.use(authUser);

// Create order (admin/assistant only)
router.post('/', canCreateOrder, (req, res) => {
  const { items = [], metadata = {} } = req.body || {};
  const createdBy = req.user?.id || 'unknown';
  const id = genId();
  const order = {
    id,
    createdAt: new Date().toISOString(),
    createdBy,
    status: 'open',
    items: items.map(it => ({ name: it.name, quantity: it.quantity || 1 })),
    metadata,
    tasks: [],
    activity: [{ ts: Date.now(), type: 'order_created', message: 'Order created', meta: { createdBy } }]
  };
  ordersStore.set(id, order);
  res.json({ success: true, order });
});

// List orders (basic filters: status, createdBy)
router.get('/', (req, res) => {
  const { status, createdBy } = req.query;
  let orders = Array.from(ordersStore.values());
  if (status) orders = orders.filter(o => o.status === status);
  if (createdBy) orders = orders.filter(o => o.createdBy === createdBy);
  res.json({ success: true, orders });
});

// Get single order
router.get('/:id', (req, res) => {
  const order = ordersStore.get(req.params.id);
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
  res.json({ success: true, order });
});

// Update order status (admin/assistant only)
router.patch('/:id/status', canCreateOrder, (req, res) => {
  const order = ordersStore.get(req.params.id);
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
  const { status } = req.body;
  const allowed = ['open','processing','completed','cancelled'];
  if (!allowed.includes(status)) return res.status(400).json({ success: false, message: 'Invalid status' });
  order.status = status;
  order.activity.push({ ts: Date.now(), type: 'order_status_change', message: `Order status -> ${status}`, meta: { by: req.user?.id } });
  res.json({ success: true, order });
});

// Create task for order (admin/assistant only)
router.post('/:id/tasks', canAssignTask, (req, res) => {
  const order = ordersStore.get(req.params.id);
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
  const { title, description='', assignedTo=null } = req.body;
  if (!title) return res.status(400).json({ success: false, message: 'Title required' });
  const task = {
    id: genId('task'),
    title,
    description,
    assignedTo,
    status: 'open',
    notes: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  order.tasks.push(task);
  order.activity.push({ ts: Date.now(), type: 'task_created', message: `Task ${task.id} created`, meta: { by: req.user?.id } });
  res.json({ success: true, task, orderId: order.id });
});

// Update task (assignment / status / description)
// Admin/assistant: full access; assignees: status only for their tasks
router.patch('/:id/tasks/:taskId', canUpdateTask, (req, res) => {
  const order = ordersStore.get(req.params.id);
  const task = order.tasks.find(t => t.id === req.params.taskId);
  const { status, assignedTo, title, description } = req.body;
  if (status) {
    const allowed = ['open','in_progress','completed','cancelled'];
    if (!allowed.includes(status)) return res.status(400).json({ success: false, message: 'Invalid task status' });
    task.status = status;
    order.activity.push({ ts: Date.now(), type: 'task_status_change', message: `Task ${task.id} status -> ${status}`, meta: { by: req.user?.id } });
  }
  if (assignedTo !== undefined) {
    task.assignedTo = assignedTo;
    order.activity.push({ ts: Date.now(), type: 'task_assigned', message: `Task ${task.id} assigned to ${assignedTo}`, meta: { by: req.user?.id } });
  }
  if (title) task.title = title;
  if (description !== undefined) task.description = description;
  task.updatedAt = new Date().toISOString();
  res.json({ success: true, task });
});

// Add note to task
router.post('/:id/tasks/:taskId/notes', (req, res) => {
  const order = ordersStore.get(req.params.id);
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
  const task = order.tasks.find(t => t.id === req.params.taskId);
  if (!task) return res.status(404).json({ success: false, message: 'Task not found' });
  const { note } = req.body;
  if (!note) return res.status(400).json({ success: false, message: 'Note required' });
  const entry = { id: genId('note'), text: note.trim(), by: req.user?.id, ts: Date.now() };
  task.notes.push(entry);
  order.activity.push({ ts: Date.now(), type: 'task_note_added', message: `Note added to task ${task.id}`, meta: { by: req.user?.id } });
  res.json({ success: true, note: entry, taskId: task.id });
});

// List tasks across all orders (filter by assignedTo, status)
router.get('/_tasks/all', (req, res) => {
  const { assignedTo, status } = req.query;
  let tasks = [];
  for (const order of ordersStore.values()) {
    for (const t of order.tasks) {
      tasks.push({ ...t, orderId: order.id });
    }
  }
  if (assignedTo) tasks = tasks.filter(t => t.assignedTo === assignedTo);
  if (status) tasks = tasks.filter(t => t.status === status);
  res.json({ success: true, tasks });
});

export default router;
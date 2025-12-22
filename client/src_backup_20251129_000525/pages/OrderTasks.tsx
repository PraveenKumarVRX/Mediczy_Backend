import React, { useEffect, useState } from 'react';
import { OrderRecord, OrderItem, CreateOrderPayload, CreateTaskPayload, UpdateTaskPayload, AddTaskNotePayload, TaskStatus } from '../lib/types';

// Basic fetch wrapper using existing token logic (adapt if api util exists)
const fetchJSON = async (url: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
  const res = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};

interface TeamMember {
  id: string;
  name: string;
  role: string;
  email: string;
}

const OrderTasks: React.FC = () => {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newOrderItems, setNewOrderItems] = useState<OrderItem[]>([{ name: '', quantity: 1 }]);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [taskDrafts, setTaskDrafts] = useState<Record<string, CreateTaskPayload>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  const loadOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJSON('/api/orders');
      setOrders(data.orders || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadTeamMembers = async () => {
    try {
      const data = await fetchJSON('/api/chat/team-members');
      if (data.success) {
        setTeamMembers(data.teamMembers || []);
      }
    } catch (e: any) {
      console.error('Load team error', e.message);
    }
  };

  useEffect(() => {
    loadOrders();
    loadTeamMembers();
  }, []);

  const updateOrderState = (orderId: string, updater: (o: OrderRecord) => void) => {
    setOrders(prev => prev.map(o => {
      if (o.id === orderId) {
        const clone = { ...o };
        updater(clone);
        return clone;
      }
      return o;
    }));
  };

  const createOrder = async () => {
    try {
      const payload: CreateOrderPayload = { items: newOrderItems.filter(i => i.name.trim()) };
      const data = await fetchJSON('/api/orders', { method: 'POST', body: JSON.stringify(payload) });
      setOrders(prev => [data.order, ...prev]);
      setNewOrderItems([{ name: '', quantity: 1 }]);
    } catch (e: any) {
      alert('Create failed: ' + e.message);
    }
  };

  const addItemRow = () => setNewOrderItems(prev => [...prev, { name: '', quantity: 1 }]);
  const updateItem = (idx: number, key: keyof OrderItem, value: any) => {
    setNewOrderItems(prev => prev.map((it, i) => i === idx ? { ...it, [key]: value } : it));
  };

  const createTask = async (orderId: string) => {
    const draft = taskDrafts[orderId];
    if (!draft?.title) return alert('Task title required');
    try {
      const data = await fetchJSON(`/api/orders/${orderId}/tasks`, { method: 'POST', body: JSON.stringify(draft) });
      updateOrderState(orderId, o => { o.tasks = [...o.tasks, data.task]; });
      setTaskDrafts(prev => ({ ...prev, [orderId]: { title: '', description: '', assignedTo: null } }));
    } catch (e: any) {
      alert('Task create failed: ' + e.message);
    }
  };

  const updateTask = async (orderId: string, taskId: string, payload: UpdateTaskPayload) => {
    try {
      const data = await fetchJSON(`/api/orders/${orderId}/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      updateOrderState(orderId, o => { o.tasks = o.tasks.map(t => t.id === taskId ? data.task : t); });
    } catch (e: any) {
      alert('Task update failed: ' + e.message);
    }
  };

  const addNote = async (orderId: string, taskId: string) => {
    const noteText = noteDrafts[taskId];
    if (!noteText?.trim()) return;
    try {
      const payload: AddTaskNotePayload = { note: noteText };
      const data = await fetchJSON(`/api/orders/${orderId}/tasks/${taskId}/notes`, { method: 'POST', body: JSON.stringify(payload) });
      updateOrderState(orderId, o => { o.tasks = o.tasks.map(t => t.id === taskId ? { ...t, notes: [...t.notes, data.note] } : t); });
      setNoteDrafts(prev => ({ ...prev, [taskId]: '' }));
    } catch (e: any) {
      alert('Add note failed: ' + e.message);
    }
  };

  const cycleStatus = (status: TaskStatus): TaskStatus => {
    switch (status) {
      case 'open': return 'in_progress';
      case 'in_progress': return 'completed';
      default: return 'open';
    }
  };

  return (
    <div style={{ padding: '1rem' }}>
      <h1>Order & Task Management</h1>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      <section style={{ marginBottom: '2rem' }}>
        <h2>Create Order</h2>
        {newOrderItems.map((it, idx) => (
          <div key={idx} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <input
              placeholder="Item name"
              value={it.name}
              onChange={e => updateItem(idx, 'name', e.target.value)}
            />
            <input
              type="number"
              min={1}
              value={it.quantity}
              onChange={e => updateItem(idx, 'quantity', Number(e.target.value))}
              style={{ width: '5rem' }}
            />
          </div>
        ))}
        <button onClick={addItemRow}>Add Item</button>{' '}
        <button onClick={createOrder}>Create Order</button>
      </section>

      <section>
        <h2>Orders</h2>
        {loading && <div>Loading...</div>}
        {orders.map(order => (
          <div key={order.id} style={{ border: '1px solid #ccc', marginBottom: '1rem', padding: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>Order {order.id}</strong>
              <button onClick={() => setExpandedOrderId(prev => prev === order.id ? null : order.id)}>
                {expandedOrderId === order.id ? 'Collapse' : 'Expand'}
              </button>
            </div>
            <div>Status: {order.status}</div>
            <div>Items: {order.items.map(i => `${i.name} x${i.quantity}`).join(', ')}</div>
            {expandedOrderId === order.id && (
              <div style={{ marginTop: '0.75rem' }}>
                <h4>Create Task</h4>
                <input
                  placeholder="Task title"
                  value={taskDrafts[order.id]?.title || ''}
                  onChange={e => setTaskDrafts(prev => ({ ...prev, [order.id]: { ...(prev[order.id] || { title: '', description: '', assignedTo: null }), title: e.target.value } }))}
                />
                <input
                  placeholder="Description"
                  value={taskDrafts[order.id]?.description || ''}
                  onChange={e => setTaskDrafts(prev => ({ ...prev, [order.id]: { ...(prev[order.id] || { title: '', description: '', assignedTo: null }), description: e.target.value } }))}
                />
                <select
                  value={taskDrafts[order.id]?.assignedTo || ''}
                  onChange={e => setTaskDrafts(prev => ({ ...prev, [order.id]: { ...(prev[order.id] || { title: '', description: '', assignedTo: null }), assignedTo: e.target.value || null } }))}
                  style={{ marginLeft: '0.5rem' }}
                >
                  <option value="">Unassigned</option>
                  {teamMembers.map(m => (
                    <option key={m.id} value={m.id}>{m.name} ({m.role})</option>
                  ))}
                </select>
                <button onClick={() => createTask(order.id)}>Add Task</button>

                <h4 style={{ marginTop: '1rem' }}>Tasks</h4>
                {order.tasks.length === 0 && <div>No tasks yet.</div>}
                {order.tasks.map(task => (
                  <div key={task.id} style={{ border: '1px solid #999', padding: '0.5rem', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span><strong>{task.title}</strong> ({task.status})</span>
                      <button onClick={() => updateTask(order.id, task.id, { status: cycleStatus(task.status) })}>Cycle Status</button>
                    </div>
                    {task.description && <div>{task.description}</div>}
                    <div style={{ marginTop: '0.5rem' }}>
                      <input
                        placeholder="Add note"
                        value={noteDrafts[task.id] || ''}
                        onChange={e => setNoteDrafts(prev => ({ ...prev, [task.id]: e.target.value }))}
                      />
                      <button onClick={() => addNote(order.id, task.id)}>Save Note</button>
                    </div>
                    {task.notes.length > 0 && (
                      <ul style={{ marginTop: '0.5rem' }}>
                        {task.notes.map(n => (
                          <li key={n.id}>{new Date(n.ts).toLocaleString()}: {n.text}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  );
};

export default OrderTasks;

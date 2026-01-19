# Order & Task Management System

## Overview
The Order & Task Management system enables healthcare teams (admins, assistants, nurses) to create orders (e.g., medical supply orders, procedure prep orders), assign tasks to team members, track task completion, and maintain detailed activity logs.

**Current Implementation**: In-memory prototype (Map-based storage)  
**Migration Target**: Intelligent Database models (planned)

---

## Backend Architecture

### Routes (`server/routes/order.route.js`)
All endpoints require authentication (`authUser` middleware).

#### Order Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/orders` | Create new order | Required |
| GET | `/api/orders` | List orders (filter: status, createdBy) | Required |
| GET | `/api/orders/:id` | Get single order details | Required |
| PATCH | `/api/orders/:id/status` | Update order status | Required |

#### Task Endpoints (nested under orders)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/orders/:id/tasks` | Create task for order | Required |
| PATCH | `/api/orders/:id/tasks/:taskId` | Update task (status, assignment, description) | Required |
| POST | `/api/orders/:id/tasks/:taskId/notes` | Add note to task | Required |
| GET | `/api/orders/_tasks/all` | List all tasks across orders (filter: assignedTo, status) | Required |

---

## Data Models

### Order Schema
```typescript
{
  id: string;                   // e.g., "ord_abc123"
  createdAt: string;            // ISO timestamp
  createdBy: string;            // User ID
  status: 'open' | 'processing' | 'completed' | 'cancelled';
  items: [                      // Order line items
    {
      name: string;
      quantity: number;
    }
  ];
  metadata?: Record<string, unknown>;  // Flexible extension field
  tasks: Task[];                       // Nested tasks
  activity: ActivityEntry[];           // Audit trail
}
```

### Task Schema
```typescript
{
  id: string;                   // e.g., "task_xyz456"
  title: string;
  description: string;
  assignedTo: string | null;    // Team member ID (from /api/chat/team-members)
  status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  notes: TaskNote[];
  createdAt: string;
  updatedAt: string;
  orderId?: string;             // Present in cross-order task listings
}
```

### TaskNote Schema
```typescript
{
  id: string;                   // e.g., "note_123"
  text: string;
  by: string;                   // User ID
  ts: number;                   // Timestamp (ms)
}
```

### ActivityEntry Schema
```typescript
{
  ts: number;                   // Timestamp (ms)
  type: string;                 // 'order_created', 'task_status_change', etc.
  message: string;
  meta?: Record<string, unknown>;
}
```

---

## Request/Response Examples

### Create Order
```bash
POST /api/orders
Authorization: Bearer <token>
Content-Type: application/json

{
  "items": [
    { "name": "Glucose Strips", "quantity": 3 },
    { "name": "Syringe", "quantity": 10 }
  ],
  "metadata": { "priority": "high", "department": "ER" }
}
```

**Response:**
```json
{
  "success": true,
  "order": {
    "id": "ord_abc123",
    "createdAt": "2025-11-25T10:00:00Z",
    "createdBy": "admin_dev",
    "status": "open",
    "items": [...],
    "tasks": [],
    "activity": [{ "ts": 1764046391233, "type": "order_created", ... }]
  }
}
```

### Create Task
```bash
POST /api/orders/ord_abc123/tasks
Authorization: Bearer <token>

{
  "title": "Prepare Glucose Test Kit",
  "description": "Get kit from storage",
  "assignedTo": "nurse_001"
}
```

### Update Task Status
```bash
PATCH /api/orders/ord_abc123/tasks/task_xyz456
Authorization: Bearer <token>

{
  "status": "in_progress"
}
```

### Add Task Note
```bash
POST /api/orders/ord_abc123/tasks/task_xyz456/notes
Authorization: Bearer <token>

{
  "note": "Retrieved 3 glucose strips from cabinet 3"
}
```

### List All Tasks (cross-order)
```bash
GET /api/orders/_tasks/all?assignedTo=nurse_001&status=open
Authorization: Bearer <token>
```

---

## Frontend Implementation

### Page: `client/src/pages/OrderTasks.tsx`
- **Route**: `/assistant/orders`
- **Features**:
  - Create orders with multiple items
  - Expand orders to view/create tasks
  - Assign tasks to team members (dropdown populated from `/api/chat/team-members`)
  - Cycle task status (open → in_progress → completed)
  - Add notes to tasks
  - View task notes history

### Navigation Integration
- **AssistantDashboard** → Orders tab → "Open Full Manager" button → `/assistant/orders`

### TypeScript Definitions
Location: `client/src/lib/types.ts`
- `OrderRecord`, `OrderTask`, `OrderTaskNote`, `OrderItem`
- `CreateOrderPayload`, `CreateTaskPayload`, `UpdateTaskPayload`, `AddTaskNotePayload`
- `OrderStatus`, `TaskStatus`

---

## Security & Permissions

### Current Auth
- All endpoints protected by `authUser` middleware
- Dev bypass token: `dev-admin-token` (remove in production)

### Recommended Role Checks (TODO)
- **Create Order**: admin, assistant
- **Assign Task**: admin, assistant
- **Update Own Task**: nurse, assistant, team (if assigned to them)
- **View Tasks**: All authenticated users

Implementation:
```javascript
// Example middleware usage (add to routes)
const canCreateOrder = (req, res, next) => {
  if (!['admin', 'assistant'].includes(req.userRole)) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  next();
};
router.post('/', authUser, canCreateOrder, createOrderHandler);
```

---

## Migration to Intelligent DB

### Planned Models
1. **Order Model**
   - Table: `orders`
   - Fields: id, createdAt, createdBy, status, items (JSON), metadata (JSON)
   - Relations: hasMany Tasks

2. **Task Model**
   - Table: `tasks`
   - Fields: id, orderId, title, description, assignedTo, status, createdAt, updatedAt
   - Relations: belongsTo Order, hasMany TaskNotes

3. **TaskNote Model**
   - Table: `task_notes`
   - Fields: id, taskId, text, createdBy, createdAt

4. **ActivityLog Model** (reuse existing auditLog or create new)
   - Fields: entityType ('order', 'task'), entityId, action, timestamp, userId, details (JSON)

### Migration Steps
1. Define Sequelize models in `server/models/`
2. Create migration scripts for table creation
3. Add model associations (Order.hasMany(Task), etc.)
4. Update route handlers to use `Order.findAll()` instead of `ordersStore.get()`
5. Preserve activity logging via `ActivityLog.create()` on each mutation
6. Run tests against prototype data migrated to DB

---

## Testing

### Manual Test Commands
```bash
# Create order
curl -H 'Authorization: Bearer dev-admin-token' \
     -H 'Content-Type: application/json' \
     -d '{"items":[{"name":"Glucose Strips","quantity":3}]}' \
     http://localhost:8000/api/orders

# Create task
curl -H 'Authorization: Bearer dev-admin-token' \
     -H 'Content-Type: application/json' \
     -d '{"title":"Prepare Kit","assignedTo":"nurse_001"}' \
     http://localhost:8000/api/orders/ord_abc123/tasks

# Update task
curl -X PATCH \
     -H 'Authorization: Bearer dev-admin-token' \
     -H 'Content-Type: application/json' \
     -d '{"status":"in_progress"}' \
     http://localhost:8000/api/orders/ord_abc123/tasks/task_xyz456

# Add note
curl -H 'Authorization: Bearer dev-admin-token' \
     -H 'Content-Type: application/json' \
     -d '{"note":"Task started"}' \
     http://localhost:8000/api/orders/ord_abc123/tasks/task_xyz456/notes

# List all tasks
curl -H 'Authorization: Bearer dev-admin-token' \
     http://localhost:8000/api/orders/_tasks/all?status=open
```

### Frontend Testing
1. Login as assistant: `/assistant/login`
2. Navigate to Orders tab in AssistantDashboard
3. Click "Open Full Manager"
4. Create order → Add tasks → Assign to team members → Update status → Add notes

---

## Troubleshooting

### "Cannot POST /api/orders" (404)
- **Cause**: Server not restarted after route changes
- **Fix**: Restart Node server: `kill <PID> && node server/index.js &`

### "unauthorized token"
- **Cause**: Missing or invalid Authorization header
- **Fix**: Add `Authorization: Bearer <token>` header (use dev token or valid user token)

### Tasks not appearing in list
- **Cause**: In-memory store cleared on server restart
- **Fix**: Create new order/tasks or migrate to persistent DB

### Team members dropdown empty
- **Cause**: `/api/chat/team-members` endpoint not returning data
- **Fix**: Verify role permissions (team, admin, doctor, nurse, assistant only)

---

## Future Enhancements

1. **Task Priority Levels**: Add `priority` field (low/medium/high/urgent)
2. **Due Dates**: Add `dueDate` field to tasks with reminder notifications
3. **File Attachments**: Allow task notes to include file uploads
4. **Task Templates**: Pre-defined task checklists for common orders
5. **Notifications**: Real-time alerts on task assignment/status changes
6. **Analytics Dashboard**: Task completion rates, average time per task type
7. **Mobile App Support**: Optimized UI for on-the-go task updates
8. **Recurring Orders**: Schedule periodic orders (e.g., weekly supply restocking)

---

## Contact & Support
For questions or issues, contact the development team or create a ticket in the support system.

**Last Updated**: November 25, 2025

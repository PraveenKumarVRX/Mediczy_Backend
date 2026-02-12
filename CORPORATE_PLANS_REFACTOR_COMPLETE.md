# Corporate Plans Refactoring - Complete Implementation Guide

## ✅ Completed Backend Changes (Ready to Use)

### 1. Database Migration (Applied)
- **File**: `migrations/migrate-corporate-plans-v2.sql`
- **Changes**:
  - Added `clinic_id` column to `corporate_plan_sponsorships`
  - Added `doctor_id` column to `corporate_plan_sponsorships`
  - Added `sponsorship_id` column to `tenant_partners`
  - Created indexes for performance

### 2. Backend API Changes (Deployed - restart #68-69)

#### POST /api/admin/corporates
**Old Request**:
```json
{
  "companyName": "...",
  "email": "...",
  "assignedTeamMemberId": 1,
  "clinicId": 2,
  "doctorId": 3,
  "membershipPlanId": 4,
  "networkPartners": { "hospitals": [5, 6], "labs": [7, 8] }
}
```

**New Request**:
```json
{
  "companyName": "...",
  "email": "...",
  "assignedTeamMemberId": 1,
  "plans": [
    {
      "planId": 4,
      "clinicId": 2,
      "doctorId": 3,
      "startDate": "2026-02-12",
      "endDate": "2027-02-12",
      "networkPartners": { "hospitals": [5, 6], "labs": [7, 8] }
    },
    {
      "planId": 10,
      "clinicId": 11,
      "doctorId": 12,
      "startDate": "2026-03-01",
      "endDate": "2027-03-01",
      "networkPartners": { "hospitals": [13], "labs": [14, 15] }
    }
  ]
}
```

#### GET /api/admin/corporates
**Old Response**:
```json
{
  "id": "5",
  "companyName": "...",
  "assignedTeamMemberId": 1,
  "clinicId": 2,
  "doctorId": 3,
  "membershipPlanId": 4,
  "networkPartners": { "hospitals": [5, 6], "labs": [7, 8] }
}
```

**New Response**:
```json
{
  "id": "5",
  "companyName": "...",
  "assignedTeamMemberId": 1,
  "plans": [
    {
      "sponsorshipId": 100,
      "planId": 4,
      "clinicId": 2,
      "doctorId": 3,
      "startDate": "2026-02-12",
      "endDate": "2027-02-12",
      "isActive": true,
      "networkPartners": { "hospitals": [5, 6], "labs": [7, 8] }
    },
    {
      "sponsorshipId": 101,
      "planId": 10,
      "clinicId": 11,
      "doctorId": 12,
      "startDate": "2026-03-01",
      "endDate": "2027-03-01",
      "isActive": true,
      "networkPartners": { "hospitals": [13], "labs": [14, 15] }
    }
  ]
}
```

#### PUT /api/admin/corporates/:id
**New Request** (same as POST - full plans array):
```json
{
  "companyName": "...",
  "plans": [
    {
      "sponsorshipId": 100, // Include for updates
      "planId": 4,
      "clinicId": 2,
      "doctorId": 3,
      "startDate": "2026-02-12",
      "endDate": "2027-02-12",
      "networkPartners": { "hospitals": [5, 6], "labs": [7, 8] }
    }
    // Plans not included will be deleted
    // Plans without sponsorshipId will be created
    // Plans with sponsorshipId will be updated
  ]
}
```

## 🔨 Frontend Changes Required

### 1. Updated Interface (Already Applied)

```typescript
interface Plan {
  sponsorshipId?: number | string;
  planId: number | string;
  clinicId?: number | string;
  doctorId?: number | string;
  startDate?: string;
  endDate?: string;
  networkPartners?: {
    hospitals: number[];
    labs: number[];
  };
}

interface CorporateData {
  // ... existing fields
  assignedTeamMemberId?: number | string;
  plans?: Plan[]; // Changed from individual fields
}
```

### 2. State Updates Needed

**Current State** (needs updating):
```typescript
const [newCorporate, setNewCorporate] = useState({
  // ... basic fields
  assignedTeamMemberId: '0',
  plans: [] as Plan[] // ✅ Already updated
});
```

### 3. UI Components Needed

#### Plan Management Section
Create a dynamic form section that allows:

1. **Add Plan Button** - Adds a new plan to the array
2. **Plan Row Component** - For each plan, show:
   - Membership Plan dropdown
   - Clinic dropdown
   - Doctor dropdown
   - Start Date picker
   - End Date picker
   - Network Partners (hospitals/labs) multi-select
   - Remove Plan button

3. **Example Component Structure**:
```tsx
const PlanRow = ({ plan, index, onUpdate, onRemove }) => (
  <div className="border p-4 rounded mb-4">
    <div className="grid grid-cols-2 gap-4">
      <div>
        <Label>Membership Plan</Label>
        <Select value={plan.planId} onValueChange={(val) => onUpdate(index, 'planId', val)}>
          <SelectTrigger>
            <SelectValue placeholder="Select Plan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">None</SelectItem>
            {membershipPlans.map(p => (
              <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      <div>
        <Label>Clinic</Label>
        <Select value={plan.clinicId} onValueChange={(val) => onUpdate(index, 'clinicId', val)}>
          {/* ...similar */}
        </Select>
      </div>
      
      <div>
        <Label>Doctor</Label>
        <Select value={plan.doctorId} onValueChange={(val) => onUpdate(index, 'doctorId', val)}>
          {/* ...similar */}
        </Select>
      </div>
      
      <div>
        <Label>Start Date</Label>
        <Input type="date" value={plan.startDate} onChange={(e) => onUpdate(index, 'startDate', e.target.value)} />
      </div>
      
      <div>
        <Label>End Date</Label>
        <Input type="date" value={plan.endDate} onChange=(e) => onUpdate(index, 'endDate', e.target.value)} />
      </div>
      
      <div className="col-span-2">
        <Label>Network Hospitals</Label>
        {/* Multi-select for hospitals */}
      </div>
      
      <div className="col-span-2">
        <Label>Network Labs</Label>
        {/* Multi-select for labs */}
      </div>
    </div>
    
    <Button variant="destructive" size="sm" onClick={() => onRemove(index)}>
      Remove Plan
    </Button>
  </div>
);
```

### 4. Handler Functions Needed

```typescript
// Add new plan
const handleAddPlan = () => {
  setNewCorporate(prev => ({
    ...prev,
    plans: [
      ...prev.plans,
      {
        planId: '0',
        clinicId: '0',
        doctorId: '0',
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date(Date.now() + 365*24*60*60*1000).toISOString().split('T')[0],
        networkPartners: { hospitals: [], labs: [] }
      }
    ]
  }));
};

// Update plan field
const handleUpdatePlan = (index, field, value) => {
  setNewCorporate(prev => ({
    ...prev,
    plans: prev.plans.map((plan, i) => 
      i === index ? { ...plan, [field]: value } : plan
    )
  }));
};

// Remove plan
const handleRemovePlan = (index) => {
  setNewCorporate(prev => ({
    ...prev,
    plans: prev.plans.filter((_, i) => i !== index)
  }));
};

// Update network partners for a plan
const handleUpdatePlanPartners = (planIndex, partnerType, partnerIds) => {
  setNewCorporate(prev => ({
    ...prev,
    plans: prev.plans.map((plan, i) => 
      i === planIndex 
        ? {
            ...plan,
            networkPartners: {
              ...plan.networkPartners,
              [partnerType]: partnerIds
            }
          }
        : plan
    )
  }));
};
```

### 5. Submit Function Updates

```typescript
const handleCorporateSubmit = async (e) => {
  e.preventDefault();
  
  // Convert plans array
  const corporate = {
    ...newCorporate,
    employeeCount: parseInt(newCorporate.employeeCount) || 0,
    assignedTeamMemberId: newCorporate.assignedTeamMemberId === '0' ? null : parseInt(newCorporate.assignedTeamMemberId),
    plans: newCorporate.plans.map(plan => ({
      planId: plan.planId === '0' ? null : parseInt(plan.planId),
      clinicId: plan.clinicId === '0' ? null : parseInt(plan.clinicId),
      doctorId: plan.doctorId === '0' ? null : parseInt(plan.doctorId),
      startDate: plan.startDate,
      endDate: plan.endDate,
      networkPartners: plan.networkPartners
    })).filter(plan => plan.planId) // Only send plans with valid planId
  };
  
  // POST to API
  const response = await fetch('/api/admin/corporates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(corporate)
  });
  
  // Handle response...
};
```

### 6. Edit Corporate Handler

```typescript
const handleEditCorporate = (corporate: CorporateData) => {
  setEditingCorporate(corporate);
  setNewCorporate({
    companyName: corporate.companyName || '',
    // ... other basic fields
    assignedTeamMemberId: corporate.assignedTeamMemberId?.toString() || '0',
    plans: (corporate.plans || []).map(plan => ({
      sponsorshipId: plan.sponsorshipId,
      planId: plan.planId?.toString() || '0',
      clinicId: plan.clinicId?.toString() || '0',
      doctorId: plan.doctorId?.toString() || '0',
      startDate: plan.startDate || new Date().toISOString().split('T')[0],
      endDate: plan.endDate || new Date(Date.now() + 365*24*60*60*1000).toISOString().split('T')[0],
      networkPartners: plan.networkPartners || { hospitals: [], labs: [] }
    }))
  });
  setActiveTab('add'); // Switch to form tab
};
```

## 📝 Summary

**Backend Status**: ✅ Complete & Deployed (restart #68-69)
- Database migrated with new columns
- POST endpoint accepts plans array
- PUT endpoint handles add/update/remove plans
- GET endpoint returns plans array with all details

**Frontend Status**: ⚠️ Needs Implementation
- Interface updated (Plan type added)
- State structure updated (plans array)
- UI components need to be built for managing multiple plans
- Form handlers need to be updated
- Submit/Edit logic needs array handling

**Architecture Benefits**:
- ✅ Corporates can now have multiple membership plans
- ✅ Each plan has its own validity period
- ✅ Doctor, clinic, and network partners are plan-specific
- ✅ Plans can be added, updated, or removed independently
- ✅ Better data modeling for corporate relationships

**Next Steps**:
1. Build the Plan management UI component
2. Update form submission logic
3. Test create/update/delete flows
4. Deploy frontend changes to S3

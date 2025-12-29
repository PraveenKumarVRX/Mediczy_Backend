# Botlet Autonomy Visual Guide

## TL;DR

**Botlets = Semi-Autonomous Specialized Agents** 

They make decisions and trigger actions, but operate within TaskRouter orchestration.

---

## Quick Answer

```
Are botlets autonomous agents?

YES ✅
├─ Make independent decisions
├─ Access knowledge autonomously
├─ Trigger external actions
└─ Execute without constant oversight

BUT with important constraints ⚠️
├─ Cannot self-initiate
├─ Must be routed by TaskRouter
├─ All actions logged
└─ Subject to safety filters
```

---

## Autonomy Spectrum

```
┌────────────────────────────────────────────────────┐
│  AUTONOMY SPECTRUM IN AI SYSTEMS                   │
├────────────────────────────────────────────────────┤
│                                                    │
│  Fully Reactive  →  Semi-Autonomous  →  Fully Free│
│  (No decisions)      (BOTLETS) ✓        (Uncontrolled)
│                                                    │
│  Chatbot      RiskBotlet      Self-driving car   │
│  ↓            ↓               ↓                   │
│  Responds     Decides &       Acts without        │
│  to prompts   Acts autonomously  constraints      │
│                                                    │
│              ← CURRENT SWEET SPOT                │
│                                                    │
└────────────────────────────────────────────────────┘
```

---

## How Botlets Work

### Request Flow
```
User Query
  ↓
Mediczy API
  ↓
TaskRouter
  ├─ Validates authorization ✅
  ├─ Logs request 📝
  └─ Routes to appropriate botlet 🎯
      ↓
    Botlet (e.g., RiskBotlet)
      ├─ Makes decision 🧠
      ├─ Evaluates context
      ├─ Decides on action
      └─ Triggers action ⚡
          ├─ Updates database
          ├─ Fires n8n workflow
          └─ Sends alert
      ↓
    Returns result to TaskRouter
      ↓
    TaskRouter logs to PostgreSQL
      ↓
    Response sent to user
```

---

## Botlet Architecture

```
╔════════════════════════════════════════════════════════╗
║             SIB (Synthetic Intelligence Brain)         ║
║                                                        ║
║  ┌──────────────────────────────────────────────────┐ ║
║  │        SIBTaskRouter (Central Hub)               │ ║
║  │  ✅ Route requests                              │ ║
║  │  ✅ Maintain context                            │ ║
║  │  ✅ Enforce authorization                       │ ║
║  │  ✅ Audit logging                               │ ║
║  └──────────────────────────────────────────────────┘ ║
║                  │                                    ║
║      ┌───────────┼───────────┐                       ║
║      ↓           ↓           ↓                       ║
║  ┌────────┐ ┌────────┐ ┌────────┐                   ║
║  │ Chat   │ │ Risk   │ │ Task   │  ← Semi-Autonomous║
║  │Botlet  │ │Botlet  │ │Botlet  │     Agents (10)  ║
║  │        │ │        │ │        │                   ║
║  │ 🟡 60% │ │ 🟢 80% │ │ 🟢 80% │  Autonomy Level  ║
║  └────────┘ └────────┘ └────────┘                   ║
║      ↓           ↓           ↓                       ║
║      │ Accesses  │ Decides   │ Triggers            ║
║      │ Knowledge │ Actions   │ Workflows           ║
║      ↓           ↓           ↓                       ║
║  ┌────────────────────────────────────────────────┐ ║
║  │  External Systems (PostgreSQL, FAISS, n8n)    │ ║
║  └────────────────────────────────────────────────┘ ║
║                                                        ║
╚════════════════════════════════════════════════════════╝
```

---

## Autonomy by Botlet

### RiskBotlet (🟢 80% Autonomous)

```
Request: Assess patient risk
  ↓
AUTONOMOUS DECISION:
├─ Access patient data
├─ Run Bayesian Network
├─ Calculate risk score
├─ Compare against thresholds
└─ Determine risk level

AUTONOMOUS ACTION:
├─ If risk > HIGH:
│  └─ AUTONOMOUSLY trigger alert workflow ⚡
├─ Update patient risk in PostgreSQL
└─ Generate risk report

Return result to TaskRouter
```

**Why High Autonomy?**
- Makes complex probabilistic decisions
- Triggers external actions (n8n)
- No human intervention needed
- Still respects TaskRouter oversight

---

### TaskBotlet (🟢 80% Autonomous)

```
Request: Create follow-up task
  ↓
AUTONOMOUS PROCESSING:
├─ Validate task data
├─ Determine priority
├─ Calculate due date
├─ Assign to provider

AUTONOMOUS ACTIONS:
├─ Create record in PostgreSQL
├─ AUTONOMOUSLY trigger n8n workflow ⚡
│  ├─ Send reminder email
│  ├─ Update calendar
│  └─ Create dashboard alert
└─ Log to audit trail

Return task ID to TaskRouter
```

**Why High Autonomy?**
- Makes scheduling decisions
- Triggers multi-step workflows
- Complex automation logic
- Integrates with external systems

---

### ChatBotlet (🟡 60% Autonomous)

```
Request: Chat about symptoms
  ↓
AUTONOMOUS PROCESSING:
├─ Parse user message
├─ Extract medical entities (MedSpaCy) 🧠
├─ Access FAISS knowledge base 📚
├─ Make contextual decisions
├─ Run safety filters

SEMI-AUTONOMOUS ACTIONS:
├─ Query medical knowledge autonomously
├─ Make response decisions autonomously
├─ BUT always returns through TaskRouter
└─ No independent action triggering

Return response to TaskRouter
```

**Why Lower Autonomy?**
- Still reactive (waits for user input)
- No external action triggering
- Safety-focused (avoids harmful responses)
- Optimized for safety over autonomy

---

## What Makes Them Semi-Autonomous?

### ✅ AUTONOMOUS Characteristics

1. **Independent Decision Making**
   ```python
   # RiskBotlet makes risk decision without asking TaskRouter
   if risk_score > THRESHOLD:
       # Botlet decides to trigger action
       self.n8n.trigger_alert()  # ← Autonomous!
   ```

2. **Knowledge Access**
   ```python
   # EHRBotlet accesses knowledge autonomously
   faiss_index.search(query, k=5)  # ← Botlet decides what to retrieve
   ```

3. **Action Triggering**
   ```python
   # TaskBotlet triggers workflows autonomously
   self.n8n.trigger_workflow(workflow_id)  # ← Botlet decides to act!
   ```

4. **Async Execution**
   ```python
   # Botlets run asynchronously
   async def process(self):  # ← Non-blocking
       await long_operation()
   ```

### ❌ NOT FULLY AUTONOMOUS

1. **Cannot Self-Initiate**
   ```
   Botlet CANNOT:
   ❌ Start without TaskRouter request
   ❌ Schedule its own execution
   ❌ Decide to run proactively
   ```

2. **Cannot Override Orchestration**
   ```
   Botlet CANNOT:
   ❌ Bypass TaskRouter
   ❌ Ignore authorization checks
   ❌ Override safety filters
   ❌ Modify SIB configuration
   ```

3. **Cannot Learn/Improve**
   ```
   Botlet CANNOT:
   ❌ Retrain models
   ❌ Update weights
   ❌ Change behavior
   ❌ Modify prompts
   ```

---

## Real Example: RiskBotlet in Action

### Scenario: Patient Assessment

```
Step 1: Request Arrives
┌─────────────────────────────────────────┐
│ POST /task/assess_risk                  │
│ {                                       │
│   "patient_id": "pat_123",             │
│   "age": 65,                           │
│   "systolic_bp": 160,                  │
│   "smoker": true                       │
│ }                                       │
└─────────────────────────────────────────┘
         ↓
Step 2: TaskRouter Routes
┌─────────────────────────────────────────┐
│ TaskRouter validates auth ✅           │
│ TaskRouter logs request 📝             │
│ TaskRouter routes to RiskBotlet 🎯     │
└─────────────────────────────────────────┘
         ↓
Step 3: RiskBotlet Acts AUTONOMOUSLY 🤖
┌─────────────────────────────────────────┐
│ RiskBotlet.evaluate(patient_data)       │
│                                         │
│ ✅ Autonomously:                        │
│   ├─ Access medical knowledge           │
│   ├─ Run Bayesian Network               │
│   ├─ Calculate: risk_score = 0.75       │
│   ├─ Compare: 0.75 > THRESHOLD(0.30)    │
│   ├─ Decide: HIGH RISK ⚠️               │
│   └─ AUTONOMOUSLY trigger alert ⚡      │
│       └─ n8n.trigger_alert(patient_id) │
│           ├─ Send doctor notification   │
│           ├─ Create urgent task         │
│           └─ Flag for human review      │
│                                         │
│ Return: {                               │
│   "risk_score": 0.75,                  │
│   "risk_level": "HIGH",                │
│   "actions": ["alert_sent", ...]       │
│ }                                       │
└─────────────────────────────────────────┘
         ↓
Step 4: TaskRouter Completes
┌─────────────────────────────────────────┐
│ TaskRouter logs result 📝              │
│ TaskRouter updates task status ✅      │
│ TaskRouter returns to API caller       │
└─────────────────────────────────────────┘
         ↓
Step 5: Doctor Sees Alert
┌─────────────────────────────────────────┐
│ Alert: High-risk patient detected       │
│ Patient: 65-year-old smoker            │
│ Risk Score: 75%                        │
│ Recommended: Immediate follow-up       │
└─────────────────────────────────────────┘
```

**Key Point:** RiskBotlet acted AUTONOMOUSLY (made decision + triggered action) BUT still within TaskRouter oversight. All decisions logged and auditable.

---

## Autonomy Levels Explained

### Level 1: Fully Reactive (NOT Botlets)
```
API Endpoint
  ↓
Get input
  ↓
Simple logic
  ↓
Return output

❌ NO decision making
❌ NO action triggering
❌ Pure request-response
```

### Level 2: Semi-Autonomous (✅ CURRENT BOTLETS)
```
Request
  ↓
Decision Logic 🧠
  ├─ Analyze context
  ├─ Make inference
  └─ Choose action
  ↓
Action Triggering ⚡
  ├─ Update database
  ├─ Fire workflow
  └─ Send alert
  ↓
Return result

✅ Internal decision making
✅ Triggers external actions
✅ Respects orchestration
❌ Cannot self-initiate
```

### Level 3: Goal-Oriented (NOT YET IMPLEMENTED)
```
Define goal
  ↓
Plan sub-goals
  ↓
Schedule execution
  ↓
Coordinate with other agents
  ↓
Monitor progress

✅ Self-scheduling
✅ Multi-agent collaboration
✅ Adaptive planning
❌ Still needs oversight
```

### Level 4: Fully Autonomous (NOT IMPLEMENTED)
```
Independent operation
  ↓
Self-monitoring
  ↓
No oversight needed
  ↓
Handles everything

⚠️ HIGH RISK
⚠️ No human control
⚠️ Potential safety issues
```

---

## Safety: How Botlets Stay Controlled

### Multi-Layer Safety Architecture

```
┌─────────────────────────────────────────────┐
│ SAFETY LAYER 1: Authorization              │
│ • TaskRouter validates user permissions    │
│ • Only authorized users trigger botlets    │
└─────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────┐
│ SAFETY LAYER 2: Botlet Constraints          │
│ • Botlets respect decision thresholds       │
│ • Cannot override safety rules              │
│ • Apply medical guidelines                  │
└─────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────┐
│ SAFETY LAYER 3: Action Restrictions         │
│ • Validate all actions before execution     │
│ • Cross-check against rules                 │
│ • Require confirmation for critical actions│
└─────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────┐
│ SAFETY LAYER 4: Audit Trail                 │
│ • Log every decision                        │
│ • Log every action                          │
│ • Enable human review                       │
│ • Allow rollback if needed                  │
└─────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────┐
│ SAFETY LAYER 5: Human Override              │
│ • Admins can pause botlets                  │
│ • Admins can override decisions             │
│ • Admins can review logs                    │
│ • Admins maintain control                   │
└─────────────────────────────────────────────┘
```

Result: **Botlets are autonomous BUT controlled**

---

## Quick Comparison

### Botlets vs Other Agent Types

```
┌──────────────────┬──────────┬──────────┬──────────┐
│ System           │ Decision │ Actions  │ Override │
├──────────────────┼──────────┼──────────┼──────────┤
│ Rule-based API   │    ❌    │    ❌    │    N/A   │
│ Botlets (Current)│    ✅    │    ✅    │    ✅    │
│ Future Agents    │    ✅    │    ✅    │    ✅    │
│ Autonomous AI    │    ✅    │    ✅    │    ❌    │
└──────────────────┴──────────┴──────────┴──────────┘

Botlets = Good balance between capability & control
```

---

## Summary

### Simple Answer
**Yes, botlets are autonomous agents** (semi-autonomous)

They:
- ✅ Make independent decisions
- ✅ Access knowledge autonomously
- ✅ Trigger external actions
- ✅ Work asynchronously
- ✅ Operate without constant oversight

BUT:
- ❌ Cannot self-initiate
- ❌ Must be orchestrated by TaskRouter
- ❌ All actions logged
- ❌ Subject to safety constraints

### Classification
**Semi-Autonomous Specialized Agent System**
- Level 2 on autonomy spectrum (1-5)
- ~70% autonomous on average
- Designed for medical domain
- Built for safety and control

### Architecture
```
TaskRouter (Orchestrator)
    ↓
10 Semi-Autonomous Botlets
    ↓
External Systems (PostgreSQL, FAISS, n8n)
```

This is the **optimal design** for a medical AI system: powerful enough to make complex decisions and take actions, but controlled enough for human oversight and safety.


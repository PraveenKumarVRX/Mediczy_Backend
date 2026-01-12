# Health Dashboard - Visual Architecture Guide

## 🏗️ Overall Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    USER DASHBOARD MENU                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [HEALTH DASHBOARD]  ← Single unified entry point              │
│  Monitor vital signs, devices, and health insights             │
│  Icon: ❤️ Link: /health-dashboard                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────────────────────────┐
│                  HEALTH DASHBOARD PAGE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─ HEADER ─────────────────────────────────────────────────┐ │
│  │ Title: "Health Dashboard"                                │ │
│  │ Subtitle: "Monitor vital signs, connected devices, ..." │ │
│  │ Buttons: [AI Analysis] [Dr. iSHA Chat]                 │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─ TAB NAVIGATION ──────────────────────────────────────────┐ │
│  │ [Overview] [Devices] [Analytics] [Insights] [Goals]      │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─ TAB CONTENT ─────────────────────────────────────────────┐ │
│  │                                                            │ │
│  │ ACTIVE TAB CONTENT DISPLAYS HERE                          │ │
│  │                                                            │ │
│  │ (Changes based on selected tab)                           │ │
│  │                                                            │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─ MODALS (Hidden by default) ──────────────────────────────┐ │
│  │ • Dr. iSHA Chat Modal                                     │ │
│  │ • Trend Analysis Dialog                                   │ │
│  │ • Device Pairing Modal                                    │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📑 Tab Structure & Content

### **Tab 1: Overview**
```
┌─────────────────────────────────────────────────────────┐
│ Overview - Fitness Data Integration                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Fitness Data Integration                         │  │
│  ├──────────────────────────────────────────────────┤  │
│  │                                                  │  │
│  │  ┌─ Google Fit (Android) ─┐ ┌─ Apple Health ─┐ │  │
│  │  │ • Daily Steps          │ │ • Activity     │ │  │
│  │  │ • Calories             │ │ • Workouts     │ │  │
│  │  │ • Active Minutes       │ │ • Health Data  │ │  │
│  │  └────────────────────────┘ └────────────────┘ │  │
│  │                                                  │  │
│  │ Connect Google Fit or Apple Health to sync     │  │
│  │                                                  │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘

Purpose: Connect fitness platforms and view integration status
```

### **Tab 2: Connected Devices**
```
┌─────────────────────────────────────────────────────────┐
│ Connected Devices - Device Management                  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Smart Device Integration        [Pair New Device]│  │
│  │ 3 Connected devices               ↳ Bluetooth    │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  Quick Health Stats                                    │
│  ┌─────────┐ ┌──────────┐ ┌──────┐ ┌────────────┐     │
│  │ Devices │ │ Heart    │ │Steps │ │ Sleep      │     │
│  │  3 Dev  │ │ Rate 72  │ │ 6245 │ │ Score 85%  │     │
│  └─────────┘ └──────────┘ └──────┘ └────────────┘     │
│                                                         │
│  Connected Devices List                                │
│  ┌───────────────────────────────────────────────────┐ │
│  │ ⌚ Apple Watch Series 7                            │ │
│  │    Apple | Synced: 2 min ago | Battery: 85%      │ │
│  │    Heart Rate, Steps, Sleep, Calories             │ │
│  │    [Sync] [Disconnect]                             │ │
│  ├───────────────────────────────────────────────────┤ │
│  │ 📱 Mi Band 6                                      │ │
│  │    Xiaomi | Synced: 5 min ago | Battery: 45%     │ │
│  │    Steps, Heart Rate, Sleep                        │ │
│  │    [Sync] [Disconnect]                             │ │
│  ├───────────────────────────────────────────────────┤ │
│  │ 💍 Oura Ring Gen 3                                │ │
│  │    Oura | Synced: 30 min ago | Battery: 92%      │ │
│  │    Sleep, Heart Rate Activity, Temperature         │ │
│  │    [Sync] [Disconnect]                             │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  Auto-Sync Settings                                    │
│  ☑️ Auto-Sync (Sync every 30 minutes)                 │
│                                                         │
└─────────────────────────────────────────────────────────┘

Purpose: Manage connected devices, pair new ones, control sync
```

### **Tab 3: Analytics**
```
┌─────────────────────────────────────────────────────────┐
│ Analytics - Health Metrics                             │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  6x6 Grid of Health Metrics                           │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │
│  │ ❤️ Blood     │ │ 💧 SpO2      │ │ ⚡ Blood     │   │
│  │ Pressure     │ │ 98%          │ │ Glucose      │   │
│  │ 120/80       │ │ ⬆️ +2%      │ │ 95 mg/dL     │   │
│  │ ⬇️ -3%      │ │              │ │ ➡️ Stable   │   │
│  └──────────────┘ └──────────────┘ └──────────────┘   │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │
│  │ 🧬 HRV       │ │ 🩸 Uric Acid │ │ 🏥 Choles-  │   │
│  │ 65 ms        │ │ 5.2 mg/dL    │ │ terol       │   │
│  │ ⬆️ +5ms     │ │ ⬆️ +0.3     │ │ 185 mg/dL   │   │
│  └──────────────┘ └──────────────┘ └──────────────┘   │
│                                                         │
│  Click any metric card to view detailed trends ↓      │
│                                                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │ Trend Analysis Dialog                           │  │
│  ├─────────────────────────────────────────────────┤  │
│  │ Heart Rate Trends - Last 7 Days                 │  │
│  │                                                 │  │
│  │ Chart showing historical data                  │  │
│  │ [Line Graph visualization]                     │  │
│  │                                                 │  │
│  │ Average: 72 bpm                                │  │
│  │ Highest: 95 bpm                                │  │
│  │ Lowest: 58 bpm                                 │  │
│  │ Trend: ⬆️ Increasing (good recovery)          │  │
│  └─────────────────────────────────────────────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘

Purpose: View all health metrics with trend analysis
```

### **Tab 4: Insights**
```
┌─────────────────────────────────────────────────────────┐
│ Insights - AI Health Recommendations                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  [Click AI Analysis Button to Generate]                │
│                                                         │
│  ┌────────────────────────────────────────────────────┐│
│  │ 🎉 Achievement                                     ││
│  │ Step Goal Consistently Achieved!                   ││
│  │ You're averaging 12,500 steps daily! Excellent!   ││
│  └────────────────────────────────────────────────────┘│
│                                                         │
│  ┌────────────────────────────────────────────────────┐│
│  │ ⚠️  Warning                                        ││
│  │ Sleep Duration Below Optimal                       ││
│  │ Your average sleep is 6.2 hours.                  ││
│  │ 💡 Establish consistent bedtime routine, aim...  ││
│  └────────────────────────────────────────────────────┘│
│                                                         │
│  ┌────────────────────────────────────────────────────┐│
│  │ ℹ️  Information                                    ││
│  │ Activity Pattern Analysis                          ││
│  │ Your active minutes vary from 45-120 daily.       ││
│  │ 💡 Aim for 60+ active minutes daily with...       ││
│  └────────────────────────────────────────────────────┘│
│                                                         │
│  ┌────────────────────────────────────────────────────┐│
│  │ ✅ Positive                                        ││
│  │ Good Sleep Habits                                  ││
│  │ Great job maintaining 7.8 hours average sleep!    ││
│  └────────────────────────────────────────────────────┘│
│                                                         │
└─────────────────────────────────────────────────────────┘

Purpose: Get AI-powered health insights and recommendations
```

### **Tab 5: Goals**
```
┌─────────────────────────────────────────────────────────┐
│ Goals - Health Objectives                              │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Goal 1: Daily Steps                                   │
│  Target: 10,000 steps | Current: 8,500                │
│  Progress: [████████░░] 85% | Status: ON-TRACK ✅     │
│  Deadline: Jan 31, 2026                                │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│                                                         │
│  Goal 2: Sleep 8 Hours                                 │
│  Target: 8 hours | Current: 7.2 hours                 │
│  Progress: [███████░░░] 90% | Status: ON-TRACK ✅     │
│  Deadline: Feb 15, 2026                                │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│                                                         │
│  Goal 3: Reduce Blood Pressure                         │
│  Target: 120/80 | Current: 125/82                     │
│  Progress: [██████░░░░] 60% | Status: BEHIND ⚠️       │
│  Deadline: Mar 1, 2026                                 │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│                                                         │
│  Goal 4: Exercise Consistency                          │
│  Target: 150 min/week | Current: 180 min/week         │
│  Progress: [██████████] 100% | Status: ACHIEVED ✨    │
│  Deadline: Ongoing                                     │
│                                                         │
└─────────────────────────────────────────────────────────┘

Purpose: Track and monitor health goals
```

---

## 🔄 Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                   EXTERNAL DATA SOURCES                      │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────┐  │
│  │ Google Fit API │  │ Apple Health   │  │ Bluetooth    │  │
│  │ (Android)      │  │ API (iOS)      │  │ Devices      │  │
│  └────────────────┘  └────────────────┘  └──────────────┘  │
│           ↓                  ↓                     ↓         │
│  ┌────────────────────────────────────────────────────────┐ │
│  │          Backend Health & Fitness APIs                │ │
│  │  GET /fitness/summary  │  GET /health/latest         │ │
│  └────────────────────────────────────────────────────────┘ │
│           ↓                                                  │
└──────────────────────────────────────────────────────────────┘
             ↓
┌──────────────────────────────────────────────────────────────┐
│              HealthDashboard Component                       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  useEffect()                                                │
│  ├─ loadDevices()           → localStorage                  │
│  ├─ loadHealthStats()       → /health/latest API          │
│  ├─ fetchFitnessSummary()   → /fitness/summary API        │
│  └─ updateSyncStatus()      → HealthSyncScheduler         │
│           ↓                                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  STATE MANAGEMENT                                   │   │
│  │  ├─ healthStats (vital signs)                       │   │
│  │  ├─ devices (connected devices list)               │   │
│  │  ├─ fitnessData (7-day aggregated data)            │   │
│  │  ├─ healthInsights (AI analysis)                    │   │
│  │  ├─ healthGoals (user objectives)                   │   │
│  │  └─ UI state (active tab, modals, etc)             │   │
│  └─────────────────────────────────────────────────────┘   │
│           ↓                                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  TAB RENDERING ENGINE                              │   │
│  │  Switch(activeTab) {                                │   │
│  │    case 'overview' → Overview Content              │   │
│  │    case 'devices' → Devices Content                │   │
│  │    case 'analytics' → Analytics Content            │   │
│  │    case 'insights' → Insights Content              │   │
│  │    case 'goals' → Goals Content                    │   │
│  │  }                                                  │   │
│  └─────────────────────────────────────────────────────┘   │
│           ↓                                                 │
└──────────────────────────────────────────────────────────────┘
             ↓
┌──────────────────────────────────────────────────────────────┐
│                    USER INTERFACE                           │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ [Overview] [Devices] [Analytics] [Insights] [Goals]  │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │  RENDERED TAB CONTENT (Dynamic)                       │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

---

## 🎯 Component Hierarchy

```
HealthDashboard (Main)
│
├── Header
│   ├── Title & Subtitle
│   ├── AI Analysis Button
│   │   └── → generateHealthInsights()
│   └── Dr. iSHA Chat Button
│       └── → setShowChat(true)
│
├── Tab Navigation
│   ├── Tab Triggers (5 buttons)
│   └── Tab List Control
│
├── Tab Content Renderer
│   │
│   ├── Tab 1: Overview
│   │   ├── Fitness Data Card
│   │   ├── Google Fit Dashboard Component
│   │   └── Apple Health Dashboard Component
│   │
│   ├── Tab 2: Connected Devices
│   │   ├── Device Header
│   │   ├── Quick Stats Cards Grid
│   │   ├── Devices List
│   │   │   └── For each device:
│   │   │       ├── Device Info
│   │   │       ├── Battery Level
│   │   │       ├── Last Sync
│   │   │       └── Action Buttons
│   │   └── Auto-Sync Toggle
│   │
│   ├── Tab 3: Analytics
│   │   ├── Health Metrics Grid (6x6)
│   │   │   └── For each metric:
│   │   │       ├── Metric Card
│   │   │       └── Trend Indicator
│   │   └── Trend Dialog (Modal)
│   │       └── HealthTrendCard Component
│   │
│   ├── Tab 4: Insights
│   │   └── Insight Cards List
│   │       └── For each insight:
│   │           ├── Icon
│   │           ├── Title
│   │           ├── Description
│   │           └── Recommendation
│   │
│   └── Tab 5: Goals
│       └── Goals List
│           └── For each goal:
│               ├── Title
│               ├── Progress Bar
│               ├── Status Badge
│               └── Deadline
│
├── Modals
│   ├── Dr. iSHA Chat Modal
│   │   └── DrISHAChat Component
│   │
│   ├── Trend Analysis Dialog
│   │   └── HealthTrendCard Component
│   │
│   └── Device Pairing Modal (Future)
│       └── Bluetooth Pairing Wizard
│
└── Services/Hooks
    ├── useEffect Hooks
    │   ├── Initial Load
    │   ├── Device Updates
    │   └── Sync Status
    │
    ├── State Hooks
    │   ├── useState for each state variable
    │   └── State setters
    │
    └── Custom Functions
        ├── loadDevices()
        ├── loadHealthStats()
        ├── fetchFitnessSummary()
        ├── updateSyncStatus()
        ├── toggleAutoSync()
        ├── generateHealthInsights()
        ├── handleSync()
        └── disconnectDevice()
```

---

## 📊 State Management Schema

```
HealthDashboard State

├── UI State
│   ├── activeTab: "overview" | "devices" | "analytics" | "insights" | "goals"
│   ├── showChat: boolean
│   ├── showTrendDialog: boolean
│   ├── showPairingModal: boolean
│   ├── selectedMetric: string | null
│   └── loading: boolean
│
├── Health Data
│   ├── healthStats
│   │   ├── heartRate: number | null
│   │   ├── steps: number | null
│   │   ├── sleepScore: number | null
│   │   ├── bloodPressure: { systolic, diastolic } | null
│   │   ├── spo2: number | null
│   │   ├── temperature: number | null
│   │   ├── bloodGlucose: number | null
│   │   ├── hrv: number | null
│   │   ├── uricAcid: number | null
│   │   ├── totalCholesterol: number | null
│   │   └── lastUpdated: Date | null
│   │
│   ├── fitnessData
│   │   ├── dailySteps: number[]
│   │   ├── weeklyAverage: number
│   │   ├── caloriesBurned: number[]
│   │   ├── activeMinutes: number[]
│   │   ├── heartRateAvg: number[]
│   │   ├── sleepHours: number[]
│   │   ├── weight: number
│   │   └── lastWeekTrend: "improving" | "stable" | "declining"
│   │
│   ├── healthInsights: HealthInsight[]
│   │   └── Each: { id, type, title, description, priority, recommendation }
│   │
│   └── healthGoals: HealthGoal[]
│       └── Each: { id, title, target, current, progress, status, deadline }
│
├── Device Management
│   ├── devices: Device[]
│   │   └── Each: { id, name, type, brand, status, lastSync, battery, dataTypes }
│   │
│   ├── syncStatus: SyncStatus | null
│   │   ├── isSyncing: boolean
│   │   ├── lastSync: Date
│   │   └── nextSync: Date
│   │
│   ├── autoSyncEnabled: boolean
│   ├── syncing: boolean
│   └── connectedDevicesCount: number
│
└── Loading States
    ├── loading: boolean
    ├── loadingStats: boolean
    ├── loadingFitness: boolean
    └── aiAnalyzing: boolean
```

---

## 🔗 URL Routing

```
┌─────────────────────────────────────────────────────────────┐
│                    ROUTING STRUCTURE                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  PRIMARY ROUTE:                                            │
│  /health-dashboard                                         │
│  └─→ HealthDashboard component                           │
│                                                             │
│  LEGACY ROUTES (Backward Compatible):                      │
│  /health-tracker                                           │
│  └─→ HealthDashboard component (redirects)               │
│                                                             │
│  /patient/devices                                          │
│  └─→ HealthDashboard component (redirects)               │
│                                                             │
│  All routes wrapped in:                                    │
│  <MainLayout> → Provides layout, navigation, etc          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## ✨ Key Features Matrix

```
┌─────────────────────────────────────────────────────────────┐
│                     FEATURES MATRIX                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Feature                    │ Tab       │ Component         │
│ ───────────────────────────┼───────────┼──────────────────│
│ Fitness Integration        │ Overview  │ Google Fit Dash  │
│ Apple Health Connection    │ Overview  │ Apple Health Dash│
│ Device Pairing             │ Devices   │ Pairing Modal    │
│ Device List                │ Devices   │ Device Cards     │
│ Battery Monitoring         │ Devices   │ Device Cards     │
│ Auto-Sync Toggle           │ Devices   │ Switch Control   │
│ Manual Sync                │ Devices   │ Sync Button      │
│ Quick Health Stats         │ Devices   │ Stats Cards      │
│ Health Metrics Grid        │ Analytics │ Metric Cards     │
│ Trend Analysis             │ Analytics │ HealthTrendCard  │
│ AI Analysis                │ Insights  │ AI Insights List │
│ Health Goals               │ Goals     │ Goals List       │
│ Progress Tracking          │ Goals     │ Progress Bars    │
│ Dr. iSHA Chat              │ Header    │ Chat Modal       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

**Diagram Last Updated**: January 11, 2026
**Implementation Status**: ✅ Complete and Deployed

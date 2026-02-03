# Post-Login Onboarding and Next Best Action Spec

Status: Draft
Scope: Patient dashboard entry experience after login.

## Goals
- Reduce time-to-first-value in the first session.
- Guide users to set up devices and core health data quickly.
- Provide a single, clear next step instead of a blank dashboard.

## Onboarding Path (Prototype)
### First Session Checklist
1) Complete profile (DOB, gender, phone)
2) Connect a wearable or health app
3) Book first consultation or explore doctors
4) Upload a report or add a manual vital

### Completion Rules (Prototype)
- Profile complete if DOB + gender + phone are present.
- Device connected if at least one wearable is connected.
- Consult complete if an upcoming appointment exists.
- Report complete if a recent report exists (future API hook).

## Next Best Action Heuristic (Prototype)
Priority order:
1) If profile incomplete -> "Complete your profile"
2) Else if no device connected -> "Connect a device"
3) Else if no upcoming appointment -> "Book a consultation"
4) Else -> "Review today’s health trends"

## UI Placement
- A lightweight onboarding panel near the top of the patient dashboard.
- A single "Next best action" card near the welcome section.

## Telemetry
- Track clicks for each onboarding action.
- Track completion time to first completed step.

## Future Enhancements
- Personalize next best action using goals, lab results, and risk scores.
- Add device trust and step-up onboarding for privacy-sensitive areas.

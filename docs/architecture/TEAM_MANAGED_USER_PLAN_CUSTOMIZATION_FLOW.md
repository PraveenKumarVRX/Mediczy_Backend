# Team-Managed User Plan Customization Flow

Last updated: 2026-05-31

## Objective

Enable team users to manage user login/benefits through assignment hierarchy:

1. User belongs to a corporate.
2. Corporate belongs to broker/aggregator chain.
3. Team user assigned to that chain can customize and apply plans.
4. Non-assigned team users are blocked.

## Ownership Model

- Platform Admin/Super Admin:
  - Can manage all users and all corporate chains.
  - Can define global master plans.
- Assigned Team User:
  - Can manage only users in assigned corporate chain.
  - Can customize plan from master templates for that corporate.
  - Can apply customized plan to user as corporate-sponsored subscription.
- Organization Admin:
  - Can customize plans only for own organization context.

## Assignment Rules (Authorization)

A team user can manage a target user if any of the following is true:

1. Team user is admin/super-admin.
2. Corporate assigned owner:
  - `corporates.assignedTo == teamUser.id`
  - or `corporates.onboardedById == teamUser.id`
3. User metadata explicit manager:
  - `users.metadata.managedByTeamUserId == teamUser.id`
  - or `users.metadata.teamManagerUserId == teamUser.id`
4. Active association exists:
  - `user_associations` has record with:
    - `userId = teamUser.id`
    - `entityType = 'corporate'`
    - `entityId = targetUser.corporateId`
    - `status = 'active'`

If none match, return `403`.

## New API Flow

### 1) Get managed user context

- Endpoint: `GET /api/org-membership-plans/team/users/:userId/plan-context`
- Auth: `authTeam` + team permission check
- Response includes:
  - target user
  - corporate
  - broker (if linked)
  - active user plan
  - available master plans
  - ownership flags

### 2) Customize and apply plan

- Endpoint: `POST /api/org-membership-plans/team/users/:userId/customize-plan`
- Auth: `authTeam` + team permission check
- Input:
  - `masterPlanId` (required)
  - optional override fields (`name`, `price`, `features`, `benefits`, etc.)
  - `applyToUser` (default true)
- Behavior:
  1. Validate ownership chain.
  2. Load active master plan.
  3. Create/update corporate customization (`membership_plans` with `isMaster=false`, `organizationType='corporate'`).
  4. If apply enabled:
    - deactivate existing active user plans
    - create new active `user_plans` row with `paymentMethod='corporate'`
    - stamp metadata with team/corporate/broker lineage

## Cross-Functional Accountability

- PM:
  - Define approval matrix for assignment and escalation.
- BA:
  - Maintain rule matrix for assignment and exception handling.
- Principal Engineer / Tech Lead:
  - Keep authorization centralized and auditable.
- Backend Engineer:
  - Enforce chain checks at API layer and DB-level consistency.
- Frontend Engineer:
  - Show context (who owns user/corporate chain) before allowing edits.
- AI Engineer:
  - Generate guided recommendations, never bypass ownership checks.
- Security & Compliance Engineer:
  - Audit all customization/apply actions, preserve non-repudiation trail.
- QA:
  - Negative tests for unauthorized chain access, stale assignments, and race conditions.
- Delivery Manager:
  - Roll out in phases: context read -> customize -> apply -> audit dashboards.

## Phase 2 (Recommended)

1. Add immutable audit log table for every customization/apply action.
2. Add soft approval workflow for high-value or regulated plan changes.
3. Add RLS policies for corporate-scoped plan reads/writes.
4. Add notification hooks to corporate admin and assigned team manager.

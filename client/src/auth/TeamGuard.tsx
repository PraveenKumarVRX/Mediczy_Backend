/**
 * TeamGuard — per-route permission gate for the Team Portal.
 *
 * Usage:
 *   <TeamGuard permission="Doctor Management">
 *     <TeamDoctorManagement />
 *   </TeamGuard>
 *
 *   // Multiple permissions — user must hold at least one:
 *   <TeamGuard permission={["Chat Dashboard Access", "Support Tickets"]}>
 *     <TeamTicketManager />
 *   </TeamGuard>
 *
 *   // Admin-only (no regular-team access):
 *   <TeamGuard adminOnly>
 *     <TeamSettings />
 *   </TeamGuard>
 *
 * Rules:
 *   - No teamToken → redirect to /team/login
 *   - isAdmin / role Admin / Super Admin → always passes
 *   - adminOnly=true + non-admin → 403 screen
 *   - Otherwise: user must hold at least one matching permission string
 *     (case-insensitive substring match so "User Management" covers
 *      "User Management Access" and vice versa)
 */

import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert, ArrowLeft, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

interface TeamGuardProps {
  children: ReactNode;
  /** Permission string(s) — at least one must match. Omit for any-team-member access. */
  permission?: string | string[];
  /** If true, only admins can access this route (no permission string needed). */
  adminOnly?: boolean;
}

const readTeamUser = () => {
  try {
    const raw = localStorage.getItem('teamUserData');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const isAdminUser = (user: any) =>
  user?.isAdmin === true ||
  String(user?.role || '').toLowerCase() === 'admin' ||
  String(user?.role || '').toLowerCase() === 'super admin' ||
  String(user?.role || '').toLowerCase() === 'super_admin';

const hasPermission = (userPermissions: string[] = [], required: string | string[]): boolean => {
  const reqs = Array.isArray(required) ? required : [required];
  return reqs.some((req) =>
    userPermissions.some(
      (p) =>
        p.toLowerCase().includes(req.toLowerCase()) ||
        req.toLowerCase().includes(p.toLowerCase())
    )
  );
};

const AccessDenied = ({ permission, adminOnly }: { permission?: string | string[]; adminOnly?: boolean }) => {
  const needed = adminOnly
    ? 'Administrator access'
    : Array.isArray(permission)
    ? permission.join(' or ')
    : (permission ?? 'a required permission');

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-6">
      <div className="max-w-md w-full text-center space-y-6 animate-in fade-in duration-500">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="p-5 rounded-2xl bg-red-500/10 border border-red-500/20">
            <ShieldAlert className="h-12 w-12 text-red-500" />
          </div>
        </div>

        {/* Heading */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">Access Restricted</h1>
          <p className="text-muted-foreground">
            You don't have permission to view this module.
          </p>
        </div>

        {/* Permission info */}
        <div className="rounded-xl border bg-muted/40 p-4 text-left space-y-2">
          <div className="flex items-start gap-2">
            <Lock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Required permission</p>
              <p className="text-sm font-medium mt-0.5">{needed}</p>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Contact your administrator to request access to this module.
        </p>

        {/* Actions */}
        <div className="flex gap-3 justify-center">
          <Button asChild variant="outline" size="sm">
            <Link to="/team/dashboard">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Dashboard
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

const TeamGuard = ({ children, permission, adminOnly = false }: TeamGuardProps) => {
  const location = useLocation();
  const token = localStorage.getItem('teamToken');

  if (!token) {
    return <Navigate to="/team/login" state={{ from: location }} replace />;
  }

  const teamUser = readTeamUser();

  if (!teamUser) {
    return <Navigate to="/team/login" state={{ from: location }} replace />;
  }

  // Admins bypass all module guards
  if (isAdminUser(teamUser)) {
    return <>{children}</>;
  }

  // Admin-only route — non-admin team member is blocked
  if (adminOnly) {
    return <AccessDenied adminOnly />;
  }

  // No permission required beyond being authenticated — pass through
  if (!permission) {
    return <>{children}</>;
  }

  const userPermissions: string[] = teamUser.permissions ?? [];

  if (!hasPermission(userPermissions, permission)) {
    return <AccessDenied permission={permission} />;
  }

  return <>{children}</>;
};

export default TeamGuard;

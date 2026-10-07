/**
 * Permission split (plan §4 / decision on staff identity). A lab login is an organisational credential: it
 * can dispatch and receive for its own lab, but it can never collect. A phlebotomist can collect only what
 * is assigned to them, for an owner they hold an active membership with, and can never dispatch or receive.
 * Both halves are checked at the route AND again inside the service, so a new route cannot forget one.
 */
import { forbidden } from './errors.js';

export const PERMISSIONS = Object.freeze({
  READ: 'collection.read',
  DISPATCH: 'collection.dispatch.write',
  RECEIVE: 'collection.custody.receive',
  ADMIN: 'collection.admin',
  WORKLIST: 'phlebotomy.worklist.read',
  COLLECT: 'phlebotomy.collection.write',
});

const LAB_PERMISSIONS = [PERMISSIONS.READ, PERMISSIONS.DISPATCH, PERMISSIONS.RECEIVE, PERMISSIONS.ADMIN];

/** Command → the permission that guards it. */
export const COMMAND_PERMISSION = Object.freeze({
  assign: PERMISSIONS.DISPATCH,
  reassign: PERMISSIONS.DISPATCH,
  cancel: PERMISSIONS.DISPATCH,
  receive: PERMISSIONS.RECEIVE,
});

export const permissionForCommand = (command) => COMMAND_PERMISSION[command] || PERMISSIONS.COLLECT;

/**
 * principal:
 *   { type: 'lab', ownerUid, ref }
 *   { type: 'phlebotomist', id, ref, memberships: [{ ownerUid, scopes, canHome, canWard }] }
 */
export function permissionsOf(principal, ownerUid) {
  if (!principal) return [];
  if (principal.type === 'lab') return principal.ownerUid === ownerUid ? LAB_PERMISSIONS : [];
  if (principal.type === 'phlebotomist') {
    const m = (principal.memberships || []).find((x) => x.ownerUid === ownerUid);
    return m ? m.scopes.filter((s) => s === PERMISSIONS.WORKLIST || s === PERMISSIONS.COLLECT) : [];
  }
  return [];
}

export function can(principal, permission, ownerUid) {
  return permissionsOf(principal, ownerUid).includes(permission);
}

export function assertCan(principal, permission, ownerUid) {
  if (!can(principal, permission, ownerUid)) throw forbidden('You do not have permission for this action', { permission });
}

export function canWorkMode(principal, ownerUid, mode) {
  if (principal.type !== 'phlebotomist') return true;
  const m = (principal.memberships || []).find((x) => x.ownerUid === ownerUid);
  return Boolean(m && (mode === 'home' ? m.canHome : m.canWard));
}

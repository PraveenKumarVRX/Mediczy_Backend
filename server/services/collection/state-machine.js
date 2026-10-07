/**
 * Collection state machine — pure, no I/O.
 *
 *   Home:  assigned → accepted → en_route → arrived → verified → consented → collected → in_transit → handed_over → lab_received
 *   Ward:  assigned → accepted → at_bedside → verified → consented → collected → ward_handoff → lab_received
 *
 * The service asks this module two questions and nothing else decides: "is this command legal from this
 * status, for this mode, by this kind of actor?" and "what status does it lead to?". Every transition
 * that is not in the table below is refused, which is what stops a generic "next stage" button from
 * skipping the evidence a stage exists to collect.
 */

export const MODES = Object.freeze(['home', 'ward']);

/** Who may issue a command. `system` is reserved for server-side follow-ups (e.g. completing a task after the last receipt). */
export const ACTORS = Object.freeze({
  PHLEBOTOMIST: 'phlebotomist',
  DISPATCH: 'dispatch',
  LAB_RECEIVER: 'lab_receiver',
  SYSTEM: 'system',
});

/** Statuses from which nothing further can happen. */
export const FINAL_STATUSES = Object.freeze(['lab_received', 'rejected_by_lab', 'refused', 'cancelled']);

// Reassignment and cancellation are allowed until a specimen exists in the collector's hands.
const BEFORE_COLLECTION = {
  home: ['assigned', 'accepted', 'en_route', 'arrived', 'verified', 'consented'],
  ward: ['assigned', 'accepted', 'at_bedside', 'verified', 'consented'],
};

const P = ACTORS.PHLEBOTOMIST;
const D = ACTORS.DISPATCH;
const L = ACTORS.LAB_RECEIVER;
const S = ACTORS.SYSTEM;

// command → { from: {mode: [statuses]}, to: status | (ctx)=>status, actors, event }
const t = (from, to, actors, event) => ({ from, to, actors, event });
const both = (...s) => ({ home: s, ward: s });

export const COMMANDS = Object.freeze({
  assign: t({ home: ['unassigned'], ward: ['unassigned'] }, 'assigned', [D], 'task.assigned'),
  reassign: t(BEFORE_COLLECTION, 'assigned', [D], 'task.reassigned'),
  accept: t(both('assigned'), 'accepted', [P], 'task.accepted'),
  decline: t({ home: ['assigned', 'accepted', 'en_route'], ward: ['assigned', 'accepted'] }, 'unassigned', [P], 'task.declined'),
  depart: t({ home: ['accepted'], ward: [] }, 'en_route', [P], 'task.en_route'),
  arrive: t({ home: ['en_route'], ward: [] }, 'arrived', [P], 'task.arrived'),
  bedside: t({ home: [], ward: ['accepted'] }, 'at_bedside', [P], 'task.at_bedside'),
  verify_patient: t({ home: ['arrived'], ward: ['at_bedside'] }, 'verified', [P], 'task.verified'),
  // consent leads to `consented` when granted and to `refused` when the patient declines: the service
  // passes the outcome and `resolve` picks the destination.
  consent: t(both('verified'), (ctx) => (ctx?.outcome === 'refused' ? 'refused' : 'consented'), [P], 'task.consent'),
  collect: t(both('consented'), 'collected', [P], 'task.collected'),
  start_transit: t({ home: ['collected'], ward: [] }, 'in_transit', [P], 'task.in_transit'),
  handoff: t({ home: ['in_transit'], ward: ['collected'] }, (ctx) => (ctx?.mode === 'ward' ? 'ward_handoff' : 'handed_over'), [P], 'task.handed_over'),
  // Lab receipt is decided specimen by specimen; the service computes the outcome once every specimen is decided.
  receive: t({ home: ['handed_over'], ward: ['ward_handoff'] }, (ctx) => (ctx?.anyRejected ? 'rejected_by_lab' : 'lab_received'), [L, S], 'task.received'),
  cancel: t(
    { home: ['unassigned', ...BEFORE_COLLECTION.home], ward: ['unassigned', ...BEFORE_COLLECTION.ward] },
    'cancelled', [D], 'task.cancelled',
  ),
});

/**
 * Commands that act on a task without moving it (the specimen scan). They are still bound to a status,
 * a mode and an actor, so they are table-driven the same way.
 */
export const STATIC_COMMANDS = Object.freeze({
  scan_specimen: { from: both('consented'), actors: [P], event: 'specimen.scanned' },
});

export class TransitionError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'TransitionError';
    this.code = code; // machine-readable; the route layer maps it to an HTTP status
    this.details = details;
  }
}

export function isFinal(status) {
  return FINAL_STATUSES.includes(status);
}

function definitionOf(command) {
  const def = COMMANDS[command] || STATIC_COMMANDS[command];
  if (!def) throw new TransitionError('unknown_command', `Unknown command "${command}"`, { command });
  return def;
}

/**
 * Check a command and, for a transition, return the destination status.
 * Throws TransitionError with a stable `code`; never returns a falsy "maybe".
 */
export function resolve({ mode, status, command, actor, context = {} }) {
  if (!MODES.includes(mode)) throw new TransitionError('invalid_mode', `Unknown mode "${mode}"`, { mode });
  const def = definitionOf(command);

  if (!def.actors.includes(actor)) {
    throw new TransitionError('actor_not_permitted', `A ${actor} may not issue "${command}"`, { command, actor });
  }
  if (isFinal(status)) {
    throw new TransitionError('task_closed', `The task is ${status} and accepts no further commands`, { status, command });
  }
  const allowedFrom = def.from[mode] || [];
  if (!allowedFrom.includes(status)) {
    throw new TransitionError(
      'invalid_transition',
      `"${command}" is not allowed on a ${mode} task that is ${status}`,
      { mode, status, command, allowedFrom },
    );
  }
  const to = typeof def.to === 'function' ? def.to({ mode, ...context }) : def.to;
  return { to: to ?? status, event: def.event, moves: to !== undefined };
}

/** Commands this actor could issue right now (drives the UI's permitted-actions list). */
export function permittedCommands({ mode, status, actor }) {
  if (isFinal(status)) return [];
  const all = { ...COMMANDS, ...STATIC_COMMANDS };
  return Object.entries(all)
    .filter(([, def]) => def.actors.includes(actor) && (def.from[mode] || []).includes(status))
    .map(([name]) => name);
}

/** Fields that exist only for one mode. The service refuses a payload that carries the other mode's. */
export const MODE_FIELDS = Object.freeze({
  home: ['address', 'contactPhone'],
  ward: ['facilityUid', 'admissionRef', 'wardName', 'bedLabel', 'roundLabel', 'isolationRequired'],
});

export function foreignModeFields(mode, payload) {
  const other = mode === 'home' ? 'ward' : 'home';
  return MODE_FIELDS[other].filter((f) => payload && payload[f] !== undefined && payload[f] !== null);
}

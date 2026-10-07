/** An error the route layer can turn into a response without guessing: a stable `code`, an HTTP `status`, safe `details`. */
export class CollectionError extends Error {
  constructor(code, status, message, details = {}) {
    super(message);
    this.name = 'CollectionError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const notFound = (what = 'Task') => new CollectionError('not_found', 404, `${what} not found`);
export const forbidden = (message = 'Not permitted', details) => new CollectionError('forbidden', 403, message, details);
export const invalid = (message, details) => new CollectionError('validation_failed', 422, message, details);
export const conflict = (code, message, details) => new CollectionError(code, 409, message, details);

const TRANSITION_STATUS = {
  unknown_command: 400,
  invalid_mode: 422,
  actor_not_permitted: 403,
  task_closed: 409,
  invalid_transition: 409,
};

/** Translate a state-machine TransitionError into a CollectionError (everything else passes through). */
export function fromTransition(err) {
  if (err && err.name === 'TransitionError') {
    return new CollectionError(err.code, TRANSITION_STATUS[err.code] || 409, err.message, err.details);
  }
  return err;
}

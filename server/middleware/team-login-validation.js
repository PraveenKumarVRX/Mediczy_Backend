import { body, validationResult } from 'express-validator';

// Normalize the identifier before validating. Never trim or otherwise change a password.
export const teamLoginValidation = [
  body('email')
    .isString().withMessage('Must be a valid email').bail()
    .customSanitizer(value => value.trim().toLowerCase())
    .isEmail().withMessage('Must be a valid email'),
  body('password')
    .isString().withMessage('Password is required').bail()
    .notEmpty().withMessage('Password is required'),
];

export function rejectInvalidTeamLogin(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  // express-validator normally includes the submitted value. Credentials must
  // appear in neither validation responses nor diagnostic logs.
  const errors = result.array().map(({ type, msg, path, location }) => ({ type, msg, path, location }));
  const diagnostics = {
    requestId: req.requestId,
    contentType: req.get('content-type') || 'missing',
    emailPresent: Object.hasOwn(req.body || {}, 'email'),
    passwordPresent: Object.hasOwn(req.body || {}, 'password'),
    invalidFields: [...new Set(errors.map(error => error.path))],
  };
  if (req.logger?.warn) req.logger.warn('Team login validation failed', diagnostics);
  else console.warn('[Team Login] Validation failed', diagnostics);

  return res.status(400).json({
    success: false,
    message: errors.map(error => error.msg).join('. '),
    errors,
    ...(req.requestId ? { requestId: req.requestId } : {}),
  });
}

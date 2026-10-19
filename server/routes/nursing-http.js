import { withNursingContext, actorFromRequest, nursingAudit } from '../services/nursing-context.service.js';
import { sendRouteError } from '../utils/route-errors.js';
// Commit before reporting success. A rolled-back clinical write must never look saved.
export const nursingHandler = (fn, status = 200) => async (req, res) => {
    try {
        const data = await withNursingContext(actorFromRequest(req), () => fn(req));
        return res.status(status).json({ success: true, data });
    }
    catch (error) {
        if (error.status === 403 || error.status === 409) {
            try {
                await withNursingContext(actorFromRequest(req), () => nursingAudit('clinical.request.denied', 'clinical_route', req.path, { code: error.code || 'REQUEST_DENIED' }));
            }
            catch (auditError) {
                console.error('[nursing] denied-action audit unavailable:', auditError.code || 'AUDIT_UNAVAILABLE');
            }
        }
        if (error.blocked || error.consentBlocked)
            return res.status(error.status || 403).json({ success: false, code: error.code, message: error.message, blocked: true, reasons: error.reasons || [error.message] });
        return sendRouteError(res, error);
    }
};

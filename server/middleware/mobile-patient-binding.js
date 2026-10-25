/** Opt-in dedicated deployment binding; existing shared deployments stay unchanged. */
export function buildMobilePatientBinding(env = process.env) {
  return (req, res, next) => {
    if (!['/login', '/signup'].includes(req.path)) return next();
    if (req.mobileTenant) {
      const { id, config } = req.mobileTenant;
      if (req.path === '/signup' && !config.apps.some(app => app.product === 'patient' && app.registration === 'open')) return res.status(403).json({ message: 'Registration is managed by your organisation.' });
      req.body = { ...req.body, clinic_id: String(id) };
      delete req.body.clinic_slug; delete req.body.clinic_domain;
      return next();
    }
    if (!env.MOBILE_DEPLOYMENT_ID) return next();
    const enabled = (env.MOBILE_PRODUCTS || '').split(',').map(s => s.trim()).includes('patient');
    if (!enabled || !/^[1-9][0-9]*$/.test(env.MOBILE_PATIENT_CLINIC_ID || '')) {
      return res.status(503).json({ message: 'Patient mobile access is not configured.' });
    }
    if (req.path === '/signup' && env.MOBILE_PATIENT_REGISTRATION !== 'open') {
      return res.status(403).json({ message: 'Registration is managed by your organisation.' });
    }
    req.body = { ...req.body, clinic_id: env.MOBILE_PATIENT_CLINIC_ID };
    delete req.body.clinic_slug;
    delete req.body.clinic_domain;
    return next();
  };
}
export const mobilePatientBinding = buildMobilePatientBinding();

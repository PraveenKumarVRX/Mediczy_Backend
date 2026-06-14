/**
 * Admin AI Copilot feature flags.
 * All default to enabled except write actions (human approval required).
 */
export const ADMIN_COPILOT = {
  enabled: process.env.ADMIN_COPILOT_ENABLED !== 'false',
  streaming: process.env.ADMIN_COPILOT_STREAMING !== 'false',
  writeActions: process.env.ADMIN_COPILOT_WRITE_ACTIONS === 'true',
};

export default ADMIN_COPILOT;

// Runs both check modules for 20261008000000-care-units.sql in order (the checked runner takes one module).
import * as units from './care-units.checks.mjs';
import * as ohc from './ohc-workspace.checks.mjs';
export async function behaviour(h) { await units.behaviour(h); console.log('\n── OHC workspace ──'); await ohc.behaviour(h); }
export const leak = units.leak;
export async function state(h) { await units.state(h); await ohc.state(h); }

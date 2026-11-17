/**
 * SQL helpers for the demo-account guard: partner work queues leave out rows that belong to a shared
 * sales demo login (users.metadata.demoAccount), using is_demo_account() from migration 20261117000100.
 * See middleware/demo-account-guard.middleware.js.
 */
import { Sequelize } from 'sequelize';

/** Sequelize where-clause: the row's user column is not a demo account. */
export const notDemoAccount = (column) => Sequelize.where(Sequelize.fn('is_demo_account', Sequelize.col(column)), false);

/** Raw SQL fragment: `NOT is_demo_account(<expr>)`. Pass a trusted column expression only. */
export const notDemoAccountSql = (expr) => `NOT is_demo_account(${expr})`;

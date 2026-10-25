import Tenant from '../models/postgres/tenant.model.postgres.js';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import { Op } from 'sequelize';
import { buildTenantMobileRepository } from './tenant-mobile-apps.store.js';
export const tenantMobileRepository = buildTenantMobileRepository({ Tenant, postgresSequelize, Op });

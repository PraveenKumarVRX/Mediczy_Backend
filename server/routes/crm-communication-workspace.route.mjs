import pool from '../db/pgPool.js';
import { authCRM } from '../middleware/crm.middleware.js';
import { hasCRMCapability } from '../config/crm-roles.config.js';
import { buildCommunicationWorkspaceRouter } from './communication-workspace.route.mjs';
import { resolveWorkspaceScope } from '../services/communication-workspace-scope.mjs';
export default buildCommunicationWorkspaceRouter({pool,authenticate:authCRM,
 resolveScope:req=>{
  if(!hasCRMCapability(req.crmUser,'communication:read'))throw Object.assign(new Error('Communication access required'),{statusCode:403});
  return resolveWorkspaceScope(pool,{userId:req.crmUser.id,tenantUid:req.crmUser.tenantUid});
 },canWrite:req=>hasCRMCapability(req.crmUser,'communication:write')});

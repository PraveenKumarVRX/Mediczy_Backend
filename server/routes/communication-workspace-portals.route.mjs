import pool from '../db/pgPool.js';
import { authTeam, requirePermission } from '../middleware/team.middleware.js';
import adminMiddleware from '../middleware/admin.middleware.js';
import { buildCommunicationWorkspaceRouter } from './communication-workspace.route.mjs';
import { resolveWorkspaceScope } from '../services/communication-workspace-scope.mjs';
import express from 'express';
import { chatwootBridge } from '../services/chatwoot-bridge.service.js';
const channelWorkspace=(ctx,health)=>chatwootBridge[health?'checkHealth':'status'](ctx.tenantId);
const teamAuth=express.Router();teamAuth.use(authTeam,requirePermission('Chat Dashboard Access'));
export const teamCommunicationWorkspace=buildCommunicationWorkspaceRouter({pool,authenticate:teamAuth,channelWorkspace,
 resolveScope:async req=>{
  const {rows:[user]}=await pool.query('SELECT organization_uid FROM users WHERE id=$1',[req.teamUser.id]);
  return resolveWorkspaceScope(pool,{userId:req.teamUser.id,tenantUid:user?.organization_uid});
 }});
export const adminCommunicationWorkspace=buildCommunicationWorkspaceRouter({pool,authenticate:adminMiddleware,channelWorkspace,
 resolveScope:req=>resolveWorkspaceScope(pool,{userId:req.admin.id,tenantUid:req.query.tenantUid,platformAdmin:true})});

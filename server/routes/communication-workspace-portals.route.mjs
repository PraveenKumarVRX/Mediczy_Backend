import pool from '../db/pgPool.js';
import { authTeam, requirePermission } from '../middleware/team.middleware.js';
import adminMiddleware from '../middleware/admin.middleware.js';
import { buildCommunicationWorkspaceRouter } from './communication-workspace.route.mjs';
import { resolveWorkspaceScope,authoritativeTeamWorkspaceIdentity } from '../services/communication-workspace-scope.mjs';
import express from 'express';
import { chatwootBridge } from '../services/chatwoot-bridge.service.js';
const channelWorkspace=(ctx,health)=>chatwootBridge[health?'checkHealth':'status'](ctx.tenantId);
const teamAuth=express.Router();teamAuth.use(authTeam,async(req,res,next)=>{
 try{
  const {rows:[user]}=await pool.query('SELECT organization_uid,role,"isAdmin",status FROM users WHERE id=$1',[req.teamUser.id]);
  const identity=authoritativeTeamWorkspaceIdentity(user);
  req.workspaceTeamIdentity=identity;req.teamUser.isAdmin=identity.isAdmin;req.teamUser.role=identity.role;
  next();
 }catch(error){res.status(error.statusCode||503).json({success:false,message:'Team communication access unavailable'});}
},requirePermission('Chat Dashboard Access'));
export const teamCommunicationWorkspace=buildCommunicationWorkspaceRouter({pool,authenticate:teamAuth,channelWorkspace,
 resolveScope:async req=>{
  return resolveWorkspaceScope(pool,{userId:req.teamUser.id,tenantUid:req.workspaceTeamIdentity.tenantUid});
 }});
export const adminCommunicationWorkspace=buildCommunicationWorkspaceRouter({pool,authenticate:adminMiddleware,channelWorkspace,
 resolveScope:req=>resolveWorkspaceScope(pool,{userId:req.admin.id,tenantUid:req.query.tenantUid,platformAdmin:true})});

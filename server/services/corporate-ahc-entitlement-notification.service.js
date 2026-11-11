import emailService from './emailService.js';
import notificationService from './notification.service.js';
import whatsappProductionService from './whatsapp-production.service.js';
import { postgresSequelize as db } from '../db/postgres-sequelize.js';
import { ahcInvitationMessage } from './corporate-ahc-message-templates.service.js';
import { mailAttachmentsForCategory } from './team-email-template-attachments.service.js';

const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const title={invitation:'Your Annual Health Checkup is available',extension:'Your Annual Health Checkup validity has been extended',reminder_15:'15 days left to use your Annual Health Checkup',reminder_7:'7 days left to use your Annual Health Checkup',reminder_3:'3 days left to use your Annual Health Checkup',reminder_1:'Final reminder: your Annual Health Checkup expires tomorrow'};

/** Sends one idempotent, employee-specific AHC notice. Provider failures are recorded, not thrown. */
export async function notifyAhcEntitlement({packageId,userId,eventType='invitation',validTo}) {
  const [claim]=await db.query(`INSERT INTO corporate_ahc_entitlement_notifications(package_id,user_id,event_type,valid_to) VALUES(:packageId,:userId,:eventType,:validTo) ON CONFLICT(package_id,user_id,event_type,valid_to) DO NOTHING RETURNING id`,{replacements:{packageId:String(packageId),userId,eventType,validTo},type:db.QueryTypes.SELECT});
  if(!claim) return {sent:false,duplicate:true};
  const [member]=await db.query(`SELECT u."firstName",u."lastName",u.email,u."phoneNumber",p.name,p."corporateName",uhp."validFrom" FROM users u JOIN corporate_health_package_catalog p ON p.id=:packageId LEFT JOIN user_health_packages uhp ON uhp."userId"=u.id AND uhp."packageId"=CAST(:packageId AS text) AND uhp.status='active' WHERE u.id=:userId ORDER BY uhp."createdAt" DESC NULLS LAST LIMIT 1`,{replacements:{packageId:String(packageId),userId},type:db.QueryTypes.SELECT});
  if(!member) return {sent:false,missing:true};
  const name=[member.firstName,member.lastName].filter(Boolean).join(' ')||'Employee';
  const start=member.validFrom?new Date(`${String(member.validFrom).slice(0,10)}T00:00:00Z`).toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}):'';
  const expiry=new Date(`${validTo}T00:00:00Z`).toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
  // The attachment is resolved BEFORE the body is composed, because the body
  // only refers to the attached booking manual when a file is really going out.
  // Files the Team user attached to the `corporate_ahc` email template ride
  // along with the welcome email. A missing or ambiguous template is not a
  // reason to withhold the notice — the body carries the validity and the
  // booking and app links — but the downgrade is recorded, not silent.
  let attachedFiles=[];
  if(eventType==='invitation'&&member.email) {
    try { const resolved=await mailAttachmentsForCategory('corporate_ahc'); attachedFiles=resolved.attachments; if(resolved.reason!=='ok') console.warn(`[ahc-notify] no template attachment for user ${userId}: ${resolved.reason}`); }
    catch (error) { console.warn('[ahc-notify] template attachment lookup failed:',error.message); }
  }
  const invitation=ahcInvitationMessage({employeeName:name,corporateName:member.corporateName,programName:member.name,validFrom:start,validTo:expiry,attachmentName:attachedFiles[0]?.filename||null});
  const subject=eventType==='invitation'?invitation.subject:(title[eventType]||title.invitation);
  const text=eventType==='invitation'?invitation.text:`Dear ${name}, your ${member.name} is available for one use only. Please book and complete it on or before ${expiry}. After this date it cannot be used. Open https://app.mediqzy.com/health-checkups`;
  let emailStatus='not_applicable',whatsappStatus='not_applicable';
  if(member.email) {
    try {
      await emailService.sendOutboundEmail(1,{to:member.email,subject,htmlContent:eventType==='invitation'?invitation.html:`<p>${esc(text)}</p>`,attachments:attachedFiles.length?attachedFiles:undefined});
      emailStatus=eventType==='invitation'&&!attachedFiles.length?'sent_no_file':'sent';
    } catch { emailStatus='failed'; }
  }
  if(member.phoneNumber) { try {
    if(eventType==='invitation'&&whatsappProductionService.provider==='gupshup') {
      await whatsappProductionService.sendAhcWelcome({to:member.phoneNumber,employeeName:name,corporateName:member.corporateName||member.name,validTo:expiry});
      whatsappStatus='sent';
    } else {
      const sent=await notificationService.sendWhatsApp(userId,'patient',subject,text);
      whatsappStatus=sent?.success?'sent':'failed';
    }
  } catch (error) { whatsappStatus=eventType==='invitation'&&whatsappProductionService.provider==='gupshup'&&/AHC_WELCOME/.test(error.message)?'pending_template_approval':'failed'; } }
  await db.query(`UPDATE corporate_ahc_entitlement_notifications SET email_status=:emailStatus,whatsapp_status=:whatsappStatus,sent_at=NOW() WHERE id=:id`,{replacements:{id:claim.id,emailStatus,whatsappStatus},type:db.QueryTypes.UPDATE});
  return {sent:emailStatus.startsWith('sent')||whatsappStatus==='sent',emailStatus,whatsappStatus,attachments:attachedFiles.map(f=>f.filename)};
}

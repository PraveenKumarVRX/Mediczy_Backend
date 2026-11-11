import emailService from './emailService.js';
import notificationService from './notification.service.js';
import whatsappProductionService from './whatsapp-production.service.js';
import { postgresSequelize as db } from '../db/postgres-sequelize.js';
import { ahcInvitationMessage } from './corporate-ahc-message-templates.service.js';
import { mailAttachmentsForCategory } from './team-email-template-attachments.service.js';
import { recordSentEmail, teamMemberForCategory } from './team-sent-folder.service.js';

const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/** Undo the idempotency claim when nothing was sent, so a retry is possible. */
async function releaseClaim(id) {
  try { await db.query(`DELETE FROM corporate_ahc_entitlement_notifications WHERE id=:id`,{replacements:{id},type:db.QueryTypes.DELETE}); }
  catch (error) { console.warn('[ahc-notify] could not release the notification claim:',error.message); }
}

const title={invitation:'Your Annual Health Checkup is available',extension:'Your Annual Health Checkup validity has been extended',reminder_15:'15 days left to use your Annual Health Checkup',reminder_7:'7 days left to use your Annual Health Checkup',reminder_3:'3 days left to use your Annual Health Checkup',reminder_1:'Final reminder: your Annual Health Checkup expires tomorrow'};

/** Sends one idempotent, employee-specific AHC notice. Provider failures are recorded, not thrown. */
export async function notifyAhcEntitlement({packageId,userId,eventType='invitation',validTo}) {
  const [claim]=await db.query(`INSERT INTO corporate_ahc_entitlement_notifications(package_id,user_id,event_type,valid_to) VALUES(:packageId,:userId,:eventType,:validTo) ON CONFLICT(package_id,user_id,event_type,valid_to) DO NOTHING RETURNING id`,{replacements:{packageId:String(packageId),userId,eventType,validTo},type:db.QueryTypes.SELECT});
  if(!claim) return {sent:false,duplicate:true};
  // The employer's name comes from corporates."companyName" through the
  // package's corporate_id. corporate_health_package_catalog has no
  // "corporateName" column — selecting one made every send throw 42703, which
  // is why corporate_ahc_entitlement_notifications held nothing at all.
  let member;
  try {
    [member]=await db.query(`SELECT u."firstName",u."lastName",u.email,u."phoneNumber",p.name,c."companyName" AS "corporateName",uhp."validFrom" FROM users u JOIN corporate_health_package_catalog p ON p.id=:packageId LEFT JOIN corporates c ON c.id=p.corporate_id LEFT JOIN user_health_packages uhp ON uhp."userId"=u.id AND uhp."packageId"=CAST(:packageId AS text) AND uhp.status='active' WHERE u.id=:userId ORDER BY uhp."createdAt" DESC NULLS LAST LIMIT 1`,{replacements:{packageId:String(packageId),userId},type:db.QueryTypes.SELECT});
  } catch (error) {
    // Nothing was sent, so the claim must not stand: leaving it would make the
    // unique (package,user,event,valid_to) guard refuse every later attempt as
    // a duplicate, and the employee would never be told.
    await releaseClaim(claim.id);
    throw error;
  }
  if(!member) { await releaseClaim(claim.id); return {sent:false,missing:true}; }
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
  const invitation=ahcInvitationMessage({employeeName:name,corporateName:member.corporateName,programName:member.name,validFrom:start,validTo:expiry,attachmentName:attachedFiles[0]?.filename||null,loginEmail:member.email,loginPhone:member.phoneNumber});
  const subject=eventType==='invitation'?invitation.subject:(title[eventType]||title.invitation);
  const text=eventType==='invitation'?invitation.text:`Dear ${name}, your ${member.name} is available for one use only. Please book and complete it on or before ${expiry}. After this date it cannot be used. Open https://app.mediqzy.com/health-checkups`;
  let emailStatus='not_applicable',whatsappStatus='not_applicable';
  if(member.email) {
    const htmlContent=eventType==='invitation'?invitation.html:`<p>${esc(text)}</p>`;
    try {
      const sent=await emailService.sendOutboundEmail(1,{to:member.email,subject,htmlContent,attachments:attachedFiles.length?attachedFiles:undefined});
      emailStatus=eventType==='invitation'&&!attachedFiles.length?'sent_no_file':'sent';
      // Put it in the Team Sent folder. Automated mail used to leave no trace a
      // human could see, so the desk was told it had gone and found nothing.
      await recordSentEmail({
        teamMemberId: await teamMemberForCategory('corporate_ahc'),
        to: member.email, subject, htmlBody: htmlContent, textBody: text,
        messageId: sent?.messageId || null, attachments: attachedFiles,
        labels: ['sent', 'ahc', eventType],
      });
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
  // Recording must never discard the fact that mail was already sent. The
  // status column was VARCHAR(20) while the code writes a 25-character value,
  // so this UPDATE used to throw after a successful delivery and the row stayed
  // 'pending'. Clamped as well as widened (20261111000700), and a recording
  // failure is now logged loudly rather than thrown.
  const clamp=(v)=>String(v??'').slice(0,40);
  try {
    await db.query(`UPDATE corporate_ahc_entitlement_notifications SET email_status=:emailStatus,whatsapp_status=:whatsappStatus,sent_at=NOW() WHERE id=:id`,{replacements:{id:claim.id,emailStatus:clamp(emailStatus),whatsappStatus:clamp(whatsappStatus)},type:db.QueryTypes.UPDATE});
  } catch (error) {
    console.error(`[ahc-notify] SENT but NOT RECORDED for user ${userId} (claim ${claim.id}, email=${emailStatus}, whatsapp=${whatsappStatus}): ${error.message}`);
  }
  return {sent:emailStatus.startsWith('sent')||whatsappStatus==='sent',emailStatus,whatsappStatus,attachments:attachedFiles.map(f=>f.filename)};
}

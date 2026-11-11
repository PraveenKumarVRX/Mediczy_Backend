import emailService from './emailService.js';
import notificationService from './notification.service.js';
import { postgresSequelize as db } from '../db/postgres-sequelize.js';

const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const title={invitation:'Your Annual Health Checkup is available',extension:'Your Annual Health Checkup validity has been extended',reminder_15:'15 days left to use your Annual Health Checkup',reminder_7:'7 days left to use your Annual Health Checkup',reminder_3:'3 days left to use your Annual Health Checkup',reminder_1:'Final reminder: your Annual Health Checkup expires tomorrow'};

/** Sends one idempotent, employee-specific AHC notice. Provider failures are recorded, not thrown. */
export async function notifyAhcEntitlement({packageId,userId,eventType='invitation',validTo}) {
  const [claim]=await db.query(`INSERT INTO corporate_ahc_entitlement_notifications(package_id,user_id,event_type,valid_to) VALUES(:packageId,:userId,:eventType,:validTo) ON CONFLICT(package_id,user_id,event_type,valid_to) DO NOTHING RETURNING id`,{replacements:{packageId:String(packageId),userId,eventType,validTo},type:db.QueryTypes.SELECT});
  if(!claim) return {sent:false,duplicate:true};
  const [member]=await db.query(`SELECT u."firstName",u."lastName",u.email,u."phoneNumber",p.name FROM users u JOIN corporate_health_package_catalog p ON p.id=:packageId WHERE u.id=:userId`,{replacements:{packageId:String(packageId),userId},type:db.QueryTypes.SELECT});
  if(!member) return {sent:false,missing:true};
  const name=[member.firstName,member.lastName].filter(Boolean).join(' ')||'Employee';
  const expiry=new Date(`${validTo}T00:00:00Z`).toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
  const subject=title[eventType]||title.invitation;
  const text=`Dear ${name}, your ${member.name} is available for one use only. Please book and complete it on or before ${expiry}. After this date it cannot be used. Open https://app.mediqzy.com/health-checkups`;
  let emailStatus='not_applicable',whatsappStatus='not_applicable';
  if(member.email) { try { await emailService.sendOutboundEmail(1,{to:member.email,subject,htmlContent:`<p>${esc(text)}</p>`}); emailStatus='sent'; } catch { emailStatus='failed'; } }
  if(member.phoneNumber) { try { const sent=await notificationService.sendWhatsApp(userId,'patient',subject,text); whatsappStatus=sent?.success?'sent':'failed'; } catch { whatsappStatus='failed'; } }
  await db.query(`UPDATE corporate_ahc_entitlement_notifications SET email_status=:emailStatus,whatsapp_status=:whatsappStatus,sent_at=NOW() WHERE id=:id`,{replacements:{id:claim.id,emailStatus,whatsappStatus},type:db.QueryTypes.UPDATE});
  return {sent:emailStatus==='sent'||whatsappStatus==='sent',emailStatus,whatsappStatus};
}

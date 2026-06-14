import AdminCopilot from './AdminCopilot';

/** Clinical oversight copilot — medical director / super_admin only (route-gated). */
export default function AdminClinicalCopilot() {
  return <AdminCopilot defaultPersona="clinical" lockPersona />;
}

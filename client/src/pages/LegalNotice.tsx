import { Link, useLocation } from 'react-router-dom';
import { BRAND } from '@/config/brand';

export default function LegalNotice() {
  const { pathname } = useLocation();
  const terms = pathname === '/terms' || pathname === '/terms-of-service';
  const compliance = pathname === '/compliance';
  return <main className="mx-auto max-w-3xl space-y-5 p-6 text-foreground bg-background">
    <Link to="/" className="underline">Back to Mediqzy</Link>
    <h1 className="text-3xl font-bold">{terms ? 'Terms of Service' : compliance ? 'Privacy & Data Rights' : 'Privacy Policy'}</h1>
    <p>Effective 28 October 2026</p>
    {terms ? <>
      <h2 className="text-xl font-semibold">Using Mediqzy</h2><p>Mediqzy provides access to appointments, health records, wellness tools and services offered by healthcare providers. Keep your account details accurate and protect your sign-in credentials. Access only records you are authorized to use.</p>
      <h2 className="text-xl font-semibold">Healthcare and AI tools</h2><p>AI summaries, wellness scores and educational content can be incomplete or incorrect. They do not establish a diagnosis or replace professional care. Contact your clinician for medical decisions. In an emergency in India, call 112 or 108.</p>
      <h2 className="text-xl font-semibold">Bookings, payments and benefits</h2><p>Provider availability and confirmation determine whether a booking can proceed. Review the price, payment status, cancellation conditions and applicable plan limits before purchasing. Employer benefits depend on your assigned plan. Contact support about payment discrepancies, cancellations or refunds.</p>
      <h2 className="text-xl font-semibold">Support</h2><p>For account or service concerns, contact <a className="underline" href={`mailto:${BRAND.support.email}`}>{BRAND.support.email}</a>.</p>
    </> : <>
      <h2 className="text-xl font-semibold">Information processed</h2><p>When you use Mediqzy, your account and contact details, profile, appointments, prescriptions, uploaded reports, health diary entries, payments and selected device readings may be processed to provide the features you use.</p>
      <h2 className="text-xl font-semibold">Health records and AI analysis</h2><p>Uploaded reports and their analysis may be saved in your health record and health diary. Reports are not automatically discarded after analysis. When you request AI features, relevant inputs may be processed by the AI services used to provide that feature. Avoid including information about other people without authorization.</p>
      <h2 className="text-xl font-semibold">Access and service providers</h2><p>Relevant information is made available to the care providers and service partners involved in the services you request. Payment providers process checkout details. Access depends on your account role, care relationship and service permissions.</p>
      <h2 className="text-xl font-semibold">Retention and your choices</h2><p>Records may be retained to support your care, account operation, billing and applicable record-keeping obligations. Contact support to request access, correction, export or deletion of your data, withdraw consent or raise a privacy concern. Some records may need to be retained where required by law.</p>
      <h2 className="text-xl font-semibold">Privacy contact</h2><p>Email <a className="underline" href={`mailto:${BRAND.support.email}?subject=Privacy%20request`}>{BRAND.support.email}</a> with your request. Do not send passwords or payment credentials. This notice does not represent a certification of HIPAA or DPDP compliance.</p>
    </>}
    <nav className="flex flex-wrap gap-4"><Link className="underline" to="/privacy">Privacy Policy</Link><Link className="underline" to="/terms">Terms of Service</Link><Link className="underline" to="/contact-us">Contact Us</Link></nav>
  </main>;
}

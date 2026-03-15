/**
 * AccountsModulePages — placeholder sub-pages for the Accounts portal.
 * Each export is lazy-loaded via lazyNamed() in routes/index.tsx.
 */
import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DollarSign, Receipt, CreditCard, Banknote, ShieldCheck,
  Wallet, Users, ClipboardList, TrendingUp, BarChart3,
  Settings, HelpCircle, PlusCircle, Download,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const navSections: DeptNavSection[] = [
  { title: 'Overview', items: [{ icon: DollarSign, label: 'Dashboard', href: '/accounts/dashboard' }] },
  { title: 'Billing & Payments', items: [
    { icon: Receipt,    label: 'Bill Generation',  href: '/accounts/bills' },
    { icon: CreditCard, label: 'Patient Accounts', href: '/accounts/patient-accounts' },
    { icon: Banknote,   label: 'Payments',         href: '/accounts/payments' },
    { icon: ShieldCheck,label: 'Insurance Billing',href: '/accounts/insurance-billing' },
  ]},
  { title: 'Finance', items: [
    { icon: Wallet,       label: 'Expenses',      href: '/accounts/expenses' },
    { icon: Users,        label: 'Payroll',       href: '/accounts/payroll' },
    { icon: ClipboardList,label: 'Ledger',        href: '/accounts/ledger' },
    { icon: TrendingUp,   label: 'Reports',       href: '/accounts/reports' },
  ]},
  { title: 'System', items: [
    { icon: BarChart3,  label: 'Analytics', href: '/accounts/analytics' },
    { icon: Settings,   label: 'Settings',  href: '/accounts/settings' },
    { icon: HelpCircle, label: 'Support',   href: '/accounts/support' },
  ]},
];

const PlaceholderPage = ({ title, description, icon: Icon, addBtn, onAdd }: {
  title: string; description: string; icon: React.ElementType;
  addBtn?: string; onAdd?: () => void;
}) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between pb-3">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-teal-50 dark:bg-teal-950">
          <Icon className="h-5 w-5 text-teal-600" />
        </div>
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export</Button>
        {addBtn && <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700" onClick={onAdd}><PlusCircle className="h-4 w-4" />{addBtn}</Button>}
      </div>
    </CardHeader>
    <CardContent>
      <div className="h-64 flex items-center justify-center border-2 border-dashed rounded-xl text-muted-foreground">
        <div className="text-center">
          <Icon className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs mt-1">Data loads from backend API</p>
        </div>
      </div>
    </CardContent>
  </Card>
);

const wrap = (deptKey: string, deptName: string, badgeLabel: string, title: string, subtitle: string, content: React.ReactNode) => {
  const Comp = () => {
    const navigate = useNavigate();
    return (
      <HospDeptLayout deptKey={deptKey} deptName={deptName} badgeLabel={badgeLabel}
        loginPath={`/${deptKey}/login`} DeptIcon={DollarSign} navSections={navSections}
        title={title} subtitle={subtitle}>
        {content}
      </HospDeptLayout>
    );
  };
  return Comp;
};

export const AccountsBillsPage       = () => { const n = useNavigate(); return <HospDeptLayout deptKey="accounts" deptName="Accounts" badgeLabel="Accounts" loginPath="/accounts/login" DeptIcon={DollarSign} navSections={navSections} title="Bill Generation" subtitle="Create & manage patient bills"><PlaceholderPage title="Bill Generation" description="Create new bills and manage invoices" icon={Receipt} addBtn="New Bill" onAdd={() => n('/accounts/bills')} /></HospDeptLayout>; };
export const AccountsPaymentsPage    = () => <HospDeptLayout deptKey="accounts" deptName="Accounts" badgeLabel="Accounts" loginPath="/accounts/login" DeptIcon={DollarSign} navSections={navSections} title="Payments Received" subtitle="Track all incoming payments"><PlaceholderPage title="Payments Received" description="Record and reconcile payments" icon={Banknote} addBtn="Record Payment" /></HospDeptLayout>;
export const AccountsPatientAcctsPage= () => <HospDeptLayout deptKey="accounts" deptName="Accounts" badgeLabel="Accounts" loginPath="/accounts/login" DeptIcon={DollarSign} navSections={navSections} title="Patient Accounts" subtitle="Patient ledger & outstanding"><PlaceholderPage title="Patient Accounts" description="View patient account details and history" icon={CreditCard} /></HospDeptLayout>;
export const AccountsInsuranceBillingPage = () => <HospDeptLayout deptKey="accounts" deptName="Accounts" badgeLabel="Accounts" loginPath="/accounts/login" DeptIcon={DollarSign} navSections={navSections} title="Insurance Billing" subtitle="TPA & insurance receivables"><PlaceholderPage title="Insurance Billing" description="Track and follow-up insurance payments" icon={ShieldCheck} addBtn="New Claim" /></HospDeptLayout>;
export const AccountsExpensesPage    = () => <HospDeptLayout deptKey="accounts" deptName="Accounts" badgeLabel="Accounts" loginPath="/accounts/login" DeptIcon={DollarSign} navSections={navSections} title="Expense Management" subtitle="Departmental & operational expenses"><PlaceholderPage title="Expense Management" description="Record and approve expenses" icon={Wallet} addBtn="New Expense" /></HospDeptLayout>;
export const AccountsPayrollPage     = () => <HospDeptLayout deptKey="accounts" deptName="Accounts" badgeLabel="Accounts" loginPath="/accounts/login" DeptIcon={DollarSign} navSections={navSections} title="Payroll" subtitle="Staff salary & deductions"><PlaceholderPage title="Payroll" description="Process and manage staff payroll" icon={Users} addBtn="Run Payroll" /></HospDeptLayout>;
export const AccountsLedgerPage      = () => <HospDeptLayout deptKey="accounts" deptName="Accounts" badgeLabel="Accounts" loginPath="/accounts/login" DeptIcon={DollarSign} navSections={navSections} title="Ledger" subtitle="General & subsidiary ledger"><PlaceholderPage title="Ledger" description="View and post ledger entries" icon={ClipboardList} /></HospDeptLayout>;
export const AccountsReportsPage     = () => <HospDeptLayout deptKey="accounts" deptName="Accounts" badgeLabel="Accounts" loginPath="/accounts/login" DeptIcon={DollarSign} navSections={navSections} title="Financial Reports" subtitle="P&L, balance sheet, MIS"><PlaceholderPage title="Financial Reports" description="Generate and export financial statements" icon={TrendingUp} addBtn="Generate" /></HospDeptLayout>;
export const AccountsAnalyticsPage   = () => <HospDeptLayout deptKey="accounts" deptName="Accounts" badgeLabel="Accounts" loginPath="/accounts/login" DeptIcon={DollarSign} navSections={navSections} title="Analytics" subtitle="Financial trends & KPIs"><PlaceholderPage title="Analytics" description="Revenue trends and financial analytics" icon={BarChart3} /></HospDeptLayout>;
export const AccountsSettingsPage    = () => <HospDeptLayout deptKey="accounts" deptName="Accounts" badgeLabel="Accounts" loginPath="/accounts/login" DeptIcon={DollarSign} navSections={navSections} title="Settings" subtitle="Portal configuration"><PlaceholderPage title="Settings" description="Configure accounts portal settings" icon={Settings} /></HospDeptLayout>;
export const AccountsSupportPage     = () => <HospDeptLayout deptKey="accounts" deptName="Accounts" badgeLabel="Accounts" loginPath="/accounts/login" DeptIcon={DollarSign} navSections={navSections} title="Help & Support" subtitle="Get assistance"><PlaceholderPage title="Help & Support" description="Contact support or view documentation" icon={HelpCircle} /></HospDeptLayout>;

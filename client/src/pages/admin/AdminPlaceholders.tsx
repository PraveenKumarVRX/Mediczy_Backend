import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import CRMPage from './CRMPage';

const AdminPlaceholder = ({ title, description }: { title: string; description: string }) => {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold">{title}</h2>
          <p className="text-muted-foreground">{description}</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Coming Soon</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              This section is under development. Check back soon for full functionality.
            </p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export const UsersManagement = () => <AdminPlaceholder title="Users Management" description="Manage internal users and their access" />;
export const LabsManagement = () => <AdminPlaceholder title="Labs Management" description="Manage diagnostic laboratories" />;
export const PharmaciesManagement = () => <AdminPlaceholder title="Pharmacies Management" description="Manage pharmacy locations" />;
export const CorporatesManagement = () => <AdminPlaceholder title="Corporates Management" description="Manage corporate clients" />;
export const ReportsPage = () => <AdminPlaceholder title="Reports & Analytics" description="View comprehensive reports" />;
export { CRMPage };
export const SettingsPage = () => <AdminPlaceholder title="Settings" description="System configuration" />;

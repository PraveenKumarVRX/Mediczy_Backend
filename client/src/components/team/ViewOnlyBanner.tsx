import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Eye, Lock, Shield } from 'lucide-react';

interface ViewOnlyBannerProps {
  canEdit?: boolean;
  canDelete?: boolean;
  moduleName?: string;
}

const ViewOnlyBanner = ({ canEdit = false, canDelete = false, moduleName }: ViewOnlyBannerProps) => {
  // If user has full access, don't show banner
  if (canEdit && canDelete) {
    return null;
  }

  const getAccessLevel = () => {
    if (!canEdit && !canDelete) return 'View Only';
    if (canEdit && !canDelete) return 'View & Edit';
    return 'Limited Access';
  };

  const getIcon = () => {
    if (!canEdit && !canDelete) return Eye;
    if (canEdit && !canDelete) return Shield;
    return Lock;
  };

  const Icon = getIcon();
  const accessLevel = getAccessLevel();

  return (
    <Alert className="mb-4 bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800">
      <Icon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
      <AlertDescription className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-blue-800 dark:text-blue-200">
            {moduleName ? `${moduleName}: ` : ''}
            <strong>{accessLevel} Access</strong>
          </span>
          <div className="flex gap-2">
            {!canEdit && (
              <Badge variant="outline" className="bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300">
                <Lock className="h-3 w-3 mr-1" />
                No Edit
              </Badge>
            )}
            {!canDelete && (
              <Badge variant="outline" className="bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300">
                <Lock className="h-3 w-3 mr-1" />
                No Delete
              </Badge>
            )}
          </div>
        </div>
        <span className="text-xs text-muted-foreground">
          Contact admin for edit permissions
        </span>
      </AlertDescription>
    </Alert>
  );
};

export default ViewOnlyBanner;

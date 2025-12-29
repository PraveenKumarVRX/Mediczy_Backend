import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, Filter, Download, Plus, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getModuleColors } from '@/constants/admin-branding';

export interface PageAction {
  label: string;
  icon?: React.ComponentType<any>;
  onClick?: () => void;
  variant?: 'default' | 'outline' | 'secondary' | 'destructive' | 'ghost';
  primary?: boolean;
  loading?: boolean;
  disabled?: boolean;
}

export interface AdminPageHeaderProps {
  /** Page title */
  title: string;
  /** Page description/subtitle */
  description?: string;
  /** Icon component to display */
  icon: React.ComponentType<any>;
  /** Module key from branding constants for consistent colors */
  moduleKey?: string;
  /** Custom color classes (overrides moduleKey) */
  colors?: {
    text: string;
    bg: string;
    border: string;
    gradient?: string;
  };
  /** Badge to show next to title (e.g., "Beta", "New") */
  badge?: string;
  /** Action buttons to display */
  actions?: PageAction[];
  /** Show search bar */
  showSearch?: boolean;
  /** Search placeholder */
  searchPlaceholder?: string;
  /** Search value */
  searchValue?: string;
  /** Search change handler */
  onSearchChange?: (value: string) => void;
  /** Show filter button */
  showFilter?: boolean;
  /** Filter click handler */
  onFilterClick?: () => void;
  /** Show export button */
  showExport?: boolean;
  /** Export click handler */
  onExportClick?: () => void;
  /** Show refresh button */
  showRefresh?: boolean;
  /** Refresh click handler */
  onRefreshClick?: () => void;
  /** Is loading/refreshing */
  isLoading?: boolean;
  /** Additional class names */
  className?: string;
  /** Children to render in the header (custom content) */
  children?: React.ReactNode;
}

export default function AdminPageHeader({
  title,
  description,
  icon: Icon,
  moduleKey,
  colors: customColors,
  badge,
  actions,
  showSearch = false,
  searchPlaceholder = 'Search...',
  searchValue = '',
  onSearchChange,
  showFilter = false,
  onFilterClick,
  showExport = false,
  onExportClick,
  showRefresh = false,
  onRefreshClick,
  isLoading = false,
  className,
  children,
}: AdminPageHeaderProps) {
  // Get colors from module key or use custom colors
  const colors = customColors || (moduleKey ? getModuleColors(moduleKey as any) : {
    text: 'text-blue-500',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    gradient: 'from-blue-500 to-blue-600',
  });

  return (
    <div className={cn('space-y-4', className)}>
      {/* Main Header Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Title Section */}
        <div className="flex items-start gap-4">
          <div className={cn(
            'p-3 rounded-xl bg-gradient-to-br border shadow-sm',
            colors.bg,
            colors.border
          )}>
            <Icon className={cn('h-6 w-6', colors.text)} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                {title}
              </h1>
              {badge && (
                <Badge variant="secondary" className="text-xs bg-blue-500 text-white">
                  {badge}
                </Badge>
              )}
            </div>
            {description && (
              <p className="text-muted-foreground text-sm md:text-base mt-0.5">
                {description}
              </p>
            )}
          </div>
        </div>

        {/* Actions Section */}
        {actions && actions.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {actions.map((action, index) => {
              const ActionIcon = action.icon;
              return (
                <Button
                  key={index}
                  variant={action.primary ? 'default' : action.variant || 'outline'}
                  size="sm"
                  onClick={action.onClick}
                  disabled={action.disabled || action.loading}
                  className={cn(
                    'gap-2',
                    action.primary && 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700'
                  )}
                >
                  {ActionIcon && (
                    <ActionIcon className={cn('h-4 w-4', action.loading && 'animate-spin')} />
                  )}
                  {action.label}
                </Button>
              );
            })}
          </div>
        )}
      </div>

      {/* Search and Filter Row */}
      {(showSearch || showFilter || showExport || showRefresh || children) && (
        <div className="flex flex-col sm:flex-row gap-3">
          {showSearch && (
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={searchPlaceholder}
                value={searchValue}
                onChange={(e) => onSearchChange?.(e.target.value)}
                className="pl-9 bg-background"
              />
            </div>
          )}
          
          {children}

          <div className="flex items-center gap-2">
            {showFilter && (
              <Button variant="outline" size="default" className="gap-2" onClick={onFilterClick}>
                <Filter className="h-4 w-4" />
                Filters
              </Button>
            )}
            
            {showExport && (
              <Button variant="outline" size="default" className="gap-2" onClick={onExportClick}>
                <Download className="h-4 w-4" />
                Export
              </Button>
            )}
            
            {showRefresh && (
              <Button 
                variant="outline" 
                size="icon" 
                onClick={onRefreshClick}
                disabled={isLoading}
              >
                <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Export a simpler version for quick use
export function SimplePageHeader({ 
  title, 
  description, 
  icon,
  moduleKey,
}: Pick<AdminPageHeaderProps, 'title' | 'description' | 'icon' | 'moduleKey'>) {
  return (
    <AdminPageHeader
      title={title}
      description={description}
      icon={icon}
      moduleKey={moduleKey}
    />
  );
}

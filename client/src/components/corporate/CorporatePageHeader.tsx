import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Download, RefreshCw, Plus, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';

type BadgeVariant = 'emerald' | 'blue' | 'amber' | 'red' | 'purple' | 'teal' | 'default';

interface BadgeConfig {
  text: string;
  variant?: BadgeVariant;
}

interface CorporatePageHeaderProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  gradient?: string;
  badge?: string | number | BadgeConfig;
  showSearch?: boolean;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  showRefresh?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  showAdd?: boolean;
  addLabel?: string;
  onAdd?: () => void;
  showExport?: boolean;
  onExport?: () => void;
  showFilter?: boolean;
  onFilter?: () => void;
  actions?: React.ReactNode;
  stats?: Array<{
    label: string;
    value: string | number;
    icon?: React.ComponentType<{ className?: string }>;
    trend?: 'up' | 'down' | 'stable';
    trendValue?: string;
  }>;
}

const CorporatePageHeader: React.FC<CorporatePageHeaderProps> = ({
  icon: Icon,
  title,
  description,
  gradient = 'from-blue-600 to-indigo-700',
  badge,
  showSearch = false,
  searchPlaceholder = 'Search...',
  searchValue = '',
  onSearchChange,
  showRefresh = false,
  onRefresh,
  isRefreshing = false,
  showAdd = false,
  addLabel = 'Add New',
  onAdd,
  showExport = false,
  onExport,
  showFilter = false,
  onFilter,
  actions,
  stats,
}) => {
  return (
    <div className="space-y-6 mb-6">
      {/* Hero Header */}
      <div className={cn(
        "relative overflow-hidden rounded-2xl bg-gradient-to-r p-6 md:p-8 text-white shadow-xl",
        gradient
      )}>
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNiIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiLz48L2c+PC9zdmc+')] opacity-30" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-white/10 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-white/5 to-transparent rounded-full blur-2xl" />
        
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center shadow-lg">
              <Icon className="w-7 h-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl md:text-3xl font-bold">{title}</h1>
                {badge !== undefined && (
                  <Badge className={cn(
                    "font-medium",
                    typeof badge === 'object' && badge.variant === 'emerald' 
                      ? "bg-emerald-500/20 text-emerald-100 border-emerald-500/30"
                      : typeof badge === 'object' && badge.variant === 'amber'
                      ? "bg-amber-500/20 text-amber-100 border-amber-500/30"
                      : typeof badge === 'object' && badge.variant === 'red'
                      ? "bg-red-500/20 text-red-100 border-red-500/30"
                      : typeof badge === 'object' && badge.variant === 'purple'
                      ? "bg-purple-500/20 text-purple-100 border-purple-500/30"
                      : typeof badge === 'object' && badge.variant === 'teal'
                      ? "bg-teal-500/20 text-teal-100 border-teal-500/30"
                      : "bg-white/20 text-white border-white/30"
                  )}>
                    {typeof badge === 'object' ? badge.text : badge}
                  </Badge>
                )}
              </div>
              <p className="text-white/80 text-sm md:text-base">{description}</p>
            </div>
          </div>
          
          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            {showRefresh && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="bg-white/10 hover:bg-white/20 text-white border-white/20 hover:border-white/30"
              >
                <RefreshCw className={cn("w-4 h-4 mr-2", isRefreshing && "animate-spin")} />
                Refresh
              </Button>
            )}
            {showExport && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={onExport}
                className="bg-white/10 hover:bg-white/20 text-white border-white/20 hover:border-white/30"
              >
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            )}
            {showAdd && (
              <Button 
                size="sm"
                onClick={onAdd}
                className="bg-white text-blue-700 hover:bg-white/90 shadow-lg"
              >
                <Plus className="w-4 h-4 mr-2" />
                {addLabel}
              </Button>
            )}
            {actions}
          </div>
        </div>
        
        {/* Stats Row */}
        {stats && stats.length > 0 && (
          <div className="relative mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.map((stat, index) => (
              <div 
                key={index}
                className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white/70 text-sm">{stat.label}</span>
                  {stat.icon && <stat.icon className="w-4 h-4 text-white/50" />}
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-white">{stat.value}</span>
                  {stat.trend && stat.trendValue && (
                    <span className={cn(
                      "text-xs font-medium",
                      stat.trend === 'up' && "text-emerald-300",
                      stat.trend === 'down' && "text-red-300",
                      stat.trend === 'stable' && "text-white/60"
                    )}>
                      {stat.trend === 'up' && '↑'}
                      {stat.trend === 'down' && '↓'}
                      {stat.trendValue}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Search and Filter Bar */}
      {(showSearch || showFilter) && (
        <div className="flex flex-col sm:flex-row gap-3">
          {showSearch && (
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder={searchPlaceholder}
                value={searchValue}
                onChange={(e) => onSearchChange?.(e.target.value)}
                className="pl-10 bg-white border-gray-200 focus:border-blue-300 focus:ring-blue-200"
              />
            </div>
          )}
          {showFilter && (
            <Button 
              variant="outline" 
              onClick={onFilter}
              className="border-gray-200 hover:bg-gray-50"
            >
              <Filter className="w-4 h-4 mr-2" />
              Filters
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default CorporatePageHeader;

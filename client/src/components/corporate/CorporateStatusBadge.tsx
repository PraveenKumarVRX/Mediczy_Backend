import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertTriangle, 
  AlertCircle,
  Activity,
  Shield,
  Pause
} from 'lucide-react';
import { 
  getStatusColor, 
  getRiskColor, 
  getPriorityColor 
} from '@/constants/corporate-branding';

type BadgeType = 'status' | 'risk' | 'priority' | 'health';

interface CorporateStatusBadgeProps {
  value: string;
  type?: BadgeType;
  showIcon?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const statusIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  // Status
  active: CheckCircle,
  approved: CheckCircle,
  completed: CheckCircle,
  resolved: CheckCircle,
  paid: CheckCircle,
  
  inactive: Pause,
  cancelled: XCircle,
  rejected: XCircle,
  closed: XCircle,
  
  pending: Clock,
  scheduled: Clock,
  processing: Activity,
  'in-progress': Activity,
  
  'no-show': AlertCircle,
  open: AlertCircle,
  
  // Health
  excellent: Shield,
  good: CheckCircle,
  moderate: AlertTriangle,
  poor: AlertCircle,
  
  // Risk
  critical: AlertCircle,
  high: AlertTriangle,
  medium: Activity,
  low: CheckCircle,
  
  // Priority
  urgent: AlertCircle,
};

const CorporateStatusBadge: React.FC<CorporateStatusBadgeProps> = ({
  value,
  type = 'status',
  showIcon = true,
  size = 'md',
  className,
}) => {
  const normalizedValue = value?.toLowerCase() || '';
  
  let colors;
  switch (type) {
    case 'risk':
      colors = getRiskColor(normalizedValue);
      break;
    case 'priority':
      colors = getPriorityColor(normalizedValue);
      break;
    case 'health':
    case 'status':
    default:
      colors = getStatusColor(normalizedValue);
  }
  
  const IconComponent = statusIcons[normalizedValue];
  
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  };
  
  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-3.5 h-3.5',
    lg: 'w-4 h-4',
  };
  
  return (
    <Badge 
      variant="outline"
      className={cn(
        colors.bg,
        colors.text,
        colors.border,
        sizeClasses[size],
        'font-medium capitalize',
        className
      )}
    >
      {showIcon && IconComponent && (
        <IconComponent className={cn(iconSizes[size], 'mr-1.5')} />
      )}
      {value?.replace(/-/g, ' ')}
    </Badge>
  );
};

export default CorporateStatusBadge;

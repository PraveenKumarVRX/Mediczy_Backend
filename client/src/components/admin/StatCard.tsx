import { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  color?: 'blue' | 'green' | 'red' | 'amber' | 'purple' | 'emerald' | 'cyan' | 'rose' | 'orange' | 'indigo';
  subtitle?: string;
  trend?: {
    value: string;
    isPositive: boolean;
  };
  className?: string;
}

const colorVariants = {
  blue: {
    gradient: 'from-blue-500/10 via-blue-500/5 to-background',
    text: 'text-blue-600 dark:text-blue-400',
    icon: 'text-blue-600',
    bg: 'bg-blue-500/15',
    hover: 'group-hover:bg-blue-500/20',
    glow: 'from-blue-500/5'
  },
  green: {
    gradient: 'from-green-500/10 via-green-500/5 to-background',
    text: 'text-green-600 dark:text-green-400',
    icon: 'text-green-600',
    bg: 'bg-green-500/15',
    hover: 'group-hover:bg-green-500/20',
    glow: 'from-green-500/5'
  },
  red: {
    gradient: 'from-red-500/10 via-red-500/5 to-background',
    text: 'text-red-600 dark:text-red-400',
    icon: 'text-red-600',
    bg: 'bg-red-500/15',
    hover: 'group-hover:bg-red-500/20',
    glow: 'from-red-500/5'
  },
  amber: {
    gradient: 'from-amber-500/10 via-amber-500/5 to-background',
    text: 'text-amber-600 dark:text-amber-400',
    icon: 'text-amber-600',
    bg: 'bg-amber-500/15',
    hover: 'group-hover:bg-amber-500/20',
    glow: 'from-amber-500/5'
  },
  purple: {
    gradient: 'from-purple-500/10 via-purple-500/5 to-background',
    text: 'text-purple-600 dark:text-purple-400',
    icon: 'text-purple-600',
    bg: 'bg-purple-500/15',
    hover: 'group-hover:bg-purple-500/20',
    glow: 'from-purple-500/5'
  },
  emerald: {
    gradient: 'from-emerald-500/10 via-emerald-500/5 to-background',
    text: 'text-emerald-600 dark:text-emerald-400',
    icon: 'text-emerald-600',
    bg: 'bg-emerald-500/15',
    hover: 'group-hover:bg-emerald-500/20',
    glow: 'from-emerald-500/5'
  },
  cyan: {
    gradient: 'from-cyan-500/10 via-cyan-500/5 to-background',
    text: 'text-cyan-600 dark:text-cyan-400',
    icon: 'text-cyan-600',
    bg: 'bg-cyan-500/15',
    hover: 'group-hover:bg-cyan-500/20',
    glow: 'from-cyan-500/5'
  },
  rose: {
    gradient: 'from-rose-500/10 via-rose-500/5 to-background',
    text: 'text-rose-600 dark:text-rose-400',
    icon: 'text-rose-600',
    bg: 'bg-rose-500/15',
    hover: 'group-hover:bg-rose-500/20',
    glow: 'from-rose-500/5'
  },
  orange: {
    gradient: 'from-orange-500/10 via-orange-500/5 to-background',
    text: 'text-orange-600 dark:text-orange-400',
    icon: 'text-orange-600',
    bg: 'bg-orange-500/15',
    hover: 'group-hover:bg-orange-500/20',
    glow: 'from-orange-500/5'
  },
  indigo: {
    gradient: 'from-indigo-500/10 via-indigo-500/5 to-background',
    text: 'text-indigo-600 dark:text-indigo-400',
    icon: 'text-indigo-600',
    bg: 'bg-indigo-500/15',
    hover: 'group-hover:bg-indigo-500/20',
    glow: 'from-indigo-500/5'
  }
};

const StatCard = ({ 
  title, 
  value, 
  icon: Icon, 
  color = 'blue', 
  subtitle, 
  trend,
  className = '' 
}: StatCardProps) => {
  const variant = colorVariants[color];

  return (
    <Card className={`relative overflow-hidden border-0 bg-gradient-to-br ${variant.gradient} shadow-lg hover:shadow-xl transition-all duration-300 group admin-card ${className}`}>
      <CardContent className="p-4 lg:p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2 flex-1">
            <p className={`text-xs lg:text-sm font-medium ${variant.text} uppercase tracking-wide`}>
              {title}
            </p>
            <p className="text-xl lg:text-2xl font-bold text-foreground group-hover:scale-105 transition-transform duration-200">
              {typeof value === 'number' ? value.toLocaleString() : value}
            </p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">
                {subtitle}
              </p>
            )}
            {trend && (
              <div className={`text-xs flex items-center gap-1 ${
                trend.isPositive ? 'text-green-600' : 'text-red-600'
              }`}>
                <span>{trend.isPositive ? '↗' : '↘'}</span>
                <span>{trend.value}</span>
              </div>
            )}
          </div>
          <div className={`p-3 rounded-xl ${variant.bg} ${variant.hover} transition-colors duration-200 flex-shrink-0`}>
            <Icon className={`h-6 w-6 lg:h-7 lg:w-7 ${variant.icon}`} />
          </div>
        </div>
        <div className={`absolute inset-0 bg-gradient-to-r ${variant.glow} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
      </CardContent>
    </Card>
  );
};

export default StatCard;
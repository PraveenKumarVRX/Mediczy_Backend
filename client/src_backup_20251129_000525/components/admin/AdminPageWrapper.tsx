import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

interface AdminPageWrapperProps {
  children: ReactNode;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  headerActions?: ReactNode;
  stats?: Array<{
    label: string;
    value: string | number;
    color?: string;
  }>;
  className?: string;
}

const AdminPageWrapper = ({ 
  children, 
  title, 
  subtitle, 
  icon: Icon, 
  headerActions,
  stats,
  className = ''
}: AdminPageWrapperProps) => {
  const gradients = [
    'from-blue-600 via-blue-700 to-purple-700',
    'from-emerald-600 via-emerald-700 to-green-700',
    'from-purple-600 via-purple-700 to-pink-700',
    'from-orange-600 via-orange-700 to-red-700',
    'from-cyan-600 via-cyan-700 to-blue-700',
    'from-rose-600 via-rose-700 to-pink-700',
    'from-amber-600 via-amber-700 to-orange-700',
    'from-indigo-600 via-indigo-700 to-purple-700'
  ];
  
  const gradientClass = gradients[Math.floor(Math.random() * gradients.length)];

  return (
    <div className={`min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/20 ${className}`}>
      <div className="space-y-6 lg:space-y-8">
        {/* Enhanced Header */}
        <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${gradientClass} p-6 lg:p-8 text-white shadow-2xl`}>
          <div className="absolute inset-0 bg-black/10" />
          {Icon && (
            <div className="absolute -top-4 -right-4 opacity-10">
              <Icon className="h-32 w-32" />
            </div>
          )}
          <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-3xl lg:text-4xl font-bold mb-2 flex items-center gap-3">
                {Icon && <Icon className="h-8 w-8 lg:h-10 lg:w-10" />}
                {title}
              </h1>
              <p className="text-white/90 text-base lg:text-lg opacity-90">
                {subtitle}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {stats && stats.length > 0 && (
                <div className="hidden lg:flex items-center gap-3">
                  {stats.slice(0, 2).map((stat, index) => (
                    <div key={index} className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                      <div className="text-center">
                        <div className="text-2xl font-bold">{stat.value}</div>
                        <div className="text-xs text-white/70">{stat.label}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {headerActions && (
                <div className="flex items-center gap-2">
                  {headerActions}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-6">
          {children}
        </div>
      </div>
    </div>
  );
};

export default AdminPageWrapper;
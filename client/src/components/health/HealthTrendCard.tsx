import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  TrendingUp, TrendingDown, Minus, Activity, Heart, Footprints, 
  Moon, Droplets, Thermometer, Zap, X, ChevronRight, BarChart3
} from 'lucide-react';
import api from '@/utils/api';

interface TrendData {
  label: string;
  timestamp: string;
  value: number;
  min: number;
  max: number;
  count: number;
}

interface TrendStats {
  average: number;
  minimum: number;
  maximum: number;
  totalReadings: number;
  lastReading: string;
}

interface HealthTrendCardProps {
  dataType: string;
  title: string;
  currentValue: number | string | null;
  unit: string;
  icon: React.ReactNode;
  color: string;
  onClose?: () => void;
}

const periodLabels: Record<string, string> = {
  hour: '24 Hours',
  day: '7 Days',
  week: '4 Weeks',
  month: '12 Months',
  year: '5 Years'
};

export default function HealthTrendCard({ 
  dataType, 
  title, 
  currentValue, 
  unit, 
  icon,
  color,
  onClose 
}: HealthTrendCardProps) {
  const [period, setPeriod] = useState<string>('day');
  const [loading, setLoading] = useState(false);
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [stats, setStats] = useState<TrendStats | null>(null);
  const [trend, setTrend] = useState<{ direction: string; percentage: number }>({ direction: 'stable', percentage: 0 });

  useEffect(() => {
    fetchTrendData();
  }, [dataType, period]);

  const fetchTrendData = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/health-data/trends/${dataType}?period=${period}`);
      setTrendData(response.data.data || []);
      setStats(response.data.stats);
      setTrend(response.data.trend || { direction: 'stable', percentage: 0 });
    } catch (error) {
      console.error('Failed to fetch trend data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTrendIcon = () => {
    switch (trend.direction) {
      case 'up': return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'down': return <TrendingDown className="w-4 h-4 text-red-500" />;
      default: return <Minus className="w-4 h-4 text-gray-500" />;
    }
  };

  const getTrendColor = () => {
    // For some metrics, down is good (like heart rate at rest)
    const downIsGood = ['heart_rate', 'blood_pressure_systolic', 'blood_glucose', 'uric_acid', 'total_cholesterol'].includes(dataType);
    
    if (trend.direction === 'stable') return 'text-gray-500';
    if (trend.direction === 'up') return downIsGood ? 'text-red-500' : 'text-green-500';
    return downIsGood ? 'text-green-500' : 'text-red-500';
  };

  const maxValue = Math.max(...trendData.map(d => d.max), 1);
  const minValue = Math.min(...trendData.map(d => d.min), 0);
  const range = maxValue - minValue || 1;

  return (
    <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-lg">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${color}`}>
              {icon}
            </div>
            <div>
              <CardTitle className="text-lg font-semibold text-slate-800 dark:text-white">
                {title}
              </CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                  {currentValue ?? '--'}
                </span>
                <span className="text-sm text-slate-500">{unit}</span>
                {trend.percentage !== 0 && (
                  <Badge variant="secondary" className={`ml-2 ${getTrendColor()}`}>
                    {getTrendIcon()}
                    <span className="ml-1">{Math.abs(trend.percentage)}%</span>
                  </Badge>
                )}
              </div>
            </div>
          </div>
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      
      <CardContent>
        {/* Period Selector */}
        <Tabs value={period} onValueChange={setPeriod} className="mb-4">
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="hour" className="text-xs">Hour</TabsTrigger>
            <TabsTrigger value="day" className="text-xs">Day</TabsTrigger>
            <TabsTrigger value="week" className="text-xs">Week</TabsTrigger>
            <TabsTrigger value="month" className="text-xs">Month</TabsTrigger>
            <TabsTrigger value="year" className="text-xs">Year</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Chart */}
        <div className="h-40 relative">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="animate-spin w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full" />
            </div>
          ) : trendData.length > 0 ? (
            <div className="flex items-end justify-between h-full gap-1 px-1">
              {trendData.map((point, index) => {
                const height = ((point.value - minValue) / range) * 100;
                return (
                  <div 
                    key={index} 
                    className="flex-1 flex flex-col items-center group"
                  >
                    {/* Bar */}
                    <div className="w-full relative flex-1 flex items-end">
                      <div 
                        className={`w-full rounded-t transition-all duration-300 ${color.replace('bg-', 'bg-').replace('-100', '-500').replace('-900/30', '-500')} opacity-80 hover:opacity-100`}
                        style={{ height: `${Math.max(height, 5)}%` }}
                      />
                      {/* Tooltip */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                        <div className="bg-slate-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                          <div className="font-semibold">{point.value} {unit}</div>
                          <div className="text-slate-300">Min: {point.min} / Max: {point.max}</div>
                          <div className="text-slate-400">{point.count} readings</div>
                        </div>
                      </div>
                    </div>
                    {/* Label */}
                    <span className="text-[10px] text-slate-500 mt-1 truncate w-full text-center">
                      {point.label}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-slate-400">
              <BarChart3 className="w-8 h-8 mr-2 opacity-50" />
              No data for this period
            </div>
          )}
        </div>

        {/* Stats Summary */}
        {stats && (
          <div className="grid grid-cols-4 gap-2 mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
            <div className="text-center">
              <p className="text-xs text-slate-500">Average</p>
              <p className="text-sm font-semibold text-slate-800 dark:text-white">{stats.average}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-500">Min</p>
              <p className="text-sm font-semibold text-slate-800 dark:text-white">{stats.minimum}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-500">Max</p>
              <p className="text-sm font-semibold text-slate-800 dark:text-white">{stats.maximum}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-500">Readings</p>
              <p className="text-sm font-semibold text-slate-800 dark:text-white">{stats.totalReadings}</p>
            </div>
          </div>
        )}

        {/* Period Label */}
        <p className="text-xs text-center text-slate-400 mt-3">
          Showing data for last {periodLabels[period]}
        </p>
      </CardContent>
    </Card>
  );
}

// Export metric configurations for easy use
export const healthMetricConfigs = {
  heart_rate: {
    title: 'Heart Rate',
    unit: 'bpm',
    icon: <Heart className="w-5 h-5 text-red-600 dark:text-red-400" />,
    color: 'bg-red-100 dark:bg-red-900/30'
  },
  steps: {
    title: 'Steps',
    unit: 'steps',
    icon: <Footprints className="w-5 h-5 text-blue-600 dark:text-blue-400" />,
    color: 'bg-blue-100 dark:bg-blue-900/30'
  },
  sleep: {
    title: 'Sleep',
    unit: 'hours',
    icon: <Moon className="w-5 h-5 text-purple-600 dark:text-purple-400" />,
    color: 'bg-purple-100 dark:bg-purple-900/30'
  },
  blood_pressure_systolic: {
    title: 'Blood Pressure (Systolic)',
    unit: 'mmHg',
    icon: <Activity className="w-5 h-5 text-pink-600 dark:text-pink-400" />,
    color: 'bg-pink-100 dark:bg-pink-900/30'
  },
  spo2: {
    title: 'Blood Oxygen (SpO2)',
    unit: '%',
    icon: <Droplets className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />,
    color: 'bg-cyan-100 dark:bg-cyan-900/30'
  },
  blood_glucose: {
    title: 'Blood Sugar',
    unit: 'mg/dL',
    icon: <Zap className="w-5 h-5 text-orange-600 dark:text-orange-400" />,
    color: 'bg-orange-100 dark:bg-orange-900/30'
  },
  hrv: {
    title: 'Heart Rate Variability',
    unit: 'ms',
    icon: <Activity className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />,
    color: 'bg-indigo-100 dark:bg-indigo-900/30'
  },
  uric_acid: {
    title: 'Uric Acid',
    unit: 'mg/dL',
    icon: <Droplets className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
    color: 'bg-amber-100 dark:bg-amber-900/30'
  },
  total_cholesterol: {
    title: 'Total Cholesterol',
    unit: 'mg/dL',
    icon: <Heart className="w-5 h-5 text-rose-600 dark:text-rose-400" />,
    color: 'bg-rose-100 dark:bg-rose-900/30'
  },
  // Activity metrics from Google Fit / Apple Health
  walking: {
    title: 'Walking',
    unit: 'steps',
    icon: <Footprints className="w-5 h-5 text-green-600 dark:text-green-400" />,
    color: 'bg-green-100 dark:bg-green-900/30'
  },
  running: {
    title: 'Running',
    unit: 'steps',
    icon: <Activity className="w-5 h-5 text-red-600 dark:text-red-400" />,
    color: 'bg-red-100 dark:bg-red-900/30'
  },
  cycling: {
    title: 'Cycling',
    unit: 'minutes',
    icon: <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400" />,
    color: 'bg-blue-100 dark:bg-blue-900/30'
  },
  calories: {
    title: 'Calories Burned',
    unit: 'kcal',
    icon: <Zap className="w-5 h-5 text-orange-600 dark:text-orange-400" />,
    color: 'bg-orange-100 dark:bg-orange-900/30'
  },
  distance: {
    title: 'Distance',
    unit: 'km',
    icon: <Activity className="w-5 h-5 text-teal-600 dark:text-teal-400" />,
    color: 'bg-teal-100 dark:bg-teal-900/30'
  },
  active_minutes: {
    title: 'Active Minutes',
    unit: 'minutes',
    icon: <Activity className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />,
    color: 'bg-emerald-100 dark:bg-emerald-900/30'
  },
  workouts: {
    title: 'Workouts',
    unit: 'count',
    icon: <Activity className="w-5 h-5 text-violet-600 dark:text-violet-400" />,
    color: 'bg-violet-100 dark:bg-violet-900/30'
  },
  temperature: {
    title: 'Body Temperature',
    unit: '°C',
    icon: <Thermometer className="w-5 h-5 text-orange-600 dark:text-orange-400" />,
    color: 'bg-orange-100 dark:bg-orange-900/30'
  }
};

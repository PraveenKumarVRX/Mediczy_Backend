import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Brain, 
  Activity, 
  Apple, 
  Pill, 
  Calendar, 
  Heart, 
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  ChevronRight,
  Star,
  ShieldAlert,
  Sparkles,
  AlertTriangle,
  Monitor
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import api from '@/lib/api';

interface HealthReminder {
  type: string;
  priority: number;
  title: string;
  message: string;
  recommendations?: any;
  suggestions?: string[];
  schedule?: string[];
  tests?: string[];
  actionable?: boolean;
  action?: any;
  timestamp: string;
}

interface HealthAppreciation {
  title: string;
  message: string;
  domain: string;
  reason?: string;
  confidence?: string;
  source?: string;
}

interface HealthHazard {
  title: string;
  prediction: string;
  recommendation: string;
  urgency: 'low' | 'medium' | 'high';
  domain: string;
  reason?: string;
  confidence?: string;
  source?: string;
}

interface HealthIntelligence {
  user_id: number;
  generated_at: string;
  summary: {
    total_reminders: number;
    high_priority: number;
    actionable: number;
    overall_score?: number;
  };
  appreciations: HealthAppreciation[];
  hazards: HealthHazard[];
  categories: {
    medication: HealthReminder[];
    checkups: HealthReminder[];
    lifestyle: HealthReminder[];
    diet: HealthReminder[];
    activity: HealthReminder[];
    vitals: HealthReminder[];
    lab_tests: HealthReminder[];
  };
  all_reminders: HealthReminder[];
}

const HealthIntelligenceDashboard: React.FC = () => {
  const [intelligence, setIntelligence] = useState<HealthIntelligence | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ai_narrative');
  const { toast } = useToast();

  useEffect(() => {
    fetchHealthIntelligence();
  }, []);

  const fetchHealthIntelligence = async () => {
    try {
      setLoading(true);
      const response = await api.get('/health-intelligence');
      if (response.data.success) {
        setIntelligence(response.data.data);
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to load health intelligence',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReminderAction = async (reminder: HealthReminder) => {
    try {
      const response = await api.post('/health-intelligence/action', {
        reminder_id: reminder.title,
        action_type: reminder.action?.type || 'acknowledge',
        action_data: reminder.action
      });

      if (response.data.success) {
        toast({
          title: 'Success',
          description: 'Reminder action completed',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to complete action',
        variant: 'destructive'
      });
    }
  };

  const getPriorityColor = (priority: number) => {
    if (priority >= 9) return 'bg-red-500';
    if (priority >= 7) return 'bg-orange-500';
    if (priority >= 5) return 'bg-yellow-500';
    return 'bg-blue-500';
  };

  const getPriorityLabel = (priority: number) => {
    if (priority >= 9) return 'High';
    if (priority >= 7) return 'Medium';
    return 'Low';
  };

  // A recommendation is actionable unless the API explicitly marks it as not
  // actionable. Older generated reminders did not populate `actionable`,
  // which made the headline say zero while the page visibly listed advice.
  const actionableItems = intelligence?.all_reminders?.filter(reminder => reminder.actionable !== false).length ?? 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Brain className="h-12 w-12 animate-pulse mx-auto mb-4 text-blue-500" />
          <p className="text-lg">Dr. iSHA is analyzing your health data...</p>
        </div>
      </div>
    );
  }

  if (!intelligence) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>No Data Available</CardTitle>
            <CardDescription>Unable to load health intelligence</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Brain className="h-8 w-8 text-blue-500" />
            My Health Intelligence
          </h1>
          <p className="text-muted-foreground mt-1">
            Powered by Dr. iSHA - Your AI Health Guardian
          </p>
        </div>
        <Button onClick={fetchHealthIntelligence} variant="outline">
          <TrendingUp className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {intelligence.summary.overall_score !== undefined && (
          <Card className="border-teal-200 bg-teal-50/30 dark:border-teal-800 dark:bg-teal-900/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-1">
                <Heart className="h-4 w-4 text-teal-600" />
                Daily Health Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-teal-600">{intelligence.summary.overall_score ?? "Not available yet"}</div>
              <p className="text-xs text-muted-foreground mt-1">Out of 100 today</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Insights</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{intelligence.summary.total_reminders}</div>
            <p className="text-xs text-muted-foreground mt-1">Personalized recommendations</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">High Priority</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-500">{intelligence.summary.high_priority}</div>
            <p className="text-xs text-muted-foreground mt-1">Requires attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Actionable Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-500">{actionableItems}</div>
            <p className="text-xs text-muted-foreground mt-1">Ready to act on</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 [&_svg]:shrink-0">
          <TabsTrigger value="ai_narrative">
            <Sparkles className="h-4 w-4 mr-2" />
            Health Narrative
          </TabsTrigger>
          <TabsTrigger value="overview">
            <TrendingUp className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="medication">
            <Pill className="h-4 w-4 mr-2" />
            Medication
          </TabsTrigger>
          <TabsTrigger value="diet">
            <Apple className="h-4 w-4 mr-2" />
            Diet
          </TabsTrigger>
          <TabsTrigger value="activity">
            <Activity className="h-4 w-4 mr-2" />
            Activity
          </TabsTrigger>
          <TabsTrigger value="checkups">
            <Calendar className="h-4 w-4 mr-2" />
            Checkups
          </TabsTrigger>
          <TabsTrigger value="vitals">
            <Heart className="h-4 w-4 mr-2" />
            Vitals
          </TabsTrigger>
          <TabsTrigger value="lifestyle">
            <Clock className="h-4 w-4 mr-2" />
            Lifestyle
          </TabsTrigger>
          <TabsTrigger value="lab_tests">
            <Monitor className="h-4 w-4 mr-2" />
            Lab Tests
          </TabsTrigger>
        </TabsList>

        {/* Health Narrative Tab */}
        <TabsContent value="ai_narrative" className="space-y-6">
          {/* Appreciations */}
          {intelligence.appreciations && intelligence.appreciations.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Star className="h-5 w-5 text-green-600" />
                <h2 className="text-lg font-semibold text-green-700 dark:text-green-400">What You're Doing Well</h2>
              </div>
              {intelligence.appreciations.map((item, i) => (
                <Card key={i} className="border-green-200 bg-green-50/40 dark:border-green-800 dark:bg-green-900/10">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      {item.title}
                      <span className="ml-auto text-xs font-normal text-green-600 border border-green-300 rounded-full px-2 py-0.5 capitalize">{item.domain}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-slate-600 dark:text-slate-300">{item.message}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="border-green-200 bg-green-50/40 dark:border-green-800 dark:bg-green-900/10">
              <CardContent className="pt-6 text-center text-muted-foreground">
                <Star className="h-10 w-10 mx-auto mb-2 text-green-400" />
                <p>Log more health data to unlock personalized appreciations from Dr. iSHA.</p>
              </CardContent>
            </Card>
          )}

          {/* Hazards */}
          {intelligence.hazards && intelligence.hazards.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-orange-600" />
                <h2 className="text-lg font-semibold text-orange-700 dark:text-orange-400">Health Observations</h2>
              </div>
              <p className="text-sm text-muted-foreground">These observations are based on your recorded data and are not medical advice or a diagnosis. Consult your doctor for assessment.</p>
              {intelligence.hazards.map((item, i) => {
                const urgencyColor = item.urgency === 'high'
                  ? 'border-red-300 bg-red-50/40 dark:border-red-800 dark:bg-red-900/10'
                  : item.urgency === 'medium'
                  ? 'border-orange-300 bg-orange-50/40 dark:border-orange-800 dark:bg-orange-900/10'
                  : 'border-yellow-300 bg-yellow-50/40 dark:border-yellow-800 dark:bg-yellow-900/10';
                const urgencyBadge = item.urgency === 'high' ? 'bg-red-500' : item.urgency === 'medium' ? 'bg-orange-500' : 'bg-yellow-500';
                return (
                  <Card key={i} className={`border ${urgencyColor}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-orange-600" />
                          {item.title}
                        </CardTitle>
                        <div className="flex gap-1 shrink-0">
                          <span className={`text-xs font-semibold text-white rounded-full px-2 py-0.5 ${urgencyBadge}`}>{item.urgency.toUpperCase()}</span>
                          <span className="text-xs font-normal text-slate-500 border border-slate-300 rounded-full px-2 py-0.5 capitalize">{item.domain}</span>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <p className="text-xs">Source: {item.source || "Your recorded health data"}</p>
                      <p className="text-xs">Confidence: {item.confidence || "Limited — insufficient evidence for clinical prediction"}</p>
                      <p className="text-xs">Why: {item.reason || "Based on available recorded data"}</p>
                      <p className="text-sm text-slate-700 dark:text-slate-300">
                        <span className="font-medium">Observation:</span> {item.prediction}
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        <span className="font-medium">Recommendation:</span> {item.recommendation}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="border-orange-200 bg-orange-50/40 dark:border-orange-800 dark:bg-orange-900/10">
              <CardContent className="pt-6 text-center text-muted-foreground">
                <ShieldAlert className="h-10 w-10 mx-auto mb-2 text-orange-400" />
                <p>No hazard predictions at this time. Keep up the healthy habits!</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>All Health Insights</CardTitle>
              <CardDescription>
                Dr. iSHA has analyzed your health profile and generated personalized recommendations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px] pr-4">
                <div className="space-y-4">
                  {intelligence.all_reminders.map((reminder, index) => (
                    <ReminderCard 
                      key={index} 
                      reminder={reminder} 
                      onAction={handleReminderAction}
                      getPriorityColor={getPriorityColor}
                      getPriorityLabel={getPriorityLabel}
                    />
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Medication Tab */}
        <TabsContent value="medication" className="space-y-4">
          <CategoryView 
            reminders={intelligence.categories.medication}
            onAction={handleReminderAction}
            getPriorityColor={getPriorityColor}
            getPriorityLabel={getPriorityLabel}
          />
        </TabsContent>

        {/* Diet Tab */}
        <TabsContent value="diet" className="space-y-4">
          <CategoryView 
            reminders={intelligence.categories.diet}
            onAction={handleReminderAction}
            getPriorityColor={getPriorityColor}
            getPriorityLabel={getPriorityLabel}
          />
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity" className="space-y-4">
          <CategoryView 
            reminders={intelligence.categories.activity}
            onAction={handleReminderAction}
            getPriorityColor={getPriorityColor}
            getPriorityLabel={getPriorityLabel}
          />
        </TabsContent>

        {/* Checkups Tab */}
        <TabsContent value="checkups" className="space-y-4">
          <CategoryView 
            reminders={intelligence.categories.checkups}
            onAction={handleReminderAction}
            getPriorityColor={getPriorityColor}
            getPriorityLabel={getPriorityLabel}
          />
        </TabsContent>

        {/* Vitals Tab */}
        <TabsContent value="vitals" className="space-y-4">
          <CategoryView 
            reminders={intelligence.categories.vitals}
            onAction={handleReminderAction}
            getPriorityColor={getPriorityColor}
            getPriorityLabel={getPriorityLabel}
          />
        </TabsContent>

        {/* Lifestyle Tab */}
        <TabsContent value="lifestyle" className="space-y-4">
          <CategoryView 
            reminders={intelligence.categories.lifestyle}
            onAction={handleReminderAction}
            getPriorityColor={getPriorityColor}
            getPriorityLabel={getPriorityLabel}
          />
        </TabsContent>

        {/* Lab Tests Tab */}
        <TabsContent value="lab_tests" className="space-y-4">
          <CategoryView 
            reminders={intelligence.categories.lab_tests}
            onAction={handleReminderAction}
            getPriorityColor={getPriorityColor}
            getPriorityLabel={getPriorityLabel}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

const CategoryView: React.FC<{
  reminders: HealthReminder[];
  onAction: (reminder: HealthReminder) => void;
  getPriorityColor: (priority: number) => string;
  getPriorityLabel: (priority: number) => string;
}> = ({ reminders, onAction, getPriorityColor, getPriorityLabel }) => {
  if (reminders.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">
            <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-500" />
            <p>No reminders in this category</p>
            <p className="text-sm mt-1">Dr. iSHA will notify you when action is needed</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {reminders.map((reminder, index) => (
        <ReminderCard 
          key={index} 
          reminder={reminder} 
          onAction={onAction}
          getPriorityColor={getPriorityColor}
          getPriorityLabel={getPriorityLabel}
        />
      ))}
    </div>
  );
};

const ReminderCard: React.FC<{
  reminder: HealthReminder;
  onAction: (reminder: HealthReminder) => void;
  getPriorityColor: (priority: number) => string;
  getPriorityLabel: (priority: number) => string;
}> = ({ reminder, onAction, getPriorityColor, getPriorityLabel }) => {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg">{reminder.title}</CardTitle>
            <CardDescription className="mt-1">{reminder.message}</CardDescription>
          </div>
          <Badge className={`${getPriorityColor(reminder.priority)} text-white`}>
            {getPriorityLabel(reminder.priority)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Recommendations */}
        {reminder.recommendations && (
          <div className="space-y-3">
            {reminder.recommendations.include && (
              <div>
                <h4 className="font-semibold text-sm mb-2 text-green-600">✓ Include:</h4>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {reminder.recommendations.include.map((item: string, i: number) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {reminder.recommendations.avoid && (
              <div>
                <h4 className="font-semibold text-sm mb-2 text-red-600">✗ Avoid:</h4>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {reminder.recommendations.avoid.map((item: string, i: number) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {reminder.recommendations.tips && (
              <div>
                <h4 className="font-semibold text-sm mb-2 text-blue-600">💡 Tips:</h4>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {reminder.recommendations.tips.map((item: string, i: number) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Suggestions */}
        {reminder.suggestions && (
          <div>
            <h4 className="font-semibold text-sm mb-2">Suggestions:</h4>
            <ul className="list-disc list-inside space-y-1 text-sm">
              {reminder.suggestions.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Schedule */}
        {reminder.schedule && (
          <div>
            <h4 className="font-semibold text-sm mb-2">Schedule:</h4>
            <ul className="space-y-1 text-sm">
              {reminder.schedule.map((item, i) => (
                <li key={i} className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-500" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Tests */}
        {reminder.tests && (
          <div>
            <h4 className="font-semibold text-sm mb-2">Recommended Tests:</h4>
            <ul className="list-disc list-inside space-y-1 text-sm">
              {reminder.tests.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Action Button */}
        {reminder.actionable && (
          <Button 
            onClick={() => onAction(reminder)}
            className="w-full"
            variant="default"
          >
            Take Action
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default HealthIntelligenceDashboard;

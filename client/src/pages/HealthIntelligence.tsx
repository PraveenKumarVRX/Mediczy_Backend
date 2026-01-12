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
  ChevronRight
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

interface HealthIntelligence {
  user_id: number;
  generated_at: string;
  summary: {
    total_reminders: number;
    high_priority: number;
    actionable: number;
  };
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
  const [activeTab, setActiveTab] = useState('overview');
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            <div className="text-3xl font-bold text-green-500">{intelligence.summary.actionable}</div>
            <p className="text-xs text-muted-foreground mt-1">Ready to act on</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid grid-cols-4 lg:grid-cols-8 w-full">
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
            Lab Tests
          </TabsTrigger>
        </TabsList>

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

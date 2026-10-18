import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { 
  Calendar as CalendarIcon, 
  Plus,
  ChevronLeft,
  ChevronRight,
  Trophy,
  Heart,
  Brain,
  Apple,
  Dumbbell,
  Eye,
  Edit,
  Trash2,
  Clock,
  MapPin,
  User,
  Filter,
  Download,
  RefreshCw,
  Sparkles,
  Stethoscope,
  Pill,
  Activity,
  Moon,
  Droplets,
  Shield,
  Flame,
  Building2,
  Send,
  Bell,
  Mail,
  CheckCircle,
  UserPlus,
  UsersRound,
  AlertCircle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';
import CorporateLayout from '@/components/corporate/CorporateLayout';
import CorporatePageHeader from '@/components/corporate/CorporatePageHeader';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfYear, addDays, subDays } from 'date-fns';
import { cn } from '@/lib/utils';

// Must match the categories Team login actually writes to event_type
// (TeamCorporateManagement.tsx's eventTypeColors) — this page and Team's
// used to have two independently-invented taxonomies that never matched,
// so every event created via Team (the only real creation path so far)
// silently displayed under the wrong category here.
type ActivityType = 'Wellness Session' | 'Health Checkup' | 'Fitness Activity' | 'Mental Health' | 'Yoga & Meditation' | 'Nutrition Workshop' | 'Sports Day' | 'Safety Training' | 'Other';
type ViewMode = 'monthly' | 'quarterly' | 'annual';
// 'location'/'facility' targeting was removed: no employee record anywhere
// in the platform has ever had a real location/facility value (not even a
// database column for it), and the selectable options were a hardcoded
// fake list ('Mumbai HQ', 'Tower A', ...) unrelated to any real corporate's
// offices -- selecting either always matched zero real employees. 'custom'
// (hand-pick from the real employee roster) replaces them with something
// that actually works with real data.
type ParticipantSelection = 'all' | 'department' | 'custom';

interface WellnessTheme {
  month: number;
  name: string;
  description: string;
  color: string;
  icon: React.ElementType;
}

interface Participant {
  id: string;
  name: string;
  email: string;
  department: string;
  location: string;
  facility: string;
}

interface ReminderSettings {
  enabled: boolean;
  fifteenDays: boolean;
  threeDays: boolean;
  oneDayBefore: boolean;
}

interface WellnessActivity {
  id: string;
  title: string;
  description: string;
  type: ActivityType;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  speaker?: string;
  capacity?: number;
  registered?: number;
  status: 'upcoming' | 'ongoing' | 'completed' | 'cancelled';
  theme: string;
  participantSelection?: ParticipantSelection;
  selectedDepartments?: string[];
  selectedEmployeeIds?: string[];
  invitesSent?: boolean;
  invitesSentDate?: string;
  reminders?: ReminderSettings;
  totalInvited?: number;
}


// invented-data-check: static-reference -- calendar theme configuration, not employee records.
const WELLNESS_THEMES: WellnessTheme[] = [
  { month: 0, name: 'New Year Wellness Kickoff', description: 'Start the year with health goals and resolutions', color: 'from-blue-500 to-blue-600', icon: Sparkles },
  { month: 1, name: 'Heart Health Month', description: 'Focus on cardiovascular wellness and heart-healthy habits', color: 'from-red-500 to-rose-600', icon: Heart },
  { month: 2, name: 'Nutrition & Diet', description: 'Healthy eating habits and nutritional awareness', color: 'from-green-500 to-emerald-600', icon: Apple },
  { month: 3, name: 'Mental Wellness', description: 'Stress management and mental health awareness', color: 'from-purple-500 to-violet-600', icon: Brain },
  { month: 4, name: 'Physical Fitness', description: 'Exercise routines and physical activity promotion', color: 'from-orange-500 to-amber-600', icon: Dumbbell },
  { month: 5, name: 'Eye & Vision Care', description: 'Eye health awareness and vision screening', color: 'from-cyan-500 to-teal-600', icon: Eye },
  { month: 6, name: 'Hydration & Detox', description: 'Importance of hydration and body detoxification', color: 'from-sky-500 to-blue-600', icon: Droplets },
  { month: 7, name: 'Preventive Health', description: 'Health screenings and preventive care', color: 'from-indigo-500 to-blue-600', icon: Shield },
  { month: 8, name: 'Diabetes Awareness', description: 'Blood sugar management and diabetes prevention', color: 'from-amber-500 to-yellow-600', icon: Activity },
  { month: 9, name: 'Breast Cancer Awareness', description: 'Cancer awareness and early detection', color: 'from-pink-500 to-rose-600', icon: Heart },
  { month: 10, name: 'Men\'s Health', description: 'Focus on men\'s health issues and wellness', color: 'from-blue-600 to-indigo-600', icon: Stethoscope },
  { month: 11, name: 'Sleep & Rest', description: 'Quality sleep and rest for overall wellness', color: 'from-slate-500 to-gray-600', icon: Moon },
];

const ACTIVITY_TYPES = [
  { value: 'Wellness Session', label: 'Wellness Session', icon: Sparkles, color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400' },
  { value: 'Health Checkup', label: 'Health Checkup', icon: Stethoscope, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  { value: 'Fitness Activity', label: 'Fitness Activity', icon: Dumbbell, color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  { value: 'Mental Health', label: 'Mental Health', icon: Brain, color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  { value: 'Yoga & Meditation', label: 'Yoga & Meditation', icon: Heart, color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' },
  { value: 'Nutrition Workshop', label: 'Nutrition Workshop', icon: Apple, color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  { value: 'Sports Day', label: 'Sports Day', icon: Trophy, color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  { value: 'Safety Training', label: 'Safety Training', icon: Shield, color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  { value: 'Other', label: 'Other', icon: Activity, color: 'bg-slate-100 text-slate-700 dark:bg-slate-800/50 dark:text-slate-400' },
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Generate ICS calendar file
const generateICSFile = (activity: WellnessActivity): string => {
  const startDate = new Date(`${activity.date}T${activity.startTime}:00`);
  const endDate = new Date(`${activity.date}T${activity.endTime}:00`);
  
  const formatICSDate = (date: Date): string => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const uid = `${activity.id}-${Date.now()}@mediczy.com`;
  
  // Create reminder alarms
  const alarms = [];
  if (activity.reminders?.fifteenDays) {
    alarms.push(`BEGIN:VALARM
TRIGGER:-P15D
ACTION:DISPLAY
DESCRIPTION:Reminder: ${activity.title} in 15 days
END:VALARM`);
  }
  if (activity.reminders?.threeDays) {
    alarms.push(`BEGIN:VALARM
TRIGGER:-P3D
ACTION:DISPLAY
DESCRIPTION:Reminder: ${activity.title} in 3 days
END:VALARM`);
  }
  if (activity.reminders?.oneDayBefore) {
    alarms.push(`BEGIN:VALARM
TRIGGER:-P1D
ACTION:DISPLAY
DESCRIPTION:Reminder: ${activity.title} tomorrow
END:VALARM`);
  }

  const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Mediczy//Wellness Calendar//EN
CALSCALE:GREGORIAN
METHOD:REQUEST
BEGIN:VEVENT
UID:${uid}
DTSTAMP:${formatICSDate(new Date())}
DTSTART:${formatICSDate(startDate)}
DTEND:${formatICSDate(endDate)}
SUMMARY:${activity.title}
DESCRIPTION:${activity.description}\\n\\nSpeaker: ${activity.speaker || 'TBA'}\\n\\nTheme: ${activity.theme}
LOCATION:${activity.location}
ORGANIZER;CN=HR Wellness Team:mailto:wellness@company.com
STATUS:CONFIRMED
SEQUENCE:0
${alarms.join('\n')}
END:VEVENT
END:VCALENDAR`;

  return icsContent;
};

const downloadICSFile = (activity: WellnessActivity) => {
  const icsContent = generateICSFile(activity);
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${activity.title.replace(/[^a-zA-Z0-9]/g, '_')}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
};

const CorporateWellnessCalendar: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  // null = not yet known; true/false once the plan's real features load.
  const [healthCalendarIncluded, setHealthCalendarIncluded] = useState<boolean | null>(null);
  const [planName, setPlanName] = useState<string>('');
  const [activities, setActivities] = useState<WellnessActivity[]>([]);
  const [employees, setEmployees] = useState<Participant[]>([]);
  // Real, derived from the actual roster -- replaces a hardcoded fake
  // department list that didn't match any real corporate's structure.
  const realDepartments = useMemo(
    () => Array.from(new Set(employees.map(e => e.department).filter(Boolean))).sort(),
    [employees]
  );
  const [employeePickerSearch, setEmployeePickerSearch] = useState('');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('monthly');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<WellnessActivity | null>(null);
  const [activityFilter, setActivityFilter] = useState('all');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [viewActivityOpen, setViewActivityOpen] = useState(false);
  const [themeDialogOpen, setThemeDialogOpen] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [sendingInvites, setSendingInvites] = useState(false);
  const [viewActivityTab, setViewActivityTab] = useState<'details' | 'registrations'>('details');
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [registrationsLoading, setRegistrationsLoading] = useState(false);
  const [registrationsEvent, setRegistrationsEvent] = useState<{ registered_count: number; max_participants: number | null } | null>(null);

  // New activity form
  const [newActivity, setNewActivity] = useState({
    title: '',
    description: '',
    type: 'Wellness Session' as ActivityType,
    date: new Date(),
    startTime: '10:00',
    endTime: '12:00',
    location: '',
    speaker: '',
    capacity: 50,
    participantSelection: 'all' as ParticipantSelection,
    selectedDepartments: [] as string[],
    selectedEmployeeIds: [] as string[],
    reminders: {
      enabled: true,
      fifteenDays: true,
      threeDays: true,
      oneDayBefore: true
    }
  });

  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();
  const currentTheme = WELLNESS_THEMES[currentMonth];

  const daysInMonth = useMemo(() => {
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  const getActivitiesForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return activities.filter(a => a.date === dateStr);
  };

  const getActivitiesForMonth = (month: number) => {
    return activities.filter(a => {
      const actDate = new Date(a.date);
      return actDate.getMonth() === month && actDate.getFullYear() === currentYear;
    });
  };

  const filteredActivities = useMemo(() => {
    let filtered = activities;
    if (activityFilter !== 'all') {
      filtered = filtered.filter(a => a.type === activityFilter);
    }
    if (viewMode === 'monthly') {
      filtered = filtered.filter(a => {
        const actDate = new Date(a.date);
        return actDate.getMonth() === currentMonth && actDate.getFullYear() === currentYear;
      });
    }
    return filtered.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [activities, activityFilter, viewMode, currentMonth, currentYear]);

  const stats = useMemo(() => ({
    totalActivities: activities.length,
    thisMonthActivities: getActivitiesForMonth(currentMonth).length,
    upcomingActivities: activities.filter(a => new Date(a.date) > new Date() && a.status === 'upcoming').length,
    completedActivities: activities.filter(a => a.status === 'completed').length
  }), [activities, currentMonth]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      // Capture real failures (auth expiry, network errors) instead of
      // silently coercing them to "no data" -- an empty activities list and
      // a failed session look identical to the user otherwise.
      const [activitiesRes, empRes, benefitsRes] = await Promise.allSettled([
        api.get('/corporate/wellness-calendar/activities'),
        api.get('/corporate/dashboard/employees-health'),
        api.get('/corporate/my-benefits'),
      ]);

      const authFailed = [activitiesRes, empRes, benefitsRes].some(
        (r) => r.status === 'rejected' && (r.reason as any)?.response?.status === 401
      );
      if (authFailed) {
        toast({
          variant: 'destructive',
          title: 'Session expired',
          description: 'Please log out and log back in to see your wellness calendar.',
        });
        setActivities([]);
        return;
      }

      if (activitiesRes.status === 'fulfilled') {
        setActivities(activitiesRes.value.data?.data?.activities || []);
      } else {
        toast({
          variant: 'destructive',
          title: 'Failed to load activities',
          description: 'Please try refreshing. If this keeps happening, contact support.',
        });
        setActivities([]);
      }

      const plan = benefitsRes.status === 'fulfilled' ? benefitsRes.value.data?.data?.plan : null;
      if (plan) {
        setPlanName(plan.planName || '');
        setHealthCalendarIncluded(Boolean(plan.platformFeatures?.healthCalendar));
      } else {
        // No linked plan (or that call failed) -- don't claim the feature
        // isn't included, just don't show a confirmation badge either.
        setHealthCalendarIncluded(null);
      }

      const empData = empRes.status === 'fulfilled' ? (empRes.value.data?.data?.employees || []) : [];
      setEmployees(empData.map((e: any) => ({
        id: String(e.id),
        name: e.name,
        email: e.email || '',
        department: e.department || '',
        location: e.location || '',
        facility: e.facility || '',
      })));
    } catch (error) {
      setActivities([]);
    } finally {
      setLoading(false);
    }
  };

  const handlePrevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const handleNextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const handleToday = () => setCurrentDate(new Date());

  // Get participants based on selection criteria
  const getSelectedParticipants = (selection: ParticipantSelection, depts: string[], employeeIds: string[]): Participant[] => {
    switch (selection) {
      case 'all':
        return employees;
      case 'department':
        return employees.filter(e => depts.includes(e.department));
      case 'custom':
        return employees.filter(e => employeeIds.includes(e.id));
      default:
        return employees;
    }
  };

  // Get participant count for preview
  const getParticipantCount = (): number => {
    const participants = getSelectedParticipants(
      newActivity.participantSelection,
      newActivity.selectedDepartments,
      newActivity.selectedEmployeeIds
    );
    return participants.length;
  };

  // Send invites to participants
  const handleSendInvites = async (activity: WellnessActivity) => {
    setSendingInvites(true);
    try {
      const participants = getSelectedParticipants(
        activity.participantSelection || 'all',
        activity.selectedDepartments || [],
        activity.selectedEmployeeIds || []
      );

      // Generate ICS file content
      const icsContent = generateICSFile(activity);

      // Persist invite status server-side, scoped to this corporate's event
      await api.post(`/corporate/wellness-calendar/activities/${encodeURIComponent(activity.id)}/send-invites`, {
        participantSelection: activity.participantSelection || 'all',
        participantIds: participants.map(p => p.id ?? p),
        activityTitle: activity.title,
        activityDate: activity.date,
        location: activity.location,
      });

      // Update activity with invite status
      setActivities(prev => prev.map(a => 
        a.id === activity.id 
          ? { 
              ...a, 
              invitesSent: true, 
              invitesSentDate: format(new Date(), 'yyyy-MM-dd'),
              totalInvited: participants.length 
            }
          : a
      ));

      // Also download ICS file for HR records
      downloadICSFile(activity);

      setInviteDialogOpen(false);
      toast({
        title: 'Invites Sent Successfully!',
        description: `Calendar invites sent to ${participants.length} employees with reminders at 15 days, 3 days, and 1 day before the event.`
      });
    } catch (error) {
      toast({
        title: 'Failed to Send Invites',
        description: 'Please try again later.',
        variant: 'destructive'
      });
    } finally {
      setSendingInvites(false);
    }
  };

  const handleCreateActivity = async () => {
    if (!newActivity.title.trim()) {
      toast({ title: 'Title is required', variant: 'destructive' });
      return;
    }
    if (!newActivity.startTime) {
      toast({ title: 'Start time is required', variant: 'destructive' });
      return;
    }
    if (!newActivity.endTime) {
      toast({ title: 'End time is required', variant: 'destructive' });
      return;
    }
    if (newActivity.startTime >= newActivity.endTime) {
      toast({ title: 'End time must be after start time', variant: 'destructive' });
      return;
    }
    const theme = WELLNESS_THEMES[newActivity.date.getMonth()];
    const participantCount = getParticipantCount();
    try {
      const { data } = await api.post('/corporate/wellness-calendar/activities', {
        title: newActivity.title,
        description: newActivity.description,
        type: newActivity.type,
        date: format(newActivity.date, 'yyyy-MM-dd'),
        startTime: newActivity.startTime,
        endTime: newActivity.endTime,
        location: newActivity.location,
        speaker: newActivity.speaker,
        capacity: newActivity.capacity,
        theme: theme.name,
      });
      const created = data?.data;
      if (!created) throw new Error('No activity returned from server');

      const activity: WellnessActivity = {
        ...created,
        id: String(created.id),
        theme: created.theme || theme.name,
        // Participant-targeting criteria and reminder preferences are only
        // persisted server-side once invites are actually sent — kept
        // client-side here so the "Send Invites" step can reuse them.
        participantSelection: newActivity.participantSelection,
        selectedDepartments: newActivity.selectedDepartments,
        selectedEmployeeIds: newActivity.selectedEmployeeIds,
        invitesSent: false,
        totalInvited: participantCount,
        reminders: newActivity.reminders
      };
      setActivities(prev => [...prev, activity]);
      setCreateDialogOpen(false);
      setNewActivity({
        title: '',
        description: '',
        type: 'Wellness Session',
        date: new Date(),
        startTime: '10:00',
        endTime: '12:00',
        location: '',
        speaker: '',
        capacity: 50,
        participantSelection: 'all',
        selectedDepartments: [],
        selectedEmployeeIds: [],
        reminders: {
          enabled: true,
          fifteenDays: true,
          threeDays: true,
          oneDayBefore: true
        }
      });
      toast({
        title: 'Activity Created!',
        description: `${activity.title} has been added to the calendar for ${participantCount} participants.`
      });
    } catch (error) {
      toast({
        title: 'Failed to Create Activity',
        description: 'Please try again later.',
        variant: 'destructive'
      });
    }
  };

  const handleViewActivity = (activity: WellnessActivity) => {
    setSelectedActivity(activity);
    setViewActivityTab('details');
    setRegistrations([]);
    setRegistrationsEvent(null);
    setViewActivityOpen(true);
    fetchRegistrations(activity.id);
  };

  const fetchRegistrations = async (activityId: string) => {
    setRegistrationsLoading(true);
    try {
      const { data } = await api.get(`/corporate/wellness-calendar/activities/${encodeURIComponent(activityId)}/registrations`);
      setRegistrations(data?.data?.registrations || []);
      setRegistrationsEvent(data?.data?.event || null);
    } catch {
      toast({ title: 'Failed to load registrations', variant: 'destructive' });
      setRegistrations([]);
    } finally {
      setRegistrationsLoading(false);
    }
  };

  const cancelRegistration = async (rsvpId: string) => {
    try {
      await api.delete(`/corporate/wellness-calendar/registrations/${encodeURIComponent(rsvpId)}`);
      toast({ title: 'Registration cancelled' });
      if (selectedActivity) fetchRegistrations(selectedActivity.id);
    } catch {
      toast({ title: 'Failed to cancel registration', variant: 'destructive' });
    }
  };

  const handleDeleteActivity = async (activityId: string) => {
    try {
      await api.delete(`/corporate/wellness-calendar/activities/${encodeURIComponent(activityId)}`);
      setActivities(prev => prev.filter(a => a.id !== activityId));
      toast({
        title: 'Activity Deleted',
        description: 'The activity has been removed from the calendar.'
      });
    } catch (error) {
      toast({
        title: 'Failed to Delete Activity',
        description: 'Please try again later.',
        variant: 'destructive'
      });
    }
  };

  const getActivityTypeInfo = (type: ActivityType) => {
    // Falling back to ACTIVITY_TYPES[0] here previously mislabeled any
    // unrecognized type as a specific *wrong* category (e.g. a real "Health
    // Checkup" event silently showing as "Health Talk"). Echo the raw value
    // instead so an unmapped type is visibly itself, not a false match.
    return ACTIVITY_TYPES.find(t => t.value === type) || {
      value: type,
      label: type || 'Other',
      icon: Activity,
      color: 'bg-slate-100 text-slate-700 dark:bg-slate-800/50 dark:text-slate-400',
    };
  };

  if (loading) {
    return (
      <CorporateLayout title="Wellness Calendar">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-emerald-600" />
        </div>
      </CorporateLayout>
    );
  }

  return (
    <CorporateLayout title="Annual Wellness Calendar">
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6 space-y-6">
        <CorporatePageHeader
          icon={CalendarIcon}
          title="Annual Health & Wellness Calendar"
          description="Plan and manage your organization's wellness activities throughout the year"
          gradient="from-teal-500 to-emerald-600"
          showRefresh={true}
          onRefresh={loadData}
          badge={healthCalendarIncluded && planName ? { text: `Included in your ${planName} plan`, variant: "emerald" } : undefined}
          stats={[
            { label: 'Total Activities', value: stats.totalActivities },
            { label: 'This Month', value: stats.thisMonthActivities },
            { label: 'Upcoming', value: stats.upcomingActivities },
            { label: 'Completed', value: stats.completedActivities }
          ]}
        />

        {healthCalendarIncluded === false && (
          <Card className="bg-amber-950/20 border-amber-500/30">
            <CardContent className="p-4 flex items-center gap-3 text-sm text-amber-300">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <span>Health Calendar isn't part of your current plan's included features. You can still see activities below if any have been scheduled -- contact your Mediczy account team to add this feature.</span>
            </CardContent>
          </Card>
        )}

        {/* Current Month Theme Banner */}
        <Card className={cn('bg-gradient-to-r text-white border-0', currentTheme.color)}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white/20 rounded-xl">
                  <currentTheme.icon className="h-8 w-8" />
                </div>
                <div>
                  <p className="text-sm opacity-80">{MONTHS[currentMonth]} {currentYear} Theme</p>
                  <h2 className="text-2xl font-bold">{currentTheme.name}</h2>
                  <p className="text-sm opacity-90 mt-1">{currentTheme.description}</p>
                </div>
              </div>
              <Button 
                variant="secondary" 
                className="bg-white/20 hover:bg-white/30 text-white border-0"
                onClick={() => setThemeDialogOpen(true)}
              >
                View All Themes
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Controls */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={handlePrevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={handleToday}>Today</Button>
            <Button variant="outline" size="icon" onClick={handleNextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white ml-4">
              {format(currentDate, 'MMMM yyyy')}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
              <TabsList className="bg-slate-100 dark:bg-slate-800">
                <TabsTrigger value="monthly">Monthly</TabsTrigger>
                <TabsTrigger value="quarterly">Quarterly</TabsTrigger>
                <TabsTrigger value="annual">Annual</TabsTrigger>
              </TabsList>
            </Tabs>

            <Select value={activityFilter} onValueChange={setActivityFilter}>
              <SelectTrigger className="w-[160px] bg-white dark:bg-slate-700">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Activities</SelectItem>
                {ACTIVITY_TYPES.map(type => (
                  <SelectItem key={type.value} value={type.value}>
                    <div className="flex items-center gap-2">
                      <type.icon className="h-4 w-4" />
                      {type.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button onClick={() => setCreateDialogOpen(true)} className="bg-gradient-to-r from-teal-500 to-emerald-600">
              <Plus className="h-4 w-4 mr-2" />
              Add Activity
            </Button>
          </div>
        </div>

        {/* Monthly View */}
        {viewMode === 'monthly' && (
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Calendar Grid */}
            <Card className="lg:col-span-2 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
              <CardHeader>
                <CardTitle className="text-slate-900 dark:text-white">Calendar</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-7 gap-1">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="p-2 text-center text-sm font-medium text-slate-500">
                      {day}
                    </div>
                  ))}
                  {/* Empty cells for days before month starts */}
                  {Array.from({ length: daysInMonth[0].getDay() }).map((_, i) => (
                    <div key={`empty-${i}`} className="p-2 min-h-[80px]" />
                  ))}
                  {/* Days of month */}
                  {daysInMonth.map(day => {
                    const dayActivities = getActivitiesForDate(day);
                    const isToday = isSameDay(day, new Date());
                    return (
                      <div
                        key={day.toISOString()}
                        className={cn(
                          'p-2 min-h-[80px] border rounded-lg cursor-pointer transition-colors',
                          isToday ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                        )}
                        onClick={() => setSelectedDate(day)}
                      >
                        <p className={cn(
                          'text-sm font-medium',
                          isToday ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'
                        )}>
                          {format(day, 'd')}
                        </p>
                        <div className="mt-1 space-y-1">
                          {dayActivities.slice(0, 2).map(act => {
                            const typeInfo = getActivityTypeInfo(act.type);
                            return (
                              <div
                                key={act.id}
                                className={cn('text-xs p-1 rounded truncate', typeInfo.color)}
                                onClick={(e) => { e.stopPropagation(); handleViewActivity(act); }}
                              >
                                {act.title}
                              </div>
                            );
                          })}
                          {dayActivities.length > 2 && (
                            <p className="text-xs text-slate-500">+{dayActivities.length - 2} more</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Activity List */}
            <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
              <CardHeader>
                <CardTitle className="text-slate-900 dark:text-white">
                  {selectedDate ? format(selectedDate, 'MMMM d, yyyy') : 'Upcoming Activities'}
                </CardTitle>
                <CardDescription className="text-slate-500 dark:text-slate-400">
                  {selectedDate ? `Activities on this day` : `This month's schedule`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {(selectedDate ? getActivitiesForDate(selectedDate) : filteredActivities).map(activity => {
                      const typeInfo = getActivityTypeInfo(activity.type);
                      const TypeIcon = typeInfo.icon;
                      return (
                        <div
                          key={activity.id}
                          className="p-3 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors"
                          onClick={() => handleViewActivity(activity)}
                        >
                          <div className="flex items-start gap-3">
                            <div className={cn('p-2 rounded-lg', typeInfo.color)}>
                              <TypeIcon className="h-4 w-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-slate-900 dark:text-white truncate">{activity.title}</h4>
                              <p className="text-sm text-slate-500 dark:text-slate-400">
                                {format(new Date(activity.date), 'MMM d')} • {activity.startTime} - {activity.endTime}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className="text-xs">{typeInfo.label}</Badge>
                                <Badge className={cn(
                                  'text-xs',
                                  activity.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                                  activity.status === 'upcoming' ? 'bg-blue-100 text-blue-700' :
                                  'bg-slate-100 text-slate-700'
                                )}>
                                  {activity.status}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {(selectedDate ? getActivitiesForDate(selectedDate) : filteredActivities).length === 0 && (
                      <div className="text-center py-8 text-slate-500">
                        <CalendarIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>No activities scheduled</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Quarterly View */}
        {viewMode === 'quarterly' && (
          <div className="grid gap-4 md:grid-cols-3">
            {[0, 1, 2].map(offset => {
              const monthIndex = Math.floor(currentMonth / 3) * 3 + offset;
              if (monthIndex > 11) return null;
              const theme = WELLNESS_THEMES[monthIndex];
              const monthActivities = getActivitiesForMonth(monthIndex);
              return (
                <Card key={monthIndex} className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                  <CardHeader className={cn('bg-gradient-to-r text-white rounded-t-lg', theme.color)}>
                    <div className="flex items-center gap-3">
                      <theme.icon className="h-6 w-6" />
                      <div>
                        <CardTitle className="text-lg">{MONTHS[monthIndex]}</CardTitle>
                        <CardDescription className="text-white/80">{theme.name}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="space-y-2">
                      {monthActivities.slice(0, 5).map(activity => {
                        const typeInfo = getActivityTypeInfo(activity.type);
                        return (
                          <div
                            key={activity.id}
                            className="flex items-center gap-2 p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer"
                            onClick={() => handleViewActivity(activity)}
                          >
                            <Badge className={cn('text-xs', typeInfo.color)}>{format(new Date(activity.date), 'd')}</Badge>
                            <span className="text-sm truncate text-slate-700 dark:text-slate-300">{activity.title}</span>
                          </div>
                        );
                      })}
                      {monthActivities.length > 5 && (
                        <p className="text-sm text-slate-500 text-center">+{monthActivities.length - 5} more activities</p>
                      )}
                      {monthActivities.length === 0 && (
                        <p className="text-sm text-slate-500 text-center py-4">No activities planned</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Annual View */}
        {viewMode === 'annual' && (
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
            {WELLNESS_THEMES.map((theme, monthIndex) => {
              const monthActivities = getActivitiesForMonth(monthIndex);
              const ThemeIcon = theme.icon;
              return (
                <Card 
                  key={monthIndex} 
                  className={cn(
                    'cursor-pointer transition-all hover:shadow-lg',
                    monthIndex === currentMonth ? 'ring-2 ring-emerald-500' : ''
                  )}
                  onClick={() => {
                    setCurrentDate(new Date(currentYear, monthIndex, 1));
                    setViewMode('monthly');
                  }}
                >
                  <CardHeader className={cn('bg-gradient-to-r text-white rounded-t-lg py-3', theme.color)}>
                    <div className="flex items-center gap-2">
                      <ThemeIcon className="h-5 w-5" />
                      <CardTitle className="text-sm">{MONTHS[monthIndex]}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-3">
                    <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mb-2">{theme.name}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex gap-1">
                        {ACTIVITY_TYPES.slice(0, 4).map(type => {
                          const count = monthActivities.filter(a => a.type === type.value).length;
                          if (count === 0) return null;
                          return (
                            <Badge key={type.value} className={cn('text-[10px] px-1', type.color)}>
                              {count}
                            </Badge>
                          );
                        })}
                      </div>
                      <span className="text-xs text-slate-500">{monthActivities.length} activities</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Activity Types Legend */}
        <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
          <CardHeader>
            <CardTitle className="text-slate-900 dark:text-white">Activity Types</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {ACTIVITY_TYPES.map(type => (
                <div key={type.value} className="flex items-center gap-2">
                  <div className={cn('p-1.5 rounded', type.color)}>
                    <type.icon className="h-4 w-4" />
                  </div>
                  <span className="text-sm text-slate-600 dark:text-slate-400">{type.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Create Activity Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] flex flex-col overflow-hidden bg-white dark:bg-slate-800">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle className="text-slate-900 dark:text-white">Add Wellness Activity</DialogTitle>
              <DialogDescription className="text-slate-500 dark:text-slate-400">
                Schedule a new wellness activity on the calendar
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="flex-1 min-h-0 pr-4">
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Activity Title</Label>
                <Input
                  value={newActivity.title}
                  onChange={e => setNewActivity({ ...newActivity, title: e.target.value })}
                  placeholder="e.g., Heart Health Awareness Talk"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Activity Type</Label>
                  <Select value={newActivity.type} onValueChange={(v) => setNewActivity({ ...newActivity, type: v as ActivityType })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTIVITY_TYPES.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          <div className="flex items-center gap-2">
                            <type.icon className="h-4 w-4" />
                            {type.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(newActivity.date, 'PPP')}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={newActivity.date}
                        onSelect={date => date && setNewActivity({ ...newActivity, date })}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Time</Label>
                  <Input
                    type="time"
                    value={newActivity.startTime}
                    onChange={e => setNewActivity({ ...newActivity, startTime: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>End Time</Label>
                  <Input
                    type="time"
                    value={newActivity.endTime}
                    onChange={e => setNewActivity({ ...newActivity, endTime: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Location</Label>
                <Input
                  value={newActivity.location}
                  onChange={e => setNewActivity({ ...newActivity, location: e.target.value })}
                  placeholder="e.g., Conference Room A or Online (Zoom)"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Speaker/Facilitator</Label>
                  <Input
                    value={newActivity.speaker}
                    onChange={e => setNewActivity({ ...newActivity, speaker: e.target.value })}
                    placeholder="e.g., Dr. Priya Sharma"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Capacity</Label>
                  <Input
                    type="number"
                    value={newActivity.capacity}
                    onChange={e => setNewActivity({ ...newActivity, capacity: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={newActivity.description}
                  onChange={e => setNewActivity({ ...newActivity, description: e.target.value })}
                  placeholder="Brief description of the activity..."
                  rows={3}
                />
              </div>

              {/* Participant Selection Section */}
              <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  <UsersRound className="h-5 w-5 text-emerald-600" />
                  <Label className="text-base font-semibold">Participant Selection</Label>
                </div>
                
                <RadioGroup 
                  value={newActivity.participantSelection} 
                  onValueChange={(v) => setNewActivity({
                    ...newActivity,
                    participantSelection: v as ParticipantSelection,
                    selectedDepartments: [],
                    selectedEmployeeIds: []
                  })}
                  className="grid grid-cols-2 gap-3"
                >
                  <div className="flex items-center space-x-2 p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <RadioGroupItem value="all" id="all" />
                    <Label htmlFor="all" className="cursor-pointer flex-1">
                      <div className="font-medium">All Employees</div>
                      <div className="text-xs text-slate-500">{employees.length} employees</div>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2 p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <RadioGroupItem value="department" id="department" />
                    <Label htmlFor="department" className="cursor-pointer flex-1">
                      <div className="font-medium">By Department</div>
                      <div className="text-xs text-slate-500">Select departments</div>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2 p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <RadioGroupItem value="custom" id="custom" />
                    <Label htmlFor="custom" className="cursor-pointer flex-1">
                      <div className="font-medium">Custom</div>
                      <div className="text-xs text-slate-500">Hand-pick employees</div>
                    </Label>
                  </div>
                </RadioGroup>

                {/* Department Selection */}
                {newActivity.participantSelection === 'department' && (
                  <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                    <Label className="text-sm font-medium">Select Departments</Label>
                    {realDepartments.length === 0 ? (
                      <p className="text-xs text-slate-500 italic">No department data on file for your employee roster yet.</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                        {realDepartments.map(dept => (
                          <div key={dept} className="flex items-center space-x-2">
                            <Checkbox
                              id={dept}
                              checked={newActivity.selectedDepartments.includes(dept)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setNewActivity({ ...newActivity, selectedDepartments: [...newActivity.selectedDepartments, dept] });
                                } else {
                                  setNewActivity({ ...newActivity, selectedDepartments: newActivity.selectedDepartments.filter(d => d !== dept) });
                                }
                              }}
                            />
                            <Label htmlFor={dept} className="text-sm cursor-pointer">{dept}</Label>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Custom employee picker -- search the real roster and hand-pick */}
                {newActivity.participantSelection === 'custom' && (
                  <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                    <Label className="text-sm font-medium">Select Employees</Label>
                    <Input
                      placeholder="Search by name or email…"
                      value={employeePickerSearch}
                      onChange={(e) => setEmployeePickerSearch(e.target.value)}
                      className="h-8 text-xs"
                    />
                    <div className="max-h-48 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-600 border border-slate-200 dark:border-slate-600 rounded-md">
                      {employees
                        .filter(e => {
                          const q = employeePickerSearch.trim().toLowerCase();
                          if (!q) return true;
                          return e.name.toLowerCase().includes(q) || e.email.toLowerCase().includes(q);
                        })
                        .slice(0, 100)
                        .map(emp => (
                          <label key={emp.id} htmlFor={`emp-${emp.id}`} className="flex items-center gap-2 px-2 py-1.5 text-xs cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700">
                            <Checkbox
                              id={`emp-${emp.id}`}
                              checked={newActivity.selectedEmployeeIds.includes(emp.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setNewActivity({ ...newActivity, selectedEmployeeIds: [...newActivity.selectedEmployeeIds, emp.id] });
                                } else {
                                  setNewActivity({ ...newActivity, selectedEmployeeIds: newActivity.selectedEmployeeIds.filter(id => id !== emp.id) });
                                }
                              }}
                            />
                            <span className="truncate flex-1">{emp.name}{emp.department ? ` · ${emp.department}` : ''}</span>
                          </label>
                        ))}
                      {employees.length === 0 && (
                        <p className="text-xs text-slate-500 italic p-2">No employees loaded.</p>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">{newActivity.selectedEmployeeIds.length} selected</p>
                  </div>
                )}

                {/* Participant Count Preview */}
                <div className="flex items-center justify-between p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
                  <div className="flex items-center gap-2">
                    <UserPlus className="h-5 w-5 text-emerald-600" />
                    <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Selected Participants</span>
                  </div>
                  <span className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{getParticipantCount()}</span>
                </div>
              </div>

              {/* Reminder Settings Section */}
              <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  <Bell className="h-5 w-5 text-amber-600" />
                  <Label className="text-base font-semibold">Reminder Settings</Label>
                </div>
                
                <div className="space-y-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                        <span className="text-xs font-bold text-amber-700">15</span>
                      </div>
                      <Label className="cursor-pointer">15 Days Before</Label>
                    </div>
                    <Switch
                      checked={newActivity.reminders.fifteenDays}
                      onCheckedChange={(checked) => setNewActivity({
                        ...newActivity,
                        reminders: { ...newActivity.reminders, fifteenDays: checked }
                      })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center">
                        <span className="text-xs font-bold text-orange-700">3</span>
                      </div>
                      <Label className="cursor-pointer">3 Days Before</Label>
                    </div>
                    <Switch
                      checked={newActivity.reminders.threeDays}
                      onCheckedChange={(checked) => setNewActivity({
                        ...newActivity,
                        reminders: { ...newActivity.reminders, threeDays: checked }
                      })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                        <span className="text-xs font-bold text-red-700">1</span>
                      </div>
                      <Label className="cursor-pointer">1 Day Before</Label>
                    </div>
                    <Switch
                      checked={newActivity.reminders.oneDayBefore}
                      onCheckedChange={(checked) => setNewActivity({
                        ...newActivity,
                        reminders: { ...newActivity.reminders, oneDayBefore: checked }
                      })}
                    />
                  </div>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  <Mail className="h-3 w-3 inline mr-1" />
                  Calendar invites with reminders will be sent to selected participants
                </p>
              </div>
            </div>
            </ScrollArea>
            <DialogFooter className="flex-shrink-0 pt-2">
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateActivity} disabled={!newActivity.title.trim()} className="bg-gradient-to-r from-teal-500 to-emerald-600">
                Add Activity
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Activity Dialog */}
        <Dialog open={viewActivityOpen} onOpenChange={setViewActivityOpen}>
          <DialogContent className="max-w-2xl bg-white dark:bg-slate-800">
            {selectedActivity && (() => {
              const typeInfo = getActivityTypeInfo(selectedActivity.type);
              const TypeIcon = typeInfo.icon;
              return (
                <>
                  <DialogHeader>
                    <div className="flex items-center gap-3">
                      <div className={cn('p-2 rounded-lg', typeInfo.color)}>
                        <TypeIcon className="h-5 w-5" />
                      </div>
                      <div>
                        <DialogTitle className="text-slate-900 dark:text-white">{selectedActivity.title}</DialogTitle>
                        <DialogDescription className="text-slate-500 dark:text-slate-400">
                          {typeInfo.label} • {selectedActivity.theme}
                        </DialogDescription>
                      </div>
                    </div>
                  </DialogHeader>
                  {/* Tab bar */}
                  <div className="flex border-b border-slate-200 dark:border-slate-700">
                    <button
                      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${viewActivityTab === 'details' ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                      onClick={() => setViewActivityTab('details')}
                    >Details</button>
                    <button
                      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${viewActivityTab === 'registrations' ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                      onClick={() => setViewActivityTab('registrations')}
                    >Registrations</button>
                  </div>
                  {viewActivityTab === 'details' && (
                  <ScrollArea className="max-h-[55vh]">
                  <div className="space-y-4 py-4">
                    <p className="text-slate-600 dark:text-slate-400">{selectedActivity.description}</p>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                        <CalendarIcon className="h-4 w-4" />
                        <span>{format(new Date(selectedActivity.date), 'MMMM d, yyyy')}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                        <Clock className="h-4 w-4" />
                        <span>{selectedActivity.startTime} - {selectedActivity.endTime}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                        <MapPin className="h-4 w-4" />
                        <span>{selectedActivity.location}</span>
                      </div>
                      {selectedActivity.speaker && (
                        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                          <User className="h-4 w-4" />
                          <span>{selectedActivity.speaker}</span>
                        </div>
                      )}
                    </div>

                    {selectedActivity.capacity && (
                      <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-slate-600 dark:text-slate-400">Registration</span>
                          <span className="text-sm font-medium text-slate-900 dark:text-white">
                            {selectedActivity.registered} / {selectedActivity.capacity}
                          </span>
                        </div>
                        <div className="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-2">
                          <div 
                            className="bg-emerald-500 h-2 rounded-full"
                            style={{ width: `${((selectedActivity.registered || 0) / selectedActivity.capacity) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Participant Selection Info */}
                    <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                          <UsersRound className="h-4 w-4" />
                          Target Participants
                        </span>
                        <Badge className="bg-emerald-100 text-emerald-700">
                          {selectedActivity.totalInvited || 0} employees
                        </Badge>
                      </div>
                      <p className="text-xs text-emerald-600 dark:text-emerald-500">
                        Selection: {selectedActivity.participantSelection === 'all' ? 'All Employees' :
                          selectedActivity.participantSelection === 'department' ? `Departments: ${selectedActivity.selectedDepartments?.join(', ') || 'None'}` :
                          selectedActivity.participantSelection === 'custom' ? `${selectedActivity.selectedEmployeeIds?.length || 0} hand-picked employees` :
                          'All Employees'}
                      </p>
                    </div>

                    {/* Invite Status */}
                    <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                            <Mail className="h-4 w-4" />
                            Calendar Invites
                          </p>
                          {selectedActivity.invitesSent ? (
                            <p className="text-xs text-emerald-600 flex items-center gap-1 mt-1">
                              <CheckCircle className="h-3 w-3" />
                              Sent on {selectedActivity.invitesSentDate}
                            </p>
                          ) : (
                            <p className="text-xs text-slate-500 mt-1">Not sent yet</p>
                          )}
                        </div>
                        {!selectedActivity.invitesSent && selectedActivity.status === 'upcoming' && (
                          <Button 
                            size="sm" 
                            className="bg-gradient-to-r from-teal-500 to-emerald-600"
                            onClick={() => {
                              setInviteDialogOpen(true);
                            }}
                          >
                            <Send className="h-4 w-4 mr-1" />
                            Send Invites
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Reminder Settings Display */}
                    {selectedActivity.reminders && (
                      <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                        <p className="text-sm font-medium text-amber-700 dark:text-amber-400 flex items-center gap-2 mb-2">
                          <Bell className="h-4 w-4" />
                          Reminder Schedule
                        </p>
                        <div className="flex gap-2">
                          {selectedActivity.reminders.fifteenDays && (
                            <Badge variant="outline" className="text-xs bg-amber-100 text-amber-700 border-amber-300">15 days</Badge>
                          )}
                          {selectedActivity.reminders.threeDays && (
                            <Badge variant="outline" className="text-xs bg-orange-100 text-orange-700 border-orange-300">3 days</Badge>
                          )}
                          {selectedActivity.reminders.oneDayBefore && (
                            <Badge variant="outline" className="text-xs bg-red-100 text-red-700 border-red-300">1 day</Badge>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <Badge className={cn(
                        selectedActivity.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                        selectedActivity.status === 'upcoming' ? 'bg-blue-100 text-blue-700' :
                        selectedActivity.status === 'ongoing' ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      )}>
                        {selectedActivity.status.charAt(0).toUpperCase() + selectedActivity.status.slice(1)}
                      </Badge>
                    </div>
                  </div>
                  </ScrollArea>
                  )}
                  {viewActivityTab === 'registrations' && (
                  <ScrollArea className="max-h-[55vh]">
                  <div className="py-4">
                    {registrationsLoading ? (
                      <div className="py-8 flex justify-center">
                        <RefreshCw className="h-6 w-6 animate-spin text-slate-400" />
                      </div>
                    ) : (
                      <>
                        {registrationsEvent && (
                          <div className="mb-3 flex items-center justify-between px-1">
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                              {registrationsEvent.registered_count} / {registrationsEvent.max_participants ?? '∞'} registered
                            </span>
                            {registrations.length > 0 && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1"
                                onClick={() => {
                                  const rows = [
                                    ['Employee ID', 'Name', 'Department', 'Status', 'Registered At'],
                                    ...registrations.map(r => [
                                      r.employeeId || '',
                                      r.employeeName || '',
                                      r.department || '',
                                      r.status || '',
                                      r.invitedAt ? new Date(r.invitedAt).toLocaleDateString() : '',
                                    ]),
                                  ];
                                  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
                                  const blob = new Blob([csv], { type: 'text/csv' });
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = `registrations-${selectedActivity?.title?.replace(/\s+/g, '-') ?? 'activity'}-${new Date().toISOString().slice(0, 10)}.csv`;
                                  a.click();
                                  URL.revokeObjectURL(url);
                                }}
                              >
                                <Download className="h-3 w-3" />
                                Export CSV
                              </Button>
                            )}
                          </div>
                        )}
                        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-slate-200 dark:border-slate-700 text-xs text-slate-500 uppercase tracking-wide">
                                <th className="px-3 py-2 text-left">Emp ID</th>
                                <th className="px-3 py-2 text-left">Name</th>
                                <th className="px-3 py-2 text-left">Dept</th>
                                <th className="px-3 py-2 text-left">Status</th>
                                <th className="px-3 py-2 text-left">Registered At</th>
                                <th className="px-3 py-2"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {registrations.map((r) => (
                                <tr key={r.id} className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                                  <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">{r.employeeId || '—'}</td>
                                  <td className="px-3 py-2 font-medium text-slate-900 dark:text-white">{r.employeeName}</td>
                                  <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">{r.department || '—'}</td>
                                  <td className="px-3 py-2">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                      r.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                                      r.status === 'cancelled' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                                      'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                    }`}>{r.status}</span>
                                  </td>
                                  <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                                    {r.invitedAt ? new Date(r.invitedAt).toLocaleDateString() : '—'}
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    {r.status !== 'cancelled' && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20"
                                        onClick={() => cancelRegistration(String(r.id))}
                                      >
                                        Cancel
                                      </Button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                              {registrations.length === 0 && (
                                <tr>
                                  <td colSpan={6} className="py-8 text-center text-slate-500 text-sm">No registrations yet</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>
                  </ScrollArea>
                  )}
                  <DialogFooter>
                    <Button variant="outline" className="text-red-600" onClick={() => {
                      handleDeleteActivity(selectedActivity.id);
                      setViewActivityOpen(false);
                    }}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                    <Button variant="outline">
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                  </DialogFooter>
                </>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Wellness Themes Dialog */}
        <Dialog open={themeDialogOpen} onOpenChange={setThemeDialogOpen}>
          <DialogContent className="max-w-2xl bg-white dark:bg-slate-800">
            <DialogHeader>
              <DialogTitle className="text-slate-900 dark:text-white">Annual Wellness Themes</DialogTitle>
              <DialogDescription className="text-slate-500 dark:text-slate-400">
                Monthly wellness focus areas for the year
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="h-[400px]">
              <div className="grid gap-3 p-1">
                {WELLNESS_THEMES.map((theme, index) => {
                  const ThemeIcon = theme.icon;
                  const monthActivities = getActivitiesForMonth(index);
                  return (
                    <div 
                      key={index}
                      className={cn(
                        'flex items-center gap-4 p-4 rounded-lg cursor-pointer transition-colors',
                        index === currentMonth ? 'bg-emerald-50 dark:bg-emerald-900/20 ring-1 ring-emerald-300' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                      )}
                      onClick={() => {
                        setCurrentDate(new Date(currentYear, index, 1));
                        setViewMode('monthly');
                        setThemeDialogOpen(false);
                      }}
                    >
                      <div className={cn('p-3 rounded-lg bg-gradient-to-br text-white', theme.color)}>
                        <ThemeIcon className="h-6 w-6" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-slate-900 dark:text-white">{MONTHS[index]}</h4>
                          {index === currentMonth && (
                            <Badge className="bg-emerald-100 text-emerald-700 text-xs">Current</Badge>
                          )}
                        </div>
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{theme.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{theme.description}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-slate-900 dark:text-white">{monthActivities.length}</p>
                        <p className="text-xs text-slate-500">activities</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>

        {/* Send Invites Confirmation Dialog */}
        <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
          <DialogContent className="max-w-md bg-white dark:bg-slate-800">
            <DialogHeader>
              <DialogTitle className="text-slate-900 dark:text-white flex items-center gap-2">
                <Send className="h-5 w-5 text-emerald-600" />
                Send Calendar Invites
              </DialogTitle>
              <DialogDescription className="text-slate-500 dark:text-slate-400">
                Send calendar invites with reminders to participants
              </DialogDescription>
            </DialogHeader>
            {selectedActivity && (
              <div className="space-y-4 py-4">
                <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
                  <h4 className="font-semibold text-emerald-700 dark:text-emerald-400">{selectedActivity.title}</h4>
                  <p className="text-sm text-emerald-600 dark:text-emerald-500 mt-1">
                    {format(new Date(selectedActivity.date), 'MMMM d, yyyy')} • {selectedActivity.startTime}
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                    <span className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-2">
                      <UsersRound className="h-4 w-4" />
                      Recipients
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {selectedActivity.totalInvited || getSelectedParticipants(
                        selectedActivity.participantSelection || 'all',
                        selectedActivity.selectedDepartments || [],
                        selectedActivity.selectedEmployeeIds || []
                      ).length} employees
                    </span>
                  </div>

                  <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-400 flex items-center gap-2 mb-2">
                      <Bell className="h-4 w-4" />
                      Reminders Included
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      {selectedActivity.reminders?.fifteenDays && (
                        <Badge variant="outline" className="text-xs bg-amber-100 text-amber-700 border-amber-300">
                          15 days before
                        </Badge>
                      )}
                      {selectedActivity.reminders?.threeDays && (
                        <Badge variant="outline" className="text-xs bg-orange-100 text-orange-700 border-orange-300">
                          3 days before
                        </Badge>
                      )}
                      {selectedActivity.reminders?.oneDayBefore && (
                        <Badge variant="outline" className="text-xs bg-red-100 text-red-700 border-red-300">
                          1 day before
                        </Badge>
                      )}
                      {!selectedActivity.reminders?.fifteenDays && !selectedActivity.reminders?.threeDays && !selectedActivity.reminders?.oneDayBefore && (
                        <span className="text-xs text-slate-500">No reminders set</span>
                      )}
                    </div>
                  </div>

                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <p className="text-sm text-blue-700 dark:text-blue-400 flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      A .ics calendar file will be sent to each participant's email
                    </p>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setInviteDialogOpen(false)} disabled={sendingInvites}>
                Cancel
              </Button>
              <Button 
                onClick={() => selectedActivity && handleSendInvites(selectedActivity)}
                disabled={sendingInvites}
                className="bg-gradient-to-r from-teal-500 to-emerald-600"
              >
                {sendingInvites ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send Invites
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </CorporateLayout>
  );
};

export default CorporateWellnessCalendar;

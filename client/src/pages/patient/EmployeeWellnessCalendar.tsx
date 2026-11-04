import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import MainLayout from '@/components/layout/MainLayout';
import { 
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  User,
  Users,
  CheckCircle,
  XCircle,
  Bell,
  Sparkles,
  Heart,
  Brain,
  Dumbbell,
  Apple,
  Stethoscope,
  Target,
  AlertCircle,
  CalendarCheck,
  CalendarX,
  Mail,
  Download,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  PartyPopper,
  Gift,
  Trophy,
  Star
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, isToday, differenceInDays, isPast } from 'date-fns';
import { cn } from '@/lib/utils';
import { useAuth } from '@/auth/AuthProvider';
import { Calendar } from '@/components/ui/calendar';

// Must match the categories Team login actually writes to event_type
// (TeamCorporateManagement.tsx's eventTypeColors / CorporateWellnessCalendar.tsx).
type ActivityType = 'Wellness Session' | 'Health Checkup' | 'Fitness Activity' | 'Mental Health' | 'Yoga & Meditation' | 'Nutrition Workshop' | 'Sports Day' | 'Safety Training' | 'Other';
type RSVPStatus = 'pending' | 'confirmed' | 'declined' | 'cancelled' | 'attended' | 'missed';

interface WellnessEvent {
  id: string;
  title: string;
  description: string;
  type: ActivityType;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  speaker?: string;
  capacity: number;
  registered: number;
  theme: string;
  icon: React.ComponentType<any>;
  color: string;
  // Employee specific data
  myRsvp: RSVPStatus;
  invitedDate?: string;
  reminderSent?: boolean;
  rewards?: string;
}

interface MonthTheme {
  name: string;
  description: string;
  icon: React.ComponentType<any>;
  color: string;
}

const ACTIVITY_TYPES: { value: ActivityType; label: string; icon: React.ComponentType<any>; color: string }[] = [
  { value: 'Wellness Session', label: 'Wellness Session', icon: Sparkles, color: 'bg-teal-100 text-teal-700' },
  { value: 'Health Checkup', label: 'Health Checkup', icon: Stethoscope, color: 'bg-blue-100 text-blue-700' },
  { value: 'Fitness Activity', label: 'Fitness Activity', icon: Dumbbell, color: 'bg-orange-100 text-orange-700' },
  { value: 'Mental Health', label: 'Mental Health', icon: Brain, color: 'bg-purple-100 text-purple-700' },
  { value: 'Yoga & Meditation', label: 'Yoga & Meditation', icon: Heart, color: 'bg-indigo-100 text-indigo-700' },
  { value: 'Nutrition Workshop', label: 'Nutrition Workshop', icon: Apple, color: 'bg-green-100 text-green-700' },
  { value: 'Sports Day', label: 'Sports Day', icon: Trophy, color: 'bg-red-100 text-red-700' },
  { value: 'Safety Training', label: 'Safety Training', icon: AlertCircle, color: 'bg-yellow-100 text-yellow-700' },
  { value: 'Other', label: 'Other', icon: CalendarCheck, color: 'bg-slate-100 text-slate-700' },
];

// invented-data-check: static-reference -- calendar theme configuration, not employee records.
const WELLNESS_THEMES: MonthTheme[] = [
  { name: 'New Year Wellness', description: 'Start fresh with health goals', icon: Sparkles, color: 'from-blue-500 to-indigo-600' },
  { name: 'Heart Health', description: 'Cardiovascular awareness', icon: Heart, color: 'from-red-500 to-pink-600' },
  { name: 'Nutrition Month', description: 'Healthy eating habits', icon: Apple, color: 'from-green-500 to-emerald-600' },
  { name: 'Mental Wellness', description: 'Stress management & mindfulness', icon: Brain, color: 'from-purple-500 to-violet-600' },
  { name: 'Physical Fitness', description: 'Exercise and movement', icon: Dumbbell, color: 'from-orange-500 to-red-600' },
  { name: 'Work-Life Balance', description: 'Holistic well-being', icon: Star, color: 'from-cyan-500 to-blue-600' },
  { name: 'Eye & Dental Health', description: 'Preventive care focus', icon: Stethoscope, color: 'from-teal-500 to-green-600' },
  { name: 'Women\'s Health', description: 'Gender-specific wellness', icon: Heart, color: 'from-pink-500 to-rose-600' },
  { name: 'Diabetes Awareness', description: 'Prevention & management', icon: Target, color: 'from-amber-500 to-orange-600' },
  { name: 'Men\'s Health', description: 'Focus on men\'s wellness', icon: Dumbbell, color: 'from-blue-600 to-indigo-700' },
  { name: 'Immunity Boost', description: 'Strengthen defenses', icon: Sparkles, color: 'from-yellow-500 to-amber-600' },
  { name: 'Year-End Review', description: 'Celebrate achievements', icon: PartyPopper, color: 'from-emerald-500 to-teal-600' },
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Generate ICS file for calendar download
const generateICSFile = (event: WellnessEvent): string => {
  const startDate = new Date(`${event.date}T${event.startTime}:00`);
  const endDate = new Date(`${event.date}T${event.endTime}:00`);
  
  const formatICSDate = (date: Date): string => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const uid = `${event.id}-${Date.now()}@mediczy.com`;
  
  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Mediczy//Wellness Calendar//EN
CALSCALE:GREGORIAN
METHOD:REQUEST
BEGIN:VEVENT
UID:${uid}
DTSTAMP:${formatICSDate(new Date())}
DTSTART:${formatICSDate(startDate)}
DTEND:${formatICSDate(endDate)}
SUMMARY:${event.title}
DESCRIPTION:${event.description}\\n\\nSpeaker: ${event.speaker || 'TBA'}\\n\\nTheme: ${event.theme}
LOCATION:${event.location}
ORGANIZER;CN=HR Wellness Team:mailto:wellness@company.com
STATUS:CONFIRMED
BEGIN:VALARM
TRIGGER:-P1D
ACTION:DISPLAY
DESCRIPTION:Reminder: ${event.title} tomorrow
END:VALARM
BEGIN:VALARM
TRIGGER:-PT2H
ACTION:DISPLAY
DESCRIPTION:Reminder: ${event.title} in 2 hours
END:VALARM
END:VEVENT
END:VCALENDAR`;
};

const downloadICSFile = (event: WellnessEvent) => {
  const icsContent = generateICSFile(event);
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${event.title.replace(/[^a-zA-Z0-9]/g, '_')}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
};

const EmployeeWellnessCalendar: React.FC = () => {
  const { toast } = useToast();
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<WellnessEvent[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<WellnessEvent | null>(null);
  const [viewEventOpen, setViewEventOpen] = useState(false);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('upcoming');

  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();
  const currentTheme = WELLNESS_THEMES[currentMonth];

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await api.get('/corporate/wellness-calendar/employee/events');
      const rawEvents: any[] = res.data?.data?.events || [];
      const mapped: WellnessEvent[] = rawEvents.map((r) => {
        const month = new Date(r.date).getMonth();
        const theme = WELLNESS_THEMES[month] || WELLNESS_THEMES[0];
        const typeInfo = ACTIVITY_TYPES.find(t => t.value === r.type) || { icon: CalendarCheck };
        return {
          ...r,
          theme: theme.name,
          icon: typeInfo.icon,
          color: theme.color,
        };
      });
      setEvents(mapped);
    } catch (error: any) {
      setEvents([]);
      toast({
        title: 'Failed to load wellness calendar',
        description: error?.response?.data?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRSVP = async (eventId: string, status: 'confirmed' | 'declined' | 'cancelled') => {
    setRsvpLoading(true);
    try {
      const { data } = await api.post(`/corporate/wellness-calendar/employee/events/${encodeURIComponent(eventId)}/rsvp`, { status });
      const registered = data?.data?.registered;

      setEvents(prev => prev.map(e =>
        e.id === eventId ? { ...e, myRsvp: status, registered: typeof registered === 'number' ? registered : e.registered } : e
      ));

      if (selectedEvent?.id === eventId) {
        setSelectedEvent(prev => prev ? { ...prev, myRsvp: status, registered: typeof registered === 'number' ? registered : prev.registered } : null);
      }

      toast({
        title: status === 'confirmed' ? 'You\'re In! 🎉' : status === 'cancelled' ? 'Registration Cancelled' : 'RSVP Declined',
        description: status === 'confirmed'
          ? 'You have confirmed your attendance. A calendar invite has been sent to your email.'
          : status === 'cancelled'
          ? 'Your registration has been cancelled. HR has been notified.'
          : 'You have declined this event. You can change your response anytime.'
      });

      if (status === 'confirmed' && selectedEvent) {
        downloadICSFile(selectedEvent);
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.response?.data?.message || 'Failed to update RSVP. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setRsvpLoading(false);
    }
  };

  const daysInMonth = useMemo(() => {
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  const getEventsForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return events.filter(e => e.date === dateStr);
  };

  const upcomingEvents = useMemo(() => 
    events.filter(e => new Date(e.date) >= new Date() && e.myRsvp !== 'declined' && e.myRsvp !== 'cancelled')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [events]
  );

  const myConfirmedEvents = useMemo(() => 
    events.filter(e => e.myRsvp === 'confirmed' && new Date(e.date) >= new Date())
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [events]
  );

  const pendingInvites = useMemo(() => 
    events.filter(e => e.myRsvp === 'pending' && new Date(e.date) >= new Date())
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [events]
  );

  const pastEvents = useMemo(() => 
    events.filter(e => new Date(e.date) < new Date())
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [events]
  );

  const stats = useMemo(() => ({
    totalUpcoming: upcomingEvents.length,
    confirmed: myConfirmedEvents.length,
    pending: pendingInvites.length,
    attended: events.filter(e => e.myRsvp === 'attended').length
  }), [upcomingEvents, myConfirmedEvents, pendingInvites, events]);

  const getActivityTypeInfo = (type: ActivityType) => {
    // Echo the raw value on an unrecognized type instead of silently
    // mislabeling it as a specific wrong category (see CorporateWellnessCalendar.tsx).
    return ACTIVITY_TYPES.find(t => t.value === type) || {
      value: type,
      label: type || 'Other',
      icon: CalendarCheck,
      color: 'bg-slate-100 text-slate-700',
    };
  };

  const getRsvpBadge = (status: RSVPStatus) => {
    switch (status) {
      case 'confirmed':
        return <Badge className="bg-emerald-100 text-emerald-700"><CheckCircle className="h-3 w-3 mr-1" />Confirmed</Badge>;
      case 'pending':
        return <Badge className="bg-amber-100 text-amber-700"><Bell className="h-3 w-3 mr-1" />Pending RSVP</Badge>;
      case 'declined':
        return <Badge className="bg-slate-100 text-slate-700"><XCircle className="h-3 w-3 mr-1" />Declined</Badge>;
      case 'cancelled':
        return <Badge className="bg-orange-100 text-orange-700"><CalendarX className="h-3 w-3 mr-1" />Cancelled</Badge>;
      case 'attended':
        return <Badge className="bg-blue-100 text-blue-700"><CheckCircle className="h-3 w-3 mr-1" />Attended</Badge>;
      case 'missed':
        return <Badge className="bg-red-100 text-red-700"><AlertCircle className="h-3 w-3 mr-1" />Missed</Badge>;
      default:
        return null;
    }
  };

  const handlePrevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const handleNextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const handleToday = () => setCurrentDate(new Date());

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-emerald-600" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <CalendarIcon className="h-7 w-7 text-teal-500" />
              Wellness Calendar
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              View upcoming wellness events and manage your participation
            </p>
          </div>
          <Button onClick={loadData} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Current Month Theme */}
        <Card className={cn('bg-gradient-to-r text-white border-0', currentTheme.color)}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white/20 rounded-xl">
                  <currentTheme.icon className="h-8 w-8" />
                </div>
                <div>
                  <p className="text-sm opacity-80">{MONTHS[currentMonth]} Theme</p>
                  <h2 className="text-2xl font-bold">{currentTheme.name}</h2>
                  <p className="text-sm opacity-90 mt-1">{currentTheme.description}</p>
                </div>
              </div>
              <div className="text-right hidden md:block">
                <p className="text-4xl font-bold">{stats.confirmed}</p>
                <p className="text-sm opacity-80">Events Confirmed</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <CalendarIcon className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">Upcoming Events</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.totalUpcoming}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 rounded-lg">
                  <CalendarCheck className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">Confirmed</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.confirmed}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <Bell className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">Pending RSVP</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.pending}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Trophy className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">Events Attended</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.attended}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
            <TabsTrigger value="upcoming" className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" />
              Upcoming
            </TabsTrigger>
            <TabsTrigger value="my-events" className="flex items-center gap-2">
              <CalendarCheck className="h-4 w-4" />
              My Events
            </TabsTrigger>
            <TabsTrigger value="invites" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Invites
              {stats.pending > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-amber-500 text-white rounded-full">{stats.pending}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="calendar" className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" />
              Calendar View
            </TabsTrigger>
          </TabsList>

          {/* Upcoming Events Tab */}
          <TabsContent value="upcoming" className="space-y-4">
            <div className="grid gap-4">
              {upcomingEvents.length === 0 ? (
                <Card className="bg-slate-50 dark:bg-slate-800/50 border-dashed">
                  <CardContent className="p-8 text-center">
                    <CalendarIcon className="h-12 w-12 mx-auto text-slate-400 mb-3" />
                    <p className="text-slate-500 font-medium">No upcoming events</p>
                    <p className="text-sm text-slate-400 mt-1">Check back later for new wellness activities</p>
                  </CardContent>
                </Card>
              ) : (
                upcomingEvents.map(event => {
                  const typeInfo = getActivityTypeInfo(event.type);
                  const TypeIcon = typeInfo.icon;
                  const daysUntil = differenceInDays(new Date(event.date), new Date());
                  
                  return (
                    <Card 
                      key={event.id} 
                      className={cn(
                        'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 overflow-hidden cursor-pointer hover:shadow-md transition-shadow',
                        event.myRsvp === 'pending' && 'ring-2 ring-amber-400'
                      )}
                      onClick={() => {
                        setSelectedEvent(event);
                        setViewEventOpen(true);
                      }}
                    >
                      <div className={cn('h-1.5 bg-gradient-to-r', event.color)} />
                      <CardContent className="p-4">
                        <div className="flex items-start gap-4">
                          <div className={cn('p-3 rounded-xl bg-gradient-to-br text-white', event.color)}>
                            <TypeIcon className="h-6 w-6" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h3 className="font-semibold text-slate-900 dark:text-white">{event.title}</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{event.description}</p>
                              </div>
                              {getRsvpBadge(event.myRsvp)}
                            </div>
                            
                            <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-slate-500 dark:text-slate-400">
                              <span className="flex items-center gap-1">
                                <CalendarIcon className="h-4 w-4" />
                                {format(new Date(event.date), 'EEEE, MMM d, yyyy')}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-4 w-4" />
                                {event.startTime} - {event.endTime}
                              </span>
                              <span className="flex items-center gap-1">
                                <MapPin className="h-4 w-4" />
                                {event.location.length > 30 ? event.location.substring(0, 30) + '...' : event.location}
                              </span>
                            </div>

                            <div className="flex items-center justify-between mt-3">
                              <div className="flex items-center gap-3">
                                <Badge className={typeInfo.color}>{typeInfo.label}</Badge>
                                <span className="text-sm text-slate-500">
                                  <Users className="h-4 w-4 inline mr-1" />
                                  {event.registered}/{event.capacity} registered
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                {daysUntil <= 3 && daysUntil >= 0 && (
                                  <Badge className="bg-red-100 text-red-700 animate-pulse">
                                    {daysUntil === 0 ? 'Today!' : daysUntil === 1 ? 'Tomorrow!' : `${daysUntil} days left`}
                                  </Badge>
                                )}
                                {event.myRsvp === 'pending' && (
                                  <Button 
                                    size="sm" 
                                    className="bg-emerald-600 hover:bg-emerald-700"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRSVP(event.id, 'confirmed');
                                    }}
                                  >
                                    <CheckCircle className="h-4 w-4 mr-1" />
                                    Confirm
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </TabsContent>

          {/* My Events Tab */}
          <TabsContent value="my-events" className="space-y-4">
            <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
              <CardHeader>
                <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2">
                  <CalendarCheck className="h-5 w-5 text-emerald-500" />
                  My Confirmed Events
                </CardTitle>
                <CardDescription className="text-slate-500">
                  Events you have confirmed attendance for
                </CardDescription>
              </CardHeader>
              <CardContent>
                {myConfirmedEvents.length === 0 ? (
                  <div className="text-center py-8">
                    <CalendarX className="h-12 w-12 mx-auto text-slate-400 mb-3" />
                    <p className="text-slate-500">No confirmed events yet</p>
                    <p className="text-sm text-slate-400 mt-1">Confirm your attendance to upcoming events</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {myConfirmedEvents.map(event => {
                      const typeInfo = getActivityTypeInfo(event.type);
                      const TypeIcon = typeInfo.icon;
                      const daysUntil = differenceInDays(new Date(event.date), new Date());
                      
                      return (
                        <div 
                          key={event.id}
                          className="flex items-center gap-4 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
                          onClick={() => {
                            setSelectedEvent(event);
                            setViewEventOpen(true);
                          }}
                        >
                          <div className={cn('p-2 rounded-lg bg-gradient-to-br text-white', event.color)}>
                            <TypeIcon className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-slate-900 dark:text-white">{event.title}</h4>
                            <p className="text-sm text-slate-500">
                              {format(new Date(event.date), 'MMM d')} • {event.startTime}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {daysUntil <= 3 && daysUntil >= 0 && (
                              <Badge className="bg-amber-100 text-amber-700">
                                {daysUntil === 0 ? 'Today' : `${daysUntil}d`}
                              </Badge>
                            )}
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadICSFile(event);
                                toast({ title: 'Calendar file downloaded!' });
                              }}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Past Events */}
            <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
              <CardHeader>
                <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-purple-500" />
                  Past Events
                </CardTitle>
                <CardDescription className="text-slate-500">
                  Your participation history
                </CardDescription>
              </CardHeader>
              <CardContent>
                {pastEvents.length === 0 ? (
                  <div className="text-center py-6 text-slate-500">
                    No past events
                  </div>
                ) : (
                  <div className="space-y-2">
                    {pastEvents.slice(0, 5).map(event => {
                      const typeInfo = getActivityTypeInfo(event.type);
                      return (
                        <div key={event.id} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                          <div className={cn('p-2 rounded', typeInfo.color)}>
                            <typeInfo.icon className="h-4 w-4" />
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-slate-900 dark:text-white">{event.title}</p>
                            <p className="text-xs text-slate-500">{format(new Date(event.date), 'MMM d, yyyy')}</p>
                          </div>
                          {getRsvpBadge(event.myRsvp)}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Pending Invites Tab */}
          <TabsContent value="invites" className="space-y-4">
            <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
              <CardHeader>
                <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2">
                  <Mail className="h-5 w-5 text-amber-500" />
                  Pending Invitations
                  {stats.pending > 0 && (
                    <Badge className="bg-amber-100 text-amber-700 ml-2">{stats.pending} pending</Badge>
                  )}
                </CardTitle>
                <CardDescription className="text-slate-500">
                  Events waiting for your response
                </CardDescription>
              </CardHeader>
              <CardContent>
                {pendingInvites.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle className="h-12 w-12 mx-auto text-emerald-500 mb-3" />
                    <p className="text-slate-500 font-medium">All caught up!</p>
                    <p className="text-sm text-slate-400 mt-1">No pending invitations</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {pendingInvites.map(event => {
                      const typeInfo = getActivityTypeInfo(event.type);
                      const TypeIcon = typeInfo.icon;
                      const daysUntil = differenceInDays(new Date(event.date), new Date());
                      
                      return (
                        <div 
                          key={event.id}
                          className="p-4 border-2 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 rounded-xl"
                        >
                          <div className="flex items-start gap-4">
                            <div className={cn('p-3 rounded-xl bg-gradient-to-br text-white', event.color)}>
                              <TypeIcon className="h-6 w-6" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-start justify-between">
                                <div>
                                  <h4 className="font-semibold text-slate-900 dark:text-white">{event.title}</h4>
                                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{event.description}</p>
                                </div>
                                {daysUntil <= 7 && (
                                  <Badge className="bg-red-100 text-red-700">
                                    {daysUntil === 0 ? 'Today!' : `${daysUntil} days`}
                                  </Badge>
                                )}
                              </div>
                              
                              <div className="flex flex-wrap gap-3 mt-3 text-sm text-slate-500">
                                <span className="flex items-center gap-1">
                                  <CalendarIcon className="h-4 w-4" />
                                  {format(new Date(event.date), 'MMM d, yyyy')}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="h-4 w-4" />
                                  {event.startTime}
                                </span>
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-4 w-4" />
                                  {event.location.substring(0, 25)}...
                                </span>
                              </div>

                              {event.rewards && (
                                <div className="mt-3 p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                                  <span className="text-sm text-amber-700 dark:text-amber-400 flex items-center gap-1">
                                    <Gift className="h-4 w-4" />
                                    Reward: {event.rewards}
                                  </span>
                                </div>
                              )}

                              <div className="flex items-center gap-3 mt-4">
                                <Button 
                                  className="bg-emerald-600 hover:bg-emerald-700 flex-1"
                                  onClick={() => handleRSVP(event.id, 'confirmed')}
                                  disabled={rsvpLoading}
                                >
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  I'll Attend
                                </Button>
                                <Button 
                                  variant="outline"
                                  className="flex-1"
                                  onClick={() => handleRSVP(event.id, 'declined')}
                                  disabled={rsvpLoading}
                                >
                                  <XCircle className="h-4 w-4 mr-2" />
                                  Can't Make It
                                </Button>
                                <Button 
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setSelectedEvent(event);
                                    setViewEventOpen(true);
                                  }}
                                >
                                  <Sparkles className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Calendar View Tab */}
          <TabsContent value="calendar" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-3">
              {/* Calendar */}
              <Card className="lg:col-span-2 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-slate-900 dark:text-white">
                      {MONTHS[currentMonth]} {currentYear}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={handlePrevMonth}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleToday}>
                        Today
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleNextMonth}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Calendar Grid */}
                  <div className="grid grid-cols-7 gap-1 mb-2">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                      <div key={day} className="text-center text-sm font-medium text-slate-500 py-2">
                        {day}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {/* Empty cells for days before month starts */}
                    {Array.from({ length: startOfMonth(currentDate).getDay() }).map((_, i) => (
                      <div key={`empty-${i}`} className="h-20 p-1" />
                    ))}
                    {/* Days of month */}
                    {daysInMonth.map(day => {
                      const dayEvents = getEventsForDate(day);
                      const hasEvents = dayEvents.length > 0;
                      const hasPending = dayEvents.some(e => e.myRsvp === 'pending');
                      const hasConfirmed = dayEvents.some(e => e.myRsvp === 'confirmed');
                      
                      return (
                        <div
                          key={day.toISOString()}
                          onClick={() => setSelectedDate(day)}
                          className={cn(
                            'h-20 p-1 rounded-lg cursor-pointer transition-colors overflow-hidden',
                            isToday(day) && 'bg-emerald-50 dark:bg-emerald-900/20 ring-2 ring-emerald-500',
                            selectedDate && isSameDay(day, selectedDate) && 'bg-blue-50 dark:bg-blue-900/20',
                            !isToday(day) && !selectedDate && 'hover:bg-slate-50 dark:hover:bg-slate-700/50',
                            isPast(day) && !isToday(day) && 'opacity-60'
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <span className={cn(
                              'text-sm font-medium',
                              isToday(day) ? 'text-emerald-600' : 'text-slate-900 dark:text-white'
                            )}>
                              {format(day, 'd')}
                            </span>
                            {hasEvents && (
                              <div className="flex gap-0.5">
                                {hasPending && <div className="w-2 h-2 rounded-full bg-amber-500" />}
                                {hasConfirmed && <div className="w-2 h-2 rounded-full bg-emerald-500" />}
                              </div>
                            )}
                          </div>
                          <div className="mt-1 space-y-0.5">
                            {dayEvents.slice(0, 2).map(evt => {
                              const typeInfo = getActivityTypeInfo(evt.type);
                              return (
                                <div 
                                  key={evt.id} 
                                  className={cn('text-xs px-1 py-0.5 rounded truncate', typeInfo.color)}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedEvent(evt);
                                    setViewEventOpen(true);
                                  }}
                                >
                                  {evt.title.substring(0, 15)}...
                                </div>
                              );
                            })}
                            {dayEvents.length > 2 && (
                              <p className="text-xs text-slate-500">+{dayEvents.length - 2} more</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Selected Date Events */}
              <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                <CardHeader>
                  <CardTitle className="text-slate-900 dark:text-white">
                    {selectedDate ? format(selectedDate, 'MMMM d, yyyy') : 'Select a Date'}
                  </CardTitle>
                  <CardDescription className="text-slate-500">
                    {selectedDate ? `Events on this day` : 'Click on a date to see events'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    {selectedDate ? (
                      getEventsForDate(selectedDate).length > 0 ? (
                        <div className="space-y-3">
                          {getEventsForDate(selectedDate).map(event => {
                            const typeInfo = getActivityTypeInfo(event.type);
                            const TypeIcon = typeInfo.icon;
                            return (
                              <div
                                key={event.id}
                                className="p-3 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50"
                                onClick={() => {
                                  setSelectedEvent(event);
                                  setViewEventOpen(true);
                                }}
                              >
                                <div className="flex items-center gap-2">
                                  <div className={cn('p-1.5 rounded', typeInfo.color)}>
                                    <TypeIcon className="h-4 w-4" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <h4 className="font-medium text-sm text-slate-900 dark:text-white truncate">{event.title}</h4>
                                    <p className="text-xs text-slate-500">{event.startTime} - {event.endTime}</p>
                                  </div>
                                </div>
                                <div className="mt-2">
                                  {getRsvpBadge(event.myRsvp)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-slate-500">
                          <CalendarIcon className="h-10 w-10 mx-auto mb-2 opacity-50" />
                          No events on this date
                        </div>
                      )
                    ) : (
                      <div className="text-center py-8 text-slate-500">
                        <CalendarIcon className="h-10 w-10 mx-auto mb-2 opacity-50" />
                        Select a date to view events
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Event Details Dialog */}
        <Dialog open={viewEventOpen} onOpenChange={setViewEventOpen}>
          <DialogContent className="max-w-lg bg-white dark:bg-slate-800">
            {selectedEvent && (() => {
              const typeInfo = getActivityTypeInfo(selectedEvent.type);
              const TypeIcon = typeInfo.icon;
              const daysUntil = differenceInDays(new Date(selectedEvent.date), new Date());
              const isPastEvent = isPast(new Date(selectedEvent.date));
              
              return (
                <>
                  <div className={cn('h-2 -mt-6 -mx-6 rounded-t-lg bg-gradient-to-r', selectedEvent.color)} />
                  <DialogHeader className="pt-2">
                    <div className="flex items-center gap-3">
                      <div className={cn('p-3 rounded-xl bg-gradient-to-br text-white', selectedEvent.color)}>
                        <TypeIcon className="h-6 w-6" />
                      </div>
                      <div>
                        <DialogTitle className="text-slate-900 dark:text-white">{selectedEvent.title}</DialogTitle>
                        <DialogDescription className="text-slate-500">
                          {typeInfo.label} • {selectedEvent.theme}
                        </DialogDescription>
                      </div>
                    </div>
                  </DialogHeader>
                  
                  <div className="space-y-4 py-4">
                    <p className="text-slate-600 dark:text-slate-400">{selectedEvent.description}</p>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                        <CalendarIcon className="h-4 w-4" />
                        <span>{format(new Date(selectedEvent.date), 'EEEE, MMMM d, yyyy')}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                        <Clock className="h-4 w-4" />
                        <span>{selectedEvent.startTime} - {selectedEvent.endTime}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 col-span-2">
                        <MapPin className="h-4 w-4 flex-shrink-0" />
                        <span>{selectedEvent.location}</span>
                      </div>
                      {selectedEvent.speaker && (
                        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 col-span-2">
                          <User className="h-4 w-4" />
                          <span>Speaker: {selectedEvent.speaker}</span>
                        </div>
                      )}
                    </div>

                    <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-slate-600 dark:text-slate-400">Registration</span>
                        <span className="text-sm font-medium text-slate-900 dark:text-white">
                          {selectedEvent.registered} / {selectedEvent.capacity}
                        </span>
                      </div>
                      <div className="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-2">
                        <div 
                          className="bg-emerald-500 h-2 rounded-full"
                          style={{ width: `${(selectedEvent.registered / selectedEvent.capacity) * 100}%` }}
                        />
                      </div>
                      {selectedEvent.registered >= selectedEvent.capacity && (
                        <p className="text-xs text-amber-600 mt-1">Event is fully booked</p>
                      )}
                    </div>

                    {selectedEvent.rewards && (
                      <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                        <span className="text-sm text-amber-700 dark:text-amber-400 flex items-center gap-2">
                          <Gift className="h-4 w-4" />
                          Reward: {selectedEvent.rewards}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      {getRsvpBadge(selectedEvent.myRsvp)}
                      {!isPastEvent && daysUntil <= 7 && daysUntil >= 0 && (
                        <Badge className="bg-red-100 text-red-700">
                          {daysUntil === 0 ? 'Today!' : daysUntil === 1 ? 'Tomorrow!' : `${daysUntil} days left`}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <DialogFooter className="flex-col sm:flex-row gap-2">
                    {!isPastEvent && selectedEvent.myRsvp === 'pending' && (
                      <>
                        <Button 
                          variant="outline" 
                          onClick={() => handleRSVP(selectedEvent.id, 'declined')}
                          disabled={rsvpLoading}
                          className="flex-1"
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Decline
                        </Button>
                        <Button 
                          onClick={() => handleRSVP(selectedEvent.id, 'confirmed')}
                          disabled={rsvpLoading}
                          className="bg-emerald-600 hover:bg-emerald-700 flex-1"
                        >
                          {rsvpLoading ? (
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <CheckCircle className="h-4 w-4 mr-2" />
                          )}
                          Confirm Attendance
                        </Button>
                      </>
                    )}
                    {!isPastEvent && selectedEvent.myRsvp === 'confirmed' && (
                      <>
                        <Button 
                          variant="outline"
                          onClick={() => {
                            downloadICSFile(selectedEvent);
                            toast({ title: 'Calendar file downloaded!' });
                          }}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Add to Calendar
                        </Button>
                        <Button
                          variant="outline"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => handleRSVP(selectedEvent.id, 'cancelled')}
                        >
                          <CalendarX className="h-4 w-4 mr-2" />
                          Cancel RSVP
                        </Button>
                      </>
                    )}
                    {!isPastEvent && selectedEvent.myRsvp === 'declined' && (
                      <Button 
                        onClick={() => handleRSVP(selectedEvent.id, 'confirmed')}
                        disabled={rsvpLoading}
                        className="bg-emerald-600 hover:bg-emerald-700"
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Change to Attending
                      </Button>
                    )}
                    {isPastEvent && (
                      <p className="text-sm text-slate-500 text-center w-full">This event has already passed</p>
                    )}
                  </DialogFooter>
                </>
              );
            })()}
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
};

export default EmployeeWellnessCalendar;

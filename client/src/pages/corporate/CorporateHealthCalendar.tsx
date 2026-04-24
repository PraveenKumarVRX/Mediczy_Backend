import React, { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  MapPin,
  Users,
  Stethoscope,
  Heart,
  Activity,
  Eye,
  Syringe,
  RefreshCw,
  Filter,
  CalendarCheck,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';
import CorporateLayout from '@/components/corporate/CorporateLayout';
import CorporatePageHeader from '@/components/corporate/CorporatePageHeader';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  isToday,
  parseISO,
} from 'date-fns';
import { cn } from '@/lib/utils';

type EventType = 'checkup' | 'screening' | 'vaccination' | 'consultation' | 'camp' | 'workshop';

interface HealthEvent {
  id: string;
  title: string;
  date: string;
  time?: string;
  type: EventType;
  department?: string;
  location?: string;
  participants?: number;
  notes?: string;
  status: 'upcoming' | 'completed' | 'cancelled';
}

const EVENT_COLORS: Record<EventType, { bg: string; text: string; dot: string; badge: string }> = {
  checkup:      { bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700' },
  screening:    { bg: 'bg-blue-50 dark:bg-blue-900/20',    text: 'text-blue-700 dark:text-blue-400',    dot: 'bg-blue-500',    badge: 'bg-blue-100 text-blue-700' },
  vaccination:  { bg: 'bg-purple-50 dark:bg-purple-900/20', text: 'text-purple-700 dark:text-purple-400', dot: 'bg-purple-500',  badge: 'bg-purple-100 text-purple-700' },
  consultation: { bg: 'bg-amber-50 dark:bg-amber-900/20',  text: 'text-amber-700 dark:text-amber-400',  dot: 'bg-amber-500',   badge: 'bg-amber-100 text-amber-700' },
  camp:         { bg: 'bg-rose-50 dark:bg-rose-900/20',    text: 'text-rose-700 dark:text-rose-400',    dot: 'bg-rose-500',    badge: 'bg-rose-100 text-rose-700' },
  workshop:     { bg: 'bg-teal-50 dark:bg-teal-900/20',    text: 'text-teal-700 dark:text-teal-400',    dot: 'bg-teal-500',    badge: 'bg-teal-100 text-teal-700' },
};

const DEFAULT_EVENT_COLOR = { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-400', dot: 'bg-slate-400', badge: 'bg-slate-100 text-slate-600' };
const getEventColor = (type: string) => EVENT_COLORS[type as EventType] ?? DEFAULT_EVENT_COLOR;

const EVENT_ICONS: Record<EventType, React.ElementType> = {
  checkup:      Stethoscope,
  screening:    Eye,
  vaccination:  Syringe,
  consultation: Heart,
  camp:         Users,
  workshop:     Activity,
};

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  checkup:      'Health Checkup',
  screening:    'Screening',
  vaccination:  'Vaccination',
  consultation: 'Consultation',
  camp:         'Health Camp',
  workshop:     'Workshop',
};

const CorporateHealthCalendar = () => {
  const { toast } = useToast();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [events, setEvents] = useState<HealthEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/corporate/health-calendar/events')
      .then(res => setEvents(res.data?.data?.events || []))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, []);
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<HealthEvent | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newEvent, setNewEvent] = useState<Partial<HealthEvent>>({ type: 'checkup', status: 'upcoming' });
  const [actionLoading, setActionLoading] = useState(false);

  // Build day → events map
  const eventsByDate = useMemo(() => {
    const map: Record<string, HealthEvent[]> = {};
    events.forEach((e) => {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    });
    return map;
  }, [events]);

  const monthDays = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const startDayOfWeek = startOfMonth(currentMonth).getDay(); // 0=Sun

  const filteredEvents = useMemo(() =>
    events
      .filter((e) => filterType === 'all' || e.type === filterType)
      .sort((a, b) => a.date.localeCompare(b.date)),
    [events, filterType]
  );

  const upcomingEvents = filteredEvents.filter((e) => e.status === 'upcoming').slice(0, 8);

  const getDayEvents = (day: Date) => {
    const key = format(day, 'yyyy-MM-dd');
    const dayEvts = eventsByDate[key] || [];
    return filterType === 'all' ? dayEvts : dayEvts.filter((e) => e.type === filterType);
  };

  const handleAddEvent = async () => {
    if (!newEvent.title || !newEvent.date || !newEvent.type) {
      toast({ title: 'Please fill required fields', variant: 'destructive' });
      return;
    }
    setActionLoading(true);
    try {
      const res = await api.post('/corporate/health-calendar/events', {
        title: newEvent.title,
        date: newEvent.date,
        time: newEvent.time,
        type: newEvent.type,
        location: newEvent.location,
        participants: newEvent.participants,
        notes: newEvent.notes,
      });
      const created: HealthEvent = res.data?.data?.event || {
        id: `evt-${Date.now()}`,
        title: newEvent.title!,
        date: newEvent.date!,
        time: newEvent.time,
        type: newEvent.type as EventType,
        location: newEvent.location,
        participants: newEvent.participants,
        status: 'upcoming',
      };
      setEvents((prev) => [...prev, created]);
      toast({ title: 'Health event added', description: `"${created.title}" scheduled for ${format(parseISO(created.date), 'MMM d, yyyy')}` });
      setAddDialogOpen(false);
      setNewEvent({ type: 'checkup', status: 'upcoming' });
    } catch {
      toast({ title: 'Failed to add event', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const monthStats = useMemo(() => {
    const monthStr = format(currentMonth, 'yyyy-MM');
    const monthEvts = events.filter((e) => e.date.startsWith(monthStr));
    return {
      total: monthEvts.length,
      upcoming: monthEvts.filter((e) => e.status === 'upcoming').length,
      completed: monthEvts.filter((e) => e.status === 'completed').length,
      participants: monthEvts.reduce((sum, e) => sum + (e.participants || 0), 0),
    };
  }, [events, currentMonth]);

  return (
    <CorporateLayout title="Health Calendar" subtitle="Schedule and track employee health events and checkups">
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6 space-y-6">
        <CorporatePageHeader
          icon={CalendarCheck}
          title="Health Calendar"
          description="Plan and track health checkups, screenings, vaccinations, and wellness events"
          gradient="from-teal-600 to-cyan-700"
          badge={{ text: format(currentMonth, 'MMMM yyyy'), variant: 'teal' }}
          actions={
            <Button onClick={() => setAddDialogOpen(true)} className="bg-teal-600 hover:bg-teal-700 text-white gap-2">
              <Plus className="w-4 h-4" /> Add Event
            </Button>
          }
        />

        {/* Month Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Events', value: monthStats.total, icon: Calendar, color: 'text-teal-600', bg: 'bg-teal-50 dark:bg-teal-900/20' },
            { label: 'Upcoming', value: monthStats.upcoming, icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
            { label: 'Completed', value: monthStats.completed, icon: CalendarCheck, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
            { label: 'Total Participants', value: monthStats.participants, icon: Users, color: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-900/20' },
          ].map((stat) => (
            <Card key={stat.label} className="border-slate-200 dark:border-slate-700/50">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${stat.bg}`}>
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{stat.value}</p>
                  <p className="text-xs text-slate-500">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Calendar */}
          <div className="lg:col-span-2">
            <Card className="border-slate-200 dark:border-slate-700/50">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Button variant="outline" size="icon" onClick={() => setCurrentMonth((m) => subMonths(m, 1))}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white min-w-[160px] text-center">
                      {format(currentMonth, 'MMMM yyyy')}
                    </h2>
                    <Button variant="outline" size="icon" onClick={() => setCurrentMonth((m) => addMonths(m, 1))}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(new Date())} className="text-teal-600">
                      Today
                    </Button>
                  </div>
                  <Select value={filterType} onValueChange={setFilterType}>
                    <SelectTrigger className="w-40">
                      <Filter className="w-3 h-3 mr-1 text-slate-400" />
                      <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      {(Object.keys(EVENT_TYPE_LABELS) as EventType[]).map((t) => (
                        <SelectItem key={t} value={t}>{EVENT_TYPE_LABELS[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {/* Weekday headers */}
                <div className="grid grid-cols-7 mb-2">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                    <div key={d} className="text-center text-xs font-semibold text-slate-400 py-2">{d}</div>
                  ))}
                </div>
                {/* Days grid */}
                <div className="grid grid-cols-7 gap-1">
                  {/* Empty cells for offset */}
                  {Array.from({ length: startDayOfWeek }).map((_, i) => (
                    <div key={`empty-${i}`} className="h-20" />
                  ))}
                  {monthDays.map((day) => {
                    const dayEvts = getDayEvents(day);
                    const isSelected = selectedDay && isSameDay(day, selectedDay);
                    const dayIsToday = isToday(day);
                    return (
                      <div
                        key={day.toString()}
                        onClick={() => setSelectedDay(isSameDay(day, selectedDay!) ? null : day)}
                        className={cn(
                          'h-20 p-1 rounded-lg border cursor-pointer transition-all text-sm',
                          isSelected
                            ? 'border-teal-400 bg-teal-50 dark:bg-teal-900/30'
                            : dayEvts.length > 0
                            ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/30 hover:border-teal-300'
                            : 'border-transparent hover:border-slate-200 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/20'
                        )}
                      >
                        <div className={cn(
                          'w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium mb-1',
                          dayIsToday ? 'bg-teal-500 text-white' : 'text-slate-700 dark:text-slate-300'
                        )}>
                          {format(day, 'd')}
                        </div>
                        <div className="space-y-0.5 overflow-hidden">
                          {dayEvts.slice(0, 2).map((evt) => (
                            <div
                              key={evt.id}
                              className={cn('text-[10px] px-1.5 py-0.5 rounded truncate font-medium', getEventColor(evt.type).badge)}
                              onClick={(e) => { e.stopPropagation(); setSelectedEvent(evt); }}
                            >
                              {evt.title}
                            </div>
                          ))}
                          {dayEvts.length > 2 && (
                            <div className="text-[10px] text-slate-400 px-1">+{dayEvts.length - 2} more</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Selected day events */}
                {selectedDay && (
                  <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                    <h3 className="font-semibold text-slate-800 dark:text-white mb-3">
                      {format(selectedDay, 'EEEE, MMMM d')}
                    </h3>
                    {getDayEvents(selectedDay).length === 0 ? (
                      <p className="text-sm text-slate-500">No events on this day.</p>
                    ) : (
                      <div className="space-y-2">
                        {getDayEvents(selectedDay).map((evt) => {
                          const Icon = EVENT_ICONS[evt.type as EventType] ?? Activity;
                          const colors = getEventColor(evt.type);
                          return (
                            <div key={evt.id} className={cn('p-3 rounded-lg border flex items-start gap-3', colors.bg)}>
                              <div className={cn('p-1.5 rounded-lg', colors.badge)}>
                                <Icon className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={cn('font-medium text-sm', colors.text)}>{evt.title}</p>
                                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-slate-500">
                                  {evt.time && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{evt.time}</span>}
                                  {evt.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{evt.location}</span>}
                                  {evt.participants && <span className="flex items-center gap-1"><Users className="w-3 h-3" />{evt.participants} participants</span>}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Upcoming Events */}
          <div className="space-y-4">
            <Card className="border-slate-200 dark:border-slate-700/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Clock className="w-4 h-4 text-teal-600" />
                  Upcoming Events
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-4 pt-0">
                {upcomingEvents.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-4">No upcoming events</p>
                ) : (
                  upcomingEvents.map((evt) => {
                    const Icon = EVENT_ICONS[evt.type as EventType] ?? Activity;
                    const colors = getEventColor(evt.type);
                    return (
                      <div
                        key={evt.id}
                        className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-teal-200 dark:hover:border-teal-800 cursor-pointer transition-all"
                        onClick={() => setSelectedEvent(evt)}
                      >
                        <div className={cn('p-2 rounded-lg flex-shrink-0', colors.badge)}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-slate-900 dark:text-white truncate">{evt.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {format(parseISO(evt.date), 'MMM d, yyyy')}{evt.time ? ` · ${evt.time}` : ''}
                          </p>
                          {evt.department && (
                            <p className="text-xs text-slate-400">{evt.department}</p>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            {/* Legend */}
            <Card className="border-slate-200 dark:border-slate-700/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-slate-600 dark:text-slate-400">Event Types</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 grid grid-cols-2 gap-2">
                {(Object.keys(EVENT_TYPE_LABELS) as EventType[]).map((type) => {
                  const Icon = EVENT_ICONS[type];
                  const colors = EVENT_COLORS[type];
                  return (
                    <div key={type} className="flex items-center gap-2 text-xs">
                      <span className={cn('w-2 h-2 rounded-full flex-shrink-0', colors.dot)} />
                      <span className="text-slate-600 dark:text-slate-400">{EVENT_TYPE_LABELS[type]}</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Event Detail Dialog */}
      {selectedEvent && (
        <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {React.createElement(EVENT_ICONS[selectedEvent.type as EventType] ?? Activity, { className: `w-5 h-5 ${getEventColor(selectedEvent.type).text}` })}
                {selectedEvent.title}
              </DialogTitle>
              <DialogDescription>
                <span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-medium', getEventColor(selectedEvent.type).badge)}>
                  {EVENT_TYPE_LABELS[selectedEvent.type]}
                </span>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-slate-400 mb-1">Date</p><p className="font-medium">{format(parseISO(selectedEvent.date), 'MMMM d, yyyy')}</p></div>
                {selectedEvent.time && <div><p className="text-xs text-slate-400 mb-1">Time</p><p className="font-medium">{selectedEvent.time}</p></div>}
                {selectedEvent.location && <div><p className="text-xs text-slate-400 mb-1">Location</p><p className="font-medium">{selectedEvent.location}</p></div>}
                {selectedEvent.department && <div><p className="text-xs text-slate-400 mb-1">Department</p><p className="font-medium">{selectedEvent.department}</p></div>}
                {selectedEvent.participants && <div><p className="text-xs text-slate-400 mb-1">Participants</p><p className="font-medium">{selectedEvent.participants}</p></div>}
              </div>
              {selectedEvent.notes && <div><p className="text-xs text-slate-400 mb-1">Notes</p><p>{selectedEvent.notes}</p></div>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedEvent(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Add Event Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Health Event</DialogTitle>
            <DialogDescription>Schedule a new health event for your employees.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Event Title *</Label>
              <Input placeholder="e.g. Annual Health Checkup" value={newEvent.title || ''} onChange={(e) => setNewEvent((p) => ({ ...p, title: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date *</Label>
                <Input type="date" value={newEvent.date || ''} onChange={(e) => setNewEvent((p) => ({ ...p, date: e.target.value }))} />
              </div>
              <div>
                <Label>Time</Label>
                <Input type="time" value={newEvent.time || ''} onChange={(e) => setNewEvent((p) => ({ ...p, time: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Event Type *</Label>
              <Select value={newEvent.type} onValueChange={(v) => setNewEvent((p) => ({ ...p, type: v as EventType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(EVENT_TYPE_LABELS) as EventType[]).map((t) => (
                    <SelectItem key={t} value={t}>{EVENT_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Department</Label>
                <Input placeholder="All Departments" value={newEvent.department || ''} onChange={(e) => setNewEvent((p) => ({ ...p, department: e.target.value }))} />
              </div>
              <div>
                <Label>Location</Label>
                <Input placeholder="Conference Room" value={newEvent.location || ''} onChange={(e) => setNewEvent((p) => ({ ...p, location: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Expected Participants</Label>
              <Input type="number" placeholder="0" value={newEvent.participants || ''} onChange={(e) => setNewEvent((p) => ({ ...p, participants: parseInt(e.target.value) || undefined }))} />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea placeholder="Additional details..." value={newEvent.notes || ''} onChange={(e) => setNewEvent((p) => ({ ...p, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddEvent} disabled={actionLoading} className="bg-teal-600 hover:bg-teal-700 text-white gap-2">
              <Plus className="w-4 h-4" /> {actionLoading ? 'Adding...' : 'Add Event'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CorporateLayout>
  );
};

export default CorporateHealthCalendar;

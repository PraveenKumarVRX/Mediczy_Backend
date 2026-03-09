import { useState } from 'react';
import InsurancePortalLayout from '@/components/hospital-insurance/InsurancePortalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, Clock } from 'lucide-react';

const InsuranceCalendarPage = () => {
  const { toast } = useToast();
  const [view, setView] = useState<'month' | 'week' | 'day'>('month');
  const [currentDate, setCurrentDate] = useState(new Date());

  const events = [
    { id: 1, title: 'Pre-Auth Follow-up - Rajesh Kumar', date: '2025-06-20', time: '10:00', type: 'followup', color: 'bg-blue-500' },
    { id: 2, title: 'Claim Submission Deadline - ICICI', date: '2025-06-20', time: '17:00', type: 'deadline', color: 'bg-red-500' },
    { id: 3, title: 'TPA Meeting - Star Health', date: '2025-06-21', time: '14:00', type: 'meeting', color: 'bg-purple-500' },
    { id: 4, title: 'Document Upload - PA-2025-0089', date: '2025-06-22', time: '11:00', type: 'task', color: 'bg-amber-500' },
    { id: 5, title: 'Discharge - Priya Singh', date: '2025-06-23', time: '09:00', type: 'discharge', color: 'bg-green-500' },
    { id: 6, title: 'Settlement Review Meeting', date: '2025-06-25', time: '15:00', type: 'meeting', color: 'bg-purple-500' },
    { id: 7, title: 'NHCX Onboarding Call', date: '2025-06-26', time: '11:00', type: 'meeting', color: 'bg-purple-500' },
    { id: 8, title: 'Monthly MIS Report Due', date: '2025-06-30', time: '23:59', type: 'deadline', color: 'bg-red-500' },
  ];

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return { firstDay, daysInMonth };
  };

  const { firstDay, daysInMonth } = getDaysInMonth(currentDate);
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const navigateMonth = (delta: number) => {
    const d = new Date(currentDate);
    d.setMonth(d.getMonth() + delta);
    setCurrentDate(d);
  };

  const getEventsForDate = (day: number) => {
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return events.filter(e => e.date === dateStr);
  };

  const today = new Date();
  const isToday = (day: number) =>
    today.getDate() === day &&
    today.getMonth() === currentDate.getMonth() &&
    today.getFullYear() === currentDate.getFullYear();

  return (
    <InsurancePortalLayout title="Calendar & Schedule" subtitle="Track deadlines, follow-ups, and meetings">
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" onClick={() => navigateMonth(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-lg font-semibold min-w-[200px] text-center">
              {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
            </h2>
            <Button variant="outline" size="icon" onClick={() => navigateMonth(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>Today</Button>
          </div>
          <div className="flex items-center gap-2">
            <Select value={view} onValueChange={(v: any) => setView(v)}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Month</SelectItem>
                <SelectItem value="week">Week</SelectItem>
                <SelectItem value="day">Day</SelectItem>
              </SelectContent>
            </Select>
            <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => toast({ title: 'Add Event', description: 'Event creation dialog — coming soon.' })}>
              <Plus className="h-4 w-4 mr-1" /> Add Event
            </Button>
          </div>
        </div>

        {/* Month View Calendar */}
        {view === 'month' && (
          <Card>
            <CardContent className="p-2">
              <div className="grid grid-cols-7">
                {dayNames.map(day => (
                  <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2 border-b">{day}</div>
                ))}
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`empty-${i}`} className="min-h-[100px] border-r border-b p-1 bg-slate-50/50 dark:bg-slate-900/50" />
                ))}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const dayEvents = getEventsForDate(day);
                  return (
                    <div key={day} className={`min-h-[100px] border-r border-b p-1 hover:bg-slate-50 dark:hover:bg-slate-800/50 ${isToday(day) ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''}`}>
                      <div className={`text-sm font-medium mb-1 ${isToday(day) ? 'text-indigo-600 font-bold' : ''}`}>
                        {day}
                      </div>
                      <div className="space-y-1">
                        {dayEvents.slice(0, 3).map(event => (
                          <div key={event.id} className={`text-xs px-1 py-0.5 rounded text-white truncate cursor-pointer ${event.color}`} title={event.title}>
                            {event.time.slice(0, 5)} {event.title.length > 20 ? event.title.slice(0, 20) + '...' : event.title}
                          </div>
                        ))}
                        {dayEvents.length > 3 && (
                          <div className="text-xs text-indigo-600 font-medium cursor-pointer">+{dayEvents.length - 3} more</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Week / Day view placeholder */}
        {(view === 'week' || view === 'day') && (
          <Card>
            <CardContent className="py-12 text-center">
              <CalendarIcon className="h-16 w-16 mx-auto mb-4 text-indigo-300" />
              <p className="text-lg font-medium">{view === 'week' ? 'Week' : 'Day'} View</p>
              <p className="text-sm text-muted-foreground">Detailed {view} view — integrating with calendar component.</p>
            </CardContent>
          </Card>
        )}

        {/* Upcoming Events */}
        <Card>
          <CardHeader><CardTitle className="text-base">Upcoming Events</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {events.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)).map(event => (
              <div key={event.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${event.color}`} />
                  <div>
                    <p className="text-sm font-medium">{event.title}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" /> {event.date} at {event.time}
                    </div>
                  </div>
                </div>
                <Badge variant="outline">{event.type}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </InsurancePortalLayout>
  );
};

export default InsuranceCalendarPage;

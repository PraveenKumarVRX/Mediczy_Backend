import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import MainLayout from '@/components/layout/MainLayout';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  Calendar, 
  Download,
  ArrowLeft,
  FileText,
  Activity,
  Clock,
  CheckCircle2
} from 'lucide-react';
import { Link } from 'react-router-dom';

const TeamReports = () => {
  const stats = [
    {
      title: 'Total Users',
      value: '12,345',
      change: '+12.5%',
      trend: 'up',
      icon: Users,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10'
    },
    {
      title: 'Active Appointments',
      value: '1,234',
      change: '+8.2%',
      trend: 'up',
      icon: Calendar,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10'
    },
    {
      title: 'Completed Today',
      value: '567',
      change: '+15.3%',
      trend: 'up',
      icon: CheckCircle2,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10'
    },
    {
      title: 'Response Time',
      value: '2.3 min',
      change: '-5.1%',
      trend: 'down',
      icon: Clock,
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10'
    }
  ];

  const recentReports = [
    {
      id: 1,
      title: 'Monthly User Activity Report',
      date: '2025-11-20',
      type: 'Analytics',
      status: 'Ready'
    },
    {
      id: 2,
      title: 'Appointment Statistics',
      date: '2025-11-19',
      type: 'Operations',
      status: 'Ready'
    },
    {
      id: 3,
      title: 'Patient Satisfaction Survey',
      date: '2025-11-18',
      type: 'Feedback',
      status: 'Ready'
    },
    {
      id: 4,
      title: 'System Performance Metrics',
      date: '2025-11-17',
      type: 'Technical',
      status: 'Processing'
    }
  ];

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto animate-in fade-in duration-700">
        {/* Back Button */}
        <Link 
          to="/team/dashboard"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-3 mb-2">
            <BarChart3 className="h-8 w-8 text-purple-500" />
            Reports & Analytics
          </h1>
          <p className="text-muted-foreground">View performance metrics and generate reports</p>
        </div>

        {/* Stats Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat, index) => (
            <Card key={index} className="group hover:shadow-lg transition-all duration-300">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-3 rounded-xl ${stat.bgColor}`}>
                    <stat.icon className={`h-6 w-6 ${stat.color}`} />
                  </div>
                  <Badge 
                    variant="outline" 
                    className={
                      stat.trend === 'up' 
                        ? 'bg-green-500/10 text-green-700 border-green-500/20' 
                        : 'bg-red-500/10 text-red-700 border-red-500/20'
                    }
                  >
                    {stat.change}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">{stat.title}</p>
                  <p className="text-2xl font-bold">{stat.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quick Actions */}
        <Card className="mb-8 bg-gradient-to-br from-blue-500/5 to-purple-500/5 border border-blue-500/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-6 w-6 text-blue-500" />
              Generate Reports
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4">
              <Button className="h-auto flex-col items-start p-4 gap-2">
                <div className="flex items-center gap-2 w-full">
                  <Users className="h-5 w-5" />
                  <span className="font-semibold">User Analytics</span>
                </div>
                <p className="text-xs text-left opacity-90">
                  Generate user activity and engagement report
                </p>
              </Button>

              <Button className="h-auto flex-col items-start p-4 gap-2" variant="outline">
                <div className="flex items-center gap-2 w-full">
                  <Calendar className="h-5 w-5" />
                  <span className="font-semibold">Appointments</span>
                </div>
                <p className="text-xs text-left text-muted-foreground">
                  Export appointment statistics and trends
                </p>
              </Button>

              <Button className="h-auto flex-col items-start p-4 gap-2" variant="outline">
                <div className="flex items-center gap-2 w-full">
                  <TrendingUp className="h-5 w-5" />
                  <span className="font-semibold">Performance</span>
                </div>
                <p className="text-xs text-left text-muted-foreground">
                  System and team performance metrics
                </p>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Recent Reports */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-6 w-6 text-green-500" />
              Recent Reports
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentReports.map((report) => (
                <div 
                  key={report.id}
                  className="flex items-center justify-between p-4 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-lg bg-blue-500/10">
                      <FileText className="h-5 w-5 text-blue-500" />
                    </div>
                    <div>
                      <h4 className="font-semibold">{report.title}</h4>
                      <div className="flex items-center gap-4 mt-1">
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(report.date).toLocaleDateString()}
                        </p>
                        <Badge variant="outline" className="text-xs">
                          {report.type}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge 
                      variant={report.status === 'Ready' ? 'default' : 'secondary'}
                      className={
                        report.status === 'Ready'
                          ? 'bg-green-500/10 text-green-700 border-green-500/20'
                          : 'bg-orange-500/10 text-orange-700 border-orange-500/20'
                      }
                    >
                      {report.status}
                    </Badge>
                    {report.status === 'Ready' && (
                      <Button size="sm" variant="outline">
                        <Download className="h-4 w-4 mr-1" />
                        Download
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
};

export default TeamReports;

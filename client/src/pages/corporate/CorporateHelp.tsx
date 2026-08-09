import React, { useMemo, useState } from 'react';
import { HelpCircle, Search, Book, MessageCircle, Phone, Mail, FileText, Video, ChevronDown, ChevronRight, LifeBuoy } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ticketService } from '@/services/ticketService';
import CorporateLayout from '@/components/corporate/CorporateLayout';
import CorporatePageHeader from '@/components/corporate/CorporatePageHeader';
import { useNavigate } from 'react-router-dom';

interface FAQItem {
  question: string;
  answer: string;
  category: string;
}

interface HelpResource {
  title: string;
  description: string;
  icon: React.ReactNode;
  link: string;
}

const CorporateHelp: React.FC = () => {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  const [ticketOpen, setTicketOpen] = useState(false);
  const [ticketTitle, setTicketTitle] = useState('Support request');
  const [ticketDescription, setTicketDescription] = useState('');
  const [ticketCategory, setTicketCategory] = useState<'technical' | 'billing' | 'integration' | 'feature-request' | 'other'>('technical');
  const [ticketSubmitting, setTicketSubmitting] = useState(false);

  const requester = useMemo(() => {
    try {
      const raw = localStorage.getItem('corporateData');
      const parsed = raw ? JSON.parse(raw) : null;
      const name = parsed?.name || 'Corporate User';
      const email = parsed?.email || 'corporate@mediqzy.com';
      const userId = parsed?.id;
      return { name, email, role: 'corporate', userId };
    } catch {
      return { name: 'Corporate User', email: 'corporate@mediqzy.com', role: 'corporate' };
    }
  }, []);

  const openTicketDialog = (category: typeof ticketCategory, title: string) => {
    setTicketCategory(category);
    setTicketTitle(title);
    setTicketDescription('');
    setTicketOpen(true);
  };

  const submitTicket = async () => {
    if (!ticketTitle.trim() || !ticketDescription.trim()) {
      toast({
        title: 'Missing fields',
        description: 'Title and description are required.',
        variant: 'destructive',
      });
      return;
    }
    try {
      setTicketSubmitting(true);
      const created = await ticketService.createTicket({
        title: ticketTitle.trim(),
        description: ticketDescription.trim(),
        category: ticketCategory,
        priority: 'medium',
        requester,
        source: 'corporate-help',
      });
      toast({
        title: 'Ticket created',
        description: `Ticket ${created.ticketId} has been created.`,
      });
      setTicketOpen(false);
    } catch (error: any) {
      toast({
        title: 'Ticket creation failed',
        description: error?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setTicketSubmitting(false);
    }
  };

  const faqCategories = ['All', 'Getting Started', 'Health Programs', 'Claims', 'Billing', 'Technical'];

  const faqs: FAQItem[] = [
    {
      question: 'How do I enroll employees in the health program?',
      answer: 'To enroll employees, navigate to the Employees section, click "Add Employee," and fill in their details. They will receive an email invitation to activate their account and complete their health profile.',
      category: 'Getting Started'
    },
    {
      question: 'What is the process for submitting insurance claims?',
      answer: 'Employees can submit claims through the Claims section by providing service details, uploading receipts, and selecting the appropriate claim type. Claims are typically processed within 5-7 business days.',
      category: 'Claims'
    },
    {
      question: 'How do I schedule company-wide health checkups?',
      answer: 'Go to the Appointments section and select "Bulk Schedule." Choose the health checkup type, select employees or departments, and pick available time slots from partnered healthcare providers.',
      category: 'Health Programs'
    },
    {
      question: 'Can I customize the health metrics tracked?',
      answer: 'Yes, in Settings > Health Program Settings, you can enable or disable specific health metrics, set tracking frequency, and configure alert thresholds for your organization.',
      category: 'Health Programs'
    },
    {
      question: 'How do I export health analytics reports?',
      answer: 'Navigate to the Reports section, select the report type and time period, then click "Export." Reports can be downloaded in PDF, Excel, or CSV formats.',
      category: 'Technical'
    },
    {
      question: 'What payment methods are accepted?',
      answer: 'We accept credit cards (Visa, MasterCard, American Express), debit cards, and bank transfers. Payment information can be updated in Settings > Billing.',
      category: 'Billing'
    },
    {
      question: 'How do I handle denied insurance claims?',
      answer: 'Denied claims can be reviewed in the Claims section. Click on the denied claim to view the reason, then use the "Appeal" button to submit additional documentation or clarification.',
      category: 'Claims'
    },
    {
      question: 'Can employees access their own health data?',
      answer: 'Yes, employees have a personal dashboard where they can view their health metrics, appointment history, claims status, and wellness program participation.',
      category: 'Getting Started'
    },
    {
      question: 'How do I set up department-specific health goals?',
      answer: 'In the Departments section, select a department and click "Set Goals." You can configure health score targets, checkup completion rates, and wellness program participation goals.',
      category: 'Health Programs'
    },
    {
      question: 'Is my data HIPAA compliant?',
      answer: 'Yes, all health data is encrypted and stored in HIPAA-compliant infrastructure. We maintain strict access controls and audit logs as required by HIPAA regulations.',
      category: 'Technical'
    }
  ];

  const helpResources: HelpResource[] = [
    {
      title: 'Documentation',
      description: 'Comprehensive guides and tutorials',
      icon: <Book className="h-6 w-6 text-blue-600" />,
      link: '/corporate/help#docs'
    },
    {
      title: 'Video Tutorials',
      description: 'Step-by-step video guides',
      icon: <Video className="h-6 w-6 text-purple-600" />,
      link: '/corporate/help#videos'
    },
    {
      title: 'Live Chat',
      description: 'Chat with our support team',
      icon: <MessageCircle className="h-6 w-6 text-green-600" />,
      link: '#live-chat'
    },
    {
      title: 'WhatsApp Support',
      description: 'Message us at +91 80989 98998',
      icon: <Phone className="h-6 w-6 text-orange-600" />,
      link: 'https://wa.me/918098998998'
    },
    {
      title: 'Email Support',
      description: 'Send us an email',
      icon: <Mail className="h-6 w-6 text-red-600" />,
      link: 'mailto:support@mediqzy.com'
    },
    {
      title: 'Knowledge Base',
      description: 'Browse articles and guides',
      icon: <FileText className="h-6 w-6 text-indigo-600" />,
      link: '/corporate/help#knowledge-base'
    }
  ];

  const filteredFAQs = faqs.filter(faq =>
    faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
    faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <CorporateLayout title="Help & Support">
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6 space-y-6">
        <CorporatePageHeader
          icon={LifeBuoy}
          title="Help & Support"
          description="Find answers, browse FAQs, and get support for your health platform"
          gradient="from-sky-500 to-sky-700"
          showSearch={true}
          searchPlaceholder="Search for help topics, FAQs, or guides..."
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
        />

      {/* Help Resources */}
      <Card>
        <CardHeader>
          <CardTitle>Get Help</CardTitle>
          <CardDescription>Choose how you'd like to get support</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {helpResources.map((resource, index) => (
              <Card
                key={index}
                className="hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => {
                  if (resource.link.startsWith('tel:') || resource.link.startsWith('mailto:')) {
                    window.location.href = resource.link;
                    return;
                  }
                  if (resource.title === 'Live Chat') {
                    openTicketDialog('technical', 'Live chat request');
                    return;
                  }
                  if (resource.link.startsWith('/')) {
                    navigate(resource.link);
                    return;
                  }
                  if (resource.link.startsWith('http')) {
                    window.open(resource.link, '_blank', 'noopener,noreferrer');
                    return;
                  }
                  openTicketDialog('technical', `${resource.title} request`);
                }}
              >
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-slate-800/40 rounded-lg">
                      {resource.icon}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold mb-1">{resource.title}</h3>
                      <p className="text-sm text-slate-400">{resource.description}</p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-slate-500" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quick Start Guide */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Start Guide</CardTitle>
          <CardDescription>Get started with the essential features</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start gap-4 p-4 bg-blue-50 rounded-lg">
              <div className="flex items-center justify-center w-8 h-8 bg-blue-600 text-white rounded-full font-bold">
                1
              </div>
              <div>
                <h3 className="font-semibold mb-1">Set Up Your Organization</h3>
                <p className="text-sm text-slate-400">Configure company details, departments, and health program settings in the Settings section.</p>
              </div>
            </div>
            <div className="flex items-start gap-4 p-4 bg-green-50 rounded-lg">
              <div className="flex items-center justify-center w-8 h-8 bg-green-600 text-white rounded-full font-bold">
                2
              </div>
              <div>
                <h3 className="font-semibold mb-1">Add Employees</h3>
                <p className="text-sm text-slate-400">Import or manually add employee information to enroll them in your health program.</p>
              </div>
            </div>
            <div className="flex items-start gap-4 p-4 bg-purple-50 rounded-lg">
              <div className="flex items-center justify-center w-8 h-8 bg-purple-600 text-white rounded-full font-bold">
                3
              </div>
              <div>
                <h3 className="font-semibold mb-1">Schedule Health Checkups</h3>
                <p className="text-sm text-slate-400">Use the Appointments section to schedule checkups and wellness visits for your team.</p>
              </div>
            </div>
            <div className="flex items-start gap-4 p-4 bg-orange-50 rounded-lg">
              <div className="flex items-center justify-center w-8 h-8 bg-orange-600 text-white rounded-full font-bold">
                4
              </div>
              <div>
                <h3 className="font-semibold mb-1">Monitor Health Metrics</h3>
                <p className="text-sm text-slate-400">Track employee health trends and analytics through the Health Analysis dashboard.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* FAQs */}
      <Card>
        <CardHeader>
          <CardTitle>Frequently Asked Questions</CardTitle>
          <CardDescription>Common questions and answers</CardDescription>
        </CardHeader>
        <CardContent>
          {filteredFAQs.length > 0 ? (
            <Accordion type="single" collapsible className="w-full">
              {filteredFAQs.map((faq, index) => (
                <AccordionItem key={index} value={`item-${index}`}>
                  <AccordionTrigger className="text-left">
                    <div className="flex items-start gap-3">
                      <HelpCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                      <span className="font-semibold">{faq.question}</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="pl-8 text-slate-400">
                      {faq.answer}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          ) : (
            <div className="text-center py-12 text-slate-400">
              <HelpCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No FAQs found matching your search</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Contact Support */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-blue-600 text-white rounded-lg">
              <MessageCircle className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg mb-2">Still need help?</h3>
              <p className="text-slate-300 mb-4">
                Our support team is available 24/7 to assist you with any questions or issues.
              </p>
              <div className="flex gap-3">
                <Button onClick={() => openTicketDialog('technical', 'Live chat request')}>
                  <MessageCircle className="h-4 w-4 mr-2" />
                  Start Live Chat
                </Button>
                <Button asChild variant="outline">
                  <a href="tel:+18001234567">
                    <Phone className="h-4 w-4 mr-2" />
                    Call Support
                  </a>
                </Button>
                <Button asChild variant="outline">
                  <a href="mailto:support@mediqzy.com">
                    <Mail className="h-4 w-4 mr-2" />
                    Email Us
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={ticketOpen} onOpenChange={setTicketOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Create Support Ticket</DialogTitle>
            <DialogDescription>Send your request to the support team</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="ticketCategory">Category</Label>
              <Select value={ticketCategory} onValueChange={(v) => setTicketCategory(v as any)}>
                <SelectTrigger id="ticketCategory">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="technical">Technical</SelectItem>
                  <SelectItem value="billing">Billing</SelectItem>
                  <SelectItem value="integration">Integration</SelectItem>
                  <SelectItem value="feature-request">Feature request</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="ticketTitle">Title</Label>
              <Input
                id="ticketTitle"
                value={ticketTitle}
                onChange={(e) => setTicketTitle(e.target.value)}
                placeholder="Short summary"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="ticketDescription">Description</Label>
              <Textarea
                id="ticketDescription"
                value={ticketDescription}
                onChange={(e) => setTicketDescription(e.target.value)}
                placeholder="Describe the issue or request"
                rows={6}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTicketOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitTicket} disabled={ticketSubmitting}>
              {ticketSubmitting ? 'Submitting…' : 'Submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </CorporateLayout>
  );
};

export default CorporateHelp;

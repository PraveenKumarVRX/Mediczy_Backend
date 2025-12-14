import React, { useMemo, useState } from 'react';
import { HelpCircle, MessageCircle, Phone, Mail, Clock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ticketService } from '@/services/ticketService';

const CorporateSupport: React.FC = () => {
  const { toast } = useToast();
  const [ticketOpen, setTicketOpen] = useState(false);
  const [ticketTitle, setTicketTitle] = useState('Live chat request');
  const [ticketDescription, setTicketDescription] = useState('');
  const [ticketCategory, setTicketCategory] = useState<'technical' | 'billing' | 'integration' | 'feature-request' | 'other'>('technical');
  const [ticketSubmitting, setTicketSubmitting] = useState(false);

  const requester = useMemo(() => {
    try {
      const raw = localStorage.getItem('corporateData');
      const parsed = raw ? JSON.parse(raw) : null;
      const name = parsed?.name || 'Corporate User';
      const email = parsed?.email || 'corporate@mediczy.com';
      const userId = parsed?.id;
      return { name, email, role: 'corporate', userId };
    } catch {
      return { name: 'Corporate User', email: 'corporate@mediczy.com', role: 'corporate' };
    }
  }, []);

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
        source: 'corporate-support',
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <HelpCircle className="h-8 w-8 text-blue-600" />
        <div>
          <h1 className="text-3xl font-bold">Support Center</h1>
          <p className="text-gray-500 mt-1">Get help from our dedicated support team</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="hover:shadow-lg transition-shadow cursor-pointer">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="p-4 bg-green-100 rounded-full">
                <MessageCircle className="h-8 w-8 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-2">Live Chat</h3>
                <p className="text-sm text-gray-600 mb-4">Chat with our support team in real-time</p>
                <Button onClick={() => setTicketOpen(true)}>Start Chat</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow cursor-pointer">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="p-4 bg-blue-100 rounded-full">
                <Phone className="h-8 w-8 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-2">Phone Support</h3>
                <p className="text-sm text-gray-600 mb-4">Call us at +1 (800) 123-4567</p>
                <Button asChild variant="outline">
                  <a href="tel:+18001234567">Call Now</a>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow cursor-pointer">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="p-4 bg-purple-100 rounded-full">
                <Mail className="h-8 w-8 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-2">Email Support</h3>
                <p className="text-sm text-gray-600 mb-4">Send us an email anytime</p>
                <Button asChild variant="outline">
                  <a href="mailto:support@mediczy.com">Send Email</a>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

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

      <Card>
        <CardHeader>
          <CardTitle>Support Hours</CardTitle>
          <CardDescription>When our team is available to help</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-4 p-4 bg-blue-50 rounded-lg">
            <Clock className="h-6 w-6 text-blue-600 mt-1" />
            <div>
              <h3 className="font-semibold mb-2">24/7 Support Available</h3>
              <p className="text-sm text-gray-600">
                Our support team is available around the clock to assist you with any questions or issues.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CorporateSupport;

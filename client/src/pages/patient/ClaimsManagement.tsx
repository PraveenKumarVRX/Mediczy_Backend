import type { Variants } from 'framer-motion';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { FileText, Upload, Clock, CheckCircle, XCircle, AlertCircle, Plus, Calendar, DollarSign, Hospital, Shield, PhoneCall, ListChecks, BellRing } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';

interface Claim {
  id: string;
  claimNumber: string;
  type: 'hospitalization' | 'outpatient' | 'pre_post_hospitalization' | 'day_care' | 'ambulance';
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'settled';
  claimAmount: number;
  approvedAmount?: number;
  hospital: string;
  admissionDate: Date;
  dischargeDate?: Date;
  submittedDate?: Date;
  documents: string[];
  remarks?: string;
}

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.07 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [.25,.46,.45,.94] } } };

const ClaimsManagement: React.FC = () => {
  const [claims, setClaims] = useState<Claim[]>([
    {
      id: '1', claimNumber: 'CLM2025001234', type: 'hospitalization', status: 'approved',
      claimAmount: 125000, approvedAmount: 120000, hospital: 'Apollo Hospital, Hyderabad',
      admissionDate: new Date('2024-12-15'), dischargeDate: new Date('2024-12-20'),
      submittedDate: new Date('2024-12-22'), documents: ['Discharge Summary', 'Bills', 'Investigation Reports'],
      remarks: 'Pre-approval obtained. Claim approved with minor deductions.'
    },
    {
      id: '2', claimNumber: 'CLM2025001567', type: 'day_care', status: 'under_review',
      claimAmount: 35000, hospital: 'CARE Hospitals, Banjara Hills',
      admissionDate: new Date('2025-01-10'), dischargeDate: new Date('2025-01-10'),
      submittedDate: new Date('2025-01-11'), documents: ['Medical Bills', 'Prescriptions', 'Reports'],
      remarks: 'Documents under verification. Expected settlement in 5-7 days.'
    },
    {
      id: '3', claimNumber: 'CLM2025001890', type: 'pre_post_hospitalization', status: 'submitted',
      claimAmount: 15000, hospital: 'Continental Hospitals',
      admissionDate: new Date('2025-01-05'), submittedDate: new Date('2025-01-14'),
      documents: ['Consultation Bills', 'Medicine Bills'],
      remarks: 'Pre-hospitalization expenses claim submitted.'
    }
  ]);

  const [activeTab, setActiveTab] = useState<string>('all');
  const [isNewClaimDialogOpen, setIsNewClaimDialogOpen] = useState(false);
  const [newClaim, setNewClaim] = useState({ type: 'hospitalization', hospital: '', claimAmount: '', admissionDate: '' });

  const statusConfig: Record<string, { label: string; icon: any; color: string; darkColor: string }> = {
    draft: { label: 'Draft', icon: FileText, color: 'bg-slate-100 text-slate-700', darkColor: 'dark:bg-slate-800 dark:text-slate-300' },
    submitted: { label: 'Submitted', icon: Upload, color: 'bg-blue-100 text-blue-700', darkColor: 'dark:bg-blue-900/40 dark:text-blue-300' },
    under_review: { label: 'Under Review', icon: Clock, color: 'bg-amber-100 text-amber-700', darkColor: 'dark:bg-amber-900/40 dark:text-amber-300' },
    approved: { label: 'Approved', icon: CheckCircle, color: 'bg-emerald-100 text-emerald-700', darkColor: 'dark:bg-emerald-900/40 dark:text-emerald-300' },
    rejected: { label: 'Rejected', icon: XCircle, color: 'bg-red-100 text-red-700', darkColor: 'dark:bg-red-900/40 dark:text-red-300' },
    settled: { label: 'Settled', icon: CheckCircle, color: 'bg-teal-100 text-teal-700', darkColor: 'dark:bg-teal-900/40 dark:text-teal-300' }
  };

  const claimTypes = [
    { value: 'hospitalization', label: 'Hospitalization' },
    { value: 'outpatient', label: 'Outpatient' },
    { value: 'pre_post_hospitalization', label: 'Pre/Post Hospitalization' },
    { value: 'day_care', label: 'Day Care Procedure' },
    { value: 'ambulance', label: 'Ambulance' }
  ];

  const getStatusBadge = (status: string) => {
    const config = statusConfig[status];
    const Icon = config.icon;
    return (
      <Badge className={`${config.color} ${config.darkColor} flex items-center gap-1 font-medium`} aria-label={`Status: ${config.label}`}>
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const filteredClaims = activeTab === 'all' ? claims : claims.filter(claim => claim.status === activeTab);

  const handleSubmitClaim = () => {
    if (!newClaim.hospital || !newClaim.claimAmount || !newClaim.admissionDate) return;
    const claim: Claim = {
      id: Date.now().toString(), claimNumber: `CLM${Date.now()}`,
      type: newClaim.type as Claim['type'], status: 'draft',
      claimAmount: parseFloat(newClaim.claimAmount), hospital: newClaim.hospital,
      admissionDate: new Date(newClaim.admissionDate), submittedDate: new Date(), documents: []
    };
    setClaims([claim, ...claims]);
    setIsNewClaimDialogOpen(false);
    setNewClaim({ type: 'hospitalization', hospital: '', claimAmount: '', admissionDate: '' });
  };

  const stats = {
    total: claims.length,
    pending: claims.filter(c => c.status === 'submitted' || c.status === 'under_review').length,
    approved: claims.filter(c => c.status === 'approved').length,
    settled: claims.filter(c => c.status === 'settled').length
  };

  const statCards = [
    { label: 'Total Claims', value: stats.total, gradient: 'from-slate-600 to-slate-800', icon: FileText },
    { label: 'Pending Review', value: stats.pending, gradient: 'from-amber-500 to-orange-600', icon: Clock },
    { label: 'Approved', value: stats.approved, gradient: 'from-emerald-500 to-teal-600', icon: CheckCircle },
    { label: 'Settled', value: stats.settled, gradient: 'from-blue-500 to-indigo-600', icon: DollarSign },
  ];

  return (
    <MainLayout>
      <motion.div initial="hidden" animate="show" variants={container as unknown as Variants} className="max-w-7xl mx-auto space-y-6 px-4 md:px-6 py-6">
        {/* Premium Header */}
        <motion.div variants={item as unknown as Variants} className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-700 via-purple-700 to-indigo-800 p-6 md:p-8 text-white shadow-2xl">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
          <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-br from-white/10 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
          <div className="relative flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 rounded-xl bg-white/15 backdrop-blur-sm shadow-lg">
                  <Shield className="w-6 h-6" />
                </div>
                <Badge className="bg-white/15 text-white/90 border-white/20 font-medium">Insurance Claims</Badge>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold mb-1">Claims Management</h1>
              <p className="text-indigo-200 text-sm md:text-base">Submit, track & manage your insurance claims</p>
            </div>
            <Dialog open={isNewClaimDialogOpen} onOpenChange={setIsNewClaimDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-white text-indigo-700 hover:bg-white/90 shadow-lg font-semibold" aria-label="File new claim">
                  <Plus className="mr-2 h-4 w-4" />
                  New Claim
                </Button>
              </DialogTrigger>
              <DialogContent className="dark:bg-slate-900">
                <DialogHeader>
                  <DialogTitle>Submit New Claim</DialogTitle>
                  <DialogDescription>File a new insurance claim</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="claim-type">Claim Type</Label>
                    <select id="claim-type" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={newClaim.type} onChange={(e) => setNewClaim({ ...newClaim, type: e.target.value })}>
                      {claimTypes.map(type => (<option key={type.value} value={type.value}>{type.label}</option>))}
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="hospital">Hospital Name</Label>
                    <Input id="hospital" placeholder="Enter hospital name" value={newClaim.hospital} onChange={(e) => setNewClaim({ ...newClaim, hospital: e.target.value })} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="amount">Claim Amount (₹)</Label>
                    <Input id="amount" type="number" placeholder="Enter claim amount" value={newClaim.claimAmount} onChange={(e) => setNewClaim({ ...newClaim, claimAmount: e.target.value })} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="admission-date">Admission Date</Label>
                    <Input id="admission-date" type="date" value={newClaim.admissionDate} onChange={(e) => setNewClaim({ ...newClaim, admissionDate: e.target.value })} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsNewClaimDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleSubmitClaim}>Create Draft</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </motion.div>

        {/* Stats Cards */}
        <motion.div variants={item as unknown as Variants} className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statCards.map((s, i) => (
            <motion.div key={s.label} whileHover={{ scale: 1.03, y: -2 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }}>
              <Card className="relative overflow-hidden border-0 shadow-lg dark:bg-slate-800/60">
                <div className={`absolute inset-0 bg-gradient-to-br ${s.gradient} opacity-[0.07] dark:opacity-[0.15]`} />
                <CardContent className="relative pt-5 pb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{s.label}</span>
                    <s.icon className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                  </div>
                  <p className="text-3xl font-bold text-slate-900 dark:text-white">{s.value}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        {/* Status Filter Tabs */}
        <motion.div variants={item as unknown as Variants} className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <Button variant={activeTab === 'all' ? 'default' : 'outline'} onClick={() => setActiveTab('all')} size="sm" className="rounded-full whitespace-nowrap transition-all duration-200">
            All Claims
          </Button>
          {Object.entries(statusConfig).map(([key, config]) => (
            <Button key={key} variant={activeTab === key ? 'default' : 'outline'} onClick={() => setActiveTab(key)} size="sm" className="rounded-full whitespace-nowrap transition-all duration-200">
              {config.label}
            </Button>
          ))}
        </motion.div>

        {/* Claims List */}
        <AnimatePresence mode="wait">
          <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.25 }} className="space-y-4">
            {filteredClaims.length === 0 ? (
              <Card className="border-dashed border-2 dark:bg-slate-800/40">
                <CardContent className="text-center py-16">
                  <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-4">
                    <FileText className="h-8 w-8 text-slate-400" />
                  </div>
                  <p className="text-lg font-medium text-slate-700 dark:text-slate-300">No claims found</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Get started by filing your first claim</p>
                  <Button className="mt-6" onClick={() => setIsNewClaimDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" /> Submit Your First Claim
                  </Button>
                </CardContent>
              </Card>
            ) : (
              filteredClaims.map((claim, idx) => (
                <motion.div key={claim.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.06, duration: 0.35 }}>
                  <Card className="group hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 border-slate-200/80 dark:border-slate-700/60 dark:bg-slate-800/50 overflow-hidden">
                    <div className={`h-1 bg-gradient-to-r ${
                      claim.status === 'approved' ? 'from-emerald-400 to-teal-500' :
                      claim.status === 'under_review' ? 'from-amber-400 to-orange-500' :
                      claim.status === 'rejected' ? 'from-red-400 to-rose-500' :
                      claim.status === 'settled' ? 'from-blue-400 to-indigo-500' :
                      'from-slate-300 to-slate-400'
                    }`} />
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg mb-2 text-slate-900 dark:text-white">{claim.claimNumber}</CardTitle>
                          <div className="flex items-center gap-2 text-sm">
                            <Badge variant="outline" className="capitalize dark:border-slate-600 dark:text-slate-300">{claim.type.replace(/_/g, ' ')}</Badge>
                            {getStatusBadge(claim.status)}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">Claim Amount</p>
                          <p className="text-2xl font-bold text-slate-900 dark:text-white">₹{claim.claimAmount.toLocaleString('en-IN')}</p>
                          {claim.approvedAmount && (
                            <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">Approved: ₹{claim.approvedAmount.toLocaleString('en-IN')}</p>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm">
                          <Hospital className="h-4 w-4 text-slate-400" />
                          <span className="font-medium text-slate-700 dark:text-slate-300">{claim.hospital}</span>
                        </div>
                        <div className="grid md:grid-cols-3 gap-3 text-sm">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-slate-400" />
                            <div>
                              <span className="text-slate-500 dark:text-slate-400">Admission: </span>
                              <span className="font-medium text-slate-700 dark:text-slate-200">{new Date(claim.admissionDate).toLocaleDateString('en-IN')}</span>
                            </div>
                          </div>
                          {claim.dischargeDate && (
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-slate-400" />
                              <div>
                                <span className="text-slate-500 dark:text-slate-400">Discharge: </span>
                                <span className="font-medium text-slate-700 dark:text-slate-200">{new Date(claim.dischargeDate).toLocaleDateString('en-IN')}</span>
                              </div>
                            </div>
                          )}
                          {claim.submittedDate && (
                            <div className="flex items-center gap-2">
                              <Upload className="h-4 w-4 text-slate-400" />
                              <div>
                                <span className="text-slate-500 dark:text-slate-400">Submitted: </span>
                                <span className="font-medium text-slate-700 dark:text-slate-200">{new Date(claim.submittedDate).toLocaleDateString('en-IN')}</span>
                              </div>
                            </div>
                          )}
                        </div>
                        {claim.documents.length > 0 && (
                          <div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider">Documents</p>
                            <div className="flex flex-wrap gap-2">
                              {claim.documents.map((doc, index) => (
                                <Badge key={index} variant="secondary" className="dark:bg-slate-700 dark:text-slate-300">
                                  <FileText className="h-3 w-3 mr-1" />{doc}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {claim.remarks && (
                          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800/40">
                            <div className="flex items-start gap-2">
                              <AlertCircle className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                              <p className="text-sm text-blue-800 dark:text-blue-300">{claim.remarks}</p>
                            </div>
                          </div>
                        )}
                        <div className="flex gap-2 pt-2">
                          <Button variant="outline" className="flex-1 dark:border-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50">View Details</Button>
                          {claim.status === 'draft' && <Button>Submit Claim</Button>}
                          {claim.status === 'under_review' && (
                            <Button variant="outline" aria-label="Upload additional documents">
                              <Upload className="mr-2 h-4 w-4" />Upload Documents
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))
            )}
          </motion.div>
        </AnimatePresence>

        {/* Help Section */}
        <motion.div variants={item as unknown as Variants}>
          <Card className="bg-gradient-to-br from-slate-50 to-blue-50/50 dark:from-slate-800/60 dark:to-indigo-900/20 border-slate-200/80 dark:border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-slate-900 dark:text-white">Need Help with Claims?</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-6">
                {[
                  { icon: PhoneCall, title: '24/7 Support', desc: 'Our claim support team is available round the clock to assist you', link: 'Call: 1800-XXX-XXXX', gradient: 'from-blue-500 to-cyan-500' },
                  { icon: ListChecks, title: 'Documents Required', desc: 'Discharge summary, bills, investigation reports, prescriptions, and ID proof', link: 'View Checklist', gradient: 'from-purple-500 to-pink-500' },
                  { icon: BellRing, title: 'Track Status', desc: 'Get real-time updates on your claim status via SMS and email', link: 'Enable Notifications', gradient: 'from-emerald-500 to-teal-500' },
                ].map((h) => (
                  <div key={h.title} className="flex gap-4">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${h.gradient} flex items-center justify-center flex-shrink-0 shadow-lg`}>
                      <h.icon className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 dark:text-white mb-1">{h.title}</h4>
                      <p className="text-sm text-slate-600 dark:text-slate-400">{h.desc}</p>
                      <Button variant="link" className="pl-0 text-indigo-600 dark:text-indigo-400 h-auto py-1">{h.link}</Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </MainLayout>
  );
};

export default ClaimsManagement;

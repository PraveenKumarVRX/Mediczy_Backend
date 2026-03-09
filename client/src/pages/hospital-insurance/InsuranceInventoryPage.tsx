import { useState } from 'react';
import InsurancePortalLayout from '@/components/hospital-insurance/InsurancePortalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Stethoscope, Package, FlaskConical, Bed, Search, Plus, Edit, Trash2, Sun } from 'lucide-react';

const InsuranceInventoryPage = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('doctors');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  // Doctors
  const [doctors] = useState([
    { id: 1, name: 'Dr. Rajesh Sharma', speciality: 'Cardiology', qualification: 'MD, DM (Cardiology)', regNo: 'MCI-12345', fee: 800, status: 'active' },
    { id: 2, name: 'Dr. Priya Patel', speciality: 'Orthopedics', qualification: 'MS (Ortho), DNB', regNo: 'MCI-23456', fee: 700, status: 'active' },
    { id: 3, name: 'Dr. Amit Gupta', speciality: 'General Surgery', qualification: 'MS (Surgery), FICS', regNo: 'MCI-34567', fee: 600, status: 'active' },
    { id: 4, name: 'Dr. Sita Verma', speciality: 'Gynecology', qualification: 'MD (OBG), DGO', regNo: 'MCI-45678', fee: 750, status: 'active' },
    { id: 5, name: 'Dr. Vikram Reddy', speciality: 'Neurology', qualification: 'MD, DM (Neurology)', regNo: 'MCI-56789', fee: 900, status: 'active' },
  ]);

  // Health Packages
  const [packages] = useState([
    { id: 1, name: 'Basic Health Checkup', tests: 12, price: 1999, includes: 'CBC, LFT, KFT, Lipid, Sugar, Thyroid, Urine', validFor: 'Male/Female 18+' },
    { id: 2, name: 'Comprehensive Health Package', tests: 28, price: 4999, includes: 'All basic + ECG, X-Ray, USG Abdomen, PSA/PAP', validFor: 'Male/Female 30+' },
    { id: 3, name: 'Executive Health Checkup', tests: 42, price: 8999, includes: 'Comprehensive + TMT, Echo, CT Calcium Score', validFor: 'Male/Female 40+' },
    { id: 4, name: 'Cardiac Health Package', tests: 18, price: 5999, includes: 'ECG, Echo, TMT, Lipid, HbA1c, BNP, CRP', validFor: 'Male/Female 35+' },
    { id: 5, name: 'Women\'s Wellness Package', tests: 22, price: 3999, includes: 'CBC, Thyroid, Hormone Panel, PAP, Mammography', validFor: 'Female 25+' },
  ]);

  // Lab Tests
  const [labTests] = useState([
    { id: 1, name: 'Complete Blood Count (CBC)', code: 'CBC001', dept: 'Hematology', price: 350, tat: '2 hrs' },
    { id: 2, name: 'Liver Function Test (LFT)', code: 'LFT001', dept: 'Biochemistry', price: 500, tat: '4 hrs' },
    { id: 3, name: 'Kidney Function Test (KFT)', code: 'KFT001', dept: 'Biochemistry', price: 450, tat: '4 hrs' },
    { id: 4, name: 'Thyroid Profile (T3, T4, TSH)', code: 'THY001', dept: 'Endocrinology', price: 600, tat: '6 hrs' },
    { id: 5, name: 'Lipid Profile', code: 'LIP001', dept: 'Biochemistry', price: 400, tat: '4 hrs' },
    { id: 6, name: 'HbA1c', code: 'HBA001', dept: 'Biochemistry', price: 500, tat: '4 hrs' },
    { id: 7, name: 'Urine Routine & Microscopy', code: 'URN001', dept: 'Pathology', price: 200, tat: '1 hr' },
    { id: 8, name: 'ECG', code: 'ECG001', dept: 'Cardiology', price: 300, tat: '30 min' },
  ]);

  // IP Packages
  const [ipPackages] = useState([
    { id: 1, name: 'Appendectomy (Laparoscopic)', code: 'IP-APPX-L', inclDays: 3, rate: 65000, roomType: 'Semi-Private', includes: 'Surgery, Anesthesia, 3-day stay, Medicines, Investigation' },
    { id: 2, name: 'LSCS (Cesarean Section)', code: 'IP-LSCS', inclDays: 5, rate: 85000, roomType: 'Private', includes: 'Surgery, OT, 5-day stay, Baby care, Medicines' },
    { id: 3, name: 'Total Knee Replacement (Unilateral)', code: 'IP-TKR-U', inclDays: 7, rate: 250000, roomType: 'Private', includes: 'Implant, Surgery, Physio, 7-day stay, Medicines' },
    { id: 4, name: 'PTCA (Angioplasty) with 1 Stent', code: 'IP-PTCA-1', inclDays: 3, rate: 175000, roomType: 'ICU + Ward', includes: 'Stent, Cath Lab, 1-day ICU + 2-day ward, Medicines' },
    { id: 5, name: 'Cholecystectomy (Laparoscopic)', code: 'IP-CHOL-L', inclDays: 2, rate: 55000, roomType: 'Semi-Private', includes: 'Surgery, Anesthesia, 2-day stay, Medicines' },
  ]);

  // Day Care Packages
  const [dayCarePackages] = useState([
    { id: 1, name: 'Cataract Surgery (Phaco + IOL)', code: 'DC-CAT', duration: '4 hrs', rate: 25000, includes: 'IOL, Surgery, Medicines, Follow-up' },
    { id: 2, name: 'Tonsillectomy', code: 'DC-TONS', duration: '6 hrs', rate: 22000, includes: 'Surgery, Recovery, Medicines' },
    { id: 3, name: 'Dialysis (Single Session)', code: 'DC-DIAL', duration: '4 hrs', rate: 2500, includes: 'Dialysis consumables, Monitoring' },
    { id: 4, name: 'Chemotherapy (Per Cycle)', code: 'DC-CHEMO', duration: '6 hrs', rate: 15000, includes: 'Drug admin, Monitoring (drug cost extra)' },
    { id: 5, name: 'Endoscopy (Upper GI)', code: 'DC-ENDO', duration: '2 hrs', rate: 5000, includes: 'Procedure, Sedation, Report' },
  ]);

  return (
    <InsurancePortalLayout title="Inventory Management" subtitle="Doctors, packages, lab tests, IP & day care packages">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button onClick={() => { setShowAdd(!showAdd); toast({ title: 'Add Item', description: 'Form will appear here.' }); }}>
            <Plus className="h-4 w-4 mr-1" /> Add New
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="doctors" className="flex items-center gap-1"><Stethoscope className="h-3 w-3" /> Doctors</TabsTrigger>
            <TabsTrigger value="packages" className="flex items-center gap-1"><Package className="h-3 w-3" /> Health Packages</TabsTrigger>
            <TabsTrigger value="labTests" className="flex items-center gap-1"><FlaskConical className="h-3 w-3" /> Lab Tests</TabsTrigger>
            <TabsTrigger value="ipPackages" className="flex items-center gap-1"><Bed className="h-3 w-3" /> IP Packages</TabsTrigger>
            <TabsTrigger value="dayCare" className="flex items-center gap-1"><Sun className="h-3 w-3" /> Day Care</TabsTrigger>
          </TabsList>

          {/* Doctors */}
          <TabsContent value="doctors">
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800">
                    <tr>
                      <th className="py-2 px-3 text-left font-medium">Doctor Name</th>
                      <th className="py-2 px-3 text-left font-medium">Speciality</th>
                      <th className="py-2 px-3 text-left font-medium">Qualification</th>
                      <th className="py-2 px-3 text-left font-medium">Reg No</th>
                      <th className="py-2 px-3 text-right font-medium">Fee (₹)</th>
                      <th className="py-2 px-3 text-center font-medium">Status</th>
                      <th className="py-2 px-3 text-center font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doctors.filter(d => d.name.toLowerCase().includes(search.toLowerCase()) || d.speciality.toLowerCase().includes(search.toLowerCase())).map(doc => (
                      <tr key={doc.id} className="border-b hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="py-2 px-3 font-medium">{doc.name}</td>
                        <td className="py-2 px-3">{doc.speciality}</td>
                        <td className="py-2 px-3 text-xs">{doc.qualification}</td>
                        <td className="py-2 px-3 font-mono text-xs">{doc.regNo}</td>
                        <td className="py-2 px-3 text-right">₹{doc.fee}</td>
                        <td className="py-2 px-3 text-center"><Badge className="bg-green-100 text-green-700">{doc.status}</Badge></td>
                        <td className="py-2 px-3 text-center">
                          <Button variant="ghost" size="sm"><Edit className="h-3 w-3" /></Button>
                          <Button variant="ghost" size="sm" className="text-red-600"><Trash2 className="h-3 w-3" /></Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Health Packages */}
          <TabsContent value="packages">
            <div className="grid grid-cols-2 gap-4">
              {packages.filter(p => p.name.toLowerCase().includes(search.toLowerCase())).map(pkg => (
                <Card key={pkg.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold">{pkg.name}</p>
                        <p className="text-sm text-muted-foreground mt-1">{pkg.includes}</p>
                        <div className="flex gap-2 mt-2">
                          <Badge variant="outline">{pkg.tests} tests</Badge>
                          <Badge variant="outline">{pkg.validFor}</Badge>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold text-indigo-600">₹{pkg.price.toLocaleString()}</p>
                        <div className="flex gap-1 mt-2">
                          <Button variant="ghost" size="sm"><Edit className="h-3 w-3" /></Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Lab Tests */}
          <TabsContent value="labTests">
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800">
                    <tr>
                      <th className="py-2 px-3 text-left font-medium">Test Name</th>
                      <th className="py-2 px-3 text-left font-medium">Code</th>
                      <th className="py-2 px-3 text-left font-medium">Department</th>
                      <th className="py-2 px-3 text-right font-medium">Price (₹)</th>
                      <th className="py-2 px-3 text-center font-medium">TAT</th>
                      <th className="py-2 px-3 text-center font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {labTests.filter(t => t.name.toLowerCase().includes(search.toLowerCase())).map(test => (
                      <tr key={test.id} className="border-b hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="py-2 px-3 font-medium">{test.name}</td>
                        <td className="py-2 px-3 font-mono text-xs">{test.code}</td>
                        <td className="py-2 px-3">{test.dept}</td>
                        <td className="py-2 px-3 text-right">₹{test.price}</td>
                        <td className="py-2 px-3 text-center"><Badge variant="outline">{test.tat}</Badge></td>
                        <td className="py-2 px-3 text-center">
                          <Button variant="ghost" size="sm"><Edit className="h-3 w-3" /></Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* IP Packages */}
          <TabsContent value="ipPackages">
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800">
                    <tr>
                      <th className="py-2 px-3 text-left font-medium">Package Name</th>
                      <th className="py-2 px-3 text-left font-medium">Code</th>
                      <th className="py-2 px-3 text-center font-medium">Days</th>
                      <th className="py-2 px-3 text-left font-medium">Room Type</th>
                      <th className="py-2 px-3 text-right font-medium">Rate (₹)</th>
                      <th className="py-2 px-3 text-left font-medium">Includes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ipPackages.filter(p => p.name.toLowerCase().includes(search.toLowerCase())).map(pkg => (
                      <tr key={pkg.id} className="border-b hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="py-2 px-3 font-medium">{pkg.name}</td>
                        <td className="py-2 px-3 font-mono text-xs">{pkg.code}</td>
                        <td className="py-2 px-3 text-center">{pkg.inclDays}</td>
                        <td className="py-2 px-3">{pkg.roomType}</td>
                        <td className="py-2 px-3 text-right font-semibold">₹{pkg.rate.toLocaleString()}</td>
                        <td className="py-2 px-3 text-xs text-muted-foreground">{pkg.includes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Day Care */}
          <TabsContent value="dayCare">
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800">
                    <tr>
                      <th className="py-2 px-3 text-left font-medium">Package Name</th>
                      <th className="py-2 px-3 text-left font-medium">Code</th>
                      <th className="py-2 px-3 text-center font-medium">Duration</th>
                      <th className="py-2 px-3 text-right font-medium">Rate (₹)</th>
                      <th className="py-2 px-3 text-left font-medium">Includes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dayCarePackages.filter(p => p.name.toLowerCase().includes(search.toLowerCase())).map(pkg => (
                      <tr key={pkg.id} className="border-b hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="py-2 px-3 font-medium">{pkg.name}</td>
                        <td className="py-2 px-3 font-mono text-xs">{pkg.code}</td>
                        <td className="py-2 px-3 text-center"><Badge variant="outline">{pkg.duration}</Badge></td>
                        <td className="py-2 px-3 text-right font-semibold">₹{pkg.rate.toLocaleString()}</td>
                        <td className="py-2 px-3 text-xs text-muted-foreground">{pkg.includes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </InsurancePortalLayout>
  );
};

export default InsuranceInventoryPage;

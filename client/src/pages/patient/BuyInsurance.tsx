import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Shield, TrendingUp, Users, Award, Check, Plus, Search, Filter, ChevronRight } from 'lucide-react';

interface InsurancePlan {
  id: string;
  name: string;
  provider: string;
  type: 'individual' | 'family_floater' | 'senior_citizen' | 'critical_illness' | 'group';
  coverage: string;
  premium: {
    monthly: number;
    annual: number;
  };
  features: string[];
  benefits: string[];
  rating: number;
  popular?: boolean;
  recommended?: boolean;
}

const BuyInsurance: React.FC = () => {
  const [plans, setPlans] = useState<InsurancePlan[]>([
    {
      id: '1',
      name: 'Health Shield Premium',
      provider: 'Star Health Insurance',
      type: 'individual',
      coverage: '₹10,00,000',
      premium: {
        monthly: 2500,
        annual: 27000
      },
      features: [
        'No Room Rent Limit',
        'Unlimited Coverage Restore',
        'Cashless at 12,000+ Hospitals',
        'No Pre-Policy Check-up',
        'Worldwide Emergency Coverage'
      ],
      benefits: [
        'Pre and Post Hospitalization (60 days)',
        'Day Care Procedures',
        'AYUSH Treatment',
        'Air Ambulance'
      ],
      rating: 4.5,
      popular: true,
      recommended: true
    },
    {
      id: '2',
      name: 'Family First Care',
      provider: 'HDFC ERGO',
      type: 'family_floater',
      coverage: '₹15,00,000',
      premium: {
        monthly: 4200,
        annual: 45000
      },
      features: [
        'Covers 4 Family Members',
        'Maternity Coverage',
        'New Born Baby Cover',
        'Preventive Health Check-ups',
        'Mental Illness Coverage'
      ],
      benefits: [
        'Pre and Post Hospitalization (90 days)',
        'Home Healthcare',
        'Organ Donor Expenses',
        'Second Medical Opinion'
      ],
      rating: 4.7,
      popular: true
    },
    {
      id: '3',
      name: 'Senior Citizen Plus',
      provider: 'ICICI Lombard',
      type: 'senior_citizen',
      coverage: '₹5,00,000',
      premium: {
        monthly: 3800,
        annual: 41000
      },
      features: [
        'No Age Limit',
        'Pre-existing Diseases Covered',
        'Daily Hospital Cash',
        'OPD Benefits',
        'Domiciliary Treatment'
      ],
      benefits: [
        'Annual Health Check-up',
        'Ambulance Charges',
        'Rehabilitation Benefits',
        'Ayurvedic Treatment'
      ],
      rating: 4.3
    },
    {
      id: '4',
      name: 'Critical Shield',
      provider: 'Max Bupa',
      type: 'critical_illness',
      coverage: '₹25,00,000',
      premium: {
        monthly: 1800,
        annual: 19500
      },
      features: [
        'Lump Sum Benefit',
        '36 Critical Illnesses Covered',
        'Cancer Care',
        'Cardiac Conditions',
        'Stroke Coverage'
      ],
      benefits: [
        'No Hospitalization Required',
        'Income Replacement',
        'Treatment Abroad',
        'Multiple Claims Allowed'
      ],
      rating: 4.6,
      recommended: true
    }
  ]);

  const [selectedType, setSelectedType] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<InsurancePlan | null>(null);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);

  const planTypes = [
    { value: 'all', label: 'All Plans' },
    { value: 'individual', label: 'Individual' },
    { value: 'family_floater', label: 'Family Floater' },
    { value: 'senior_citizen', label: 'Senior Citizen' },
    { value: 'critical_illness', label: 'Critical Illness' },
    { value: 'group', label: 'Group' }
  ];

  const filteredPlans = plans
    .filter(plan => selectedType === 'all' || plan.type === selectedType)
    .filter(plan => 
      plan.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      plan.provider.toLowerCase().includes(searchTerm.toLowerCase())
    );

  const handleViewDetails = (plan: InsurancePlan) => {
    setSelectedPlan(plan);
    setIsDetailsDialogOpen(true);
  };

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Buy Health Insurance</h1>
        <p className="text-gray-600 mt-1">Compare and buy the best health insurance plans</p>
      </div>

      {/* Benefits Banner */}
      <Card className="bg-gradient-to-r from-blue-50 to-purple-50 mb-6">
        <CardContent className="pt-6">
          <div className="grid md:grid-cols-4 gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Shield className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="font-semibold">Cashless Treatment</p>
                <p className="text-sm text-gray-600">12,000+ Hospitals</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Check className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="font-semibold">Instant Policy</p>
                <p className="text-sm text-gray-600">Get covered in minutes</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <TrendingUp className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="font-semibold">No Claims Bonus</p>
                <p className="text-sm text-gray-600">Increase coverage</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Users className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <p className="font-semibold">Family Protection</p>
                <p className="text-sm text-gray-600">Cover your loved ones</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search and Filter */}
      <div className="space-y-4 mb-6">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search plans or providers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button variant="outline">
            <Filter className="mr-2 h-4 w-4" />
            Advanced Filters
          </Button>
        </div>

        {/* Plan Type Filter */}
        <div className="flex gap-2 overflow-x-auto">
          {planTypes.map(type => (
            <Button
              key={type.value}
              variant={selectedType === type.value ? 'default' : 'outline'}
              onClick={() => setSelectedType(type.value)}
              size="sm"
            >
              {type.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Insurance Plans */}
      <div className="grid md:grid-cols-2 gap-6">
        {filteredPlans.map((plan) => (
          <Card key={plan.id} className={`hover:shadow-lg transition-shadow ${plan.recommended ? 'border-2 border-blue-500' : ''}`}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    {plan.recommended && (
                      <Badge className="bg-blue-100 text-blue-800">
                        <Award className="h-3 w-3 mr-1" />
                        Recommended
                      </Badge>
                    )}
                    {plan.popular && (
                      <Badge className="bg-green-100 text-green-800">Popular</Badge>
                    )}
                  </div>
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <CardDescription className="mt-1">{plan.provider}</CardDescription>
                </div>
                <Badge variant="outline" className="capitalize">
                  {plan.type.replace('_', ' ')}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Coverage Amount */}
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">Sum Insured</p>
                  <p className="text-3xl font-bold text-blue-600">{plan.coverage}</p>
                </div>

                {/* Premium */}
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="text-sm text-gray-600">Premium Starting At</p>
                    <p className="text-2xl font-bold">₹{plan.premium.monthly.toLocaleString()}/mo</p>
                    <p className="text-xs text-gray-500">₹{plan.premium.annual.toLocaleString()}/year</p>
                  </div>
                  <Button>Buy Now</Button>
                </div>

                {/* Key Features */}
                <div>
                  <p className="font-semibold mb-2">Key Features:</p>
                  <ul className="space-y-2">
                    {plan.features.slice(0, 4).map((feature, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm">
                        <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    className="flex-1"
                    onClick={() => handleViewDetails(plan)}
                  >
                    View Details
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                  <Button variant="outline">Compare</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Plan Details Dialog */}
      <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedPlan && (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl">{selectedPlan.name}</DialogTitle>
                <DialogDescription>{selectedPlan.provider}</DialogDescription>
              </DialogHeader>
              <div className="space-y-6 py-4">
                {/* Coverage */}
                <div>
                  <h3 className="font-semibold mb-2">Coverage Details</h3>
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <p className="text-sm text-gray-600">Sum Insured</p>
                    <p className="text-3xl font-bold text-blue-600">{selectedPlan.coverage}</p>
                  </div>
                </div>

                {/* Premium */}
                <div>
                  <h3 className="font-semibold mb-2">Premium</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 border rounded-lg">
                      <p className="text-sm text-gray-600">Monthly</p>
                      <p className="text-2xl font-bold">₹{selectedPlan.premium.monthly.toLocaleString()}</p>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <p className="text-sm text-gray-600">Annual</p>
                      <p className="text-2xl font-bold">₹{selectedPlan.premium.annual.toLocaleString()}</p>
                      <p className="text-xs text-green-600">Save 10%</p>
                    </div>
                  </div>
                </div>

                {/* All Features */}
                <div>
                  <h3 className="font-semibold mb-2">All Features</h3>
                  <ul className="space-y-2">
                    {selectedPlan.features.map((feature, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Benefits */}
                <div>
                  <h3 className="font-semibold mb-2">Additional Benefits</h3>
                  <ul className="space-y-2">
                    {selectedPlan.benefits.map((benefit, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>{benefit}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDetailsDialogOpen(false)}>
                  Close
                </Button>
                <Button>
                  Buy This Plan
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Why Choose Us */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Why Buy Insurance Through Mediczy?</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-6">
            <div>
              <h4 className="font-semibold mb-2">Best Prices</h4>
              <p className="text-sm text-gray-600">
                Compare plans from top insurers and get the best rates with exclusive discounts
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Easy Claims</h4>
              <p className="text-sm text-gray-600">
                Hassle-free claim settlement with 24/7 support and guidance throughout the process
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Expert Advice</h4>
              <p className="text-sm text-gray-600">
                Get personalized recommendations from our health insurance experts
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BuyInsurance;

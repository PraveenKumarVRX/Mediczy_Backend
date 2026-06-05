import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import api from "@/utils/api";

interface FamilyMember {
  id?: number;
  firstName: string;
  lastName: string;
  relationship: string;
  dateOfBirth?: string;
  gender: string;
  phoneNumber?: string;
  email?: string;
  bloodType?: string;
  abhaHealthId?: string;
}

interface FamilyMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member?: FamilyMember;
  onSuccess: () => void;
  allowedRelations?: string[];
  canAddMore?: boolean;
}

const RELATION_OPTIONS = [
  { value: "spouse", label: "Spouse", genderHint: null },
  { value: "father", label: "Father", genderHint: "Male" },
  { value: "mother", label: "Mother", genderHint: "Female" },
  { value: "son", label: "Son", genderHint: "Male" },
  { value: "daughter", label: "Daughter", genderHint: "Female" },
  { value: "brother", label: "Brother", genderHint: "Male" },
  { value: "sister", label: "Sister", genderHint: "Female" },
  { value: "grandfather", label: "Grandfather", genderHint: "Male" },
  { value: "grandmother", label: "Grandmother", genderHint: "Female" },
  { value: "grandson", label: "Grandson", genderHint: "Male" },
  { value: "granddaughter", label: "Granddaughter", genderHint: "Female" },
  { value: "uncle", label: "Uncle", genderHint: "Male" },
  { value: "aunt", label: "Aunt", genderHint: "Female" },
  { value: "nephew", label: "Nephew", genderHint: "Male" },
  { value: "niece", label: "Niece", genderHint: "Female" },
  { value: "cousin", label: "Cousin", genderHint: null },
  { value: "guardian", label: "Guardian", genderHint: null },
  { value: "other", label: "Other", genderHint: null },
];

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

const RELATION_ALIASES: Record<string, string> = {
  wife: "spouse",
  husband: "spouse",
  spouse: "spouse",
  partner: "spouse",
  mom: "mother",
  mother: "mother",
  dad: "father",
  father: "father",
  son: "son",
  daughter: "daughter",
  child: "other",
  bro: "brother",
  brother: "brother",
  sis: "sister",
  sister: "sister",
  grandma: "grandmother",
  grandfather: "grandfather",
  grandpa: "grandfather",
  grandmother: "grandmother",
  uncle: "uncle",
  aunt: "aunt",
  nephew: "nephew",
  niece: "niece",
  cousin: "cousin",
  guardian: "guardian",
};

function inferRelationshipFromHint(hint: string) {
  const normalized = (hint || "").toLowerCase().trim();
  if (!normalized) return "";
  const compact = normalized.replace(/[-_\s]+/g, "");
  for (const [key, val] of Object.entries(RELATION_ALIASES)) {
    if (compact.includes(key)) return val;
  }
  return "";
}

function inferGender(relationship: string, currentGender: string) {
  if (["Male", "Female"].includes(currentGender)) return currentGender;
  const option = RELATION_OPTIONS.find((r) => r.value === relationship);
  return option?.genderHint || currentGender || "Other";
}

export function FamilyMemberDialog({
  open,
  onOpenChange,
  member,
  onSuccess,
  allowedRelations = [],
  canAddMore = true,
}: FamilyMemberDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [relationshipHint, setRelationshipHint] = useState("");
  const [formData, setFormData] = useState<FamilyMember>(
    member || {
      firstName: "",
      lastName: "",
      relationship: "",
      gender: "Male",
      dateOfBirth: "",
      phoneNumber: "",
      email: "",
      bloodType: "",
      abhaHealthId: "",
    }
  );

  useEffect(() => {
    if (!open) return;
    setRelationshipHint("");
    setFormData(
      member || {
        firstName: "",
        lastName: "",
        relationship: "",
        gender: "Other",
        dateOfBirth: "",
        phoneNumber: "",
        email: "",
        bloodType: "",
        abhaHealthId: "",
      }
    );
  }, [open, member]);

  const visibleRelations = useMemo(() => {
    if (!allowedRelations || allowedRelations.length === 0) {
      return RELATION_OPTIONS;
    }
    return RELATION_OPTIONS.filter((option) => allowedRelations.includes(option.value));
  }, [allowedRelations]);

  const relationRestricted = !!allowedRelations && allowedRelations.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!member && !canAddMore) {
      toast({
        title: "Plan limit reached",
        description: "Upgrade your plan to add more family members",
        variant: "destructive",
      });
      return;
    }

    const inferredRelationship = formData.relationship || inferRelationshipFromHint(relationshipHint);
    if (!inferredRelationship) {
      toast({
        title: "Relationship required",
        description: "Select relationship or describe who they are to you",
        variant: "destructive",
      });
      return;
    }

    if (relationRestricted && !visibleRelations.some((r) => r.value === inferredRelationship)) {
      toast({
        title: "Relationship not allowed",
        description: "This relationship is not allowed in your current plan",
        variant: "destructive",
      });
      return;
    }

    const payload = {
      ...formData,
      relationship: inferredRelationship,
      relationshipHint: relationshipHint || undefined,
      gender: inferGender(inferredRelationship, formData.gender),
    };

    setLoading(true);

    try {
      if (member?.id) {
        // Update existing member
        const res = await api.put(`/family-members/${member.id}`, payload);
        const ai = res?.data?.aiInference;
        toast({
          title: "Success",
          description: ai?.relationshipInferred || ai?.genderInferred
            ? "Family member updated (AI assisted inference applied)"
            : "Family member updated successfully",
        });
      } else {
        // Add new member
        const res = await api.post("/family-members", payload);
        const ai = res?.data?.aiInference;
        toast({
          title: "Success",
          description: ai?.relationshipInferred || ai?.genderInferred
            ? "Family member added (AI assisted inference applied)"
            : "Family member added successfully",
        });
      }
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to save family member",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{member ? "Edit" : "Add"} Family Member</DialogTitle>
          <DialogDescription>
            {member ? "Update" : "Add"} family member information
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {/* Basic Information */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  value={formData.firstName}
                  onChange={(e) =>
                    setFormData({ ...formData, firstName: e.target.value })
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  value={formData.lastName}
                  onChange={(e) =>
                    setFormData({ ...formData, lastName: e.target.value })
                  }
                  required
                />
              </div>
            </div>

            {/* Relationship and Gender */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="relationship">Relationship *</Label>
                <Select
                  value={formData.relationship}
                  onValueChange={(value) => {
                    const inferred = inferGender(value, formData.gender);
                    setFormData({ ...formData, relationship: value, gender: inferred });
                  }}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select relationship" />
                  </SelectTrigger>
                  <SelectContent>
                    {visibleRelations.map((rel) => (
                      <SelectItem key={rel.value} value={rel.value}>
                        {rel.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500">AI assist: if not sure, type in hint below and relationship/gender will be inferred.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="gender">Gender *</Label>
                <Select
                  value={formData.gender}
                  onValueChange={(value) =>
                    setFormData({ ...formData, gender: value })
                  }
                  required
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="relationshipHint">Who are they to you? (AI assist)</Label>
              <Input
                id="relationshipHint"
                value={relationshipHint}
                onChange={(e) => {
                  const hint = e.target.value;
                  setRelationshipHint(hint);
                  if (!formData.relationship) {
                    const inferredRel = inferRelationshipFromHint(hint);
                    if (inferredRel) {
                      setFormData((prev) => ({
                        ...prev,
                        relationship: inferredRel,
                        gender: inferGender(inferredRel, prev.gender),
                      }));
                    }
                  }
                }}
                placeholder="Example: my wife, my father, my daughter"
              />
            </div>

            {/* Date of Birth and Blood Type */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dateOfBirth">Date of Birth</Label>
                <Input
                  id="dateOfBirth"
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={(e) =>
                    setFormData({ ...formData, dateOfBirth: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bloodType">Blood Type</Label>
                <Select
                  value={formData.bloodType}
                  onValueChange={(value) =>
                    setFormData({ ...formData, bloodType: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select blood type" />
                  </SelectTrigger>
                  <SelectContent>
                    {BLOOD_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Contact Information */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phoneNumber">Phone Number</Label>
                <Input
                  id="phoneNumber"
                  type="tel"
                  value={formData.phoneNumber}
                  onChange={(e) =>
                    setFormData({ ...formData, phoneNumber: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                />
              </div>
            </div>

            {/* ABHA Health ID */}
            <div className="space-y-2">
              <Label htmlFor="abhaHealthId">ABHA Health ID (14 digits)</Label>
              <Input
                id="abhaHealthId"
                value={formData.abhaHealthId}
                onChange={(e) =>
                  setFormData({ ...formData, abhaHealthId: e.target.value })
                }
                placeholder="Enter 14-digit ABHA ID"
                maxLength={14}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || (!member && !canAddMore)}>
              {loading ? "Saving..." : member ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

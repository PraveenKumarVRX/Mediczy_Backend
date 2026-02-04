import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/auth/AuthProvider";
import MainLayout from "@/components/layout/MainLayout";
import { Camera, Plus, Edit, Trash2, Users } from "lucide-react";
import api from "@/utils/api";
import { FamilyMemberDialog } from "@/components/profile/FamilyMemberDialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface FamilyMember {
  id: number;
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

const ProfileEnhanced = () => {
  const { toast } = useToast();
  const { currentUser, isLoading } = useAuth();
  
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [profileData, setProfileData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phoneNumber: "",
    abhaHealthId: "",
  });
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Family members state
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [loadingFamily, setLoadingFamily] = useState(false);
  const [familyDialogOpen, setFamilyDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<FamilyMember | undefined>();

  useEffect(() => {
    if (currentUser) {
      const currentUserAbha = (currentUser as { abhaHealthId?: string }).abhaHealthId;
      setProfileData({
        firstName: currentUser.firstName || "",
        lastName: currentUser.lastName || "",
        email: currentUser.email || "",
        phoneNumber: currentUser.phoneNumber || "",
        abhaHealthId: currentUserAbha || "",
      });
      setProfileImage(null);
    }
  }, [currentUser]);

  useEffect(() => {
    fetchFamilyMembers();
  }, []);

  const fetchFamilyMembers = async () => {
    setLoadingFamily(true);
    try {
      const response = await api.get("/api/family-members");
      setFamilyMembers(response.data.data || []);
    } catch (error: any) {
      console.error("Error fetching family members:", error);
    } finally {
      setLoadingFamily(false);
    }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload an image smaller than 5MB",
        variant: "destructive",
      });
      return;
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file",
        variant: "destructive",
      });
      return;
    }

    setUploadingImage(true);
    const formData = new FormData();
    formData.append("profilePicture", file);

    try {
      const response = await api.post("/users/profile-picture", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      
      setProfileImage(response.data.profileImage);
      toast({
        title: "Success",
        description: "Profile picture updated successfully",
      });
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.response?.data?.message || "Failed to upload profile picture",
        variant: "destructive",
      });
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const response = await api.put("/users/profile", profileData);
      toast({
        title: "Success",
        description: "Profile updated successfully",
      });
      setIsEditing(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to update profile",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleEditMember = (member: FamilyMember) => {
    setEditingMember(member);
    setFamilyDialogOpen(true);
  };

  const handleAddMember = () => {
    setEditingMember(undefined);
    setFamilyDialogOpen(true);
  };

  const handleDeleteMember = async (id: number) => {
    if (!confirm("Are you sure you want to remove this family member?")) return;

    try {
      await api.delete(`/api/family-members/${id}`);
      toast({
        title: "Success",
        description: "Family member removed successfully",
      });
      fetchFamilyMembers();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to remove family member",
        variant: "destructive",
      });
    }
  };

  const handleDialogSuccess = () => {
    fetchFamilyMembers();
  };

  if (isLoading) {
    return (
        <div className="flex justify-center items-center h-96">
          <p>Loading...</p>
        </div>
    );
  }

  return (
    <>
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <h1 className="text-3xl font-bold mb-6">My Profile</h1>

        {/* Profile Picture and Basic Info Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-6">
              {/* Profile Picture */}
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <Avatar className="w-32 h-32">
                    <AvatarImage 
                      src={profileImage ? `${import.meta.env.VITE_API_URL}${profileImage}` : undefined} 
                      alt={`${profileData.firstName} ${profileData.lastName}`} 
                    />
                    <AvatarFallback className="text-3xl">
                      {profileData.firstName?.charAt(0)}{profileData.lastName?.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <label
                    htmlFor="profile-upload"
                    className="absolute bottom-0 right-0 bg-primary text-primary-foreground rounded-full p-2 cursor-pointer hover:bg-primary/90 transition-colors"
                  >
                    <Camera className="w-4 h-4" />
                  </label>
                  <input
                    id="profile-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageUpload}
                    disabled={uploadingImage}
                  />
                </div>
                {uploadingImage && (
                  <p className="text-sm text-muted-foreground">Uploading...</p>
                )}
              </div>

              {/* Profile Form */}
              <div className="flex-1 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      value={profileData.firstName}
                      onChange={(e) =>
                        setProfileData({ ...profileData, firstName: e.target.value })
                      }
                      disabled={!isEditing}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      value={profileData.lastName}
                      onChange={(e) =>
                        setProfileData({ ...profileData, lastName: e.target.value })
                      }
                      disabled={!isEditing}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={profileData.email}
                    disabled
                    className="bg-muted"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phoneNumber">Phone Number</Label>
                  <Input
                    id="phoneNumber"
                    value={profileData.phoneNumber}
                    onChange={(e) =>
                      setProfileData({ ...profileData, phoneNumber: e.target.value })
                    }
                    disabled={!isEditing}
                  />
                </div>

                {/* ABHA Health ID */}
                <div className="space-y-2">
                  <Label htmlFor="abhaHealthId">
                    ABHA Health ID (Ayushman Bharat Health Account)
                  </Label>
                  <Input
                    id="abhaHealthId"
                    value={profileData.abhaHealthId}
                    onChange={(e) =>
                      setProfileData({ ...profileData, abhaHealthId: e.target.value })
                    }
                    disabled={!isEditing}
                    placeholder="Enter 14-digit ABHA ID"
                    maxLength={14}
                  />
                  <p className="text-sm text-muted-foreground">
                    Your Ayushman Bharat Health Account unique identifier
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-4">
                  {!isEditing ? (
                    <Button onClick={() => setIsEditing(true)}>Edit Profile</Button>
                  ) : (
                    <>
                      <Button onClick={handleSaveProfile} disabled={saving}>
                        {saving ? "Saving..." : "Save Changes"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setIsEditing(false);
                          // Reset form
                          if (currentUser) {
                            setProfileData({
                              firstName: currentUser.firstName || "",
                              lastName: currentUser.lastName || "",
                              email: currentUser.email || "",
                              phoneNumber: currentUser.phoneNumber || "",
                              abhaHealthId: "",
                            });
                          }
                        }}
                      >
                        Cancel
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Family Members Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                <CardTitle>Family Members</CardTitle>
              </div>
              <Button onClick={handleAddMember} size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Add Member
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loadingFamily ? (
              <p className="text-center text-muted-foreground py-8">Loading...</p>
            ) : familyMembers.length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">
                  No family members added yet
                </p>
                <Button onClick={handleAddMember} variant="outline">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your First Family Member
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Relationship</TableHead>
                      <TableHead>Gender</TableHead>
                      <TableHead>Age</TableHead>
                      <TableHead>Blood Type</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {familyMembers.map((member) => {
                      const age = member.dateOfBirth
                        ? new Date().getFullYear() -
                          new Date(member.dateOfBirth).getFullYear()
                        : "N/A";

                      return (
                        <TableRow key={member.id}>
                          <TableCell className="font-medium">
                            {member.firstName} {member.lastName}
                          </TableCell>
                          <TableCell className="capitalize">
                            {member.relationship}
                          </TableCell>
                          <TableCell>{member.gender}</TableCell>
                          <TableCell>{age}</TableCell>
                          <TableCell>{member.bloodType || "N/A"}</TableCell>
                          <TableCell>{member.phoneNumber || "N/A"}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleEditMember(member)}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeleteMember(member.id)}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Family Member Dialog */}
      <FamilyMemberDialog
        open={familyDialogOpen}
        onOpenChange={setFamilyDialogOpen}
        member={editingMember}
        onSuccess={handleDialogSuccess}
      />
    </>
  );
};

export default ProfileEnhanced;

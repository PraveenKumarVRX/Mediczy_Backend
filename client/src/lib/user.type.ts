import { Coordinate } from "recharts/types/util/types";

interface UserProps {
  firstName: string;
  lastName: string;
  email: string;
  _id: string;
}
interface cardsProps {
  title: string;
  value: string;
  trend: string;
  icon: undefined;
  trendDirection: undefined;
}
type locationProp = {
  coordinates: [number, number];
};
interface profileProps {
  _id?: string;
  id?: string | number;
  name?: string;
  profileImage?: string;
  bloodGroup?: string;
  phone?: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  dob?: string;
  dateOfBirth?: string;
  gender?: string;
  isOnline?: boolean;
  location?: locationProp;
  height?: number;
  weight?: number;
  bloodType?: string;
  allergies?: string[];
  medications?: string[];
  chronicConditions?: string[];
  medicalHistory?: string;
  familyHistory?: {
    diabetes?: boolean;
    hypertension?: boolean;
    heartDisease?: boolean;
    cancer?: boolean;
    stroke?: boolean;
    asthma?: boolean;
    thyroid?: boolean;
    mentalHealth?: boolean;
    kidney?: boolean;
    details?: string;
  };
  personalHistory?: {
    smoking?: string;
    alcohol?: string;
    exercise?: string;
    diet?: string;
    sleep?: string;
    occupation?: string;
    stressLevel?: string;
  };
  // Doctor fields accessed via the profileProps | doctorProfileProps union (optional here).
  clinicName?: string;
  qualifications?: string;
  registrationNumber?: string;
  organizationId?: number;
}

interface doctorProfileProps {
  _id?: string;
  id?: string | number;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  isOnline?: boolean;
  location?: locationProp;
  specialization?: string;
  experience?: number;
  profileImage?: string;
  rating?: number;
  organization_id?: number;
  organizationId?: number;
  organization_type?: string;
  organizationType?: string;
  hospitalId?: number;
  hospital_id?: number;
  // Fields accessed via the profileProps | doctorProfileProps union (optional on this member).
  name?: string;
  clinicName?: string;
  qualifications?: string;
  registrationNumber?: string;
  address?: unknown;
  height?: number;
  weight?: number;
  bloodType?: string;
  allergies?: string[];
  medications?: string[];
  chronicConditions?: string[];
  familyHistory?: unknown;
  personalHistory?: unknown;
}
export type { UserProps, cardsProps, profileProps, doctorProfileProps };

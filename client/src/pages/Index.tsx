import { useState, useEffect, useMemo } from "react";
import {
  Activity,
  Stethoscope,
  Apple,
  Pill,
  Bot,
  HeartPulse,
  Leaf,
  AlertCircle,
  Info,
  Bell,
  Calendar,
  CheckCircle2,
  Phone,
  ArrowRight,
  Video,
  Clock,
  Shield,
  Brain,
  Sparkles,
  Heart,
  Plus,
  TrendingUp,
  Droplets,
  Footprints,
  Moon,
  Zap,
  CalendarCheck,
  User,
  FileText,
  Wallet,
  ShieldCheck,
  Crown,
  Watch,
  Bluetooth,
  RefreshCw,
  Building2,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { X, Loader2, WifiOff, CheckCircle, Smartphone, Users, Trophy } from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import api from "@/utils/api";
import { getToken } from "@/hooks/auth";
import { trackEvent } from "@/utils/telemetry";
import veepooService, { VeepooService, VEEPOO_SERVICE_UUID, VEEPOO_WRITE_UUID, VEEPOO_NOTIFY_UUID } from "@/services/ble/VeepooService";
import fireBolttService, { FireBolttService, FIREBOLTT_SERVICE_UUID } from "@/services/ble/FireBolttService";
import { healthSyncScheduler } from "@/services/health/HealthSyncScheduler";
import { motion } from "framer-motion";

const Index = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentUser, currentDoctor, userType } = useAuth();
  
  // Make healthSyncScheduler available on window for device connection
  useEffect(() => {
    (window as any).healthSyncScheduler = healthSyncScheduler;
  }, []);
  
  // Redirect non-patient users to their appropriate dashboards
  useEffect(() => {
    if (userType === 'user') return;

    const storedUserType = localStorage.getItem('userType');
    const doctorToken = localStorage.getItem('doctorToken');
    const clinicToken = localStorage.getItem('clinicToken');
    const labToken = localStorage.getItem('labToken');
    const pharmacyToken = localStorage.getItem('pharmacyToken');
    const hospitalToken = localStorage.getItem('hospitalToken');

    if (userType === 'doctor' || (storedUserType === 'doctor' && doctorToken)) {
      navigate('/doctor/dashboard', { replace: true });
      return;
    }
    if (storedUserType === 'clinic' && clinicToken) {
      navigate('/clinic/dashboard', { replace: true });
      return;
    }
    if (storedUserType === 'lab' && labToken) {
      navigate('/lab/dashboard', { replace: true });
      return;
    }
    if (storedUserType === 'pharmacy' && pharmacyToken) {
      navigate('/pharmacy/dashboard', { replace: true });
      return;
    }
    if (storedUserType === 'hospital' && hospitalToken) {
      navigate('/hospital/dashboard', { replace: true });
      return;
    }
  }, [userType, navigate]);

  const userName = currentUser?.firstName || "Guest";
  const [healthStats, setHealthStats] = useState({
    steps: 0,
    stepsGoal: 10000,
    heartRate: 0,
    sleep: 0,
    water: 0,
    waterGoal: 8,
    calories: 0,
    caloriesGoal: 2200,
  });
  const [healthStatsLoaded, setHealthStatsLoaded] = useState(false);
  const [healthStatsUpdatedAt, setHealthStatsUpdatedAt] = useState<Date | null>(null);
  const [healthinessScore, setHealthinessScore] = useState({
    score: 0,
    trend: 'stable' as 'up' | 'down' | 'stable',
    lastUpdated: null as Date | null,
    breakdown: {
      activity: { current: 0, history: [0] },
      nutrition: { current: 0, history: [0] },
      sleep: { current: 0, history: [0] },
      vitals: { current: 0, history: [0] },
    }
  });
  const [upcomingAppointments, setUpcomingAppointments] = useState<any[]>([]);
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [appointmentsLoadError, setAppointmentsLoadError] = useState(false);
  const [membershipNotice, setMembershipNotice] = useState<null | {
    level: 'warning' | 'danger';
    title: string;
    description: string;
    ctaLabel: string;
    ctaLink: string;
    secondaryCtaLabel?: string;
    secondaryCtaLink?: string;
  }>(null);

  useEffect(() => {
    if (!membershipNotice) return;
    trackEvent('membership_notice_impression', {
      level: membershipNotice.level,
      title: membershipNotice.title,
      ctaLink: membershipNotice.ctaLink,
      secondaryCtaLink: membershipNotice.secondaryCtaLink || null,
    });
  }, [membershipNotice]);

  // Health Tip of the Day — personalized based on user's health profile
  const healthTips = useMemo(() => {
    const generalTips = [
      { emoji: "💧", tip: "Drink a glass of water first thing in the morning to kickstart your metabolism.", category: "Hydration" },
      { emoji: "🧘", tip: "Take 5 deep breaths every hour to reduce stress and improve focus.", category: "Mindfulness" },
      { emoji: "🥗", tip: "Aim for 5 servings of fruits and vegetables every day for optimal nutrition.", category: "Nutrition" },
      { emoji: "🚶", tip: "A 30-minute walk after meals can improve digestion and lower blood sugar.", category: "Activity" },
      { emoji: "😴", tip: "Avoid screens 1 hour before bed for better sleep quality.", category: "Sleep" },
      { emoji: "🫀", tip: "Regular cardio exercise strengthens your heart and reduces disease risk.", category: "Heart Health" },
      { emoji: "🧠", tip: "Learning something new every day keeps your brain sharp and healthy.", category: "Mental Health" },
      { emoji: "☀️", tip: "15 minutes of morning sunlight boosts vitamin D and regulates sleep.", category: "Wellness" },
      { emoji: "🦷", tip: "Brushing for 2 minutes twice daily prevents 90% of dental issues.", category: "Dental" },
      { emoji: "🫁", tip: "Practice 4-7-8 breathing: inhale 4s, hold 7s, exhale 8s for instant calm.", category: "Breathing" },
    ];

    const personalTips: typeof generalTips = [];
    const conditions = currentUser?.chronicConditions || [];
    const allergies = currentUser?.allergies || [];
    const family = currentUser?.familyHistory;
    const lifestyle = currentUser?.personalHistory;

    // Condition-specific tips
    conditions.forEach((c: string) => {
      const cl = c.toLowerCase();
      if (cl.includes('diabetes')) {
        personalTips.push(
          { emoji: "🩸", tip: "Monitor your blood sugar before and after meals. Low-GI foods like oats and lentils help maintain stable levels.", category: "Diabetes Care" },
          { emoji: "🥬", tip: "Include bitter gourd, fenugreek seeds, and cinnamon in your diet — they help regulate blood sugar naturally.", category: "Diabetes Care" },
        );
      }
      if (cl.includes('hypertension') || cl.includes('blood pressure')) {
        personalTips.push(
          { emoji: "🧂", tip: "Limit sodium to under 2,300mg/day. Replace table salt with herbs, lemon, and spices for flavor.", category: "Heart Health" },
          { emoji: "🍌", tip: "Eat potassium-rich foods like bananas, spinach, and sweet potatoes to help lower blood pressure.", category: "Heart Health" },
        );
      }
      if (cl.includes('asthma') || cl.includes('respiratory')) {
        personalTips.push(
          { emoji: "🌬️", tip: "Practice diaphragmatic breathing daily. Keep rescue inhaler accessible and avoid known triggers.", category: "Respiratory" },
        );
      }
      if (cl.includes('thyroid')) {
        personalTips.push(
          { emoji: "🦋", tip: "Take thyroid medication on an empty stomach and wait 30-60 minutes before eating for best absorption.", category: "Thyroid Care" },
        );
      }
      if (cl.includes('cholesterol') || cl.includes('heart')) {
        personalTips.push(
          { emoji: "❤️", tip: "Include omega-3 rich foods like walnuts, flaxseeds, and fish to support heart health and lower cholesterol.", category: "Heart Health" },
        );
      }
    });

    // Allergy awareness
    if (allergies.length > 0) {
      personalTips.push(
        { emoji: "⚠️", tip: `Remember to check food labels for your allergens: ${allergies.slice(0, 3).join(', ')}. Always carry antihistamines.`, category: "Allergy Alert" },
      );
    }

    // Family history preventive tips
    if (family?.diabetes && !conditions.some((c: string) => c.toLowerCase().includes('diabetes'))) {
      personalTips.push(
        { emoji: "🏃", tip: "With diabetes in your family, regular exercise and maintaining a healthy weight reduces your risk by up to 58%.", category: "Prevention" },
      );
    }
    if (family?.heartDisease && !conditions.some((c: string) => c.toLowerCase().includes('heart'))) {
      personalTips.push(
        { emoji: "💓", tip: "Family history of heart disease detected. Get annual lipid profile tests and aim for 150 minutes of cardio per week.", category: "Prevention" },
      );
    }
    if (family?.hypertension && !conditions.some((c: string) => c.toLowerCase().includes('hypertension'))) {
      personalTips.push(
        { emoji: "🫀", tip: "Monitor your blood pressure regularly. With a family history, reducing sodium and managing stress are key preventive steps.", category: "Prevention" },
      );
    }

    // Lifestyle tips
    if (lifestyle?.smoking === 'current' || lifestyle?.smoking === 'occasional') {
      personalTips.push(
        { emoji: "🚭", tip: "Every cigarette-free day helps. After 20 minutes, heart rate drops. After 1 year, heart disease risk halves.", category: "Quit Smoking" },
      );
    }
    if (lifestyle?.sleep === 'less-than-5' || lifestyle?.sleep === '5-6') {
      personalTips.push(
        { emoji: "🌙", tip: "You're getting less sleep than recommended. Set a consistent bedtime — even 30 extra minutes improves immunity and focus.", category: "Sleep" },
      );
    }
    if (lifestyle?.stressLevel === 'high' || lifestyle?.stressLevel === 'very-high') {
      personalTips.push(
        { emoji: "🧘‍♂️", tip: "High stress detected. Try the 5-4-3-2-1 grounding technique: notice 5 things you see, 4 you touch, 3 you hear, 2 you smell, 1 you taste.", category: "Stress Relief" },
      );
    }

    // Merge: personal tips first, then fill with general tips (no duplicates)
    if (personalTips.length > 0) {
      const merged = [...personalTips];
      for (const tip of generalTips) {
        if (merged.length >= 15) break;
        if (!merged.some(t => t.category === tip.category)) merged.push(tip);
      }
      return merged;
    }
    return generalTips;
  }, [currentUser]);
  const todayTipIndex = new Date().getDate() % healthTips.length;
  const todayTip = healthTips[todayTipIndex];

  // Gamification / Streak Data
  const [streakData, setStreakData] = useState(() => {
    const stored = JSON.parse(localStorage.getItem('healthStreak') || '{}');
    return {
      currentStreak: stored.currentStreak || 0,
      longestStreak: stored.longestStreak || 0,
      healthCoins: stored.healthCoins || 0,
      level: stored.level || 1,
      xp: stored.xp || 0,
      nextLevelXp: stored.nextLevelXp || 500,
      todayCheckedIn: stored.todayCheckedIn || false,
      badges: stored.badges || [],
    };
  });

  const fetchStreakWalletData = async () => {
    try {
      const response = await api.get('/wallet');
      const wallet = response?.data?.data;
      if (!wallet) return;

      setStreakData((prev) => {
        const next = {
          ...prev,
          currentStreak: wallet.streakDays ?? prev.currentStreak,
          longestStreak: Math.max(prev.longestStreak || 0, wallet.streakDays || 0),
          healthCoins: Math.round(wallet.balance ?? prev.healthCoins ?? 0),
          // Keep dashboard level/xp predictable while aligning source to wallet totals.
          level: Math.max(1, Math.floor((wallet.totalEarned ?? 0) / 1000) + 1),
          xp: Math.round(wallet.totalEarned ?? prev.xp ?? 0),
          todayCheckedIn: !!wallet.todayActivity?.dailyLoginRewarded,
        };
        localStorage.setItem('healthStreak', JSON.stringify(next));
        return next;
      });
    } catch (error) {
      // Dashboard should continue rendering with cached streak data.
    }
  };
  
  // Bluetooth Pairing State
  const [showPairingModal, setShowPairingModal] = useState(false);
  const [pairingStep, setPairingStep] = useState<'scanning' | 'found' | 'pairing' | 'success' | 'error'>('scanning');
  const [discoveredDevices, setDiscoveredDevices] = useState<Array<{
    id: string;
    name: string;
    type: string;
    icon: string;
    signal: number;
    device?: any;
  }>>([]);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [pairingProgress, setPairingProgress] = useState(0);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [connectedDevices, setConnectedDevices] = useState<Array<{
    id: string;
    name: string;
    type: string;
    icon: string;
    brand?: string;
    model?: string;
    status: string;
    battery?: number;
    dataTypes?: string[];
    connectedAt?: string;
    lastSync?: string;
  }>>([]);
  const supportedDevices = [
    { name: "Apple Watch", icon: "⌚", brands: "Series 4+" },
    { name: "Samsung Watch", icon: "⌚", brands: "Galaxy Watch" },
    { name: "Fitbit", icon: "📱", brands: "Versa, Charge" },
    { name: "Smart Ring", icon: "💍", brands: "Oura, Circular" },
  ];
  const onboardingStorageKey = currentUser?.id ? `onboarding:user:${currentUser?.id}` : 'onboarding:user:guest';
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);

  // Helper function to get device icon based on type
  const getDeviceIcon = (type: string): string => {
    const iconMap: { [key: string]: string } = {
      'smartwatch': '⌚',
      'smart_watch': '⌚',
      'fitness_band': '📱',
      'smart_ring': '💍',
      'weight_scale': '⚖️',
      'bp_monitor': '🩺',
      'blood_pressure': '🩺',
      'glucose_meter': '🩸',
      'thermometer': '🌡️',
      'pulse_oximeter': '💗',
      'integration': '❤️',
      'manual': '➕',
    };
    return iconMap[type?.toLowerCase()] || '⌚';
  };

  useEffect(() => {
    const stored = localStorage.getItem(onboardingStorageKey);
    setOnboardingDismissed(stored === 'dismissed');
  }, [onboardingStorageKey]);

  const dismissOnboarding = () => {
    setOnboardingDismissed(true);
    localStorage.setItem(onboardingStorageKey, 'dismissed');
  };

  const profileComplete = Boolean(
    currentUser?.dateOfBirth &&
    currentUser?.gender &&
    (currentUser?.phoneNumber || currentUser?.phone)
  );
  const deviceConnected = connectedDevices.length > 0;
  const hasUpcomingAppointment = upcomingAppointments.length > 0;

  const onboardingSteps = [
    {
      id: 'profile',
      title: 'Complete your profile',
      description: 'Add DOB, gender, and a verified phone number.',
      done: profileComplete,
      link: '/profile',
      cta: 'Complete profile'
    },
    {
      id: 'device',
      title: 'Connect a device',
      description: 'Sync steps, sleep, heart rate, and more.',
      done: deviceConnected,
      link: '/patient/devices?action=pair-device',
      cta: 'Connect device'
    },
    {
      id: 'consult',
      title: 'Book your first consult',
      description: 'Talk to a doctor and build your care plan.',
      done: hasUpcomingAppointment,
      link: '/consultation',
      cta: 'Book consult'
    }
  ];

  const onboardingComplete = onboardingSteps.every((step) => step.done);
  const showOnboarding = !onboardingDismissed && !onboardingComplete;
  const completedCount = onboardingSteps.filter((step) => step.done).length;

  const nextBestAction = !profileComplete
    ? {
        title: 'Complete your profile',
        description: 'Unlock personalized care and accurate recommendations.',
        link: '/profile',
        cta: 'Finish profile',
        icon: User
      }
    : !deviceConnected
      ? {
          title: 'Connect a device',
          description: 'Start automatic health tracking in minutes.',
          link: '/patient/devices?action=pair-device',
          cta: 'Connect device',
          icon: Bluetooth
        }
      : !hasUpcomingAppointment
        ? {
            title: 'Book a consultation',
            description: 'Get expert guidance on your health goals.',
            link: '/consultation',
            cta: 'Book now',
            icon: CalendarCheck
          }
        : {
            title: 'Review today’s trends',
            description: 'See how your sleep, activity, and vitals are moving.',
            link: '/health-tracker',
            cta: 'View trends',
            icon: TrendingUp
          };
  const NextBestIcon = nextBestAction.icon;

  // Helper to detect device type from name
  const detectDeviceType = (name: string): { type: string; icon: string } => {
    const nameLower = name.toLowerCase();
    
    const smartwatchPatterns = ['watch', 'galaxy', 'apple', 've30', 've20', 've40', 'gt', 'gts', 'gtr', 'amazfit', 'huawei', 'honor', 'realme', 'noise', 'boat', 'fire-boltt', 'fireboltt', 'dizo'];
    const ringPatterns = ['ring', 'oura', 'circular', 'motiv'];
    const scalePatterns = ['scale', 'weight', 'body', 'renpho', 'eufy', 'withings'];
    const bpPatterns = ['bp', 'pressure', 'omron', 'sphygmo'];
    const bandPatterns = ['band', 'mi band', 'fitbit', 'charge', 'inspire'];
    
    if (ringPatterns.some(p => nameLower.includes(p))) {
      return { type: 'smart_ring', icon: '💍' };
    } else if (scalePatterns.some(p => nameLower.includes(p))) {
      return { type: 'weight_scale', icon: '⚖️' };
    } else if (bpPatterns.some(p => nameLower.includes(p))) {
      return { type: 'bp_monitor', icon: '🩺' };
    } else if (bandPatterns.some(p => nameLower.includes(p))) {
      return { type: 'fitness_band', icon: '📱' };
    } else if (smartwatchPatterns.some(p => nameLower.includes(p))) {
      return { type: 'smartwatch', icon: '⌚' };
    }
    // Default to smartwatch for BLE health devices
    return { type: 'smartwatch', icon: '⌚' };
  };

  // Function to disconnect a device
  const disconnectDevice = (deviceId: string) => {
    const updatedDevices = connectedDevices.filter(d => d.id !== deviceId);
    localStorage.setItem('connectedDevices', JSON.stringify(updatedDevices));
    setConnectedDevices(updatedDevices);
    // Clean up Fire-Boltt service if active
    fireBolttService.disconnect();
  };

  const syncDevice = async (deviceId: string) => {
    const deviceInfo = connectedDevices.find(d => d.id === deviceId);
    // Update device status to 'syncing' in UI
    setConnectedDevices(prev =>
      prev.map(d => d.id === deviceId ? { ...d, status: 'syncing' } : d)
    );
    try {
      // Fire-Boltt / Jieli protocol
      if (deviceInfo?.isFireBolttDevice) {
        const data = await fireBolttService.syncAll();
        if (data.heartRate || data.steps || data.spo2) {
          const updatedAt = new Date().toISOString();
          setConnectedDevices(prev =>
            prev.map(d => d.id === deviceId ? {
              ...d,
              status: 'connected',
              battery: data.battery ?? d.battery,
              lastSync: updatedAt,
            } : d)
          );
          const stored = JSON.parse(localStorage.getItem('connectedDevices') || '[]');
          localStorage.setItem('connectedDevices', JSON.stringify(
            stored.map((d: any) => d.id === deviceId ? { ...d, lastSync: updatedAt } : d)
          ));
          console.log('[Sync] Fire-Boltt data:', data);
          return;
        }
      }

      // Veepoo / HBand protocol
      if (deviceInfo?.isVeepooDevice) {
        // Try to (re)connect silently if not currently connected
        if (!veepooService.getConnectionStatus()) {
          console.log('[Sync] Veepoo not connected, attempting auto-reconnect...');
          const reconnected = await veepooService.reconnect();
          if (!reconnected) {
            console.warn('[Sync] Could not reconnect to Veepoo device. User must re-pair.');
            // Don't fall through to healthSyncScheduler — it will also fail and throw
            return;
          }
        }
        await veepooService.startHeartRateMeasurement();
        const updatedAt = new Date().toISOString();
        setConnectedDevices(prev =>
          prev.map(d => d.id === deviceId ? { ...d, status: 'connected', lastSync: updatedAt } : d)
        );
        const stored = JSON.parse(localStorage.getItem('connectedDevices') || '[]');
        localStorage.setItem('connectedDevices', JSON.stringify(
          stored.map((d: any) => d.id === deviceId ? { ...d, lastSync: updatedAt } : d)
        ));
        console.log('[Sync] Veepoo measurement started');
        return;
      }

      // Fallback: healthSyncScheduler (standard GATT / generic non-Veepoo, non-FireBoltt devices)
      if (!deviceInfo?.isVeepooDevice && !deviceInfo?.isFireBolttDevice && window.healthSyncScheduler) {
        await window.healthSyncScheduler.triggerDeviceMeasurements();
        await window.healthSyncScheduler.performSync();
      }
    } catch (e) {
      console.error('[Sync] Error syncing device:', e);
    } finally {
      setConnectedDevices(prev =>
        prev.map(d => d.id === deviceId ? { ...d, status: 'connected' } : d)
      );
    }
  };

  const syncAllDevices = async () => {
    if (connectedDevices.length === 0 || isSyncingAll) return;
    setIsSyncingAll(true);
    try {
      for (const device of connectedDevices) {
        await syncDevice(device.id);
      }
      if (window.healthSyncScheduler) {
        await window.healthSyncScheduler.performSync();
      }
    } catch (error) {
      console.error('[Sync] Error syncing all devices:', error);
    } finally {
      setIsSyncingAll(false);
    }
  };

  // Handle URL action parameters (e.g., ?action=pair-device)
  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'pair-device') {
      // Clear the action param from URL first to prevent re-trigger
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
      // Start the Bluetooth scan - this opens modal and triggers device picker
      startBluetoothScan();
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    fetchDashboardData();
    fetchHealthStats(); // Fetch real health data from backend
    fetchDailyHealthScore();
    fetchMembershipStatus();
    fetchStreakWalletData();
    
    // Load connected devices from localStorage and fix any with wrong types
    const storedDevices = JSON.parse(localStorage.getItem('connectedDevices') || '[]');
    
    // Auto-fix devices with incorrect types/icons (but don't change dataTypes)
    const fixedDevices = storedDevices.map((device: any) => {
      const detected = detectDeviceType(device.name);
      const needsFix = device.type === 'fitness_band' && detected.type === 'smartwatch';
      
      if (needsFix) {
        return {
          ...device,
          type: detected.type,
          icon: detected.icon,
          // Keep existing dataTypes - don't override with defaults
        };
      }
      return device;
    });
    
    // Save fixed devices back to localStorage if any changes
    const hasChanges = JSON.stringify(storedDevices) !== JSON.stringify(fixedDevices);
    if (hasChanges) {
      localStorage.setItem('connectedDevices', JSON.stringify(fixedDevices));
    }
    
    setConnectedDevices(fixedDevices);
    
    // Listen for health data updates
    const handleHealthDataSync = () => {
      console.log('Health data synced event received, refreshing stats...');
      fetchHealthStats();
      fetchDailyHealthScore();
    };
    window.addEventListener('healthDataSynced', handleHealthDataSync);
    
    return () => {
      window.removeEventListener('healthDataSynced', handleHealthDataSync);
    };
  }, [currentUser, userType]);

  const fetchDashboardData = async () => {
    try {
      const token = getToken();
      const isPatient = userType === "user" && !!currentUser;
      setAppointmentsLoadError(false);

      if (token && isPatient) {
        // Try to fetch real appointments for authenticated patients
        const appointmentsRes = await api.get('/appointments/my-appointments').catch(() => null);
        if (appointmentsRes?.data) {
          const raw = appointmentsRes.data;
          const list = Array.isArray(raw)
            ? raw
            : Array.isArray(raw.appointments)
            ? raw.appointments
            : [];
          // The dashboard must not call a past or closed appointment
          // "Upcoming" just because the API returned it first. Some legacy
          // rows are payment-pending while their appointment date is already
          // over, so date and lifecycle status both need to be considered.
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const upcoming = list
            .filter((appointment: any) => {
              const status = String(appointment.status || '').toLowerCase();
              if (['completed', 'cancelled', 'no-show', 'no_show'].includes(status)) return false;
              const rawDate = appointment.appointmentDate || appointment.date;
              if (!rawDate) return false;
              const appointmentDate = new Date(`${String(rawDate).slice(0, 10)}T00:00:00`);
              return !Number.isNaN(appointmentDate.getTime()) && appointmentDate >= today;
            })
            .sort((a: any, b: any) =>
              String(a.appointmentDate || a.date).localeCompare(String(b.appointmentDate || b.date))
              || String(a.appointmentTime || a.time || '').localeCompare(String(b.appointmentTime || b.time || ''))
            );
          setUpcomingAppointments(upcoming.slice(0, 3));
        } else {
          setUpcomingAppointments([]);
          setAppointmentsLoadError(true);
        }
      } else {
        // Unauthenticated visitors see sample content without hitting protected APIs
        setUpcomingAppointments(getSampleAppointments());
      }

      setRecentActivities([
        { id: 1, type: "checkup", message: "Health metrics updated", time: "2 hours ago", icon: Activity, link: "/health-tracker" },
        { id: 2, type: "prescription", message: "New prescription added", time: "Yesterday", icon: Pill, link: "/my-prescriptions" },
        { id: 3, type: "appointment", message: "Appointment confirmed", time: "2 days ago", icon: CalendarCheck, link: "/appointments" },
      ]);
    } catch (err) {
      console.error("Error fetching dashboard data:", err);
      setUpcomingAppointments([]);
      setAppointmentsLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const fetchMembershipStatus = async () => {
    try {
      const token = getToken();
      const isPatient = userType === "user" && !!currentUser;
      if (!token || !isPatient) {
        setMembershipNotice(null);
        return;
      }

      const response = await api.get('/membership/my/current');
      const userPlan = response?.data?.userPlan;

      if (!userPlan) {
        setMembershipNotice({
          level: 'danger',
          title: 'No active membership plan',
          description: 'Your account needs an active plan to keep all services available.',
          ctaLabel: 'Choose Plan',
          ctaLink: '/choose-plan',
          secondaryCtaLabel: 'Get Help',
          secondaryCtaLink: '/help',
        });
        return;
      }

      const endDate = userPlan?.endDate ? new Date(`${userPlan.endDate}T23:59:59.999`) : null;
      if (!endDate || Number.isNaN(endDate.getTime())) {
        setMembershipNotice(null);
        return;
      }

      const msRemaining = endDate.getTime() - Date.now();
      const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));

      if (daysRemaining <= 0) {
        setMembershipNotice({
          level: 'danger',
          title: 'Membership expired',
          description: `Your membership expired on ${userPlan.endDate}. Renew now to restore uninterrupted access.`,
          ctaLabel: 'Renew Plan',
          ctaLink: '/my-plans',
          secondaryCtaLabel: 'Contact Support',
          secondaryCtaLink: '/contact-us',
        });
        return;
      }

      if (daysRemaining <= 7) {
        setMembershipNotice({
          level: 'warning',
          title: `Membership expires in ${daysRemaining} day${daysRemaining > 1 ? 's' : ''}`,
          description: 'Renew in advance to avoid account interruption.',
          ctaLabel: 'Renew Early',
          ctaLink: '/my-plans',
        });
        return;
      }

      setMembershipNotice(null);
    } catch (error) {
      console.log('Could not fetch membership status:', error);
      setMembershipNotice(null);
    }
  };

  const fetchHealthStats = async () => {
    try {
      const token = getToken();
      if (!token) {
        console.log('No auth token, using default health stats');
        return;
      }

      // `/health/latest` is the canonical latest-vitals source used by the
      // health dashboard. Keep the older summary only for metrics it alone
      // supplies (water/calories), rather than showing a different pulse on
      // the home screen and My Vitals.
      const [response, latestResponse] = await Promise.all([
        api.get('/health-data/summary'),
        api.get('/health/latest').catch(() => null),
      ]);
      const data = response.data;
      const latestVitals = latestResponse?.data || {};
      
      console.log('Fetched health summary:', data);

      const normaliseSleepHours = (value: unknown) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric < 0) return null;
        // Health integrations send duration in hours, seconds, or (rarely)
        // milliseconds. The home card always displays hours.
        const hours = numeric >= 86_400 ? numeric / 3_600_000 : numeric > 24 ? numeric / 3600 : numeric;
        return Math.round(hours * 10) / 10;
      };

      // Update health stats with real data from backend
      if (data.latest) {
        setHealthStats(prev => ({
          ...prev,
          steps:     latestVitals.steps ?? data.latest.steps?.value ?? prev.steps,
          heartRate: latestVitals.heartRate ?? data.latest.heart_rate?.value ?? prev.heartRate,
          sleep:     normaliseSleepHours(data.latest.sleep?.value) ?? prev.sleep,
          water:     data.latest.water?.value      ?? prev.water,
          calories:  data.latest.calories?.value   ?? prev.calories,
        }));
        setHealthStatsLoaded(true);
        setHealthStatsUpdatedAt(new Date());
      }
    } catch {
      // API not available — leave stats at zero so UI shows empty state, not fake numbers
    }
  };

  // All patient score surfaces use this daily composite endpoint. Keeping the
  // dashboard off its old sample score prevents it from disagreeing with the
  // health-intelligence and score pages for the same account/day.
  const fetchDailyHealthScore = async () => {
    try {
      const { data } = await api.get('/health-score/today');
      if (!data?.success || data?.score === null || data?.score === undefined) return;
      const score = Number(data.score);
      if (!Number.isFinite(score)) return;

      const domains = data.domains || {};
      const setDomain = (current: number, previous: number[]) => ({
        current,
        history: [...previous.slice(-6), current],
      });
      setHealthinessScore(previous => ({
        ...previous,
        score: Math.round(score),
        lastUpdated: new Date(data.computedAt || Date.now()),
        breakdown: {
          activity: setDomain(Number(domains.activity) || 0, previous.breakdown.activity.history),
          nutrition: setDomain(Number(domains.nutrition) || 0, previous.breakdown.nutrition.history),
          sleep: setDomain(Number(domains.sleep) || 0, previous.breakdown.sleep.history),
          vitals: setDomain(Number(domains.vitals) || 0, previous.breakdown.vitals.history),
        },
      }));
    } catch {
      // Keep the current rendered score if this optional refresh fails.
    }
  };

  const getSampleAppointments = () => [
    {
      id: 1,
      doctorName: "Dr. Sarah Johnson",
      specialty: "Cardiologist",
      date: new Date(Date.now() + 86400000 * 2).toISOString(),
      time: "10:30 AM",
      type: "Video Consultation",
    },
  ];

  // Health stat cards
  const healthMetrics = [
    {
      title: "Steps",
      value: healthStats.steps.toLocaleString(),
      goal: healthStats.stepsGoal.toLocaleString(),
      progress: (healthStats.steps / healthStats.stepsGoal) * 100,
      icon: Footprints,
      color: "text-primary",
      bgColor: "bg-primary/10",
      borderColor: "border-primary/20",
    },
    {
      title: "Heart Rate",
      value: `${healthStats.heartRate}`,
      unit: "bpm",
      icon: Heart,
      color: "text-destructive",
      bgColor: "bg-destructive/10",
      borderColor: "border-destructive/20",
      status: "Normal",
    },
    {
      title: "Sleep",
      value: healthStats.sleep.toString(),
      unit: "hours",
      icon: Moon,
      color: "text-info",
      bgColor: "bg-info/10",
      borderColor: "border-info/20",
    },
    {
      title: "Water",
      value: `${healthStats.water}/${healthStats.waterGoal}`,
      unit: "glasses",
      progress: (healthStats.water / healthStats.waterGoal) * 100,
      icon: Droplets,
      color: "text-info",
      bgColor: "bg-info/10",
      borderColor: "border-info/20",
    },
  ];

  // Feature sections
  const features = [
    {
      title: "Health Dashboard",
      description: "Monitor vital signs, connected devices, and personalized health insights",
      icon: HeartPulse,
      color: "primary-gradient",
      borderColor: "border-primary/20",
      iconColor: "text-primary",
      link: "/health-dashboard",
      highlights: ["Real-time vitals", "Device integration", "AI health insights"],
    },
    {
      title: "Claims Express",
      description: "File and track insurance claims with guided workflows",
      icon: Zap,
      color: "warning-gradient",
      borderColor: "border-warning/20",
      iconColor: "text-warning",
      link: "/claims-express",
      highlights: ["Quick filing", "Live status tracking", "Reduced rework"],
    },
    {
      title: "AI Report Scanner",
      description: "Scan reports and extract actionable insights instantly",
      icon: FileText,
      color: "secondary-gradient",
      borderColor: "border-secondary/20",
      iconColor: "text-secondary",
      link: "/report-scanner",
      highlights: ["Document OCR", "AI interpretation", "Share-ready outputs"],
    },
    {
      title: "Diet & Nutrition",
      description: "Personalized meal plans and nutrition tracking",
      icon: Apple,
      color: "success-gradient",
      borderColor: "border-success/20",
      iconColor: "text-success",
      link: "/diet",
      highlights: ["Meal planning", "Nutritional analysis", "Diet tracking"],
    },
    {
      title: "Health Risk Assessment",
      description: "Quick personalized health risk evaluation",
      icon: Shield,
      color: "warning-gradient",
      borderColor: "border-warning/20",
      iconColor: "text-warning",
      link: "/health-risk-assessment",
      highlights: ["5-minute assessment", "Risk scoring", "Personalized insights"],
    },
    {
      title: "Find Clinics",
      description: "Search 500+ clinics near you — Clove Dental, Apollo Clinic & more",
      icon: Building2,
      color: "primary-gradient",
      borderColor: "border-primary/20",
      iconColor: "text-primary",
      link: "/patient/network-clinics",
      highlights: ["Clove Dental", "Apollo Clinic", "Nearby clinics"],
    },
  ];

  const quickActions = [
    {
      title: "Emergency",
      icon: AlertCircle,
      color: "warning-gradient",
      border: "border-warning/20",
      iconColor: "text-warning",
      link: "/emergency",
      description: "24/7 Emergency Support",
      badge: "Call 112",
    },
    {
      title: "Book Appointment",
      icon: Calendar,
      color: "primary-gradient",
      border: "border-primary/20",
      iconColor: "text-primary",
      link: "/doctors",
      description: "Find & Book Doctors",
      badge: "Available 24/7",
    },
    {
      title: "Claims Express",
      icon: Zap,
      color: "warning-gradient",
      border: "border-warning/20",
      iconColor: "text-warning",
      link: "/claims-express",
      description: "File & Track Claims",
      badge: "Fast Filing",
    },
    {
      title: "Scan Report",
      icon: FileText,
      color: "info-gradient",
      border: "border-info/20",
      iconColor: "text-info",
      link: "/report-scanner",
      description: "AI Report Analysis",
      badge: "Smart OCR",
    },
  ];

  const essentials = [
    {
      title: "Health Risk Assessment",
      description: "Personalized risk score in minutes",
      icon: ShieldCheck,
      link: "/health-risk-assessment",
      badge: "HRA",
    },
    {
      title: "Health Diary",
      description: "Log daily symptoms and notes",
      icon: FileText,
      link: "/health-diary",
      badge: "Daily",
    },
    {
      title: "My Programs",
      description: "Health coaching & disease management",
      icon: Target,
      link: "/my-programs",
      badge: "Coaching",
    },
    {
      title: "Membership Plans",
      description: "Upgrade for premium benefits",
      icon: Crown,
      link: "/my-plans",
      badge: "Plans",
    },
    {
      title: "Wallet & Rewards",
      description: "View balance and rewards",
      icon: Wallet,
      link: "/wallet",
      badge: "Rewards",
    },
  ];

  // Platform Detection
  const getPlatformInfo = () => {
    const ua = navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(ua);
    const isAndroid = /android/.test(ua);
    const isMobile = isIOS || isAndroid;
    const isChrome = /chrome/.test(ua) && !/edge/.test(ua);
    const isSafari = /safari/.test(ua) && !/chrome/.test(ua);
    const isFirefox = /firefox/.test(ua);
    const hasWebBluetooth = 'bluetooth' in navigator;
    const isCapacitor = !!(window as any).Capacitor;
    const isPWA = window.matchMedia('(display-mode: standalone)').matches;
    
    return { isIOS, isAndroid, isMobile, isChrome, isSafari, isFirefox, hasWebBluetooth, isCapacitor, isPWA };
  };

  // Bluetooth Pairing Functions - Cross-Platform Support
  const startBluetoothScan = async () => {
    setShowPairingModal(true);
    setDiscoveredDevices([]);
    setSelectedDevice(null);
    setPairingProgress(0);

    const platform = getPlatformInfo();
    console.log('Platform info:', platform);

    // Check for Capacitor (native app)
    if (platform.isCapacitor) {
      try {
        // Use Capacitor Bluetooth plugin if available
        // @ts-expect-error - Dynamic import for optional Capacitor plugin
        const BleClient = (window as any).CapacitorBluetooth?.BleClient;
        
        if (BleClient) {
          setPairingStep('scanning');
          await BleClient.initialize();
          
          // Request permissions on Android
          if (platform.isAndroid) {
            await BleClient.requestLEScan({ services: [] }, (result: any) => {
              const deviceName = result.device.name || result.localName || 'Unknown Device';
              const existingDevice = discoveredDevices.find(d => d.id === result.device.deviceId);
              
              if (!existingDevice && deviceName !== 'Unknown Device') {
                let deviceType = 'fitness_band';
                let deviceIcon = '📱';
                
                const nameLower = deviceName.toLowerCase();
                if (nameLower.includes('watch')) { deviceType = 'smartwatch'; deviceIcon = '⌚'; }
                else if (nameLower.includes('ring') || nameLower.includes('oura')) { deviceType = 'smart_ring'; deviceIcon = '💍'; }
                else if (nameLower.includes('scale')) { deviceType = 'weight_scale'; deviceIcon = '⚖️'; }
                else if (nameLower.includes('band')) { deviceType = 'fitness_band'; deviceIcon = '📱'; }

                setDiscoveredDevices(prev => [...prev, {
                  id: result.device.deviceId,
                  name: deviceName,
                  type: deviceType,
                  icon: deviceIcon,
                  signal: result.rssi ? Math.min(100, Math.max(0, 100 + result.rssi)) : 75,
                  device: result.device
                }]);
              }
            });
            
            // Stop scan after 10 seconds
            setTimeout(async () => {
              await BleClient.stopLEScan();
              setPairingStep('found');
            }, 10000);
            return;
          }
        }
      } catch (error) {
        console.log('Capacitor BLE not available, falling back');
      }
    }

    // iOS Safari - No Web Bluetooth support, show manual options
    if (platform.isIOS && platform.isSafari) {
      setPairingStep('found');
      setDiscoveredDevices([
        { id: 'ios-health', name: 'Connect via Apple Health', type: 'integration', icon: '❤️', signal: 100, device: null },
        { id: 'manual-add', name: 'Add Device Manually', type: 'manual', icon: '➕', signal: 100, device: null },
      ]);
      return;
    }

    // Firefox - No Web Bluetooth support
    if (platform.isFirefox) {
      setPairingStep('found');
      setDiscoveredDevices([
        { id: 'manual-add', name: 'Add Device Manually', type: 'manual', icon: '➕', signal: 100, device: null },
      ]);
      return;
    }

    // Web Bluetooth (Chrome, Edge, Android Chrome)
    // Note: Web Bluetooth opens a browser-native device picker, not a background scan
    if (platform.hasWebBluetooth) {
      // Show instructions while browser picker opens
      setPairingStep('scanning');
      
      try {
        // --- Reconnect already-permitted device silently (no picker) ---
        // getDevices() returns devices the user already granted access to in a previous session.
        // If we find a known device, connect to it directly without showing the picker again.
        const storedDevices: any[] = JSON.parse(localStorage.getItem('connectedDevices') || '[]');
        if ('getDevices' in navigator.bluetooth && storedDevices.length > 0) {
          try {
            const permittedDevices = await (navigator.bluetooth as any).getDevices();
            const knownPermitted = permittedDevices.find((d: BluetoothDevice) =>
              storedDevices.some((s: any) => s.id === d.id || s.name === d.name)
            );
            if (knownPermitted) {
              console.log('[BLE] Reconnecting to already-permitted device:', knownPermitted.name);
              // Inject the remembered device directly into the pairing flow
              const deviceName = knownPermitted.name || 'Paired Device';
              setDiscoveredDevices([{
                id: knownPermitted.id,
                name: deviceName,
                type: 'smartwatch',
                icon: '⌚',
                signal: 80,
                device: knownPermitted,
                alreadyPaired: true,
              }]);
              setPairingStep('found');
              return;
            }
          } catch (e) {
            // getDevices() not supported or no permissions yet — fall through to picker
            console.log('[BLE] getDevices() not available, showing picker');
          }
        }

        // This will open the browser's native Bluetooth device picker
        // Use standard GATT service UUIDs - short form (16-bit) UUIDs work better
        // Also include Veepoo/HBand service UUIDs for VE30 and similar devices
        const device = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: [
            // Veepoo/HBand Service UUIDs (for VE30, etc.)
            VEEPOO_SERVICE_UUID,
            // Fire-Boltt / Jieli chip UUIDs
            FIREBOLTT_SERVICE_UUID,
            // Standard 16-bit GATT Service UUIDs
            0x180D, // Heart Rate
            0x180F, // Battery Service
            0x180A, // Device Information
            0x1809, // Health Thermometer
            0x1810, // Blood Pressure
            0x1808, // Glucose
            0x181D, // Weight Scale
            0x181B, // Body Composition
            0x181C, // User Data
            0x1826, // Fitness Machine
            0x1814, // Running Speed and Cadence
            0x1816, // Cycling Speed and Cadence
            0x1800, // Generic Access
            0x1801, // Generic Attribute
          ]
        });

        if (device) {
          const deviceName = device.name || 'Unknown Device';
          let deviceType = 'smartwatch'; // Default to smartwatch for unknown BLE devices
          let deviceIcon = '⌚';
          
          const nameLower = deviceName.toLowerCase();
          
          // Smartwatch patterns - most BLE health devices are smartwatches
          const smartwatchPatterns = ['watch', 'galaxy', 'apple', 've30', 've20', 've40', 'gt', 'gts', 'gtr', 'amazfit', 'huawei', 'honor', 'realme', 'noise', 'boat', 'fire-boltt', 'fireboltt', 'boAt', 'dizo'];
          const ringPatterns = ['ring', 'oura', 'circular', 'motiv'];
          const scalePatterns = ['scale', 'weight', 'body', 'renpho', 'eufy', 'withings'];
          const bpPatterns = ['bp', 'pressure', 'omron', 'sphygmo'];
          const bandPatterns = ['band', 'mi band', 'fitbit', 'charge', 'inspire'];
          const glucosePatterns = ['glucose', 'sugar', 'cgm', 'dexcom', 'libre'];
          
          if (ringPatterns.some(p => nameLower.includes(p))) {
            deviceType = 'smart_ring';
            deviceIcon = '💍';
          } else if (scalePatterns.some(p => nameLower.includes(p))) {
            deviceType = 'weight_scale';
            deviceIcon = '⚖️';
          } else if (bpPatterns.some(p => nameLower.includes(p))) {
            deviceType = 'bp_monitor';
            deviceIcon = '🩺';
          } else if (glucosePatterns.some(p => nameLower.includes(p))) {
            deviceType = 'glucose_meter';
            deviceIcon = '🩸';
          } else if (bandPatterns.some(p => nameLower.includes(p))) {
            deviceType = 'fitness_band';
            deviceIcon = '📱';
          } else if (smartwatchPatterns.some(p => nameLower.includes(p))) {
            deviceType = 'smartwatch';
            deviceIcon = '⌚';
          }
          // Default is already smartwatch for unknown health devices

          // Filter out already connected devices
          const storedDevices = JSON.parse(localStorage.getItem('connectedDevices') || '[]');
          const isAlreadyConnected = storedDevices.some((d: any) => d.id === device.id || d.name === deviceName);
          
          if (isAlreadyConnected) {
            setPairingStep('found');
            setDiscoveredDevices([]);
            return;
          }
          
          setDiscoveredDevices([{
            id: device.id,
            name: deviceName,
            type: deviceType,
            icon: deviceIcon,
            signal: 85,
            device: device
          }]);
          setPairingStep('found');
        }
      } catch (error: any) {
        console.log('Bluetooth scan error:', error);
        if (error.name === 'NotFoundError' || error.name === 'NotAllowedError') {
          // User cancelled or no device selected
          setPairingStep('found');
          setDiscoveredDevices([]);
        } else {
          setPairingStep('error');
        }
      }
    } else {
      // Fallback for unsupported browsers
      setPairingStep('found');
      setDiscoveredDevices([
        { id: 'manual-add', name: 'Add Device Manually', type: 'manual', icon: '➕', signal: 100, device: null },
      ]);
    }
  };

  const pairDevice = async (deviceId: string) => {
    const selectedDeviceData = discoveredDevices.find(d => d.id === deviceId);
    if (!selectedDeviceData) return;

    // Handle special integration options
    if (deviceId === 'ios-health') {
      // Redirect to Apple Health integration page
      window.location.href = '/patient/devices?connect=apple-health';
      return;
    }
    
    if (deviceId === 'manual-add') {
      // Redirect to device management page for manual entry
      window.location.href = '/patient/devices?action=add-manual';
      return;
    }

    setSelectedDevice(deviceId);
    setPairingStep('pairing');
    setPairingProgress(0);

    const platform = getPlatformInfo();

    try {
      const device = selectedDeviceData.device;
      
      // Capacitor native pairing
      if (platform.isCapacitor && device?.deviceId) {
        try {
          // @ts-expect-error - Dynamic access for optional Capacitor plugin
          const BleClient = (window as any).CapacitorBluetooth?.BleClient;
          
          if (BleClient) {
            setPairingProgress(20);
            await BleClient.connect(device.deviceId);
            setPairingProgress(50);
            
            // Discover services
            const services = await BleClient.getServices(device.deviceId);
            setPairingProgress(70);
            
            // Try to read heart rate
            for (const service of services) {
              if (service.uuid.includes('180d')) {
                for (const char of service.characteristics) {
                  if (char.uuid.includes('2a37')) {
                    await BleClient.startNotifications(device.deviceId, service.uuid, char.uuid, (value: any) => {
                      const heartRate = new DataView(value.buffer).getUint8(1);
                      console.log('Heart rate:', heartRate);
                    });
                  }
                }
              }
            }
            
            setPairingProgress(100);
            saveConnectedDevice(selectedDeviceData);
            setPairingStep('success');
            return;
          }
        } catch (error) {
          console.error('Capacitor pairing error:', error);
        }
      }
      
      // Web Bluetooth pairing
      if (device && device.gatt) {
        setPairingProgress(20);
        
        const server = await device.gatt.connect();
        setPairingProgress(40);

        // Detect available services to determine data types
        const detectedDataTypes: string[] = [];
        let batteryLevel = 75;
        let isVeepooDevice = false;
        let isFireBolttDevice = false;

        try {
          const services = await server.getPrimaryServices();
          setPairingProgress(50);

          // Pre-scan all service UUIDs before processing — ensures device-type
          // flags are correct regardless of the order the BT stack returns services.
          // (VE35PRO exposes both ae00 and fee7; ae00 must win over fee7.)
          const serviceUUIDs = services.map(s => s.uuid.toLowerCase());
          isVeepooDevice = serviceUUIDs.some(u => u.includes('ae00') || u === VEEPOO_SERVICE_UUID.toLowerCase());
          const mightBeFireBoltt = serviceUUIDs.some(u => u === FIREBOLTT_SERVICE_UUID.toLowerCase() || u.includes('fee7'));
          // Only treat as Fire-Boltt when ae00 is NOT present
          isFireBolttDevice = mightBeFireBoltt && !isVeepooDevice;

          if (isVeepooDevice) console.log('Veepoo device detected!');
          if (isFireBolttDevice) console.log('Fire-Boltt (Jieli) device detected!');

          for (const service of services) {
            const serviceUUID = service.uuid.toLowerCase();
            
            // Veepoo/HBand service — connect proprietary channel
            if (isVeepooDevice && (serviceUUID.includes('ae00') || serviceUUID === VEEPOO_SERVICE_UUID.toLowerCase())) {
              // Veepoo devices support all these features via proprietary protocol
              detectedDataTypes.push('Heart Rate');
              detectedDataTypes.push('Blood Pressure');
              detectedDataTypes.push('Blood Oxygen');
              detectedDataTypes.push('Steps');
              detectedDataTypes.push('Calories');
              detectedDataTypes.push('Sleep');
              detectedDataTypes.push('HRV');

              // Attach the VeepooService singleton to the existing GATT server so
              // healthSyncScheduler can call startHeartRateMeasurement() immediately.
              try {
                const ok = await veepooService.connectWithServer(device, server);
                if (ok) {
                  console.log('Veepoo characteristics found - device supports direct data sync');
                  detectedDataTypes.push('Temperature');
                  // Sync phone time to watch so timestamps are correct
                  veepooService.syncTime().catch(e => console.warn('Veepoo syncTime failed:', e));
                }
              } catch (e) {
                console.log('Veepoo characteristics not fully accessible');
              }
            }

            // Fire-Boltt / Jieli chip service — connect write-trigger channel
            if (isFireBolttDevice && (serviceUUID === FIREBOLTT_SERVICE_UUID.toLowerCase() || serviceUUID.includes('fee7'))) {
              detectedDataTypes.push('Heart Rate');
              detectedDataTypes.push('Blood Oxygen');
              detectedDataTypes.push('Steps');
              detectedDataTypes.push('Calories');

              // Connect the Fire-Boltt service so it can accept write-trigger commands
              try {
                const connected = await fireBolttService.connect(server);
                if (connected) {
                  console.log('Fire-Boltt service ready - will use write-trigger protocol for data sync');
                  // Sync phone time to watch so timestamps are correct
                  fireBolttService.syncTime().catch(e => console.warn('FireBoltt syncTime failed:', e));
                }
              } catch (e) {
                console.log('Fire-Boltt service connection failed:', e);
              }
            }
            
            // Map standard service UUIDs to data types
            if (serviceUUID.includes('180d') || serviceUUID.includes('heart_rate')) {
              detectedDataTypes.push('Heart Rate');
              detectedDataTypes.push('HRV');
            }
            if (serviceUUID.includes('1810') || serviceUUID.includes('blood_pressure')) {
              detectedDataTypes.push('Blood Pressure');
            }
            if (serviceUUID.includes('1808') || serviceUUID.includes('glucose')) {
              detectedDataTypes.push('Blood Glucose');
            }
            if (serviceUUID.includes('1809') || serviceUUID.includes('health_thermometer')) {
              detectedDataTypes.push('Temperature');
            }
            if (serviceUUID.includes('181d') || serviceUUID.includes('weight_scale')) {
              detectedDataTypes.push('Weight');
            }
            if (serviceUUID.includes('181b') || serviceUUID.includes('body_composition')) {
              detectedDataTypes.push('Body Fat');
            }
            if (serviceUUID.includes('1826') || serviceUUID.includes('fitness_machine')) {
              detectedDataTypes.push('Steps');
              detectedDataTypes.push('Calories');
              detectedDataTypes.push('Distance');
            }
            if (serviceUUID.includes('1814')) {
              detectedDataTypes.push('Running');
            }
            if (serviceUUID.includes('1816')) {
              detectedDataTypes.push('Cycling');
            }
          }
          console.log('Detected services:', services.map(s => s.uuid));
        } catch (e) {
          console.log('Could not enumerate services:', e);
        }

        setPairingProgress(60);

        try {
          const deviceInfoService = await server.getPrimaryService('device_information');
          
          try {
            const manufacturerChar = await deviceInfoService.getCharacteristic('manufacturer_name_string');
            const manufacturerValue = await manufacturerChar.readValue();
            const manufacturer = new TextDecoder().decode(manufacturerValue);
            console.log('Device manufacturer:', manufacturer);
          } catch (e) {
            console.log('Could not read manufacturer');
          }
        } catch (e) {
          console.log('Device info service not available');
        }

        setPairingProgress(70);

        try {
          const heartRateService = await server.getPrimaryService('heart_rate');
          const heartRateChar = await heartRateService.getCharacteristic('heart_rate_measurement');
          
          await heartRateChar.startNotifications();
          heartRateChar.addEventListener('characteristicvaluechanged', (event: any) => {
            const value = event.target.value;
            const heartRate = value.getUint8(1);
            console.log('Heart rate:', heartRate);
          });
          if (!detectedDataTypes.includes('Heart Rate')) {
            detectedDataTypes.push('Heart Rate');
          }
        } catch (e) {
          console.log('Heart rate service not available');
        }

        setPairingProgress(85);

        try {
          const batteryService = await server.getPrimaryService('battery_service');
          const batteryChar = await batteryService.getCharacteristic('battery_level');
          const batteryValue = await batteryChar.readValue();
          batteryLevel = batteryValue.getUint8(0);
          console.log('Battery level:', batteryLevel + '%');
        } catch (e) {
          console.log('Battery service not available');
        }

        setPairingProgress(100);
        
        // Only show actually detected services - no defaults
        const finalDataTypes = [...new Set(detectedDataTypes)];
        
        // If it's a Veepoo device but we couldn't detect services, still mark capabilities
        if (isVeepooDevice && finalDataTypes.length === 0) {
          finalDataTypes.push('Heart Rate', 'Blood Pressure', 'Steps', 'Sleep');
          console.log('Veepoo device - using known capabilities');
        } else if (isFireBolttDevice && finalDataTypes.length === 0) {
          finalDataTypes.push('Heart Rate', 'Blood Oxygen', 'Steps', 'Calories');
          console.log('Fire-Boltt device - using known capabilities');
        } else if (finalDataTypes.length === 0) {
          console.log('No GATT services detected. Device may require companion app for data sync.');
        }

        saveConnectedDevice({
          ...selectedDeviceData,
          battery: batteryLevel,
          isVeepooDevice,
          isFireBolttDevice,
          dataTypes: finalDataTypes
        });
        setPairingStep('success');
      } else {
        // Fallback progress animation
        const interval = setInterval(() => {
          setPairingProgress(prev => {
            if (prev >= 100) {
              clearInterval(interval);
              saveConnectedDevice(selectedDeviceData);
              setPairingStep('success');
              return 100;
            }
            return prev + 20;
          });
        }, 400);
      }
    } catch (error) {
      console.error('Pairing error:', error);
      setPairingStep('error');
    }
  };

  const saveConnectedDevice = async (deviceData: any) => {
    const connectedDevices = JSON.parse(localStorage.getItem('connectedDevices') || '[]');
    
    const newDevice = {
      id: deviceData.id,
      name: deviceData.name,
      type: deviceData.type || 'smartwatch',
      brand: deviceData.brand || getBrandFromName(deviceData.name),
      model: deviceData.model || getModelFromName(deviceData.name),
      status: 'connected',
      icon: deviceData.icon,
      battery: deviceData.battery || null,
      dataTypes: deviceData.dataTypes || [], // Only show detected services
      isVeepooDevice: deviceData.isVeepooDevice || false,
      isFireBolttDevice: deviceData.isFireBolttDevice || false,
      connectedAt: new Date().toISOString(),
      lastSync: new Date().toISOString(),
    };
    
    const filtered = connectedDevices.filter((d: any) => d.id !== deviceData.id);
    filtered.push(newDevice);
    localStorage.setItem('connectedDevices', JSON.stringify(filtered));
    // Update state to reflect the new device
    setConnectedDevices(filtered);

    // Save device to backend
    try {
      const token = localStorage.getItem('token');
      if (token) {
        const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

        // Primary registration via /wearables
        await api.post('/wearables', {
          deviceId: newDevice.id,
          name: newDevice.name,
          type: newDevice.type,
          brand: newDevice.brand,
          model: newDevice.model,
          status: 'active',
          batteryLevel: newDevice.battery,
          lastSync: new Date().toISOString()
        }, authHeaders);

        // Belt-and-suspenders: also register in user_devices via /health-data/devices/register
        // This ensures validateDeviceOwnership() in ble-sync will pass
        try {
          await api.post('/health-data/devices/register', {
            deviceId: newDevice.id,
            deviceName: newDevice.name,
            deviceType: newDevice.type
          }, authHeaders);
        } catch (regErr) {
          console.warn('Secondary device registration warning (non-fatal):', regErr);
        }

        console.log('✅ Device saved to backend:', newDevice.name);

        // Upload any buffered readings from the previous session.
        // Do NOT call triggerDeviceMeasurements() here — running the full
        // measurement sequence immediately after pairing stresses the GATT
        // connection and causes it to drop before the user can interact.
        // Measurements will start on the scheduler's 30-minute interval.
        if (window.healthSyncScheduler) {
          setTimeout(async () => {
            await window.healthSyncScheduler.performSync();
          }, 2000);
        }
      }
    } catch (error) {
      console.warn('Failed to save device to backend (will retry on next sync):', error);
    }
  };

  // Helper function to extract brand from device name
  const getBrandFromName = (name: string): string => {
    const brands = ['Apple', 'Samsung', 'Fitbit', 'Garmin', 'Mi', 'Xiaomi', 'Oura', 'Withings', 'Omron', 'Honor'];
    for (const brand of brands) {
      if (name.toLowerCase().includes(brand.toLowerCase())) {
        return brand;
      }
    }
    return 'Generic';
  };

  // Helper function to extract model from device name
  const getModelFromName = (name: string): string => {
    // Return the full name if no specific model found
    return name.replace(/^(Apple|Samsung|Fitbit|Garmin|Mi|Xiaomi|Oura|Withings|Omron|Honor)\s*/i, '') || name;
  };

  const closePairingModal = () => {
    setShowPairingModal(false);
    setPairingStep('scanning');
    setDiscoveredDevices([]);
    setSelectedDevice(null);
    setPairingProgress(0);
  };

  return (
      <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500 px-4 md:px-6">
        {/* Welcome Section */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 p-6 md:p-8 text-white shadow-2xl">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNiIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiLz48L2c+PC9zdmc+')] opacity-30" />
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-teal-500/20 to-transparent rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-teal-400/10 to-transparent rounded-full blur-2xl" />
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 shadow-lg shadow-teal-500/30">
                  <HeartPulse className="w-6 h-6" />
                </div>
                <Badge className="bg-white/10 text-white/90 border-white/20 font-medium">
                  {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                </Badge>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold mb-2">
                Welcome back, {userName}!
              </h1>
              <p className="text-slate-300 text-sm md:text-base">
                Your health journey continues. Let's make today count.
              </p>
            </div>
            <div className="flex gap-3">
              <Link to="/profile">
                <Button variant="outline" className="bg-white/10 hover:bg-white/20 text-white border-white/20 hover:border-white/30">
                  <User className="w-4 h-4 mr-2" />
                  Profile
                </Button>
              </Link>
              <Link to="/health-tracker">
                <Button className="bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white shadow-lg shadow-teal-500/30 border-0">
                  <Activity className="w-4 h-4 mr-2" />
                  Track Health
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {showOnboarding ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2 bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-700/50">
                <div>
                  <CardTitle className="text-lg font-semibold text-slate-800 dark:text-white">
                    Getting Started
                  </CardTitle>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Quick setup for a personalized experience.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {completedCount}/{onboardingSteps.length} done
                  </Badge>
                  <Button variant="ghost" size="sm" onClick={dismissOnboarding} className="text-slate-500">
                    Dismiss
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                {onboardingSteps.map((step) => (
                  <div
                    key={step.id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/50"
                  >
                    <div className={`p-1.5 rounded-lg ${step.done ? 'bg-teal-50 dark:bg-teal-900/30' : 'bg-slate-100 dark:bg-slate-700'}`}>
                      {step.done ? (
                        <CheckCircle2 className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-slate-500 dark:text-slate-300" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-white">{step.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{step.description}</p>
                    </div>
                    {step.done ? (
                      <Badge variant="outline" className="text-[10px] text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-700">
                        Done
                      </Badge>
                    ) : (
                      <Link to={step.link}>
                        <Button size="sm" variant="outline" className="text-xs">
                          {step.cta}
                        </Button>
                      </Link>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-700/50">
                <CardTitle className="text-lg font-semibold text-slate-800 dark:text-white">
                  Next Best Action
                </CardTitle>
                <Badge variant="outline" className="text-[10px]">Recommended</Badge>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  <div className="p-3 rounded-xl bg-teal-50 dark:bg-teal-900/30">
                    <NextBestIcon className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-slate-800 dark:text-white">{nextBestAction.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{nextBestAction.description}</p>
                    <Link to={nextBestAction.link}>
                      <Button size="sm" className="bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white shadow-sm">
                        {nextBestAction.cta}
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-700/50">
              <CardTitle className="text-lg font-semibold text-slate-800 dark:text-white">
                Next Best Action
              </CardTitle>
              <Badge variant="outline" className="text-[10px]">Recommended</Badge>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <div className="p-3 rounded-xl bg-teal-50 dark:bg-teal-900/30">
                  <NextBestIcon className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-800 dark:text-white">{nextBestAction.title}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{nextBestAction.description}</p>
                  <Link to={nextBestAction.link}>
                    <Button size="sm" className="bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white shadow-sm">
                      {nextBestAction.cta}
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Health Stats Row */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Today's Health</p>
            <div className="flex items-center gap-2">
              {healthStatsUpdatedAt && (
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  Updated {Math.round((Date.now() - healthStatsUpdatedAt.getTime()) / 60000) < 1
                    ? 'just now'
                    : `${Math.round((Date.now() - healthStatsUpdatedAt.getTime()) / 60000)}m ago`}
                </span>
              )}
              <button
                onClick={fetchHealthStats}
                aria-label="Refresh health stats"
                className="text-slate-400 hover:text-teal-500 dark:hover:text-teal-400 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          {!healthStatsLoaded ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-6 text-center">
              <Activity className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No health data yet</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 mb-3">Connect a wearable or log your vitals to see your daily stats here.</p>
              <a href="/patient/device-integration" className="text-xs text-teal-600 dark:text-teal-400 font-semibold underline underline-offset-2">Connect a device →</a>
            </div>
          ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {healthMetrics.map((metric, index) => (
            <Card key={index} className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 hover:border-teal-200 dark:hover:border-teal-500/50 hover:shadow-lg hover:shadow-teal-500/5 transition-all duration-300 overflow-hidden group">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 rounded-xl bg-gradient-to-br from-slate-100 to-slate-50 dark:from-slate-700 dark:to-slate-800 group-hover:from-teal-50 group-hover:to-teal-100/50 dark:group-hover:from-teal-900/30 dark:group-hover:to-teal-800/20 transition-colors">
                    <metric.icon className="w-5 h-5 text-slate-600 dark:text-slate-400 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors" />
                  </div>
                  {metric.status && (
                    <Badge variant="outline" className="text-xs bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-700">
                      {metric.status}
                    </Badge>
                  )}
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">{metric.title}</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl font-bold text-slate-800 dark:text-white">{metric.value}</span>
                    {metric.unit && <span className="text-xs text-slate-500 dark:text-slate-400">{metric.unit}</span>}
                  </div>
                  {metric.goal && (
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Goal: {metric.goal}</p>
                  )}
                  {metric.progress !== undefined && (
                    <div className="h-1.5 mt-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-teal-500 to-teal-400 rounded-full transition-all duration-500" 
                        style={{ width: `${Math.min(metric.progress, 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          </div>
          )}
        </div>

        {/* Health Tip of the Day + Streak Widget */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Health Tip of the Day */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="lg:col-span-2"
          >
            <Card className="bg-gradient-to-r from-teal-50 via-emerald-50 to-cyan-50 dark:from-teal-950/30 dark:via-emerald-950/30 dark:to-cyan-950/30 border-teal-200/60 dark:border-teal-800/40 overflow-hidden relative">
              <div className="absolute right-0 top-0 w-32 h-32 bg-gradient-to-bl from-teal-200/30 dark:from-teal-500/10 to-transparent rounded-full blur-2xl" />
              <CardContent className="p-5 relative">
                <div className="flex items-start gap-4">
                  <div className="text-4xl shrink-0">{todayTip.emoji}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                      <h3 className="text-sm font-semibold text-teal-800 dark:text-teal-300">Health Tip of the Day</h3>
                      <Badge className="text-[10px] bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-400 border-0">
                        {todayTip.category}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                      {todayTip.tip}
                    </p>
                    <div className="flex mt-3 gap-2">
                      <Link to="/ai-doctor">
                        <Button size="sm" variant="outline" className="text-xs border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-400 hover:bg-teal-100 dark:hover:bg-teal-900/30 h-7">
                          <Bot className="w-3 h-3 mr-1.5" />
                          Ask Dr. iSHA more
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Streak / Gamification Widget */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
          >
            <Link to="/wallet" className="block h-full">
              <Card className="h-full bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 dark:from-amber-950/30 dark:via-orange-950/20 dark:to-yellow-950/20 border-amber-200/60 dark:border-amber-800/40 hover:shadow-lg hover:shadow-amber-500/10 transition-all hover:-translate-y-0.5 overflow-hidden relative group">
                <div className="absolute right-0 bottom-0 w-24 h-24 bg-gradient-to-tl from-amber-200/40 dark:from-amber-500/10 to-transparent rounded-full blur-xl" />
                <CardContent className="p-5 relative flex flex-col justify-between h-full">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">🔥</span>
                        <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">Streak</h3>
                      </div>
                      <Badge className="text-[10px] bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 border-0">
                        Lv. {streakData.level}
                      </Badge>
                    </div>
                    <div className="flex items-baseline gap-1 mb-1">
                      <span className="text-3xl font-bold text-amber-700 dark:text-amber-300">{streakData.currentStreak}</span>
                      <span className="text-sm text-amber-600/70 dark:text-amber-400/70">days</span>
                    </div>
                    <p className="text-xs text-amber-600/80 dark:text-amber-400/60">
                      Best: {streakData.longestStreak} days
                    </p>
                  </div>
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-amber-700 dark:text-amber-400 mb-1">
                      <span className="flex items-center gap-1">🪙 {streakData.healthCoins} HC</span>
                      <span>{streakData.xp}/{streakData.nextLevelXp} XP</span>
                    </div>
                    <div className="h-1.5 bg-amber-200/50 dark:bg-amber-900/30 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber-400 to-orange-400 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min((streakData.xp / streakData.nextLevelXp) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </motion.div>
        </div>

        {/* Healthiness Score Card */}
        <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 overflow-hidden">
          <CardContent className="p-6">
            <div className="flex flex-col lg:flex-row lg:items-center gap-6">
              {/* Score Circle */}
              <div className="flex flex-col items-center">
                <div className="relative w-32 h-32">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                    <circle
                      cx="50" cy="50" r="42"
                      className="fill-none stroke-slate-200 dark:stroke-slate-700"
                      strokeWidth="8"
                    />
                    <circle
                      cx="50" cy="50" r="42"
                      className={`fill-none transition-all duration-1000 ${
                        healthinessScore.score >= 80 ? 'stroke-teal-500' :
                        healthinessScore.score >= 60 ? 'stroke-yellow-500' :
                        healthinessScore.score >= 40 ? 'stroke-orange-500' : 'stroke-red-500'
                      }`}
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={`${healthinessScore.score * 2.64} 264`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`text-3xl font-bold ${
                      healthinessScore.score >= 80 ? 'text-teal-600 dark:text-teal-400' :
                      healthinessScore.score >= 60 ? 'text-yellow-600 dark:text-yellow-400' :
                      healthinessScore.score >= 40 ? 'text-orange-600 dark:text-orange-400' : 'text-red-600 dark:text-red-400'
                    }`}>{healthinessScore.score}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">out of 100</span>
                  </div>
                </div>
                <Badge className={`mt-2 ${
                  healthinessScore.score >= 80 ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400' :
                  healthinessScore.score >= 60 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                  healthinessScore.score >= 40 ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' :
                  'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                }`}>
                  {healthinessScore.score >= 80 ? '🌟 Excellent' :
                   healthinessScore.score >= 60 ? '👍 Good' :
                   healthinessScore.score >= 40 ? '⚠️ Moderate Risk' : '🚨 High Risk'}
                </Badge>
              </div>
              
              {/* Score Details */}
              <div className="flex-1">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-teal-500" />
                      Your Healthiness Score
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Based on your activity, nutrition, sleep & vitals
                    </p>
                  </div>
                  <Link to="/health-risk-assessment">
                    <Button size="sm" variant="outline" className="border-teal-500/30 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20">
                      <TrendingUp className="w-4 h-4 mr-2" />
                      View Details
                    </Button>
                  </Link>
                </div>
                
                {/* Score Breakdown with Sparkline Wave Graphs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Activity', data: healthinessScore.breakdown.activity, icon: Footprints },
                    { label: 'Nutrition', data: healthinessScore.breakdown.nutrition, icon: Apple },
                    { label: 'Sleep', data: healthinessScore.breakdown.sleep, icon: Moon },
                    { label: 'Vitals', data: healthinessScore.breakdown.vitals, icon: Heart },
                  ].map((item, idx) => {
                    const value = item.data.current;
                    const history = item.data.history;
                    const maxVal = Math.max(...history);
                    const minVal = Math.min(...history);
                    const range = maxVal - minVal || 1;
                    const trend = history[history.length - 1] - history[0];
                    const strokeColor = value >= 80 ? '#14b8a6' : value >= 60 ? '#eab308' : value >= 40 ? '#f97316' : '#ef4444';
                    const fillColor = value >= 80 ? '#14b8a640' : value >= 60 ? '#eab30840' : value >= 40 ? '#f9731640' : '#ef444440';
                    
                    // Generate SVG path for smooth wave/curve graph using cubic bezier
                    const width = 100;
                    const height = 32;
                    const padding = 2;
                    
                    // Calculate points
                    const pointsData = history.map((val, i) => ({
                      x: padding + (i / (history.length - 1)) * (width - padding * 2),
                      y: height - padding - ((val - minVal) / range) * (height - padding * 2)
                    }));
                    
                    // Generate smooth cubic bezier curve path
                    const generateSmoothPath = (points: {x: number, y: number}[]) => {
                      if (points.length < 2) return '';
                      
                      let path = `M ${points[0].x},${points[0].y}`;
                      
                      for (let i = 0; i < points.length - 1; i++) {
                        const p0 = points[i === 0 ? i : i - 1];
                        const p1 = points[i];
                        const p2 = points[i + 1];
                        const p3 = points[i + 2 < points.length ? i + 2 : i + 1];
                        
                        // Calculate control points for smooth curve
                        const tension = 0.3;
                        const cp1x = p1.x + (p2.x - p0.x) * tension;
                        const cp1y = p1.y + (p2.y - p0.y) * tension;
                        const cp2x = p2.x - (p3.x - p1.x) * tension;
                        const cp2y = p2.y - (p3.y - p1.y) * tension;
                        
                        path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
                      }
                      
                      return path;
                    };
                    
                    const wavePath = generateSmoothPath(pointsData);
                    const lastPoint = pointsData[pointsData.length - 1];
                    const firstPoint = pointsData[0];
                    const areaPath = `${wavePath} L ${lastPoint.x},${height - padding} L ${firstPoint.x},${height - padding} Z`;
                    
                    return (
                      <div key={idx} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer group">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <item.icon className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{item.label}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className={`text-sm font-bold ${
                              value >= 80 ? 'text-teal-600 dark:text-teal-400' :
                              value >= 60 ? 'text-yellow-600 dark:text-yellow-400' :
                              value >= 40 ? 'text-orange-600 dark:text-orange-400' : 'text-red-600 dark:text-red-400'
                            }`}>{value}</span>
                            {trend > 0 ? (
                              <TrendingUp className="w-3 h-3 text-teal-500" />
                            ) : trend < 0 ? (
                              <TrendingUp className="w-3 h-3 text-red-500 rotate-180" />
                            ) : null}
                          </div>
                        </div>
                        
                        {/* Sparkline Wave Graph */}
                        <div className="h-10 mt-2">
                          <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
                            {/* Gradient definition */}
                            <defs>
                              <linearGradient id={`waveGradient-${idx}`} x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor={strokeColor} stopOpacity="0.4" />
                                <stop offset="100%" stopColor={strokeColor} stopOpacity="0.05" />
                              </linearGradient>
                            </defs>
                            {/* Area fill with gradient */}
                            <path
                              d={areaPath}
                              fill={`url(#waveGradient-${idx})`}
                              className="transition-all duration-500"
                            />
                            {/* Wave line */}
                            <path
                              d={wavePath}
                              fill="none"
                              stroke={strokeColor}
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="transition-all duration-500"
                            />
                            {/* Animated glow effect */}
                            <path
                              d={wavePath}
                              fill="none"
                              stroke={strokeColor}
                              strokeWidth="4"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              opacity="0.3"
                              className="transition-all duration-500"
                            />
                            {/* End point dot with pulse */}
                            <circle
                              cx={lastPoint.x}
                              cy={lastPoint.y}
                              r="4"
                              fill={strokeColor}
                              opacity="0.3"
                              className="animate-ping"
                            />
                            <circle
                              cx={lastPoint.x}
                              cy={lastPoint.y}
                              r="3"
                              fill={strokeColor}
                              className="transition-all duration-300"
                            />
                          </svg>
                        </div>
                        
                        {/* Day Labels */}
                        <div className="flex justify-between mt-1">
                          <span className="text-[9px] text-slate-400">7d ago</span>
                          <span className="text-[9px] text-slate-400">Today</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((action, index) => (
            <Link 
              key={index} 
              to={action.link}
              className="group"
            >
              <Card className="h-full transition-all duration-300 bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 hover:shadow-xl hover:shadow-slate-200/50 dark:hover:shadow-teal-500/10 hover:border-teal-200 dark:hover:border-teal-500/50 relative overflow-hidden hover:-translate-y-1">
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-teal-500/5 dark:from-teal-500/10 to-transparent rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                <CardContent className="p-5 relative flex flex-col h-full">
                  <div className="flex items-start justify-between mb-4">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-slate-100 to-slate-50 dark:from-slate-700 dark:to-slate-800 group-hover:from-teal-50 group-hover:to-teal-100/50 dark:group-hover:from-teal-900/30 dark:group-hover:to-teal-800/20 transition-colors">
                      <action.icon className="w-6 h-6 text-slate-600 dark:text-slate-400 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors" />
                    </div>
                    {action.badge && (
                      <Badge variant="outline" className="text-xs bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-700">
                        {action.badge}
                      </Badge>
                    )}
                  </div>
                  <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-1">{action.title}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-3 flex-1">{action.description}</p>
                  <ArrowRight className="w-4 h-4 text-teal-500 mt-auto transition-transform group-hover:translate-x-2" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Smart Devices Sync Section */}
        <Card className="bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 border-slate-700/50 overflow-hidden">
          <CardContent className="p-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 shadow-lg shadow-teal-500/30">
                  <Watch className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white mb-1">Smart Device Hub</h3>
                  <p className="text-sm text-slate-400">
                    Manage your connected devices and sync health data
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button 
                  onClick={startBluetoothScan}
                  className="bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white shadow-lg shadow-teal-500/30"
                >
                  <Bluetooth className="w-4 h-4 mr-2" />
                  Pair New Device
                </Button>
                <Button
                  variant="outline"
                  className="border-teal-500/30 text-teal-400 hover:bg-teal-500/10"
                  onClick={syncAllDevices}
                  disabled={connectedDevices.length === 0 || isSyncingAll}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  {isSyncingAll ? 'Syncing...' : 'Sync All'}
                </Button>
              </div>
            </div>

            {/* Bluetooth Pairing Modal */}
            <Dialog open={showPairingModal} onOpenChange={setShowPairingModal}>
              <DialogContent className="sm:max-w-md bg-slate-900 border-slate-700 text-white">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-white">
                    <div className="p-2 rounded-lg bg-gradient-to-br from-teal-500 to-teal-600">
                      <Bluetooth className="w-5 h-5" />
                    </div>
                    {pairingStep === 'scanning' && 'Select Your Device'}
                    {pairingStep === 'found' && 'Available Devices'}
                    {pairingStep === 'pairing' && 'Pairing Device'}
                    {pairingStep === 'success' && 'Device Connected!'}
                    {pairingStep === 'error' && 'Connection Failed'}
                  </DialogTitle>
                  <DialogDescription className="text-slate-400">
                    {pairingStep === 'scanning' && 'A browser dialog should appear - select your device from the list'}
                    {pairingStep === 'found' && 'Select a device to pair with'}
                    {pairingStep === 'pairing' && 'Establishing secure connection...'}
                    {pairingStep === 'success' && 'Your device is now connected and syncing'}
                    {pairingStep === 'error' && 'Unable to connect. Please try again.'}
                  </DialogDescription>
                </DialogHeader>

                <div className="py-4">
                  {/* Scanning Animation - Shows while browser picker is open */}
                  {pairingStep === 'scanning' && (
                    <div className="flex flex-col items-center py-8">
                      <div className="relative w-24 h-24">
                        <div className="absolute inset-0 rounded-full border-4 border-teal-500/20" />
                        <div className="absolute inset-0 rounded-full border-4 border-teal-500/40 animate-ping" />
                        <div className="absolute inset-4 rounded-full border-4 border-teal-500/60 animate-ping" style={{ animationDelay: '0.5s' }} />
                        <div className="absolute inset-8 flex items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-teal-600">
                          <Bluetooth className="w-6 h-6 text-white" />
                        </div>
                      </div>
                      <p className="mt-6 text-sm text-slate-300 text-center">Look for the browser's Bluetooth dialog</p>
                      <p className="mt-2 text-xs text-slate-500 text-center">Select your device from the popup list that appears</p>
                      <div className="mt-4 p-3 bg-slate-800 rounded-lg text-xs text-slate-400">
                        <p className="font-medium text-teal-400 mb-1">💡 Tips:</p>
                        <ul className="space-y-1 list-disc list-inside">
                          <li>Enable Bluetooth on your wearable device</li>
                          <li>Put device in pairing mode if required</li>
                          <li>Keep device close to your computer/phone</li>
                        </ul>
                      </div>
                    </div>
                  )}

                  {/* Device List */}
                  {pairingStep === 'found' && (
                    <div className="space-y-3">
                      {discoveredDevices.length === 0 ? (
                        <div className="text-center py-6">
                          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800 flex items-center justify-center">
                            <Bluetooth className="w-8 h-8 text-slate-500" />
                          </div>
                          <p className="text-slate-400 mb-2">No devices found</p>
                          <p className="text-xs text-slate-500 mb-4">Make sure your device is in pairing mode and Bluetooth is enabled</p>
                          <div className="flex flex-col gap-2">
                            <Button
                              onClick={startBluetoothScan}
                              className="bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white"
                            >
                              <Bluetooth className="w-4 h-4 mr-2" />
                              Scan for Devices
                            </Button>
                            <Link to="/patient/devices?action=add-manual">
                              <Button variant="outline" className="w-full border-slate-600 text-slate-300">
                                <Plus className="w-4 h-4 mr-2" />
                                Add Device Manually
                              </Button>
                            </Link>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-xs text-teal-400 mb-2">{discoveredDevices.length} option(s) available</p>
                          {discoveredDevices.map((device) => (
                            <div
                              key={device.id}
                              onClick={() => pairDevice(device.id)}
                              className="flex items-center justify-between p-4 rounded-xl bg-slate-800/80 border border-slate-700/50 hover:border-teal-500/50 cursor-pointer transition-all group"
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-3xl">{device.icon}</span>
                                <div>
                                  <p className="font-medium text-white group-hover:text-teal-400 transition-colors">{device.name}</p>
                                  <p className="text-xs text-slate-500 capitalize">
                                    {device.type === 'integration' ? 'Health App Integration' : 
                                     device.type === 'manual' ? 'Enter device details' :
                                     device.type.replace('_', ' ')}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                {device.type !== 'manual' && device.type !== 'integration' && (
                                  <div className="flex items-center gap-1">
                                    {[...Array(4)].map((_, i) => (
                                      <div
                                        key={i}
                                        className={`w-1 rounded-full transition-all ${
                                          i < Math.ceil(device.signal / 25)
                                            ? 'bg-teal-400'
                                            : 'bg-slate-600'
                                        }`}
                                        style={{ height: `${8 + i * 4}px` }}
                                      />
                                    ))}
                                  </div>
                                )}
                                <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-teal-400 transition-colors" />
                              </div>
                            </div>
                          ))}
                          <Button
                            variant="ghost"
                            onClick={startBluetoothScan}
                            className="w-full text-slate-400 hover:text-teal-400 hover:bg-slate-800"
                          >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Scan for More Devices
                          </Button>
                        </>
                      )}
                      
                      {/* Platform-specific tips */}
                      <div className="mt-4 p-3 rounded-lg bg-slate-800/50 border border-slate-700/30">
                        <p className="text-xs text-slate-500 flex items-start gap-2">
                          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                          <span>
                            {/iphone|ipad|ipod/i.test(navigator.userAgent) 
                              ? "iOS devices can connect via Apple Health integration for best compatibility."
                              : /android/i.test(navigator.userAgent)
                              ? "Android: Make sure Bluetooth and Location are enabled in Settings."
                              : "Use Chrome or Edge browser for best Bluetooth support."}
                          </span>
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Pairing Progress */}
                  {pairingStep === 'pairing' && (
                    <div className="flex flex-col items-center py-6">
                      <div className="relative w-20 h-20 mb-4">
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-4xl">
                            {discoveredDevices.find(d => d.id === selectedDevice)?.icon}
                          </span>
                        </div>
                        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                          <circle cx="50" cy="50" r="45" className="fill-none stroke-slate-700" strokeWidth="6" />
                          <circle
                            cx="50" cy="50" r="45"
                            className="fill-none stroke-teal-500 transition-all duration-300"
                            strokeWidth="6"
                            strokeLinecap="round"
                            strokeDasharray={`${pairingProgress * 2.83} 283`}
                          />
                        </svg>
                      </div>
                      <p className="text-lg font-medium text-white">
                        {discoveredDevices.find(d => d.id === selectedDevice)?.name}
                      </p>
                      <div className="w-full mt-4 px-4">
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-slate-400">Connecting...</span>
                          <span className="text-teal-400">{pairingProgress}%</span>
                        </div>
                        <Progress value={pairingProgress} className="h-2 bg-slate-700" />
                      </div>
                      <p className="mt-4 text-xs text-slate-500">Do not close this window</p>
                    </div>
                  )}

                  {/* Success State */}
                  {pairingStep === 'success' && (
                    <div className="flex flex-col items-center py-6">
                      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center mb-4 animate-in zoom-in duration-300">
                        <CheckCircle className="w-8 h-8 text-white" />
                      </div>
                      <p className="text-lg font-medium text-white mb-1">
                        {discoveredDevices.find(d => d.id === selectedDevice)?.name}
                      </p>
                      <p className="text-sm text-teal-400 mb-4">Successfully connected!</p>
                      <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800 px-3 py-2 rounded-lg">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        Syncing health data...
                      </div>
                      <Button
                        onClick={closePairingModal}
                        className="mt-6 bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white"
                      >
                        Done
                      </Button>
                    </div>
                  )}

                  {/* Error State */}
                  {pairingStep === 'error' && (
                    <div className="flex flex-col items-center py-6">
                      <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
                        <WifiOff className="w-8 h-8 text-red-400" />
                      </div>
                      <p className="text-sm text-slate-400 mb-4 text-center">
                        Could not connect to the device. Make sure it's in pairing mode and try again.
                      </p>
                      <div className="flex gap-3">
                        <Button
                          variant="outline"
                          onClick={closePairingModal}
                          className="border-slate-600 text-slate-300"
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={() => { setPairingStep('scanning'); startBluetoothScan(); }}
                          className="bg-gradient-to-r from-teal-500 to-teal-600 text-white"
                        >
                          Try Again
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            {/* My Active Devices */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-slate-300 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
                  My Active Devices
                </h4>
                <span className="text-xs text-slate-500">{connectedDevices.length} device{connectedDevices.length !== 1 ? 's' : ''} connected</span>
              </div>
              {connectedDevices.length === 0 ? (
                <div className="text-center py-8 bg-slate-800/40 rounded-xl border border-dashed border-slate-700">
                  <Bluetooth className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm mb-2">No devices connected</p>
                  <p className="text-slate-500 text-xs mb-4">Pair a device to start syncing health data</p>
                  <Button 
                    onClick={startBluetoothScan}
                    className="bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white"
                  >
                    <Bluetooth className="w-4 h-4 mr-2" />
                    Pair Your First Device
                  </Button>
                </div>
              ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {connectedDevices.map((device, idx) => (
                  <div key={device.id || idx} className="p-4 rounded-xl bg-slate-800/80 border border-slate-700/50 hover:border-teal-500/30 transition-all group">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <span className="text-3xl">{getDeviceIcon(device.type)}</span>
                          <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-teal-500 border-2 border-slate-800" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{device.name}</p>
                          <p className="text-xs text-teal-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Connected
                          </p>
                          <p className="text-[10px] text-slate-500 capitalize">{device.type?.replace('_', ' ') || 'Device'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          {device.battery && (
                            <div className="flex items-center gap-1 text-xs text-slate-400">
                              <Zap className="w-3 h-3" /> {device.battery}%
                            </div>
                          )}
                          <p className="text-[10px] text-slate-500">
                            {device.lastSync ? `Synced ${new Date(device.lastSync).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}` : 'Ready to sync'}
                          </p>
                        </div>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-teal-400 hover:bg-teal-500/10" title="Sync Now" onClick={() => syncDevice(device.id)}>
                          <RefreshCw className={`w-4 h-4 ${device.status === 'syncing' ? 'animate-spin' : ''}`} />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-8 w-8 p-0 text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                          title="Disconnect"
                          onClick={() => disconnectDevice(device.id)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    {/* Data Types */}
                    {device.dataTypes && device.dataTypes.length > 0 ? (
                      <div className="flex flex-wrap gap-1 pt-3 border-t border-slate-700/50">
                        {device.dataTypes.slice(0, 6).map((dataType, i) => (
                          <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-400">
                            {dataType}
                          </span>
                        ))}
                        {device.dataTypes.length > 6 && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700 text-slate-400">
                            +{device.dataTypes.length - 6} more
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="pt-3 border-t border-slate-700/50">
                        <p className="text-[10px] text-slate-500 flex items-center gap-1">
                          <Info className="w-3 h-3" />
                          Use companion app to sync data
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              )}
            </div>

            {/* Supported Devices / Add New */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-slate-400">Add New Device</h4>
                <Link to="/patient/devices?tab=devices" className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1">
                  View all <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {supportedDevices.map((device, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={startBluetoothScan}
                    className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/30 border border-dashed border-slate-700/50 hover:border-teal-500/30 hover:bg-slate-800/50 transition-all cursor-pointer group text-left"
                  >
                    <span className="text-2xl opacity-60 group-hover:opacity-100 transition-opacity">{device.icon}</span>
                    <div>
                      <p className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">{device.name}</p>
                      <p className="text-[10px] text-slate-500">{device.brands}</p>
                    </div>
                    <Plus className="w-4 h-4 text-slate-600 group-hover:text-teal-400 ml-auto transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Essentials: Wallet, Payments, HRA, Membership, Diary */}
        {membershipNotice && (
          <Card className={`border ${membershipNotice.level === 'danger' ? 'border-red-200/80 dark:border-red-700/50' : 'border-amber-200/80 dark:border-amber-700/50'} bg-white dark:bg-slate-800/50`}>
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className={`font-semibold ${membershipNotice.level === 'danger' ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}>
                  {membershipNotice.title}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-300">{membershipNotice.description}</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Link to={membershipNotice.ctaLink}>
                  <Button
                    variant={membershipNotice.level === 'danger' ? 'destructive' : 'outline'}
                    onClick={() =>
                      trackEvent('membership_notice_cta_click', {
                        level: membershipNotice.level,
                        title: membershipNotice.title,
                        ctaLink: membershipNotice.ctaLink,
                      })
                    }
                  >
                    {membershipNotice.ctaLabel}
                  </Button>
                </Link>
                {membershipNotice.secondaryCtaLabel && membershipNotice.secondaryCtaLink && (
                  <Link to={membershipNotice.secondaryCtaLink}>
                    <Button
                      variant="outline"
                      onClick={() =>
                        trackEvent('membership_notice_secondary_cta_click', {
                          level: membershipNotice.level,
                          title: membershipNotice.title,
                          ctaLink: membershipNotice.secondaryCtaLink,
                        })
                      }
                    >
                      {membershipNotice.secondaryCtaLabel}
                    </Button>
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-800 dark:text-white">Essentials</h2>
            <Badge variant="outline" className="text-xs">Personalized</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {essentials.map((item, idx) => (
              <Link key={idx} to={item.link} className="group">
                <Card className="h-full transition-all duration-300 bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 hover:border-teal-200 dark:hover:border-teal-500/50 hover:shadow-lg hover:shadow-teal-500/10 relative overflow-hidden hover:-translate-y-1">
                  <CardContent className="p-4 relative space-y-3 flex flex-col h-full">
                    <div className="flex items-center justify-between">
                      <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-700 group-hover:bg-teal-50 dark:group-hover:bg-teal-900/30 transition-colors">
                        <item.icon className="w-5 h-5 text-slate-600 dark:text-slate-400 group-hover:text-teal-600 dark:group-hover:text-teal-300" />
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        {item.badge}
                      </Badge>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-800 dark:text-white mb-1">{item.title}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug">{item.description}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Upcoming Appointments */}
          <Card className="lg:col-span-2 bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-700/50">
              <CardTitle className="text-lg font-semibold flex items-center gap-2 text-slate-800 dark:text-white">
                <div className="p-1.5 rounded-lg bg-teal-50 dark:bg-teal-900/30">
                  <Calendar className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                </div>
                Upcoming Appointments
              </CardTitle>
              <Link to="/my-bookings">
                <Button variant="ghost" size="sm" className="text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-900/30">
                  View All
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="pt-4">
              {upcomingAppointments.length > 0 ? (
                <div className="space-y-3">
                  {upcomingAppointments.map((apt, index) => (
                    <div key={apt.id || index} className="flex items-center gap-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-700/30 hover:bg-teal-50/50 dark:hover:bg-teal-900/20 transition-colors border border-slate-100 dark:border-slate-700 hover:border-teal-200 dark:hover:border-teal-700">
                      <div className="p-2.5 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 shadow-sm">
                        {apt.type === "Video Consultation" ? (
                          <Video className="w-5 h-5 text-white" />
                        ) : (
                          <Stethoscope className="w-5 h-5 text-white" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 dark:text-white truncate">{apt.doctorName || apt.doctor?.name || "Doctor"}</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{apt.specialty || apt.doctor?.specialty || "Specialist"}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-slate-800 dark:text-white">
                          {new Date(apt.date || apt.appointmentDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </p>
                        <p className="text-xs text-teal-600 dark:text-teal-400 font-medium">{apt.time || apt.appointmentTime}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="flex items-center justify-center mb-2">
                    <div className="p-4 rounded-full bg-slate-100 dark:bg-slate-700/50">
                      <Calendar className="w-12 h-12 text-slate-300 dark:text-slate-500" />
                    </div>
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 mb-4">
                    {appointmentsLoadError ? 'Could not load appointments right now.' : 'No upcoming appointments'}
                  </p>
                  {appointmentsLoadError ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={fetchDashboardData}
                      className="border-teal-200 text-teal-700 hover:bg-teal-50 dark:border-teal-700 dark:text-teal-300"
                    >
                      Retry
                    </Button>
                  ) : (
                    <Link to="/doctors">
                      <Button size="sm" className="bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white shadow-sm">Book Now</Button>
                    </Link>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 shadow-sm">
            <CardHeader className="pb-2 border-b border-slate-100 dark:border-slate-700/50">
              <CardTitle className="text-lg font-semibold flex items-center gap-2 text-slate-800 dark:text-white">
                <div className="p-1.5 rounded-lg bg-teal-50 dark:bg-teal-900/30">
                  <Activity className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                </div>
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="space-y-3">
                {recentActivities.map((activity) => {
                  const content = (
                    <>
                      <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-700">
                        <activity.icon className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-700 dark:text-slate-300">{activity.message}</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{activity.time}</p>
                      </div>
                    </>
                  );

                  return activity.link ? (
                    <Link
                      key={activity.id}
                      to={activity.link}
                      className="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                    >
                      {content}
                    </Link>
                  ) : (
                    <div
                      key={activity.id}
                      className="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                    >
                      {content}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Features Grid */}
        <div>
          <h2 className="text-xl font-semibold text-slate-800 dark:text-white mb-4">Explore Services</h2>

          {/* ── AI-Powered Features Banner ── */}
          <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-teal-600 via-blue-600 to-purple-600 text-white relative overflow-hidden">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIxIiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiLz48L3N2Zz4=')] opacity-50" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                <Brain className="h-5 w-5" />
                <h3 className="font-bold text-lg">AI-Powered Health Tools</h3>
                <Badge variant="outline" className="text-[10px] border-white/30 text-white bg-white/10 ml-auto">NEW</Badge>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <Link to="/report-scanner" className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-white/10 hover:bg-white/20 transition-all active:scale-95 backdrop-blur-sm">
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                    <FileText className="h-5 w-5" />
                  </div>
                  <span className="text-[11px] font-semibold text-center leading-tight">Scan Report</span>
                </Link>
                <Link to="/symptom-checker" className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-white/10 hover:bg-white/20 transition-all active:scale-95 backdrop-blur-sm">
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                    <Stethoscope className="h-5 w-5" />
                  </div>
                  <span className="text-[11px] font-semibold text-center leading-tight">AI Triage</span>
                </Link>
                <Link to="/smart-health" className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-white/10 hover:bg-white/20 transition-all active:scale-95 backdrop-blur-sm">
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <span className="text-[11px] font-semibold text-center leading-tight">AI Health Dashboard</span>
                </Link>
                <Link to="/family-hub" className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-white/10 hover:bg-white/20 transition-all active:scale-95 backdrop-blur-sm">
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                    <Users className="h-5 w-5" />
                  </div>
                  <span className="text-[11px] font-semibold text-center leading-tight">Family Hub</span>
                </Link>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Link to="/wellness-rewards" className="flex items-center gap-3 p-3 rounded-xl bg-white/10 hover:bg-white/20 transition-all active:scale-95 backdrop-blur-sm">
                  <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                    <Trophy className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold">Health Rewards</p>
                    <p className="text-[10px] text-white/70">Earn coins &amp; redeem</p>
                  </div>
                </Link>
                <Link to="/smart-opd" className="flex items-center gap-3 p-3 rounded-xl bg-white/10 hover:bg-white/20 transition-all active:scale-95 backdrop-blur-sm">
                  <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                    <Stethoscope className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold">Smart OPD</p>
                    <p className="text-[10px] text-white/70">Best doctor for you</p>
                  </div>
                </Link>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <Link 
                key={index}
                to={feature.link}
                className="group"
              >
                <Card className="h-full transition-all duration-300 bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 hover:border-teal-200 dark:hover:border-teal-500/50 hover:shadow-xl hover:shadow-slate-200/50 dark:hover:shadow-teal-500/10 relative overflow-hidden hover:-translate-y-1">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-teal-500/5 dark:from-teal-500/10 to-transparent rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                  <CardContent className="p-5 relative">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-slate-100 to-slate-50 dark:from-slate-700 dark:to-slate-800 group-hover:from-teal-50 group-hover:to-teal-100/50 dark:group-hover:from-teal-900/30 dark:group-hover:to-teal-800/20 w-fit mb-4 transition-all group-hover:scale-110">
                      <feature.icon className="w-6 h-6 text-slate-600 dark:text-slate-400 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors" />
                    </div>
                    <h3 className="font-semibold text-slate-800 dark:text-white mb-2">{feature.title}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">{feature.description}</p>
                    <div className="space-y-1.5">
                      {feature.highlights.slice(0, 2).map((highlight, idx) => (
                        <div key={idx} className="flex items-center text-xs text-slate-500 dark:text-slate-400">
                          <CheckCircle2 className="w-3 h-3 mr-1.5 text-teal-500" />
                          {highlight}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </div>
  );
};

export default Index;

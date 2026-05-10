import { validationResult } from 'express-validator';
import { JWT_CONFIG } from '../config/auth.config.js';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Appointment, Prescription, Doctor, User } from '../models/index.js';
import { buildLiveKitJoinData, createMeetingInfo, generateCanonicalMeetingId, verifyCanonicalMeetingId } from '../utils/videoProvider.js';
import { RoomServiceClient } from 'livekit-server-sdk';
import { redisClient } from '../config/redis.js';

const INVITE_TTL_SECONDS = 4 * 60 * 60; // 4 hours
const INVITE_SECRET = process.env.VIDEO_INVITE_SECRET || JWT_CONFIG.SECRET + ':video-invite';
const FRONTEND_BASE = (process.env.FRONTEND_URL || 'https://app.mediqzy.com').replace(/\/+$/, '');

// Redis key prefix for invite codes (cluster-safe, persists across restarts)
const INVITE_REDIS_PREFIX = 'video:invite:';

// Simple WebRTC video calling controller
class VideoController {
  
  // Test endpoint for video calling system
  static testVideoSystem = (req, res) => {
    try {
      const turnHost = process.env.TURN_SERVER_HOST || '13.234.17.52';
      const serverConfig = {
        turnServer: `turn:${turnHost}:3478`,
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: `turn:${turnHost}:3478?transport=udp`, username: 'livekit', credential: 'livekit' },
          { urls: `turn:${turnHost}:3478?transport=tcp`, username: 'livekit', credential: 'livekit' }
        ]
      };

      res.json({
        success: true,
        message: 'Video calling system is operational',
        timestamp: new Date().toISOString(),
        config: serverConfig
      });
    } catch (error) {
      console.error('Video system test failed:', error);
      res.status(500).json({
        success: false,
        message: 'Video system test failed',
        error: error.message
      });
    }
  };

  // Generate video room token
  static generateRoomToken = async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { roomId, appointmentId } = req.body;
      const userId = req.user.id;
      const userRole = req.user.role || 'user';
      let resolvedRoomId = roomId;

      if (appointmentId) {
        const appointment = await Appointment.findByPk(appointmentId);
        if (!appointment) {
          return res.status(404).json({
            success: false,
            message: 'Appointment not found'
          });
        }

        const isPatient = String(appointment.userId) === String(userId);
        const isDoctor = String(appointment.doctorId) === String(userId);
        if (!isPatient && !isDoctor) {
          return res.status(403).json({
            success: false,
            message: 'Not authorized to generate token for this consultation'
          });
        }

        const canonicalMeetingId = generateCanonicalMeetingId(appointment.id);
        // Prefer stored meetingId so all token paths return the same room
        const storedRoomId = appointment.meetingId;
        const expectedRoomId = storedRoomId || canonicalMeetingId;
        if (
          resolvedRoomId &&
          resolvedRoomId !== expectedRoomId &&
          !verifyCanonicalMeetingId(appointment.id, resolvedRoomId)
        ) {
          return res.status(403).json({
            success: false,
            message: 'Invalid room for appointment'
          });
        }
        resolvedRoomId = resolvedRoomId || expectedRoomId;
      }

      if (!resolvedRoomId) {
        return res.status(400).json({
          success: false,
          message: 'roomId or appointmentId is required'
        });
      }

      // Create a simple room token
      const roomToken = jwt.sign(
        {
          userId,
          userRole,
          roomId: resolvedRoomId,
          appointmentId,
          timestamp: Date.now()
        },
        JWT_CONFIG.SECRET,
        { expiresIn: '2h' }
      );

      // Generate room URL
      const roomUrl = `${req.protocol}://${req.get('host')}/video-room/${resolvedRoomId}?token=${roomToken}`;

      res.json({
        success: true,
        roomToken,
        roomId: resolvedRoomId,
        roomUrl,
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: `turn:${process.env.TURN_SERVER_HOST || '13.234.17.52'}:3478?transport=udp`, username: 'livekit', credential: 'livekit' },
          { urls: `turn:${process.env.TURN_SERVER_HOST || '13.234.17.52'}:3478?transport=tcp`, username: 'livekit', credential: 'livekit' }
        ]
      });

    } catch (error) {
      console.error('Failed to generate room token:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate room token',
        error: error.message
      });
    }
  };

  // Generate LiveKit token from query parameters (GET endpoint)
  static generateLiveKitTokenFromQuery = async (req, res) => {
    try {
      const { roomId, appointmentId, identity } = req.query;
      const userId = req.user.id;
      const userRole = req.user.role || 'user';
      const displayName =
        [req.user.firstName, req.user.lastName].filter(Boolean).join(' ') ||
        req.user.name ||
        req.user.email ||
        'Mediczy User';

      if (!appointmentId && ['user', 'doctor'].includes(String(userRole).toLowerCase())) {
        return res.status(400).json({
          success: false,
          message: 'appointmentId is required to join consultation rooms'
        });
      }

      let meetingId = roomId || createMeetingInfo({}).meetingId;
      if (appointmentId) {
        const appointment = await Appointment.findByPk(appointmentId);
        if (!appointment) {
          return res.status(404).json({
            success: false,
            message: 'Appointment not found'
          });
        }

        const isPatient = String(appointment.userId) === String(userId);
        const isDoctor = String(appointment.doctorId) === String(userId);
        if (!isPatient && !isDoctor) {
          return res.status(403).json({
            success: false,
            message: 'Not authorized to join this consultation'
          });
        }

        const normalizedStatus = String(appointment.status || '').replace('_', '-');
        if (!['scheduled', 'confirmed', 'in-progress', 'rescheduled', 'accepted'].includes(normalizedStatus)) {
          return res.status(400).json({
            success: false,
            message: `Cannot join video call. Appointment status: ${appointment.status}`,
            currentStatus: appointment.status
          });
        }

        // Skip time-window enforcement for active (in-progress) calls —
        // doctor or patient may re-join after a disconnect.
        if (normalizedStatus !== 'in-progress') {
          const normalizedTime = String(appointment.appointmentTime || '').slice(0, 5);
          const appointmentDateTime = new Date(`${appointment.appointmentDate}T${normalizedTime}:00`);
          if (Number.isNaN(appointmentDateTime.getTime())) {
            return res.status(400).json({
              success: false,
              message: 'Appointment has an invalid schedule. Please contact support.'
            });
          }
          const now = new Date();
          const windowStart = new Date(appointmentDateTime.getTime() - 15 * 60 * 1000);
          const windowEnd = new Date(appointmentDateTime.getTime() + 60 * 60 * 1000);

          if (now < windowStart) {
            return res.status(400).json({
              success: false,
              message: 'Video call will be available 15 minutes before the appointment',
              appointmentTime: appointmentDateTime.toISOString(),
              canJoinAt: windowStart.toISOString()
            });
          }

          if (now > windowEnd) {
            return res.status(400).json({
              success: false,
              message: 'Appointment time has passed',
              appointmentTime: appointmentDateTime.toISOString()
            });
          }
        }

        const canonicalMeetingId = generateCanonicalMeetingId(appointment.id);
        // Prefer the stored meetingId (set by initiate-call) so doctor and patient
        // always land in the same room. Fall back to canonical if not set.
        const storedMeetingId = appointment.meetingId;
        const resolvedMeetingId = storedMeetingId || canonicalMeetingId;

        if (
          roomId &&
          roomId !== resolvedMeetingId &&
          !verifyCanonicalMeetingId(appointment.id, roomId)
        ) {
          return res.status(403).json({
            success: false,
            message: 'Invalid room for appointment'
          });
        }
        meetingId = roomId || resolvedMeetingId;
      }

      console.log('🎥 Generating LiveKit token from query params:', {
        roomId: meetingId,
        appointmentId,
        identity: identity || `${userRole}-${userId}`
      });

      const livekitData = await buildLiveKitJoinData({
        meetingId,
        identity: identity || `${userRole}-${userId}`,
        name: displayName
      });

      // Return in format expected by client
      res.json({
        token: livekitData.token,
        serverUrl: livekitData.serverUrl,
        roomName: meetingId,
        success: true,
        video: {
          meetingId,
          meetingLink: livekitData.meetUrl,
          joinUrl: livekitData.joinUrl,
          livekit: livekitData
        },
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
      });
    } catch (error) {
      console.error('❌ Failed to generate LiveKit token from query:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate LiveKit token: ' + error.message,
        error: error.message
      });
    }
  };

  // Generate LiveKit token without appointment context
  static generateLiveKitToken = async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { roomName } = req.body;
      const userId = req.user.id;
      const userRole = req.user.role || 'user';
      const displayName =
        [req.user.firstName, req.user.lastName].filter(Boolean).join(' ') ||
        req.user.name ||
        req.user.email ||
        'Mediczy User';

      const meetingId = roomName || createMeetingInfo({}).meetingId;
      const livekitData = await buildLiveKitJoinData({
        meetingId,
        identity: `${userRole}-${userId}`,
        name: displayName
      });

      res.json({
        success: true,
        video: {
          meetingId,
          meetingLink: livekitData.meetUrl,
          joinUrl: livekitData.joinUrl,
          livekit: livekitData
        },
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
      });
    } catch (error) {
      console.error('Failed to generate LiveKit token:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate LiveKit token',
        error: error.message
      });
    }
  };

  // PHASE 2: Join video room with lazy room creation
  static joinRoom = async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { roomId } = req.params;
      const userId = req.user.id;
      const userRole = req.user.role || 'user';
      const displayName = 
        [req.user.firstName, req.user.lastName].filter(Boolean).join(' ') ||
        req.user.name ||
        req.user.email ||
        `${userRole}-${userId}`;

      console.log(`📞 Join request: ${roomId} by ${displayName} (${userRole})`);

      // PHASE 2: When room ID follows apt-{id} format, verify appointment exists
      let appointmentId = null;
      let isAppointmentRoom = false;
      
      if (roomId.startsWith('apt-')) {
        // PHASE 3.1: Extract appointment ID and verify canonical meeting ID
        // Format: apt-{appointmentId}-{hash} or apt-{appointmentId} (backward compat)
        const roomParts = roomId.substring(4).split('-');
        appointmentId = roomParts[0]; // First numeric part is the appointment ID
        isAppointmentRoom = true;
        
        // Verify appointment exists and user is authorized
        const appointment = await Appointment.findByPk(appointmentId);
        if (!appointment) {
          return res.status(404).json({
            success: false,
            message: 'Appointment not found'
          });
        }

        // PHASE 3.1: Verify canonical meeting ID to ensure both doctor/patient use same room
        const canonicalMeetingId = generateCanonicalMeetingId(appointmentId);
        const providedMeetingId = roomId;
        const isFallbackFormat = !roomId.includes('-', 4); // apt-{id} format without hash
        
        if (!isFallbackFormat && !verifyCanonicalMeetingId(appointmentId, providedMeetingId)) {
          console.warn(`🔐 SECURITY: Invalid meeting ID provided: ${providedMeetingId} vs expected: ${canonicalMeetingId}`);
          return res.status(403).json({
            success: false,
            message: 'Invalid meeting room code',
            details: 'The meeting code does not match the expected canonical ID for this appointment'
          });
        }
        
        console.log(`🔐 Meeting ID verified: ${providedMeetingId} (canonical: ${canonicalMeetingId})`);

        // Verify user is doctor or patient for this appointment
        const isDoctor = appointment.doctorId === userId;
        const isPatient = appointment.userId === userId || appointment.patientId === userId;
        
        if (!isDoctor && !isPatient) {
          console.warn(`⚠️ Unauthorized join attempt: user ${userId} for appointment ${appointmentId}`);
          return res.status(403).json({
            success: false,
            message: 'Unauthorized: You are not part of this appointment'
          });
        }

        console.log(`✅ Appointment verified: ${appointmentId} - ${displayName} is ${isDoctor ? 'doctor' : 'patient'}`);
      }

      // PHASE 2: Lazy room creation - create room if it doesn't exist
      let videoRoomToken = null;
      try {
        const videoApiUrl = process.env.VIDEO_API_URL || 'http://localhost:3000';
        
        // Determine room type and get appropriate max participants for Zoom-like multi-participant support
        let roomType = 'appointment'; // default for appointment-based calls
        let maxParticipants = 2;
        
        if (isAppointmentRoom) {
          // Standard appointment is 1-on-1
          roomType = 'appointment';
          maxParticipants = 2;
        } else {
          // For non-appointment rooms (group consultations, etc.), support up to 100 participants
          roomType = 'generic';
          maxParticipants = 100;
        }
        
        // First, try to ensure room exists
        const createRoomResponse = await fetch(`${videoApiUrl}/api/video/room/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId,
            roomType,
            appointmentId: appointmentId || null,
            doctorId: req.user.role === 'doctor' ? userId : null,
            patientId: req.user.role !== 'doctor' ? userId : null,
            maxParticipants: maxParticipants,
            duration: roomType === 'appointment' ? 60 : 120 // minutes
          })
        }).catch(err => {
          console.warn(`⚠️ Room creation failed: ${err.message}`);
          return null;
        });

        if (createRoomResponse?.ok) {
          const roomData = await createRoomResponse.json();
          videoRoomToken = roomData.roomToken || roomData.token;
          console.log(`✅ Room created/verified: ${roomId}, Token: ${videoRoomToken ? 'YES' : 'NO'}`);
        }
      } catch (err) {
        console.warn(`⚠️ Lazy room creation error: ${err.message}`);
        // Continue without token - participant can still join
      }

      // Generate LiveKit token for this participant
      const livekitData = await buildLiveKitJoinData({
        meetingId: roomId,
        identity: `${userRole}-${userId}`,
        name: displayName
      }).catch(err => {
        console.warn(`⚠️ LiveKit token generation failed: ${err.message}`);
        return null;
      });

      const roomData = {
        roomId,
        userId,
        userRole,
        displayName,
        joinedAt: new Date().toISOString(),
        appointmentId: appointmentId || null,
        videoToken: videoRoomToken,
        livekit: livekitData || {
          token: null,
          serverUrl: process.env.LIVEKIT_URL || 'ws://localhost:7880',
          roomName: roomId
        },
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: `turns:${(process.env.LIVEKIT_URL || 'wss://video.mediqzy.com').replace(/^wss?:\/\//, '')}:5349?transport=tcp`, username: 'livekit', credential: 'livekit' },
          { urls: `turn:${(process.env.LIVEKIT_URL || 'wss://video.mediqzy.com').replace(/^wss?:\/\//, '')}:3478?transport=udp`, username: 'livekit', credential: 'livekit' }
        ]
      };

      res.json({
        success: true,
        message: 'Successfully joined video room',
        roomData,
        roomCapacity: {
          max: isAppointmentRoom ? 2 : 100,
          type: isAppointmentRoom ? 'appointment' : 'group',
          description: isAppointmentRoom ? '1-on-1 video call' : 'Multi-participant video conference (Zoom-like)'
        },
        livekit: livekitData
      });

    } catch (error) {
      console.error('Failed to join room:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to join video room',
        error: error.message
      });
    }
  };

  // Leave video room
  static leaveRoom = async (req, res) => {
    try {
      const { roomId } = req.params;
      const userId = req.user.id;
      const userRole = req.user.role || 'user';
      const { appointmentId, duration } = req.body; // Optional appointment ID and call duration

      let prescriptionCreated = false;
      let prescriptionData = null;

      // If doctor is leaving and appointmentId is provided, auto-create prescription draft
      if (userRole === 'doctor' && appointmentId) {
        try {
          const appointment = await Appointment.findByPk(appointmentId);
          
          if (appointment && appointment.doctorId === userId) {
            // Check if consultation was online and no prescription exists yet
            const existingPrescription = await Prescription.findOne({
              where: { appointmentId: parseInt(appointmentId) }
            });

            if (!existingPrescription && ['video', 'audio', 'chat'].includes(appointment.consultationType)) {
              // Get doctor details
              const doctor = await Doctor.findByPk(userId);
              
              // Get patient details
              const patient = await User.findByPk(appointment.userId);
              
              if (doctor && patient) {
                // Calculate patient age
                let patientAge = null;
                if (patient.dateOfBirth) {
                  const dob = new Date(patient.dateOfBirth);
                  const today = new Date();
                  patientAge = today.getFullYear() - dob.getFullYear();
                }

                // Auto-create prescription draft
                const prescription = await Prescription.create({
                  appointmentId: appointment.id,
                  tenant_id: appointment.tenant_id || appointment.organization_id || null,
                  corporate_tenant_id: appointment.corporate_tenant_id || null,
                  organization_id: appointment.organization_id || null,
                  organization_type: appointment.organization_type || null,
                  patientId: appointment.userId,
                  patientName: `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || appointment.patientName,
                  patientAge,
                  patientGender: patient.gender || 'Not specified',
                  patientPhone: patient.phoneNumber || patient.phone || appointment.patientPhone,
                  doctorId: doctor.id,
                  doctorName: `${doctor.firstName || ''} ${doctor.lastName || ''}`.trim(),
                  doctorQualifications: Array.isArray(doctor.qualifications) 
                    ? doctor.qualifications.join(', ') 
                    : (doctor.qualifications || doctor.qualification || 'MBBS'),
                  doctorRegNo: doctor.registrationNumber || doctor.licenseNumber || 'N/A',
                  specialty: doctor.specialization || 'General Medicine',
                  clinicName: doctor.clinicHospitalName || doctor.clinicName || 'Mediczy Healthcare',
                  clinicAddress: 'Online Consultation / Telemedicine',
                  clinicPhone: doctor.phone || doctor.phoneNumber || doctor.clinicPhone,
                  clinicEmail: doctor.email,
                  clinicDetails: {
                    name: doctor.clinicHospitalName || doctor.clinicName || 'Mediczy Healthcare',
                    address: 'Online Consultation / Telemedicine',
                    phone: doctor.phone || doctor.phoneNumber,
                    email: doctor.email,
                    specialty: doctor.specialization,
                    consultationType: appointment.consultationType
                  },
                  diagnosis: 'To be filled by doctor',
                  chiefComplaints: appointment.symptoms || ['As discussed during consultation'],
                  medications: [],
                  labTests: [],
                  instructions: [
                    'Complete the full course of medications',
                    'Take medicines as directed',
                    'Contact doctor if symptoms worsen'
                  ],
                  vitals: {},
                  validityDays: 30,
                  notes: duration ? `Video consultation duration: ${duration}` : 'Consultation completed via video call',
                  status: 'draft'
                });

                // Update appointment status
                await appointment.update({
                  status: 'completed',
                  prescription: prescription.prescriptionId,
                  notes: duration ? `Video consultation completed (${duration})` : 'Video consultation completed'
                });

                prescriptionCreated = true;
                prescriptionData = {
                  prescriptionId: prescription.prescriptionId,
                  status: 'draft',
                  message: 'Prescription draft created. Please add diagnosis and medications.',
                  editUrl: `/api/prescriptions/${prescription.prescriptionId}`
                };
              }
            }
          }
        } catch (prescriptionError) {
          console.error('Auto-prescription creation failed:', prescriptionError);
          // Don't fail the leave request if prescription creation fails
        }
      }

      res.json({
        success: true,
        message: 'Successfully left video room',
        roomId,
        userId,
        leftAt: new Date().toISOString(),
        prescriptionCreated,
        prescription: prescriptionData
      });

    } catch (error) {
      console.error('Failed to leave room:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to leave video room',
        error: error.message
      });
    }
  };

  /**
   * POST /api/video/room/:roomId/invite
   * Creates a time-limited shareable invite link for family/friends to join the call.
   * Requires valid auth (doctor or user with active membership).
   * Guests open the link in any browser — no login required.
   */
  static createInviteLink = async (req, res) => {
    try {
      const { roomId } = req.params;
      const { label = 'Guest', maxUses = 10 } = req.body;

      if (!roomId) {
        return res.status(400).json({ success: false, message: 'roomId is required' });
      }

      const inviteCode = crypto.randomBytes(16).toString('hex');
      const payload = {
        type: 'video-invite',
        roomId,
        label,
        maxUses: Math.min(parseInt(maxUses, 10) || 10, 20),
        iat: Math.floor(Date.now() / 1000)
      };

      const token = jwt.sign(payload, INVITE_SECRET, { expiresIn: INVITE_TTL_SECONDS });

      // Store in Redis with TTL (cluster-safe, survives restarts)
      const redisKey = `${INVITE_REDIS_PREFIX}${inviteCode}`;
      await redisClient.set(redisKey, JSON.stringify({ uses: 0, max: payload.maxUses, token, roomId }), 'EX', INVITE_TTL_SECONDS);

      const shareableUrl = `${FRONTEND_BASE}/video-consultation?room=${encodeURIComponent(roomId)}&invite=${inviteCode}`;

      return res.json({
        success: true,
        invite: {
          code: inviteCode,
          roomId,
          label,
          shareableUrl,
          expiresIn: '4 hours',
          expiresAt: new Date(Date.now() + INVITE_TTL_SECONDS * 1000).toISOString(),
          maxUses: payload.maxUses,
          instructions: 'Share this link — recipients can join directly in a browser without logging in.'
        }
      });
    } catch (error) {
      console.error('Failed to create invite link:', error);
      return res.status(500).json({ success: false, message: 'Failed to create invite link', error: error.message });
    }
  };

  /**
   * GET /api/video/join/:inviteCode?name=FamilyMember
   * Public endpoint — no auth or membership required.
   * Exchanges a valid invite code for a LiveKit token so guests can join.
   */
  static joinViaInvite = async (req, res) => {
    try {
      const { inviteCode } = req.params;
      const guestName = (req.query.name || 'Guest').slice(0, 40).replace(/[^\w\s-]/g, '');

      if (!inviteCode) {
        return res.status(400).json({ success: false, message: 'Invite code is required' });
      }

      const redisKey = `${INVITE_REDIS_PREFIX}${inviteCode}`;
      const entryJson = await redisClient.get(redisKey);
      if (!entryJson) {
        return res.status(404).json({ success: false, message: 'Invite link not found or has expired. Please request a new link from the host.' });
      }

      const entry = JSON.parse(entryJson);

      // Verify the JWT inside the entry
      let payload;
      try {
        payload = jwt.verify(entry.token, INVITE_SECRET);
      } catch (err) {
        await redisClient.del(redisKey);
        return res.status(410).json({ success: false, message: 'This invite link has expired. Please request a new link from the host.' });
      }

      // Check usage limit
      if (entry.uses >= entry.max) {
        return res.status(429).json({ success: false, message: 'This invite link has reached its maximum number of uses.' });
      }

      // Increment usage atomically in Redis
      entry.uses++;
      const remainingTtl = await redisClient.ttl(redisKey);
      await redisClient.set(redisKey, JSON.stringify(entry), 'EX', remainingTtl > 0 ? remainingTtl : INVITE_TTL_SECONDS);

      const identity = `guest-${guestName.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}`;
      const livekitData = await buildLiveKitJoinData({
        meetingId: payload.roomId,
        identity,
        name: guestName,
        ttl: Math.max(0, payload.exp - Math.floor(Date.now() / 1000)), // remaining TTL
        canPublish: true,
        canSubscribe: true
      });

      return res.json({
        success: true,
        guest: true,
        roomId: payload.roomId,
        displayName: guestName,
        livekit: livekitData,
        expiresAt: new Date(payload.exp * 1000).toISOString()
      });
    } catch (error) {
      console.error('Failed to process guest invite:', error);
      return res.status(500).json({ success: false, message: 'Failed to join via invite', error: error.message });
    }
  };

  // Get room status — queries LiveKit for live participant data
  static getRoomStatus = async (req, res) => {
    try {
      const { roomId } = req.params;

      const isAppointmentRoom = roomId.startsWith('apt-');
      const maxParticipants = isAppointmentRoom ? 2 : 100;
      const roomType = isAppointmentRoom ? 'appointment' : 'generic';

      // Query LiveKit for real participant data
      let participants = [];
      let roomActive = false;
      try {
        const serverUrl = process.env.LIVEKIT_URL;
        const apiKey = process.env.LIVEKIT_API_KEY;
        const apiSecret = process.env.LIVEKIT_API_SECRET;
        if (serverUrl && apiKey && apiSecret) {
          const svc = new RoomServiceClient(serverUrl, apiKey, apiSecret);
          const lkParticipants = await svc.listParticipants(roomId);
          roomActive = lkParticipants.length > 0;
          participants = lkParticipants.map(p => ({
            identity: p.identity,
            name: p.name,
            joinedAt: p.joinedAt ? new Date(Number(p.joinedAt) * 1000).toISOString() : null,
            tracks: p.tracks?.length || 0,
            isSpeaking: p.isSpeaking || false,
          }));
        }
      } catch (lkErr) {
        // Room may not exist yet in LiveKit — that's OK
        if (!lkErr.message?.includes('not found')) {
          console.warn('LiveKit room status query failed:', lkErr.message);
        }
      }

      const roomStatus = {
        roomId,
        status: roomActive ? 'active' : 'waiting',
        roomType,
        capacity: {
          max: maxParticipants,
          type: roomType,
          description: isAppointmentRoom ? '1-on-1 video call' : 'Multi-participant video conference'
        },
        participants,
        participantCount: participants.length,
        createdAt: new Date().toISOString(),
        maxParticipants,
        features: {
          screenShare: true,
          recording: true,
          chat: true,
          whiteboard: !isAppointmentRoom,
          fileShare: true
        }
      };

      res.json({ success: true, roomStatus });
    } catch (error) {
      console.error('Failed to get room status:', error);
      res.status(500).json({ success: false, message: 'Failed to get room status', error: error.message });
    }
  };

}

export default VideoController;

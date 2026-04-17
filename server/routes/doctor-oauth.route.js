import express from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import jwt from 'jsonwebtoken';
import Doctor from '../models/doctor.model.intelligent.js';
import { processOAuthProfilePicture } from '../utils/oauth-profile-picture.js';
import { JWT_CONFIG } from '../config/auth.config.js';

const router = express.Router();

/**
 * Doctor OAuth2 Configuration
 * Separate strategies for doctor authentication
 */

// Configure Google Strategy for Doctors
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  const googleDoctorStrategy = new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_DOCTOR_CALLBACK_URL || 'https://app.mediqzy.com/api/auth/doctor/google/callback',
      scope: ['profile', 'email']
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        console.log('🔵 Doctor Google OAuth callback received:', profile.id);
        const doctor = await findOrCreateDoctor(profile, 'google');
        return done(null, { doctor, accessToken, refreshToken });
      } catch (error) {
        console.error('Doctor Google OAuth error:', error);
        return done(error, null);
      }
    }
  );
  passport.use('google-doctor', googleDoctorStrategy);
} else {
  console.warn('⚠️  Google OAuth not configured for doctors - skipping Google strategy');
}

// Configure Facebook Strategy for Doctors
if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
  const facebookDoctorStrategy = new FacebookStrategy(
    {
      clientID: process.env.FACEBOOK_APP_ID,
      clientSecret: process.env.FACEBOOK_APP_SECRET,
      callbackURL: process.env.FACEBOOK_DOCTOR_CALLBACK_URL || 'https://app.mediqzy.com/api/auth/doctor/facebook/callback',
      profileFields: ['id', 'emails', 'name', 'picture.type(large)'],
      scope: ['email', 'public_profile']
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        console.log('🔵 Doctor Facebook OAuth callback received:', profile.id);
        const doctor = await findOrCreateDoctor(profile, 'facebook');
        return done(null, { doctor, accessToken, refreshToken });
      } catch (error) {
        console.error('Doctor Facebook OAuth error:', error);
        return done(error, null);
      }
    }
  );
  passport.use('facebook-doctor', facebookDoctorStrategy);
} else {
  console.warn('⚠️  Facebook OAuth not configured for doctors - skipping Facebook strategy');
}

/**
 * Find or create doctor from OAuth profile
 */
async function findOrCreateDoctor(profile, provider) {
  try {
    const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
    
    if (!email) {
      throw new Error(`No email provided by ${provider}`);
    }
    
    // Check if doctor exists with this OAuth ID
    const oauthIdField = `${provider}Id`;
    let doctor = await Doctor.findOne({ where: { [oauthIdField]: profile.id } });
    
    // If not, check if doctor exists with this email
    if (!doctor) {
      doctor = await Doctor.findOne({ where: { email } });
      
      if (doctor) {
        // Link OAuth account to existing doctor
        console.log(`🔗 Linking ${provider} account to existing doctor: ${email}`);
        await doctor.update({ [oauthIdField]: profile.id });
      }
    }
    
    // Download and save profile picture for existing doctor
    let profileImagePath = null;
    if (doctor) {
      profileImagePath = await processOAuthProfilePicture(profile, doctor.id, provider);
      if (profileImagePath) {
        await doctor.update({ profileImage: profileImagePath });
        console.log(`✅ Updated doctor profile picture from ${provider} for doctor ${doctor.id}`);
      }
    }
    
    // If still no doctor, create new one
    if (!doctor) {
      console.log(`✨ Creating new doctor from ${provider} OAuth: ${email}`);
      
      const firstName = profile.name?.givenName || profile.displayName?.split(' ')[0] || 'Doctor';
      const lastName = profile.name?.familyName || profile.displayName?.split(' ').slice(1).join(' ') || '';
      
      // Generate a random password
      const randomPassword = Math.random().toString(36).slice(-12) + 'A1!';
      
      doctor = await Doctor.create({
        email,
        password: randomPassword,
        firstName,
        lastName,
        prefix: 'Dr',
        [oauthIdField]: profile.id,
        oauthProvider: provider,
        emailVerified: true,
        phoneNumber: '',
        specialization: 'General Practitioner', // Default, will be updated
        experience: 0,
        qualifications: [],
        status: 'active',
        isAvailable: true
      });
      
      // Download and save profile picture for new doctor
      profileImagePath = await processOAuthProfilePicture(profile, doctor.id, provider);
      if (profileImagePath) {
        await doctor.update({ profileImage: profileImagePath });
        console.log(`✅ Saved doctor profile picture from ${provider} for new doctor ${doctor.id}`);
      }
    }
    
    return doctor;
  } catch (error) {
    console.error(`Error in findOrCreateDoctor (${provider}):`, error);
    throw error;
  }
}

/**
 * Generate JWT token for doctor
 * FIXED: Use JWT_SECRET and include required id/role fields for authDoctor middleware
 */
function generateDoctorToken(doctor) {
  const payload = {
    id: doctor.id,             // Required for authDoctor middleware
    doctorId: doctor.doctorId || doctor.id,
    email: doctor.email,
    role: 'doctor',            // Required for authUser/authDoctor middleware
    userType: 'doctor',
    firstName: doctor.firstName,
    lastName: doctor.lastName,
    specialization: doctor.specialization
  };
  
  return jwt.sign(payload, JWT_CONFIG.SECRET || process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
}

/**
 * Handle successful OAuth authentication
 */
function handleOAuthSuccess(req, res, doctorData, provider) {
  try {
    const { doctor } = doctorData;
    
    // Generate JWT token
    const token = generateDoctorToken(doctor);
    
    console.log(`✅ Doctor ${provider} OAuth successful for: ${doctor.email}`);
    
    // Redirect to frontend with token
    const redirectUrl = process.env.NODE_ENV === 'production'
      ? `https://app.mediqzy.com/oauth-callback?token=${token}&userType=doctor&provider=${provider}`
      : `http://localhost:3001/oauth-callback?token=${token}&userType=doctor&provider=${provider}`;
    
    res.redirect(redirectUrl);
  } catch (error) {
    console.error(`Error handling doctor ${provider} OAuth success:`, error);
    const errorUrl = process.env.NODE_ENV === 'production'
      ? `https://app.mediqzy.com/doctor/login?error=oauth_failed&provider=${provider}`
      : `http://localhost:3001/doctor/login?error=oauth_failed&provider=${provider}`;
    res.redirect(errorUrl);
  }
}

// ==================== GOOGLE OAUTH2 FOR DOCTORS ====================

router.get(
  '/google',
  passport.authenticate('google-doctor', { 
    scope: ['profile', 'email'],
    session: false 
  })
);

router.get(
  '/google/callback',
  passport.authenticate('google-doctor', { 
    session: false,
    failureRedirect: '/doctor/login?error=google_auth_failed'
  }),
  (req, res) => {
    handleOAuthSuccess(req, res, req.user, 'google');
  }
);

// ==================== FACEBOOK OAUTH2 FOR DOCTORS ====================

router.get(
  '/facebook',
  passport.authenticate('facebook-doctor', { 
    scope: ['email', 'public_profile'],
    session: false 
  })
);

router.get(
  '/facebook/callback',
  passport.authenticate('facebook-doctor', { 
    session: false,
    failureRedirect: '/doctor/login?error=facebook_auth_failed'
  }),
  (req, res) => {
    handleOAuthSuccess(req, res, req.user, 'facebook');
  }
);

// ==================== OAUTH STATUS ENDPOINT ====================

router.get('/oauth/status', (req, res) => {
  const baseUrl = process.env.NODE_ENV === 'production'
    ? 'https://app.mediqzy.com'
    : 'http://localhost:8000';
  
  res.json({
    google: {
      configured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      url: `${baseUrl}/api/auth/doctor/google`,
      enabled: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
    },
    facebook: {
      configured: !!(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET),
      url: `${baseUrl}/api/auth/doctor/facebook`,
      enabled: !!(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET)
    }
  });
});

export default router;

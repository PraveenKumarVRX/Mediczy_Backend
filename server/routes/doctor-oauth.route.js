import express from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import Doctor from '../models/doctor.model.intelligent.js';
import { processOAuthProfilePicture } from '../utils/oauth-profile-picture.js';
import { issuePortalTokenPair } from '../services/token-revocation.service.js';

const router = express.Router();

const DOCTOR_MOBILE_REDIRECT_SCHEMES = (process.env.DOCTOR_OAUTH_MOBILE_REDIRECT_SCHEMES || 'mediqzydoctor://oauth-callback,mysmarthealth://oauth-callback')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const toQueryString = (params = {}) =>
  Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');

const isAllowedDoctorMobileRedirectUri = (uri = '') =>
  DOCTOR_MOBILE_REDIRECT_SCHEMES.some((allowed) => uri.startsWith(allowed));

const buildDoctorMobileState = (req) => {
  const mobileRedirectUri = String(req.query.mobile_redirect_uri || '').trim();
  const clientState = String(req.query.state || '').trim();

  if (!mobileRedirectUri || !isAllowedDoctorMobileRedirectUri(mobileRedirectUri)) {
    return null;
  }

  const payload = {
    mobileRedirectUri,
    clientState: clientState || undefined,
    source: 'doctor-mobile',
  };

  return Buffer.from(JSON.stringify(payload)).toString('base64url');
};

const parseDoctorMobileState = (state) => {
  if (!state) return null;

  try {
    const decoded = Buffer.from(String(state), 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded);
    if (parsed?.mobileRedirectUri && isAllowedDoctorMobileRedirectUri(parsed.mobileRedirectUri)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
};

const buildDoctorOAuthSuccessRedirect = ({ req, provider, token, refreshToken, expiresIn }) => {
  const mobileState = parseDoctorMobileState(req.query.state);

  if (mobileState?.mobileRedirectUri) {
    const params = {
      token,
      refreshToken,
      expiresIn,
      userType: 'doctor',
      provider,
      state: mobileState.clientState,
    };

    return `${mobileState.mobileRedirectUri}${mobileState.mobileRedirectUri.includes('?') ? '&' : '?'}${toQueryString(params)}`;
  }

  return process.env.NODE_ENV === 'production'
    ? `https://app.mediqzy.com/oauth-callback?token=${token}&userType=doctor&provider=${provider}`
    : `http://localhost:3001/oauth-callback?token=${token}&userType=doctor&provider=${provider}`;
};

const buildDoctorOAuthErrorRedirect = ({ req, provider, error = 'oauth_failed' }) => {
  const mobileState = parseDoctorMobileState(req.query.state);
  if (mobileState?.mobileRedirectUri) {
    const params = {
      error,
      provider,
      state: mobileState.clientState,
    };
    return `${mobileState.mobileRedirectUri}${mobileState.mobileRedirectUri.includes('?') ? '&' : '?'}${toQueryString(params)}`;
  }

  return process.env.NODE_ENV === 'production'
    ? `https://app.mediqzy.com/doctor/login?error=${error}&provider=${provider}`
    : `http://localhost:3001/doctor/login?error=${error}&provider=${provider}`;
};

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
 * Handle successful OAuth authentication
 */
async function handleOAuthSuccess(req, res, doctorData, provider) {
  try {
    const { doctor } = doctorData;
    const deviceFp = req.headers['x-device-fingerprint'] || null;
    const { accessToken: token, refreshToken } = await issuePortalTokenPair(
      { id: doctor.id, email: doctor.email, role: 'doctor' },
      { portal: 'doctor', deviceFp }
    );
    const expiresIn = 900;
    
    console.log(`✅ Doctor ${provider} OAuth successful for: ${doctor.email}`);
    
    // Redirect to frontend with token
    const redirectUrl = buildDoctorOAuthSuccessRedirect({ req, provider, token, refreshToken, expiresIn });
    
    res.redirect(redirectUrl);
  } catch (error) {
    console.error(`Error handling doctor ${provider} OAuth success:`, error);
    const errorUrl = buildDoctorOAuthErrorRedirect({ req, provider, error: 'oauth_failed' });
    res.redirect(errorUrl);
  }
}

// ==================== GOOGLE OAUTH2 FOR DOCTORS ====================

router.get(
  '/google',
  (req, res, next) => {
    const state = buildDoctorMobileState(req);
    const options = {
      scope: ['profile', 'email'],
      session: false,
      ...(state ? { state } : {}),
    };
    return passport.authenticate('google-doctor', options)(req, res, next);
  }
);

router.get(
  '/google/callback',
  (req, res, next) => {
    passport.authenticate('google-doctor', { session: false }, async (err, authResult) => {
      if (err || !authResult) {
        const errorUrl = buildDoctorOAuthErrorRedirect({ req, provider: 'google', error: 'auth_failed' });
        return res.redirect(errorUrl);
      }
      req.user = authResult;
      await handleOAuthSuccess(req, res, req.user, 'google');
    })(req, res, next);
  }
);

// ==================== FACEBOOK OAUTH2 FOR DOCTORS ====================

router.get(
  '/facebook',
  (req, res, next) => {
    const state = buildDoctorMobileState(req);
    const options = {
      scope: ['email', 'public_profile'],
      session: false,
      ...(state ? { state } : {}),
    };
    return passport.authenticate('facebook-doctor', options)(req, res, next);
  }
);

router.get(
  '/facebook/callback',
  (req, res, next) => {
    passport.authenticate('facebook-doctor', { session: false }, async (err, authResult) => {
      if (err || !authResult) {
        const errorUrl = buildDoctorOAuthErrorRedirect({ req, provider: 'facebook', error: 'auth_failed' });
        return res.redirect(errorUrl);
      }
      req.user = authResult;
      await handleOAuthSuccess(req, res, req.user, 'facebook');
    })(req, res, next);
  }
);

// ==================== OAUTH STATUS ENDPOINT ====================

router.get('/oauth/status', (req, res) => {
  const baseUrl = process.env.NODE_ENV === 'production'
    ? 'https://app.mediqzy.com'
    : 'http://localhost:8000';
  
  res.json({
    mobileRedirectSchemes: DOCTOR_MOBILE_REDIRECT_SCHEMES,
    google: {
      configured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      url: `${baseUrl}/api/auth/doctor/google`,
      mobileUrl: `${baseUrl}/api/auth/doctor/google?mobile_redirect_uri=${encodeURIComponent(DOCTOR_MOBILE_REDIRECT_SCHEMES[0] || 'mediqzydoctor://oauth-callback')}`,
      enabled: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
    },
    facebook: {
      configured: !!(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET),
      url: `${baseUrl}/api/auth/doctor/facebook`,
      mobileUrl: `${baseUrl}/api/auth/doctor/facebook?mobile_redirect_uri=${encodeURIComponent(DOCTOR_MOBILE_REDIRECT_SCHEMES[0] || 'mediqzydoctor://oauth-callback')}`,
      enabled: !!(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET)
    }
  });
});

export default router;

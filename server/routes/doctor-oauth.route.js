import express from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import Doctor from '../models/doctor.model.intelligent.js';
import { processOAuthProfilePicture } from '../utils/oauth-profile-picture.js';
import { issuePortalTokenPair } from '../services/token-revocation.service.js';
import { generateOAuthPassword, isOAuthEmailVerified } from '../utils/oauth-security.js';
import redis from '../config/redis.js';
import { signState, verifyState, createHandoff, pkceRequired, isValidChallenge } from '../services/oauth-handoff.service.js';

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

const appendQuery = (uri, params) => `${uri}${uri.includes('?') ? '&' : '?'}${toQueryString(params)}`;
const doctorWebBase = () => (process.env.NODE_ENV === 'production' ? 'https://app.mediqzy.com' : 'http://localhost:3001');

/**
 * Signed round-trip state for a doctor sign-in (audit M20; same scheme as the
 * patient router, services/oauth-handoff.service.js). PKCE is accepted for the
 * doctor app (mobile_redirect_uri) and for the web portal; with it the callback
 * hands over a one-time code, never a token.
 * Returns { state } | { state: null } (legacy web) | { error, mobileRedirectUri, clientState }.
 */
const buildDoctorMobileState = (req) => {
  const mobileRedirectUri = String(req.query.mobile_redirect_uri || '').trim();
  const clientState = String(req.query.state || '').trim();
  const isMobile = Boolean(mobileRedirectUri) && isAllowedDoctorMobileRedirectUri(mobileRedirectUri);
  const target = isMobile ? mobileRedirectUri : null;
  const codeChallenge = String(req.query.code_challenge || '').trim();
  const method = String(req.query.code_challenge_method || 'S256').trim();

  if (codeChallenge) {
    if (method !== 'S256' || !isValidChallenge(codeChallenge)) return { error: 'invalid_pkce', mobileRedirectUri: target, clientState };
    if (!clientState) return { error: 'state_required', mobileRedirectUri: target, clientState };
  } else if (isMobile && pkceRequired()) {
    return { error: 'pkce_required', mobileRedirectUri, clientState };
  }
  if (!isMobile && !codeChallenge) return { state: null };

  return {
    state: signState({
      mobileRedirectUri: target || undefined,
      clientState: clientState || undefined,
      codeChallenge: codeChallenge || undefined,
      source: isMobile ? 'doctor-mobile' : 'doctor-web',
    }),
  };
};

const parseDoctorMobileState = (state) => {
  const payload = verifyState(state);
  if (!payload) return null;
  if (payload.mobileRedirectUri && !isAllowedDoctorMobileRedirectUri(payload.mobileRedirectUri)) return null;
  return payload;
};

const doctorStartErrorRedirect = ({ error, mobileRedirectUri, clientState, provider }) => (mobileRedirectUri
  ? appendQuery(mobileRedirectUri, { error, provider, state: clientState })
  : `${doctorWebBase()}/doctor/login?error=${error}&provider=${provider}`);

const buildDoctorOAuthSuccessRedirect = ({ req, provider, token, refreshToken, expiresIn }) => {
  const mobileState = parseDoctorMobileState(req.query.state);

  if (mobileState?.mobileRedirectUri && !mobileState.codeChallenge) {
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
    
    const emailVerified = isOAuthEmailVerified(profile);

    // Check if doctor exists with this OAuth ID
    const oauthIdField = `${provider}Id`;
    let doctor = await Doctor.findOne({ where: { [oauthIdField]: profile.id } });
    
    // If not, check if doctor exists with this email
    if (!doctor) {
      const existingByEmail = await Doctor.findOne({ where: { email } });

      if (existingByEmail) {
        // SECURITY: only auto-link a social identity to an existing account when
        // the provider asserts the email is verified. Otherwise an attacker
        // could create a provider account carrying this email and hijack the
        // existing doctor account on first sign-in. Facebook does not assert
        // verification, so such links are refused.
        if (!emailVerified) {
          throw new Error(
            `${provider} did not verify this email, so it cannot be linked to the existing account. Please sign in with your password and link ${provider} from settings.`
          );
        }
        console.log(`🔗 Linking ${provider} account to existing doctor: ${email}`);
        doctor = existingByEmail;
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
      
      // Cryptographically strong placeholder password (login is via OAuth)
      const randomPassword = generateOAuthPassword();
      
      doctor = await Doctor.create({
        email,
        password: randomPassword,
        firstName,
        lastName,
        prefix: 'Dr',
        [oauthIdField]: profile.id,
        oauthProvider: provider,
        emailVerified,
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
    const handoffState = parseDoctorMobileState(req.query.state);
    // Without PKCE there are no tokens once PKCE is required (mobile and web).
    if (!handoffState?.codeChallenge && pkceRequired()) {
      return res.redirect(buildDoctorOAuthErrorRedirect({ req, provider, error: 'pkce_required' }));
    }
    const deviceFp = req.headers['x-device-fingerprint'] || null;
    const { accessToken: token, refreshToken } = await issuePortalTokenPair(
      { id: doctor.id, email: doctor.email, role: 'doctor' },
      { portal: 'doctor', deviceFp }
    );
    const expiresIn = 900;
    
    console.log(`✅ Doctor ${provider} OAuth successful for: ${doctor.email}`);
    
    // PKCE hand-off: a one-time code in the link, redeemed at POST /api/auth/oauth/exchange.
    if (handoffState?.codeChallenge) {
      const code = await createHandoff({
        tokens: { token, refreshToken, expiresIn, userType: 'doctor', provider },
        codeChallenge: handoffState.codeChallenge,
      }, redis);
      const target = handoffState.mobileRedirectUri || `${doctorWebBase()}/oauth-callback`;
      return res.redirect(appendQuery(target, { code, provider, state: handoffState.clientState }));
    }

    // Legacy: token in the link — only until OAUTH_REQUIRE_PKCE=true.
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
    const { state, error, mobileRedirectUri, clientState } = buildDoctorMobileState(req);
    if (error) return res.redirect(doctorStartErrorRedirect({ error, mobileRedirectUri, clientState, provider: 'google' }));
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
    const { state, error, mobileRedirectUri, clientState } = buildDoctorMobileState(req);
    if (error) return res.redirect(doctorStartErrorRedirect({ error, mobileRedirectUri, clientState, provider: 'facebook' }));
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

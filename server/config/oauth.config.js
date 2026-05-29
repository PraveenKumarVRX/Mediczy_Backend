import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// Ensure env vars are loaded before reading them (guards against ESM hoisting)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
if (process.env.NODE_ENV !== 'production' || process.env.DOTENV_IN_PROD === 'true') {
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
}

import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import { User } from '../models/user.model.intelligent.js';
import { processOAuthProfilePicture } from '../utils/oauth-profile-picture.js';

/**
 * OAuth2 Configuration for Mediczy
 * 
 * Supports:
 * - Google OAuth2
 * - Facebook OAuth2
 * 
 * Features:
 * - Automatic user creation/linking
 * - Profile photo sync
 * - Email verification via OAuth
 */

// OAuth2 Configuration
const config = {
  google: {
    clientID: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:8000/api/auth/google/callback',
    scope: ['profile', 'email']
  },
  facebook: {
    clientID: process.env.FACEBOOK_APP_ID || '',
    clientSecret: process.env.FACEBOOK_APP_SECRET || '',
    callbackURL: process.env.FACEBOOK_CALLBACK_URL || 'http://localhost:8000/api/auth/facebook/callback',
    profileFields: ['id', 'emails', 'name', 'picture.type(large)'],
    scope: ['email', 'public_profile']
  }
};

/**
 * Find or create user from OAuth profile
 */
async function findOrCreateUser(profile, provider) {
  try {
    const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
    
    if (!email) {
      throw new Error(`No email provided by ${provider}`);
    }
    
    // Check if user exists with this OAuth ID
    const oauthIdField = `${provider}Id`;
    let user = await User.findOne({ where: { [oauthIdField]: profile.id } });
    
    // If not, check if user exists with this email
    if (!user) {
      user = await User.findOne({ where: { email } });
      
      if (user) {
        // Link OAuth account to existing user
        console.log(`🔗 Linking ${provider} account to existing user: ${email}`);
        await user.update({ [oauthIdField]: profile.id });
      }
    }
    
    // Download and save profile picture
    let profileImagePath = null;
    if (user) {
      profileImagePath = await processOAuthProfilePicture(profile, user.id, provider);
      if (profileImagePath) {
        await user.update({ profileImage: profileImagePath });
        console.log(`✅ Updated profile picture from ${provider} for user ${user.id}`);
      }
    }
    
    // If still no user, create new one
    if (!user) {
      console.log(`✨ Creating new user from ${provider} OAuth: ${email}`);
      
      const firstName = profile.name?.givenName || profile.displayName?.split(' ')[0] || 'User';
      const lastName = profile.name?.familyName || profile.displayName?.split(' ').slice(1).join(' ') || '';
      
      // Generate a random password (user won't use it, can reset if needed)
      const randomPassword = Math.random().toString(36).slice(-12) + 'A1!';
      
      user = await User.create({
        email,
        password: randomPassword,
        firstName,
        lastName,
        [oauthIdField]: profile.id,
        oauthProvider: provider,
        emailVerified: true, // OAuth emails are pre-verified
        phoneNumber: '', // Will be added by user later
        dateOfBirth: new Date('1990-01-01'), // Placeholder, will be updated by user
        gender: 'Other', // Will be updated by user
        status: 'active'
      });
      
      // Download and save profile picture for new user
      profileImagePath = await processOAuthProfilePicture(profile, user.id, provider);
      if (profileImagePath) {
        await user.update({ profileImage: profileImagePath });
        console.log(`✅ Saved profile picture from ${provider} for new user ${user.id}`);
      }
    }
    
    return user;
  } catch (error) {
    console.error(`Error in findOrCreateUser (${provider}):`, error);
    throw error;
  }
}

/**
 * Configure Google OAuth2 Strategy
 */
if (config.google.clientID && config.google.clientSecret) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: config.google.clientID,
        clientSecret: config.google.clientSecret,
        callbackURL: config.google.callbackURL,
        scope: config.google.scope
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          console.log('🔵 Google OAuth callback received:', profile.id);
          const user = await findOrCreateUser(profile, 'google');
          return done(null, { user, accessToken, refreshToken });
        } catch (error) {
          console.error('Google OAuth error:', error);
          return done(error, null);
        }
      }
    )
  );
  console.log('✅ Google OAuth2 strategy configured');
} else {
  console.warn('⚠️ Google OAuth2 not configured (missing credentials)');
}

/**
 * Configure Facebook OAuth2 Strategy
 */
if (config.facebook.clientID && config.facebook.clientSecret) {
  passport.use(
    new FacebookStrategy(
      {
        clientID: config.facebook.clientID,
        clientSecret: config.facebook.clientSecret,
        callbackURL: config.facebook.callbackURL,
        profileFields: config.facebook.profileFields,
        scope: config.facebook.scope
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          console.log('🔵 Facebook OAuth callback received:', profile.id);
          const user = await findOrCreateUser(profile, 'facebook');
          return done(null, { user, accessToken, refreshToken });
        } catch (error) {
          console.error('Facebook OAuth error:', error);
          return done(error, null);
        }
      }
    )
  );
  console.log('✅ Facebook OAuth2 strategy configured');
} else {
  console.warn('⚠️ Facebook OAuth2 not configured (missing credentials)');
}

/**
 * Serialize user for session (if using sessions)
 */
passport.serializeUser((userData, done) => {
  done(null, userData.user.id);
});

/**
 * Deserialize user from session (if using sessions)
 */
passport.deserializeUser(async (userId, done) => {
  try {
    const user = await User.findByPk(userId);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

export default passport;
export { config };

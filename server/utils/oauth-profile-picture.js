/**
 * OAuth Profile Picture Utility
 * Downloads profile pictures from OAuth providers and saves locally
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Download and save OAuth profile picture
 * @param {string} photoUrl - URL of the profile photo from OAuth provider
 * @param {number} userId - User ID for filename
 * @param {string} provider - OAuth provider (google, facebook)
 * @returns {Promise<string>} - Local file path or null
 */
export async function downloadOAuthProfilePicture(photoUrl, userId, provider) {
  try {
    if (!photoUrl) {
      console.log('⚠️ No profile photo URL provided');
      return null;
    }

    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(__dirname, '..', 'uploads', 'profiles');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const hash = crypto.createHash('md5').update(`${userId}_${provider}_${timestamp}`).digest('hex').substring(0, 8);
    const extension = 'jpg'; // Most OAuth photos are JPEG
    const filename = `oauth_${provider}_${userId}_${hash}.${extension}`;
    const filepath = path.join(uploadsDir, filename);

    // Download the image
    console.log(`📥 Downloading ${provider} profile picture for user ${userId}...`);
    const response = await axios({
      method: 'get',
      url: photoUrl,
      responseType: 'stream',
      timeout: 10000, // 10 second timeout
      headers: {
        'User-Agent': 'Mediczy/1.0'
      }
    });

    // Save to file
    const writer = fs.createWriteStream(filepath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        console.log(`✅ Profile picture saved: ${filename}`);
        // Return relative path for database
        resolve(`/uploads/profiles/${filename}`);
      });
      writer.on('error', (error) => {
        console.error(`❌ Error saving profile picture:`, error);
        reject(error);
      });
    });

  } catch (error) {
    console.error(`❌ Error downloading ${provider} profile picture:`, error.message);
    return null;
  }
}

/**
 * Get high-quality Google profile picture URL
 * @param {object} profile - Google OAuth profile
 * @returns {string|null} - High-quality photo URL
 */
export function getGoogleProfilePictureUrl(profile) {
  if (!profile.photos || !profile.photos[0]) {
    return null;
  }

  let photoUrl = profile.photos[0].value;
  
  // Google photos come with size parameter (s96-c by default)
  // Remove size parameter to get original or set to larger size
  if (photoUrl.includes('googleusercontent.com')) {
    // Remove existing size parameter and add s400 for 400x400 image
    photoUrl = photoUrl.replace(/=s\d+-c/, '=s400-c');
    // If no size parameter exists, add it
    if (!photoUrl.includes('=s')) {
      photoUrl = photoUrl.replace(/\/photo\.jpg/, '/photo.jpg=s400-c');
    }
  }

  return photoUrl;
}

/**
 * Get high-quality Facebook profile picture URL
 * @param {object} profile - Facebook OAuth profile
 * @returns {string|null} - High-quality photo URL
 */
export function getFacebookProfilePictureUrl(profile) {
  // Facebook profile with picture.type(large) field
  if (profile.photos && profile.photos[0]) {
    return profile.photos[0].value;
  }

  // Fallback: construct URL from profile ID
  if (profile.id) {
    // Request 400x400 image
    return `https://graph.facebook.com/${profile.id}/picture?type=large&width=400&height=400`;
  }

  return null;
}

/**
 * Process OAuth profile picture
 * Downloads and saves locally, returns local path
 * @param {object} profile - OAuth profile
 * @param {number} userId - User ID
 * @param {string} provider - OAuth provider
 * @returns {Promise<string|null>} - Local file path or null
 */
export async function processOAuthProfilePicture(profile, userId, provider) {
  try {
    let photoUrl = null;

    switch (provider.toLowerCase()) {
      case 'google':
        photoUrl = getGoogleProfilePictureUrl(profile);
        break;
      case 'facebook':
        photoUrl = getFacebookProfilePictureUrl(profile);
        break;
      default:
        console.warn(`⚠️ Unknown OAuth provider: ${provider}`);
        return null;
    }

    if (!photoUrl) {
      console.log(`⚠️ No profile picture available from ${provider}`);
      return null;
    }

    // Download and save the picture
    const localPath = await downloadOAuthProfilePicture(photoUrl, userId, provider);
    return localPath;

  } catch (error) {
    console.error(`Error processing ${provider} profile picture:`, error);
    return null;
  }
}

export default {
  downloadOAuthProfilePicture,
  getGoogleProfilePictureUrl,
  getFacebookProfilePictureUrl,
  processOAuthProfilePicture
};

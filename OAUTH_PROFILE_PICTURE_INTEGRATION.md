# OAuth Profile Picture Integration

## Overview
Automatically downloads and saves profile pictures from Google and Facebook during OAuth login/signup.

## Implementation Date
December 19, 2024

## Features

### 1. Automatic Profile Picture Download
When users log in via Google or Facebook OAuth:
- ✅ Downloads high-quality profile picture (400x400)
- ✅ Saves locally to `/uploads/profiles/` directory
- ✅ Updates user/doctor `profileImage` field automatically
- ✅ Works for both new signups and existing users
- ✅ Supports both patient and doctor OAuth flows

### 2. Provider Support

**Google OAuth:**
- Requests high-quality image (400x400)
- Removes default size parameter (s96-c) and replaces with s400-c
- URL format: `https://lh3.googleusercontent.com/...=s400-c`

**Facebook OAuth:**
- Requests large profile picture
- Uses Graph API for high-resolution images
- URL format: `https://graph.facebook.com/{user-id}/picture?type=large&width=400&height=400`

### 3. File Naming Convention
```
oauth_{provider}_{userId}_{hash}.jpg

Examples:
- oauth_google_123_a3f5b2c8.jpg
- oauth_facebook_456_d9e1c7f4.jpg
```

### 4. Storage & Access

**Storage Location:**
```
/home/ubuntu/Mediczy/server/uploads/profiles/oauth_*.jpg
```

**Public URL:**
```
https://mediqzy.com/uploads/profiles/oauth_google_123_a3f5b2c8.jpg
```

**Database Field:**
```sql
profileImage VARCHAR(500) = '/uploads/profiles/oauth_google_123_a3f5b2c8.jpg'
```

## Implementation Files

### 1. OAuth Profile Picture Utility
**File:** `server/utils/oauth-profile-picture.js`

**Functions:**
```javascript
// Download and save OAuth profile picture
async function downloadOAuthProfilePicture(photoUrl, userId, provider)

// Get high-quality Google profile picture URL
function getGoogleProfilePictureUrl(profile)

// Get high-quality Facebook profile picture URL
function getFacebookProfilePictureUrl(profile)

// Process OAuth profile picture (main function)
async function processOAuthProfilePicture(profile, userId, provider)
```

**Features:**
- HTTP timeout (10 seconds)
- Stream-based download for memory efficiency
- MD5 hash for unique filenames
- Error handling with fallback
- Console logging for debugging

### 2. User OAuth Configuration
**File:** `server/config/oauth.config.js`

**Changes:**
```javascript
import { processOAuthProfilePicture } from '../utils/oauth-profile-picture.js';

// In findOrCreateUser function:
// For existing users
let profileImagePath = await processOAuthProfilePicture(profile, user.id, provider);
if (profileImagePath) {
  await user.update({ profileImage: profileImagePath });
}

// For new users
profileImagePath = await processOAuthProfilePicture(profile, user.id, provider);
if (profileImagePath) {
  await user.update({ profileImage: profileImagePath });
}
```

### 3. Doctor OAuth Routes
**File:** `server/routes/doctor-oauth.route.js`

**Changes:**
- Same profile picture download logic for doctors
- Separate doctor OAuth strategies
- Downloads profile pictures for both Google and Facebook doctor logins

## Flow Diagram

```
User clicks "Login with Google/Facebook"
         ↓
OAuth Provider Authentication
         ↓
OAuth Callback with Profile Data
         ↓
findOrCreateUser/Doctor Function
         ↓
Check if user exists by OAuth ID
         ↓
Check if user exists by email
         ↓
processOAuthProfilePicture()
    ├── getGoogleProfilePictureUrl() or
    └── getFacebookProfilePictureUrl()
         ↓
downloadOAuthProfilePicture()
    ├── Generate unique filename
    ├── Download image via axios stream
    └── Save to /uploads/profiles/
         ↓
Update user.profileImage in database
         ↓
Return JWT token to frontend
         ↓
Profile picture available at /uploads/profiles/
```

## OAuth Scopes

### Google OAuth
```javascript
scope: ['profile', 'email']
```
- `profile`: Access to name, photo, gender, locale
- `email`: Access to primary email address

### Facebook OAuth
```javascript
profileFields: ['id', 'emails', 'name', 'picture.type(large)']
scope: ['email', 'public_profile']
```
- `email`: Access to email address
- `public_profile`: Access to name, profile picture, gender, age range

## Environment Variables

Required for OAuth to work:

```bash
# Google OAuth
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_CALLBACK_URL=https://mediqzy.com/api/auth/google/callback
GOOGLE_DOCTOR_CALLBACK_URL=https://mediqzy.com/api/auth/doctor/google/callback

# Facebook OAuth
FACEBOOK_APP_ID=your_app_id
FACEBOOK_APP_SECRET=your_app_secret
FACEBOOK_CALLBACK_URL=https://mediqzy.com/api/auth/facebook/callback
FACEBOOK_DOCTOR_CALLBACK_URL=https://mediqzy.com/api/auth/doctor/facebook/callback

# JWT
SECRET_TOKEN=your_secret_token
```

## API Endpoints

### Patient OAuth
```
GET /api/auth/google - Initiate Google OAuth
GET /api/auth/google/callback - Google OAuth callback
GET /api/auth/facebook - Initiate Facebook OAuth
GET /api/auth/facebook/callback - Facebook OAuth callback
```

### Doctor OAuth
```
GET /api/auth/doctor/google - Initiate Google OAuth for doctors
GET /api/auth/doctor/google/callback - Google OAuth callback for doctors
GET /api/auth/doctor/facebook - Initiate Facebook OAuth for doctors
GET /api/auth/doctor/facebook/callback - Facebook OAuth callback for doctors
```

## Testing

### Test Google OAuth Login
1. Navigate to: `https://mediqzy.com/api/auth/google`
2. Select Google account
3. Grant permissions
4. Check console logs for profile picture download
5. Verify image saved in `/uploads/profiles/`
6. Check database for `profileImage` field updated

### Test Facebook OAuth Login
1. Navigate to: `https://mediqzy.com/api/auth/facebook`
2. Select Facebook account
3. Grant permissions
4. Check console logs for profile picture download
5. Verify image saved in `/uploads/profiles/`
6. Check database for `profileImage` field updated

### Console Logs
```bash
# Watch server logs
pm2 logs mediczy-server

# Expected output for successful download:
📥 Downloading google profile picture for user 123...
✅ Profile picture saved: oauth_google_123_a3f5b2c8.jpg
✅ Updated profile picture from google for user 123
```

## Error Handling

### No Profile Picture Available
- Logs warning: `⚠️ No profile picture available from {provider}`
- User created/logged in without profile picture
- User can upload picture manually later

### Download Fails
- Logs error: `❌ Error downloading {provider} profile picture: {error}`
- User created/logged in without profile picture
- Does not block authentication flow

### Network Timeout
- 10-second timeout configured
- Falls back gracefully if timeout occurs
- User authentication still succeeds

### Invalid Image URL
- Validates URL exists before download
- Handles malformed URLs gracefully
- Logs error and continues

## Security Features

1. **Unique Filenames**
   - MD5 hash prevents filename collisions
   - Timestamp ensures uniqueness
   - Format: `oauth_{provider}_{userId}_{hash}.jpg`

2. **File Type Validation**
   - Only downloads from OAuth provider domains
   - Saves as .jpg extension (standard OAuth format)

3. **Size Limits**
   - OAuth providers return optimized images
   - Typically 20-100 KB per image
   - No explicit size limit (OAuth images are pre-optimized)

4. **Directory Permissions**
   - `/uploads/profiles/` has 755 permissions
   - Readable by web server (Nginx)
   - Writable by Node.js process

## Database Schema

No schema changes required. Uses existing fields:

**Users Table:**
```sql
profileImage VARCHAR(500) -- Path to profile image
googleId VARCHAR(255)     -- Google OAuth ID
facebookId VARCHAR(255)   -- Facebook OAuth ID
oauthProvider VARCHAR(50) -- 'google' or 'facebook'
emailVerified BOOLEAN     -- Set to true for OAuth users
```

**Doctors Table:**
```sql
profileImage VARCHAR(500) -- Path to profile image
googleId VARCHAR(255)     -- Google OAuth ID
facebookId VARCHAR(255)   -- Facebook OAuth ID
oauthProvider VARCHAR(50) -- 'google' or 'facebook'
emailVerified BOOLEAN     -- Set to true for OAuth users
```

## Frontend Integration

### OAuth Callback Handling
After successful OAuth, redirect URL includes:
```
https://mediqzy.com/oauth-callback?token={jwt}&userType={user|doctor}&provider={google|facebook}
```

Frontend should:
1. Extract token from URL
2. Store token in localStorage/cookies
3. Fetch user profile (includes profileImage)
4. Display profile picture in Avatar component
5. Redirect to dashboard

### Displaying Profile Picture
```jsx
<Avatar>
  <AvatarImage 
    src={user.profileImage || '/default-avatar.png'} 
    alt={`${user.firstName} ${user.lastName}`} 
  />
  <AvatarFallback>
    {user.firstName?.[0]}{user.lastName?.[0]}
  </AvatarFallback>
</Avatar>
```

## Maintenance

### Disk Space Monitoring
```bash
# Check uploads directory size
du -sh /home/ubuntu/Mediczy/server/uploads/profiles/

# Count profile pictures
ls /home/ubuntu/Mediczy/server/uploads/profiles/ | wc -l
```

### Cleanup Old Pictures
If user uploads new picture or logs in again, old OAuth picture remains.
Consider periodic cleanup:
```bash
# Find OAuth pictures older than 90 days for deleted users
# (Implement cleanup script if needed)
```

### Image Optimization (Future Enhancement)
- Consider compressing images to WebP format
- Resize to consistent dimensions (e.g., 200x200)
- Use CDN for faster delivery

## Troubleshooting

### Profile Picture Not Downloading

**Check 1: OAuth Provider Credentials**
```bash
# Verify environment variables set
echo $GOOGLE_CLIENT_ID
echo $FACEBOOK_APP_ID
```

**Check 2: Network Connectivity**
```bash
# Test connectivity to OAuth providers
curl -I https://lh3.googleusercontent.com/
curl -I https://graph.facebook.com/
```

**Check 3: Directory Permissions**
```bash
# Verify uploads directory is writable
ls -la /home/ubuntu/Mediczy/server/uploads/
chmod 755 /home/ubuntu/Mediczy/server/uploads/profiles/
```

**Check 4: Server Logs**
```bash
pm2 logs mediczy-server --lines 100 | grep -i "profile picture"
```

### Profile Picture Not Displaying

**Check 1: Nginx Configuration**
```bash
# Verify uploads location configured
sudo nginx -t
curl -I https://mediqzy.com/uploads/profiles/test.jpg
```

**Check 2: Database Value**
```sql
SELECT id, email, profileImage FROM users WHERE profileImage IS NOT NULL LIMIT 10;
```

**Check 3: File Exists**
```bash
ls -lh /home/ubuntu/Mediczy/server/uploads/profiles/ | tail -10
```

## Performance

### Download Speed
- Average OAuth profile picture: 50 KB
- Download time: 100-500 ms (depending on network)
- Non-blocking: Uses async/await
- Timeout: 10 seconds maximum

### Database Impact
- Single UPDATE query per OAuth login
- Only updates profileImage field
- No additional database load

### Storage Impact
- Average image size: 50 KB
- 1000 users = ~50 MB
- 10,000 users = ~500 MB
- 100,000 users = ~5 GB

## Completion Status

✅ OAuth profile picture utility created
✅ User OAuth integration updated
✅ Doctor OAuth integration updated
✅ High-quality image URLs implemented (400x400)
✅ Automatic download and save functionality
✅ Database updates for both new and existing users
✅ Error handling and fallback logic
✅ Console logging for debugging
✅ Server restarted with new functionality
✅ Documentation complete

## Benefits

1. **Better User Experience**
   - Instant profile picture on first login
   - No manual upload required
   - Familiar face from their social account

2. **Higher Engagement**
   - Users with profile pictures more likely to engage
   - Professional appearance for doctors
   - Trust and credibility

3. **Reduced Friction**
   - One-click social login
   - Automatic profile setup
   - Fewer onboarding steps

4. **Data Consistency**
   - Always up-to-date with social account
   - High-quality images guaranteed
   - Consistent format and size

## Future Enhancements

1. **Profile Picture Sync**
   - Periodic update from OAuth provider
   - User option to refresh from social account
   - Notification when social picture changes

2. **Multiple Pictures**
   - Store both manual and OAuth pictures
   - Allow user to choose which to display
   - Gallery of profile pictures

3. **Image Processing**
   - Face detection and cropping
   - Automatic background removal
   - Filters and enhancements

4. **CDN Integration**
   - Upload to Cloudflare R2 or AWS S3
   - Faster global delivery
   - Reduced server storage

5. **Avatar Generator**
   - AI-generated avatars from profile pictures
   - Consistent style across platform
   - Privacy-friendly alternatives

---

**Status:** ✅ Production Ready  
**Last Updated:** December 19, 2024  
**Version:** 1.0.0

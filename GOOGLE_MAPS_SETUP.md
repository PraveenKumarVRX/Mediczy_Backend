# Google Maps API Setup Guide

## Current Status
✅ API Key configured: `AIzaSyAuYgocNCvsNuf8uW6G43vdSw74TYraXb4`
❌ APIs not enabled in Google Cloud Console

## Required Actions

### 1. Enable Places API in Google Cloud Console

The API key is valid but needs the Places API enabled. Choose **ONE** of these options:

#### Option A: Enable New Places API (Recommended)
1. Visit: https://console.cloud.google.com/apis/library/places.googleapis.com
2. Click "Enable API"
3. Wait 2-3 minutes for propagation
4. Test endpoint: `curl "http://localhost:8000/api/places/nearby?lat=12.9716&lng=77.5946&type=hospital"`

#### Option B: Enable Legacy Places API
1. Visit: https://console.cloud.google.com/apis/library/places-backend.googleapis.com
2. Click "Enable API"
3. Wait 2-3 minutes for propagation
4. Test endpoint

**Note:** Google is deprecating legacy APIs. Use the New Places API for future compatibility.

### 2. Verify API Key Restrictions (Optional)

Check API key restrictions at:
https://console.cloud.google.com/apis/credentials

Ensure:
- **Application restrictions**: Set to your domain or "None" for testing
- **API restrictions**: Include "Places API" or "Places API (New)"

## Current Configuration

### Backend
- **File:** `/root/Mediczy/server/.env`
- **Variable:** `GOOGLE_MAPS_API_KEY=AIzaSyAuYgocNCvsNuf8uW6G43vdSw74TYraXb4`
- **Endpoint:** `/api/places/nearby`
- **Fallback:** Tries New API first, then Legacy API

### Frontend
- **File:** `/root/Mediczy/client/.env`
- **Variable:** `VITE_GOOGLE_MAPS_API_KEY=AIzaSyAuYgocNCvsNuf8uW6G43vdSw74TYraXb4`
- **Usage:** Direct Google Maps JavaScript API in browser

## Testing

After enabling the API, test with:

```bash
# Test nearby hospitals in Bangalore
curl "http://localhost:8000/api/places/nearby?lat=12.9716&lng=77.5946&type=hospital"

# Expected response (success):
{
  "status": "OK",
  "results": [...],
  "api_version": "new" or "legacy"
}
```

## Troubleshooting

### Error: "REQUEST_DENIED"
- API not enabled → Enable Places API in console
- API key restrictions → Check key restrictions allow your domain/IP

### Error: "PERMISSION_DENIED"
- New Places API not enabled → Enable or wait for propagation
- Backend automatically falls back to legacy API

### Error: "OVER_QUERY_LIMIT"
- Free quota exceeded → Upgrade billing plan or wait for quota reset

## Google Cloud Console Links

- **Project Dashboard:** https://console.cloud.google.com/apis/dashboard?project=336463424171
- **Places API (New):** https://console.cloud.google.com/apis/library/places.googleapis.com
- **Places API (Legacy):** https://console.cloud.google.com/apis/library/places-backend.googleapis.com
- **API Credentials:** https://console.cloud.google.com/apis/credentials

## Implementation Details

### Backend Code
- **Route:** `/root/Mediczy/server/routes/places.js`
- **Logic:** 
  1. Try New Places API with POST request
  2. If 403/not enabled, fallback to Legacy API with GET request
  3. Transform responses to unified format

### Frontend Integration
- Maps rendered using Google Maps JavaScript API
- Uses `VITE_GOOGLE_MAPS_API_KEY` for client-side requests
- Emergency page shows nearby hospitals on map

## Next Steps

1. ✅ API key added to server `.env`
2. ✅ Backend route configured with fallback
3. ⏳ **ACTION REQUIRED:** Enable Places API in Google Cloud Console
4. ⏳ Test endpoint after API is enabled
5. ⏳ Verify map functionality in frontend

---

**Last Updated:** $(date)
**Project:** Mediczy Production
**Environment:** /root/Mediczy

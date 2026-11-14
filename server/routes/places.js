import express from 'express';
import axios from '../integrations/axios.js';
import { nearbyFromDatabase, supportsType } from '../services/nearby-places.service.js';

const router = express.Router();

/**
 * Serve the request from our own geocoded hospitals/labs. Returns true when it
 * answered, false when this type has no local source and the caller should
 * carry on to Google (or report the original failure).
 */
async function serveFromDatabase(res, { lat, lng, type, reason }) {
  if (!supportsType(type)) return false;
  try {
    const results = await nearbyFromDatabase(Number(lat), Number(lng), type);
    if (!results) return false;
    res.json({ status: 'OK', results, api_version: 'local', source: 'mediczy-directory', fallback_reason: reason });
    return true;
  } catch (error) {
    console.error('Nearby places local lookup failed:', error.message);
    return false;
  }
}

router.get('/nearby', async (req, res) => {
  try {
    const { lat, lng, type } = req.query;

    if (!lat || !lng || !type) {
      return res.status(400).json({ error: 'Missing required parameters: lat, lng, type' });
    }
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
      return res.status(400).json({ error: 'lat and lng must be numbers' });
    }

    // No Google key: answer from our own directory rather than 503. This
    // endpoint used to fail outright whenever GOOGLE_MAPS_API_KEY was unset,
    // which is why the app's Find Hospital screen showed no distances.
    if (!process.env.GOOGLE_MAPS_API_KEY) {
      if (await serveFromDatabase(res, { lat, lng, type, reason: 'google_maps_api_key_not_configured' })) return;
      return res.status(503).json({
        error: 'Google Maps API not configured',
        message: 'Please configure GOOGLE_MAPS_API_KEY in environment variables'
      });
    }

    console.log('Fetching nearby places with params:', { lat, lng, type });

    // Try new API first, fallback to legacy if not enabled
    try {
      const response = await axios.post(
        'https://places.googleapis.com/v1/places:searchNearby',
        {
          includedTypes: [type === 'hospital' ? 'hospital' : type],
          maxResultCount: 20,
          locationRestriction: {
            circle: {
              center: {
                latitude: parseFloat(lat),
                longitude: parseFloat(lng)
              },
              radius: 5000.0
            }
          }
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY,
            'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.types,places.nationalPhoneNumber,places.businessStatus'
          }
        }
      );

      const transformedResults = (response.data.places || []).map(place => ({
        name: place.displayName?.text || 'Unknown',
        vicinity: place.formattedAddress || '',
        geometry: {
          location: {
            lat: place.location?.latitude || 0,
            lng: place.location?.longitude || 0
          }
        },
        rating: place.rating || 0,
        user_ratings_total: place.userRatingCount || 0,
        types: place.types || [],
        business_status: place.businessStatus || 'OPERATIONAL',
        formatted_phone_number: place.nationalPhoneNumber || ''
      }));

      return res.json({
        status: 'OK',
        results: transformedResults,
        api_version: 'new'
      });
    } catch (newApiError) {
      // Log the new API error for debugging
      console.log('New Places API error:', newApiError.response?.status, newApiError.response?.data || newApiError.message);
      console.log('Falling back to legacy API');
      
      const response = await axios.get(
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json`,
        {
          params: {
            location: `${lat},${lng}`,
            radius: '5000',
            type: type,
            key: process.env.GOOGLE_MAPS_API_KEY,
          },
        }
      );

      if (response.data.status === 'REQUEST_DENIED') {
        console.error('Google Places API request denied:', response.data.error_message);
        if (await serveFromDatabase(res, { lat, lng, type, reason: 'google_request_denied' })) return;
        return res.status(500).json({
          error: 'Google Places API request denied',
          details: response.data.error_message,
          help: 'Enable Places API in Google Cloud Console: https://console.cloud.google.com/apis/library/places-backend.googleapis.com'
        });
      }

      res.json({
        ...response.data,
        api_version: 'legacy'
      });
    }
  } catch (error) {
    console.error('Error fetching nearby places:', error.response?.data || error.message);
    // Google is unreachable or erroring — our own directory still answers.
    const { lat, lng, type } = req.query;
    if (lat && lng && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
        && await serveFromDatabase(res, { lat, lng, type, reason: 'google_request_failed' })) return;
    res.status(500).json({
      error: 'Failed to fetch nearby places',
      details: error.response?.data || error.message
    });
  }
});

export default router; 
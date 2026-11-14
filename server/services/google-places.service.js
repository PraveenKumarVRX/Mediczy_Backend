import * as places from '../integrations/google-places.js';
import { IntegrationError } from '../integrations/core/integration.js';

/**
 * Google Places API Service
 * Handles address autocomplete, geocoding, and place details.
 *
 * Calls go through the integration layer (integrations/google-places.js):
 * timeout, retry, circuit breaker, kill switch INTEGRATION_GOOGLE_PLACES_ENABLED.
 *
 * Invented addresses are a development convenience only. In production a
 * missing key or a Google failure raises IntegrationError (503), which the
 * routes pass on — before 2026-11-14 production silently returned
 * "123 MG Road, Bangalore" with coordinates, and that could be saved as a
 * patient's address for a home collection or an ambulance.
 */

const mockAllowed = () => process.env.NODE_ENV !== 'production'
  && String(process.env.GOOGLE_PLACES_ALLOW_MOCK ?? 'true').toLowerCase() !== 'false';

/** In development, fall back to the fixtures; in production, surface the failure. */
function fallbackOrThrow(error, label, mock) {
  if (mockAllowed()) {
    console.warn(`[google-places] ${label}: ${error.code || error.message} — returning development fixture`);
    return mock();
  }
  if (error instanceof IntegrationError) throw error;
  throw new IntegrationError('INTEGRATION_UNAVAILABLE', 'Address lookup is unavailable right now.', { integration: 'google-places' });
}

class GooglePlacesService {
  /**
   * Autocomplete address search
   * @param {string} input - User's search query
   * @param {object} options - Additional options (types, location, radius)
   * @returns {Promise<Array>} Array of place predictions
   */
  async autocomplete(input, options = {}) {
    const params = {
      input,
      types: options.types || 'address',
      language: options.language || 'en',
    };
    if (options.location) {
      params.location = `${options.location.lat},${options.location.lng}`;
      params.radius = options.radius || 50000; // 50km default
    }
    if (options.components) params.components = options.components; // e.g. 'country:in'
    try {
      const predictions = await places.autocomplete(params);
      return predictions.map((prediction) => ({
        placeId: prediction.place_id,
        description: prediction.description,
        mainText: prediction.structured_formatting?.main_text || '',
        secondaryText: prediction.structured_formatting?.secondary_text || '',
        types: prediction.types,
      }));
    } catch (error) {
      return fallbackOrThrow(error, 'autocomplete', () => this.getMockAutocomplete(input));
    }
  }

  /**
   * Get place details by Place ID
   * @param {string} placeId - Google Place ID
   * @returns {Promise<object>} Place details with address components
   */
  async getPlaceDetails(placeId) {
    try {
      const place = await places.placeDetails({
        place_id: placeId,
        fields: 'address_components,formatted_address,geometry,place_id,types,name',
      });
      if (!place) throw new IntegrationError('INTEGRATION_REJECTED', 'That place could not be found.', { status: 404, integration: 'google-places' });
      return this.parseGooglePlace(place);
    } catch (error) {
      return fallbackOrThrow(error, 'place details', () => this.getMockPlaceDetails(placeId));
    }
  }

  /**
   * Geocode an address string
   * @param {string} address - Address to geocode
   * @returns {Promise<object>} Geocoded address with coordinates
   */
  async geocode(address) {
    try {
      const [place] = await places.geocode({ address });
      if (!place) throw new IntegrationError('INTEGRATION_REJECTED', 'That address could not be located.', { status: 404, integration: 'google-places' });
      return this.parseGooglePlace(place);
    } catch (error) {
      return fallbackOrThrow(error, 'geocode', () => this.getMockGeocode(address));
    }
  }

  /**
   * Reverse geocode coordinates to address
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @returns {Promise<object>} Address details
   */
  async reverseGeocode(lat, lng) {
    try {
      const [place] = await places.geocode({ latlng: `${lat},${lng}` });
      if (!place) throw new IntegrationError('INTEGRATION_REJECTED', 'No address found for that location.', { status: 404, integration: 'google-places' });
      return this.parseGooglePlace(place);
    } catch (error) {
      return fallbackOrThrow(error, 'reverse geocode', () => this.getMockGeocode(`${lat},${lng}`));
    }
  }

  /**
   * Parse Google Place response into standardized format
   * @param {object} place - Google Place object
   * @returns {object} Parsed address data
   */
  parseGooglePlace(place) {
    const addressComponents = {};
    
    if (place.address_components) {
      place.address_components.forEach(component => {
        const types = component.types;
        
        if (types.includes('street_number')) {
          addressComponents.streetNumber = component.long_name;
        }
        if (types.includes('route')) {
          addressComponents.route = component.long_name;
        }
        if (types.includes('locality')) {
          addressComponents.city = component.long_name;
        }
        if (types.includes('administrative_area_level_1')) {
          addressComponents.state = component.long_name;
        }
        if (types.includes('postal_code')) {
          addressComponents.zipCode = component.long_name;
        }
        if (types.includes('country')) {
          addressComponents.country = component.long_name;
          addressComponents.countryCode = component.short_name;
        }
        if (types.includes('sublocality') || types.includes('sublocality_level_1')) {
          addressComponents.sublocality = component.long_name;
        }
      });
    }

    // Build street address
    let street = '';
    if (addressComponents.streetNumber) {
      street = addressComponents.streetNumber;
    }
    if (addressComponents.route) {
      street = street ? `${street} ${addressComponents.route}` : addressComponents.route;
    }
    if (!street && addressComponents.sublocality) {
      street = addressComponents.sublocality;
    }

    return {
      placeId: place.place_id,
      formattedAddress: place.formatted_address,
      street: street || '',
      city: addressComponents.city || '',
      state: addressComponents.state || '',
      zipCode: addressComponents.zipCode || '',
      country: addressComponents.country || '',
      countryCode: addressComponents.countryCode || '',
      latitude: place.geometry?.location?.lat || null,
      longitude: place.geometry?.location?.lng || null,
      placeData: {
        name: place.name,
        types: place.types,
        addressComponents: place.address_components
      }
    };
  }

  /**
   * Mock autocomplete for testing without API key
   */
  getMockAutocomplete(input) {
    const mockAddresses = [
      {
        placeId: 'mock_place_1',
        description: '123 MG Road, Bangalore, Karnataka, India',
        mainText: '123 MG Road',
        secondaryText: 'Bangalore, Karnataka, India',
        types: ['street_address']
      },
      {
        placeId: 'mock_place_2',
        description: 'Koramangala, Bangalore, Karnataka, India',
        mainText: 'Koramangala',
        secondaryText: 'Bangalore, Karnataka, India',
        types: ['sublocality']
      },
      {
        placeId: 'mock_place_3',
        description: 'HSR Layout, Bangalore, Karnataka, India',
        mainText: 'HSR Layout',
        secondaryText: 'Bangalore, Karnataka, India',
        types: ['sublocality']
      }
    ];

    return mockAddresses.filter(addr => 
      addr.description.toLowerCase().includes(input.toLowerCase())
    );
  }

  /**
   * Mock place details for testing without API key
   */
  getMockPlaceDetails(placeId) {
    return {
      placeId: placeId,
      formattedAddress: '123 MG Road, Bangalore, Karnataka 560001, India',
      street: '123 MG Road',
      city: 'Bangalore',
      state: 'Karnataka',
      zipCode: '560001',
      country: 'India',
      countryCode: 'IN',
      latitude: 12.9716,
      longitude: 77.5946,
      placeData: {
        name: 'MG Road',
        types: ['street_address'],
        addressComponents: []
      }
    };
  }

  /**
   * Mock geocode for testing without API key
   */
  getMockGeocode(address) {
    return {
      placeId: 'mock_geocode_' + Date.now(),
      formattedAddress: typeof address === 'string' ? address : '123 MG Road, Bangalore, Karnataka 560001, India',
      street: '123 MG Road',
      city: 'Bangalore',
      state: 'Karnataka',
      zipCode: '560001',
      country: 'India',
      countryCode: 'IN',
      latitude: 12.9716,
      longitude: 77.5946,
      placeData: {
        name: 'Sample Address',
        types: ['street_address'],
        addressComponents: []
      }
    };
  }
}

export default new GooglePlacesService();

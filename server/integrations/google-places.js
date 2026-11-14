/**
 * Google Places & Geocoding on the integration core — the reference example
 * for moving a vendor onto the layer.
 *
 * Returns Google's raw `results`/`predictions`; mapping to Mediqzy's address
 * shape stays in services/google-places.service.js. A Google status other
 * than OK/ZERO_RESULTS is an IntegrationError, never an empty or invented
 * answer: REQUEST_DENIED / OVER_QUERY_LIMIT mean the vendor is not serving us.
 */
import { googlePlaces } from './catalog.js';
import { IntegrationError } from './core/integration.js';

const BASE = 'https://maps.googleapis.com/maps/api';

async function googleGet(path, query, { fetchImpl } = {}) {
  const key = process.env.GOOGLE_GEOCODING_API_KEY && path.startsWith('/geocode')
    ? process.env.GOOGLE_GEOCODING_API_KEY
    : process.env.GOOGLE_PLACES_API_KEY;
  const { body } = await googlePlaces.fetchJson(`${BASE}${path}`, { query: { ...query, key }, fetchImpl });
  const status = body?.status;
  if (status === 'OK' || status === 'ZERO_RESULTS') return body;
  throw new IntegrationError(
    status === 'INVALID_REQUEST' ? 'INTEGRATION_REJECTED' : 'INTEGRATION_UPSTREAM_ERROR',
    `Google Places answered ${status || 'without a status'}.`,
    { status: status === 'INVALID_REQUEST' ? 400 : 503, integration: 'google-places' },
  );
}

export const autocomplete = (params, opts) => googleGet('/place/autocomplete/json', params, opts).then((b) => b.predictions || []);
export const placeDetails = (params, opts) => googleGet('/place/details/json', params, opts).then((b) => b.result || null);
export const geocode = (params, opts) => googleGet('/geocode/json', params, opts).then((b) => b.results || []);

export default { autocomplete, placeDetails, geocode };

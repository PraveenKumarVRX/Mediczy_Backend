import dotenv from 'dotenv';
import googlePlacesService from '../services/google-places.service.js';
import doctorModel from '../models/doctor.model.intelligent.js';

dotenv.config();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const toFiniteNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const normalizeClinicAddressJson = (existingJson = {}, updates = {}) => {
  const out = { ...(existingJson && typeof existingJson === 'object' ? existingJson : {}) };
  Object.assign(out, updates);
  return out;
};

const hasGoogleVerified = (json = {}) => {
  const placeId = json.placeId || json.place_id || json.googlePlaceId || json.google_place_id || '';
  const provider = String(json.provider || json.source || '').toLowerCase();
  const verificationStatus = String(json.verificationStatus || '').toLowerCase();
  const lat = toFiniteNumber(json.lat ?? json.latitude);
  const lng = toFiniteNumber(json.lng ?? json.longitude ?? json.lon);

  return Boolean(String(placeId).trim()) ||
    (provider.startsWith('google') && verificationStatus === 'verified') ||
    (provider.startsWith('google') && lat !== null && lng !== null);
};

const pickAddressText = (doctor) => {
  const clinicAddress = typeof doctor.clinicAddress === 'string' ? doctor.clinicAddress.trim() : '';
  if (clinicAddress) return clinicAddress;

  const j = doctor.clinicAddress_json && typeof doctor.clinicAddress_json === 'object' ? doctor.clinicAddress_json : {};
  const parts = [
    j.formattedAddress,
    j.line1,
    j.street,
    j.city,
    j.state,
    j.pincode || j.zipCode,
    j.country
  ].filter(Boolean);
  return parts.join(', ').trim();
};

const mapPlaceToClinicJson = (placeDetails = {}, existing = {}) => {
  const next = normalizeClinicAddressJson(existing, {
    placeId: placeDetails.placeId || existing.placeId || existing.place_id || existing.googlePlaceId || existing.google_place_id,
    place_id: placeDetails.placeId || existing.place_id || existing.placeId,
    googlePlaceId: placeDetails.placeId || existing.googlePlaceId || existing.placeId,
    google_place_id: placeDetails.placeId || existing.google_place_id || existing.placeId,
    formattedAddress: placeDetails.formattedAddress || existing.formattedAddress,
    line1: placeDetails.street || existing.line1 || existing.street,
    street: placeDetails.street || existing.street || existing.line1,
    city: placeDetails.city || existing.city,
    state: placeDetails.state || existing.state,
    pincode: placeDetails.zipCode || existing.pincode || existing.zipCode,
    zipCode: placeDetails.zipCode || existing.zipCode || existing.pincode,
    country: placeDetails.country || existing.country,
    countryCode: placeDetails.countryCode || existing.countryCode,
    latitude: toFiniteNumber(placeDetails.latitude) ?? toFiniteNumber(existing.latitude) ?? toFiniteNumber(existing.lat),
    longitude: toFiniteNumber(placeDetails.longitude) ?? toFiniteNumber(existing.longitude) ?? toFiniteNumber(existing.lng) ?? toFiniteNumber(existing.lon),
    source: 'google_places',
    provider: 'google_places',
    verificationStatus: 'verified',
    verifiedAt: new Date().toISOString()
  });

  if (toFiniteNumber(next.latitude) !== null) {
    next.lat = toFiniteNumber(next.latitude);
  }
  if (toFiniteNumber(next.longitude) !== null) {
    next.lng = toFiniteNumber(next.longitude);
  }

  return next;
};

async function run() {
  const dryRun = process.argv.includes('--dry-run');
  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? Math.max(1, parseInt(limitArg.split('=')[1], 10) || 1000) : 1000;

  const doctors = await doctorModel.findAll({
    where: {
      status: 'active',
      isVerified: true
    },
    attributes: ['id', 'clinicAddress', 'clinicAddress_json', 'inPersonConsultationFee'],
    order: [['id', 'DESC']],
    limit
  });

  let scanned = 0;
  let alreadyVerified = 0;
  let skippedNoAddress = 0;
  let skippedGeocodeFailed = 0;
  let updated = 0;
  const updatedIds = [];

  for (const doctor of doctors) {
    scanned += 1;
    const plain = doctor.get ? doctor.get({ plain: true }) : doctor;
    const existingJson = plain.clinicAddress_json && typeof plain.clinicAddress_json === 'object' ? plain.clinicAddress_json : {};

    if (hasGoogleVerified(existingJson)) {
      alreadyVerified += 1;
      continue;
    }

    const addressText = pickAddressText(plain);
    if (!addressText) {
      skippedNoAddress += 1;
      continue;
    }

    let placeDetails;
    try {
      placeDetails = await googlePlacesService.geocode(addressText);
      await sleep(120);
    } catch {
      skippedGeocodeFailed += 1;
      continue;
    }

    const placeId = placeDetails?.placeId;
    if (!placeId) {
      skippedGeocodeFailed += 1;
      continue;
    }

    const nextClinicJson = mapPlaceToClinicJson(placeDetails, existingJson);
    const nextClinicAddress = placeDetails.formattedAddress || plain.clinicAddress || addressText;

    if (!dryRun) {
      await doctorModel.update(plain.id, {
        clinicAddress: nextClinicAddress,
        clinicAddress_json: nextClinicJson
      });
    }

    updated += 1;
    updatedIds.push(plain.id);
  }

  console.log(JSON.stringify({
    dryRun,
    scanned,
    alreadyVerified,
    skippedNoAddress,
    skippedGeocodeFailed,
    updated,
    updatedIds
  }, null, 2));
}

run().catch((error) => {
  console.error('Backfill failed:', error?.message || error);
  process.exit(1);
});

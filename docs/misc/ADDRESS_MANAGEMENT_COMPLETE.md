# User Address Management with Google Places API - Complete ✅

## Feature Overview

User profiles now support **multiple addresses** with **Google Places API integration**, allowing users to save addresses with labels like **home**, **office**, and **other**.

## Features Implemented

### 1. **Address Model** (`server/models/address.model.intelligent.js`)

Complete address management with:
- **Multiple addresses per user**
- **Google Place ID** for geocoding
- **Geographic coordinates** (latitude/longitude)
- **Address components** (street, city, state, zip, country)
- **Custom labels** (home, office, other)
- **Default address** flag
- **Delivery instructions** and landmarks
- **Soft delete** (addresses marked inactive instead of deleted)

### 2. **Google Places Service** (`server/services/google-places.service.js`)

Integration with Google Places API:
- **Address Autocomplete** - Search and suggest addresses
- **Place Details** - Get complete address from Place ID
- **Geocoding** - Convert address to coordinates
- **Reverse Geocoding** - Convert coordinates to address
- **Mock data fallback** when API key not configured

### 3. **Address API Endpoints** (`server/routes/address.route.js`)

#### Address Management:
- `GET /api/addresses` - Get all user addresses
- `GET /api/addresses/:id` - Get specific address
- `GET /api/addresses/default` - Get default address
- `POST /api/addresses` - Add new address
- `PUT /api/addresses/:id` - Update address
- `PUT /api/addresses/:id/set-default` - Set as default
- `DELETE /api/addresses/:id` - Delete address (soft delete)

#### Google Places Integration:
- `GET /api/addresses/autocomplete?input=query` - Address search
- `GET /api/addresses/place/:placeId` - Get place details

## API Documentation

### 1. Address Autocomplete

**Endpoint:** `GET /api/addresses/autocomplete`

**Query Parameters:**
- `input` (required) - Search query (min 3 characters)
- `country` (optional) - Country code filter (e.g., "in" for India)

**Example Request:**
```bash
GET /api/addresses/autocomplete?input=koramangala&country=in
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "placeId": "ChIJ...",
      "description": "Koramangala, Bangalore, Karnataka, India",
      "mainText": "Koramangala",
      "secondaryText": "Bangalore, Karnataka, India",
      "types": ["sublocality"]
    }
  ]
}
```

### 2. Get Place Details

**Endpoint:** `GET /api/addresses/place/:placeId`

**Example Request:**
```bash
GET /api/addresses/place/ChIJbU60yXAWrjsR4E9-UejD3_g
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "placeId": "ChIJ...",
    "formattedAddress": "123 MG Road, Bangalore, Karnataka 560001, India",
    "street": "123 MG Road",
    "city": "Bangalore",
    "state": "Karnataka",
    "zipCode": "560001",
    "country": "India",
    "countryCode": "IN",
    "latitude": 12.9716,
    "longitude": 77.5946
  }
}
```

### 3. Add New Address

**Endpoint:** `POST /api/addresses`

**Request Body:**
```json
{
  "placeId": "ChIJbU60yXAWrjsR4E9-UejD3_g",
  "formattedAddress": "123 MG Road, Bangalore, Karnataka 560001, India",
  "street": "123 MG Road",
  "street2": "Apartment 5B",
  "city": "Bangalore",
  "state": "Karnataka",
  "zipCode": "560001",
  "country": "India",
  "countryCode": "IN",
  "latitude": 12.9716,
  "longitude": 77.5946,
  "label": "home",
  "landmark": "Near Cubbon Park",
  "deliveryInstructions": "Ring the doorbell twice",
  "isDefault": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Address added successfully",
  "data": {
    "id": 1,
    "userId": 36,
    "label": "home",
    "isDefault": true,
    "formattedAddress": "123 MG Road, Bangalore, Karnataka 560001, India",
    "street": "123 MG Road",
    "city": "Bangalore",
    "latitude": "12.97160000",
    "longitude": "77.59460000",
    "landmark": "Near Cubbon Park",
    "deliveryInstructions": "Ring the doorbell twice"
  }
}
```

### 4. Get All Addresses

**Endpoint:** `GET /api/addresses`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "label": "home",
      "isDefault": true,
      "formattedAddress": "123 MG Road, Bangalore, Karnataka 560001, India",
      "street": "123 MG Road",
      "city": "Bangalore"
    },
    {
      "id": 2,
      "label": "office",
      "isDefault": false,
      "formattedAddress": "Koramangala, Bangalore, Karnataka 560095, India"
    }
  ]
}
```

### 5. Get Default Address

**Endpoint:** `GET /api/addresses/default`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "label": "home",
    "isDefault": true,
    "formattedAddress": "123 MG Road, Bangalore, Karnataka 560001, India"
  }
}
```

### 6. Update Address

**Endpoint:** `PUT /api/addresses/:id`

**Request Body:**
```json
{
  "landmark": "Opposite to Coffee Day",
  "deliveryInstructions": "Call before delivery",
  "label": "home"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Address updated successfully",
  "data": {
    "id": 1,
    "landmark": "Opposite to Coffee Day",
    "deliveryInstructions": "Call before delivery"
  }
}
```

### 7. Set as Default

**Endpoint:** `PUT /api/addresses/:id/set-default`

**Response:**
```json
{
  "success": true,
  "message": "Address set as default successfully"
}
```

### 8. Delete Address

**Endpoint:** `DELETE /api/addresses/:id`

**Response:**
```json
{
  "success": true,
  "message": "Address deleted successfully"
}
```

**Note:** Addresses are soft-deleted (marked as inactive). If the deleted address was default, another address is automatically set as default.

## Database Schema

**Table:** `addresses`

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| userId | INTEGER | Foreign key to users |
| label | STRING(50) | Address label (home/office/other) |
| isDefault | BOOLEAN | Default address flag |
| placeId | STRING(255) | Google Place ID |
| formattedAddress | TEXT | Complete formatted address |
| street | STRING(255) | Street address line 1 |
| street2 | STRING(255) | Street address line 2 |
| city | STRING(100) | City name |
| state | STRING(100) | State/Province |
| zipCode | STRING(20) | Postal/ZIP code |
| country | STRING(100) | Country name |
| countryCode | STRING(2) | ISO country code |
| latitude | DECIMAL(10,8) | Latitude |
| longitude | DECIMAL(11,8) | Longitude |
| landmark | STRING(255) | Nearby landmark |
| deliveryInstructions | TEXT | Special instructions |
| placeData | JSONB | Google Places data |
| isActive | BOOLEAN | Active status |
| createdAt | TIMESTAMP | Creation time |
| updatedAt | TIMESTAMP | Last update time |

**Indexes:**
- userId (for user queries)
- placeId (for geocoding)
- isDefault (for default lookup)
- label (for filtering by type)

## Testing Results

### Test 1: Address Autocomplete ✅
```bash
GET /api/addresses/autocomplete?input=koramangala
```
**Result:** Returns suggested addresses matching "koramangala"

### Test 2: Add Home Address ✅
```bash
POST /api/addresses
{
  "formattedAddress": "123 MG Road, Bangalore...",
  "label": "home",
  "isDefault": true
}
```
**Result:** Address created with ID 1, set as default

### Test 3: Add Office Address ✅
```bash
POST /api/addresses
{
  "formattedAddress": "Koramangala, Bangalore...",
  "label": "office"
}
```
**Result:** Address created with ID 2, not default

### Test 4: Get All Addresses ✅
```bash
GET /api/addresses
```
**Result:** Returns 2 addresses (home and office)

### Test 5: Get Default Address ✅
```bash
GET /api/addresses/default
```
**Result:** Returns home address (ID 1)

### Test 6: Set Office as Default ✅
```bash
PUT /api/addresses/2/set-default
```
**Result:** Office is now default, home is not default

### Test 7: Update Address ✅
```bash
PUT /api/addresses/1
{
  "landmark": "Opposite to Coffee Day",
  "deliveryInstructions": "Call before delivery"
}
```
**Result:** Address updated successfully

## Google Places API Setup

### Environment Variables

Add to `server/.env`:
```env
GOOGLE_PLACES_API_KEY=your_google_places_api_key_here
GOOGLE_GEOCODING_API_KEY=your_geocoding_api_key_here  # Optional, uses GOOGLE_PLACES_API_KEY if not set
```

### Get API Keys

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create/select a project
3. Enable APIs:
   - Places API
   - Geocoding API
4. Create credentials (API Key)
5. Add the key to `.env` file

### Without API Key

The system works with **mock data** when API keys are not configured:
- Returns sample addresses for autocomplete
- Provides mock place details
- Suitable for development/testing

## Address Labels

**Supported Labels:**
- `home` - Home address
- `office` - Work/office address
- `other` - Other addresses

Labels help users organize and quickly select addresses for different purposes (deliveries, appointments, etc.).

## Default Address Behavior

- **First address** is automatically set as default
- Only **one default** address per user
- Setting a new default **automatically unsets** the previous one
- Deleting default address **promotes another** to default

## Use Cases

### 1. Medicine Delivery
Users can save home and office addresses for medicine deliveries with delivery instructions.

### 2. Doctor Appointments
Save clinic addresses or home address for home visits.

### 3. Lab Test Collection
Save multiple addresses where lab technicians can collect samples.

### 4. Emergency Services
Quick access to saved addresses for ambulance services.

## Frontend Integration Guide

### Example: Address Autocomplete

```typescript
// Search for addresses
const searchAddress = async (query: string) => {
  const response = await fetch(
    `/api/addresses/autocomplete?input=${query}&country=in`,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  const data = await response.json();
  return data.data; // Array of predictions
};

// Get place details when user selects
const getPlaceDetails = async (placeId: string) => {
  const response = await fetch(
    `/api/addresses/place/${placeId}`,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  const data = await response.json();
  return data.data; // Complete address
};

// Save address
const saveAddress = async (addressData) => {
  const response = await fetch('/api/addresses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(addressData)
  });
  return await response.json();
};
```

## Files Created/Modified

### New Files:
1. ✅ `server/models/address.model.intelligent.js` - Address model
2. ✅ `server/services/google-places.service.js` - Google Places integration
3. ✅ `server/routes/address.route.js` - Address API routes

### Modified Files:
1. ✅ `server/app.js` - Registered address routes

### Database:
1. ✅ `addresses` table created with all fields and indexes

## Status: COMPLETE ✅

**All Features Working:**
- ✅ Address autocomplete with Google Places API
- ✅ Add multiple addresses (home, office, other)
- ✅ Set default address
- ✅ Update address details
- ✅ Delete addresses (soft delete)
- ✅ Get all addresses
- ✅ Get default address
- ✅ Google Place ID integration
- ✅ Geographic coordinates storage
- ✅ Delivery instructions and landmarks
- ✅ Mock data fallback (works without API key)

## Next Steps (Optional)

1. **Frontend Components:**
   - Address autocomplete input
   - Address list view
   - Add/Edit address form
   - Default address selector

2. **Enhanced Features:**
   - Address validation
   - Distance calculation between addresses
   - Recent addresses
   - Address sharing with family members

3. **Production:**
   - Add rate limiting for autocomplete
   - Cache Google Places responses
   - Implement address verification
   - Add address analytics

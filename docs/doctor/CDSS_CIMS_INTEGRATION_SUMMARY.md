# CDSS-CIMS Integration Summary

## Overview
The Clinical Decision Support System (CDSS) has been successfully integrated with the CIMS (Central Cumulative Index of Medical Specialties) medicine database to provide doctors with real-world medication alternatives, pricing information, and drug interaction checking capabilities.

## What Changed

### 1. CDSS Service Enhancement
**File:** `server/services/cdss.service.js`

#### New Imports
```javascript
import cimsService from './cims-medicine.service.js';
```

#### New Methods Added

##### `enrichDrugInfoWithCIMS(drugInfoArray)`
Enriches AI-generated drug recommendations with real CIMS medicine data including:
- Available brand alternatives
- Manufacturer information
- Strength/form/pricing
- Regulatory schedules (OTC/H/X)

**Usage:**
```javascript
const enrichedDrugs = await cdssService.enrichDrugInfoWithCIMS([
  { name: "Paracetamol", genericName: "Acetaminophen", dosage: "500mg" }
]);
// Returns drugs with cimsAvailable flag and alternatives array
```

##### `getMedicationAlternatives(genericName, limit = 5)`
Retrieves available alternative brand names for a given generic drug from CIMS.

**Usage:**
```javascript
const alternatives = await cdssService.getMedicationAlternatives("Paracetamol", 5);
// Returns: [{brandName, manufacturer, strength, form, mrp, schedule, inCIMS}]
```

##### `checkDrugInteractions(medications)`
Performs drug-drug interaction checking using CIMS contraindication data.

**Usage:**
```javascript
const interactions = await cdssService.checkDrugInteractions([
  { name: "Paracetamol", genericName: "Acetaminophen" },
  { name: "Ibuprofen", genericName: "Ibuprofen" }
]);
// Returns: { hasInteractions, interactions[], medicationsChecked }
```

#### Enhanced Query Method
The main `query()` method now:
1. ✅ Searches medical knowledge base (existing)
2. ✅ Generates AI clinical recommendations (existing)
3. **[NEW]** Enriches drug recommendations with CIMS alternatives
4. **[NEW]** Retrieves medication alternatives with pricing
5. **[NEW]** Checks for drug interactions automatically

**New Option:**
```javascript
const result = await cdssService.query("Treatment for fever", {
  category: 'treatment',
  specialty: 'general',
  searchKnowledge: true,
  searchCIMS: true  // NEW: Enable CIMS integration (default: true)
});
```

#### Enhanced System Prompt
Updated CDSS AI prompt to include:
- CIMS medicine availability awareness
- Medication alternatives generation
- Drug interaction checking capabilities
- Indian medicine context and pricing

**New Response Fields:**
```json
{
  "drugInfo": [
    {
      "name": "Paracetamol",
      "genericName": "Acetaminophen",
      "cimsAvailable": true,
      "alternatives": [
        {
          "brandName": "Crocin 500mg",
          "manufacturer": "GSK",
          "mrp": 3.50,
          "schedule": "OTC"
        }
      ]
    }
  ],
  "medicationAlternatives": [
    {
      "genericName": "Paracetamol",
      "alternatives": [...]
    }
  ],
  "drugInteractions": [
    {
      "drug1": "Paracetamol",
      "drug2": "Ibuprofen",
      "severity": "moderate",
      "recommendation": "Verify dosing schedule"
    }
  ]
}
```

### 2. CDSS Knowledge Routes Enhancement
**File:** `server/routes/cdss-knowledge.route.js`

#### New Endpoints

##### `POST /api/cdss/knowledge/drug-interactions`
Check for drug interactions using CIMS data without needing full CDSS query.

**Request:**
```json
{
  "medications": [
    { "name": "Paracetamol", "genericName": "Acetaminophen" },
    { "name": "Ibuprofen", "genericName": "Ibuprofen" }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "hasInteractions": true,
  "interactions": [
    {
      "drug1": "Paracetamol",
      "drug2": "Ibuprofen",
      "severity": "moderate",
      "type": "contraindication",
      "description": "Check compatibility between Paracetamol and Ibuprofen",
      "recommendation": "Verify dosing schedule and monitor patient response",
      "source": "CIMS Database"
    }
  ],
  "medicationsChecked": 2,
  "message": "Found 1 potential interaction(s)"
}
```

##### `POST /api/cdss/knowledge/medication-alternatives`
Get alternative medications for a given drug with pricing and availability.

**Request:**
```json
{
  "genericName": "Paracetamol",
  "limit": 5
}
```

**Response:**
```json
{
  "success": true,
  "genericName": "Paracetamol",
  "count": 5,
  "source": "CIMS Database",
  "data": [
    {
      "id": "CIMS001",
      "genericName": "Acetaminophen",
      "brandName": "Crocin 500mg",
      "strength": "500mg",
      "form": "Tablet",
      "manufacturer": "GSK",
      "mrp": 3.50,
      "schedule": "OTC",
      "inCIMS": true
    },
    // ... more alternatives
  ]
}
```

## Integration Flow

```
Doctor Query
    ↓
CDSS Service Processing
    ├→ Search Knowledge Base (medical guidelines)
    ├→ Query AI (SIB/Groq) for clinical recommendations
    ├→ [NEW] Enrich with CIMS medicine data
    │   ├→ Search CIMS for each recommended drug
    │   ├→ Get alternatives, pricing, schedule
    │   └→ Check drug interactions
    └→ Return enriched response
    
Response includes:
- Clinical guidelines (from KB)
- Drug recommendations (from AI)
- CIMS alternatives (with pricing) [NEW]
- Drug interactions (CIMS-based) [NEW]
- Lab tests & ICD codes
- Warnings & evidence
```

## Benefits

### For Doctors
- ✅ Alternative medicine options with pricing during consultation
- ✅ Automatic drug interaction warnings
- ✅ Real-time India CIMS medicine availability
- ✅ MRP and regulatory schedule information
- ✅ Manufacturer details for informed prescribing

### For Patients
- ✅ Access to affordable medicine alternatives
- ✅ Transparency on medicine pricing (MRP)
- ✅ Safety checks for medication interactions
- ✅ OTC vs prescription schedule clarity

### For Platform
- ✅ Data-driven clinical decision support
- ✅ Reduced medication errors through interaction checking
- ✅ Compliance with Indian pharmaceutical regulations
- ✅ Differential pricing & accessibility

## Configuration

### Enable/Disable CIMS Integration
```javascript
// Enable (default)
const result = await cdssService.query(query, {
  searchCIMS: true  // Enables CIMS enrichment
});

// Disable (use knowledge base + AI only)
const result = await cdssService.query(query, {
  searchCIMS: false
});
```

## Performance Considerations

### Caching
- CIMS service uses internal caching (5-minute TTL)
- Prevents repeated database lookups
- Automatic cache invalidation

### Async Operations
- CIMS enrichment happens after main CDSS response
- Non-blocking to AI response generation
- Graceful fallback if CIMS fails

### Error Handling
```javascript
// If CIMS enrichment fails, response still returned with AI data only
try {
  // Enrich with CIMS
} catch (error) {
  console.warn('[CDSS] CIMS enrichment failed, continuing with AI data');
  // Return AI-only response
}
```

## Example Usage

### 1. Full CDSS Query with CIMS Integration
```javascript
const response = await fetch('http://localhost:8888/api/cdss/knowledge/query', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: "Patient with fever and headache",
    category: 'treatment',
    specialty: 'general',
    searchKnowledge: true,
    searchCIMS: true
  })
});

const result = await response.json();
// result.data includes drugInfo with CIMS alternatives
// result.data includes medicationAlternatives array
// result.data includes drugInteractions if any
```

### 2. Direct Drug Interaction Check
```javascript
const response = await fetch('http://localhost:8888/api/cdss/knowledge/drug-interactions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    medications: [
      { name: "Paracetamol 500mg", genericName: "Acetaminophen" },
      { name: "Aspirin 75mg", genericName: "Acetylsalicylic Acid" },
      { name: "Ibuprofen 400mg", genericName: "Ibuprofen" }
    ]
  })
});

const result = await response.json();
// Specific interaction warnings for prescriber
```

### 3. Get Medication Alternatives
```javascript
const response = await fetch('http://localhost:8888/api/cdss/knowledge/medication-alternatives', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    genericName: "Amoxicillin",
    limit: 10
  })
});

const result = await response.json();
// Returns all Amoxicillin brands available in CIMS with pricing
```

## Testing Checklist

- [x] CDSS service loads CIMS service on initialization
- [x] Enrichment methods handle missing/invalid data gracefully
- [x] Drug interaction checking works with multiple medications
- [x] Medication alternatives returned with CIMS data
- [x] New endpoints respond correctly with proper validation
- [x] Error handling doesn't block main CDSS response
- [x] Caching improves performance on repeated queries
- [x] CIMS data properly formatted in responses

## Future Enhancements

1. **Advanced Interaction Checking**
   - Full pharmacokinetic interaction database
   - CYP450 enzyme interaction analysis
   - Severity scoring (mild/moderate/severe/contraindicated)

2. **Dosage Verification**
   - Check against CIMS recommended dosages
   - Patient-specific dose calculations (renal/hepatic impairment)
   - Age/weight-based pediatric dosing

3. **Contraindication Matching**
   - Patient allergy history checking
   - Pregnancy/lactation safety
   - Renal/hepatic function considerations

4. **Formulary Integration**
   - Insurance coverage checks
   - Hospital formulary availability
   - Pharmacy network pricing

5. **Clinical Guidelines**
   - Link CIMS medicines to specific guidelines
   - Evidence-based drug selection
   - Quality metrics and outcomes tracking

## Troubleshooting

### CIMS Data Not Enriching Response
- Check: `cimsService.loaded` property
- Verify: CIMS JSON data files in `/server/data/`
- Logs: Look for `[CIMS]` messages in server logs

### Drug Interactions Not Detected
- Current: Simple contraindication matching
- Limitation: Requires explicit match in contraindication field
- Future: More sophisticated interaction database

### Slow Response Times
- First query may be slow (CIMS indexing)
- Subsequent: Should be cached (5-min TTL)
- Monitor: Response times in CDSS logs

## Deployment Notes

1. Ensure CIMS data files are present before deployment
2. CIMS service initializes automatically on startup
3. No database migrations needed
4. Backward compatible with existing CDSS queries
5. New parameters optional (default enabled)

---

**Integration Date:** February 10, 2026
**Status:** ✅ Complete and Tested
**Versions:** CDSS v2.1.0, CIMS v1.5.0

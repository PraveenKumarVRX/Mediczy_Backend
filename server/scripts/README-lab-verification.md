# Lab Data Verification Scripts

Two powerful scripts to verify and enhance laboratory data using Google Places API and AI/LLM.

## 1. Google Places Verification (`verify-labs-with-google-places.cjs`)

Verifies lab locations using Google Maps Places API and updates database with accurate information.

### Setup

1. **Get Google Places API Key:**
   - Go to https://console.cloud.google.com/apis/credentials
   - Create a new project or select existing
   - Enable "Places API" and "Geocoding API"
   - Create API key
   - Add restrictions: HTTP referrers (for web) or IP addresses (for server)

2. **Set Environment Variable:**
   ```bash
   export GOOGLE_PLACES_API_KEY="your_api_key_here"
   ```

3. **Run Script:**
   ```bash
   cd /root/Mediczy/server
   node scripts/verify-labs-with-google-places.cjs
   ```

### Features
- ✅ Searches each lab on Google Maps
- ✅ Retrieves verified name, address, phone
- ✅ Extracts structured location (city, state, pincode)
- ✅ Parses brand name vs branch name
- ✅ Adds Google Place ID for future reference
- ✅ Includes ratings and review counts
- ✅ Rate-limited to respect API quotas

### What Gets Updated
- `name` - Verified lab brand name
- `areaName` - Branch/location name
- `address` - Google verified formatted address
- `city`, `state`, `pincode` - Structured location data
- `phone` - Verified phone number
- `google_place_id` - Google's unique identifier

### Cost & Limits
- Google Places API: First $200/month FREE
- Text Search: $32 per 1000 requests
- Place Details: $17 per 1000 requests
- Script processes 100 labs at a time (~$5 per 100 labs)

---

## 2. LLM-Powered Enhancement (`enhance-labs-with-llm.cjs`)

Uses AI/LLM (FLAN-T5, GPT, Claude, Llama) to intelligently parse unstructured lab data.

### Setup - Option A: Ollama (Local, Free)

1. **Install Ollama:**
   ```bash
   curl -fsSL https://ollama.com/install.sh | sh
   ```

2. **Download FLAN-T5 Model:**
   ```bash
   ollama pull flan-t5
   # or for better results:
   ollama pull llama3
   ```

3. **Run Script:**
   ```bash
   cd /root/Mediczy/server
   node scripts/enhance-labs-with-llm.cjs
   ```

### Setup - Option B: OpenAI (Cloud, Paid)

```bash
export LLM_PROVIDER="openai"
export LLM_MODEL="gpt-3.5-turbo"
export LLM_API_KEY="your_openai_api_key"

node scripts/enhance-labs-with-llm.cjs
```

### Setup - Option C: Anthropic Claude (Cloud, Paid)

```bash
export LLM_PROVIDER="anthropic"
export LLM_MODEL="claude-3-haiku-20240307"
export LLM_API_KEY="your_anthropic_api_key"

node scripts/enhance-labs-with-llm.cjs
```

### Features
- 🤖 AI-powered address parsing
- 🤖 Extracts brand vs branch intelligently
- 🤖 Infers city, state from unstructured text
- 🤖 Suggests likely services based on lab type
- 🤖 Handles Indian address formats
- 🤖 Fallback to rule-based parsing if LLM unavailable

### What Gets Updated
- `name` - Extracted brand name
- `areaName` - Extracted branch/locality
- `city`, `state`, `pincode` - Parsed from address
- `services` - Inferred available services

### Cost
- **Ollama (Local):** FREE - runs on your server
- **OpenAI GPT-3.5:** ~$0.002 per lab (~$5 per 2000 labs)
- **Anthropic Claude Haiku:** ~$0.0001 per lab (~$0.50 per 2000 labs)

---

## Recommended Workflow

### For Best Results (Use Both):

1. **First: Run LLM Enhancement** (Free with Ollama)
   ```bash
   node scripts/enhance-labs-with-llm.cjs
   ```
   This extracts brand names, branches, and basic location info from existing data.

2. **Then: Run Google Verification** (First $200/month free)
   ```bash
   export GOOGLE_PLACES_API_KEY="your_key"
   node scripts/verify-labs-with-google-places.cjs
   ```
   This verifies against real Google Maps data and adds ratings/reviews.

### For Budget Approach (Free):

Just use LLM with local Ollama - no API costs!

---

## Database Schema Updates

Both scripts work with existing schema. Optionally add these columns for richer data:

```sql
ALTER TABLE clinics ADD COLUMN latitude DECIMAL(10, 8) NULL;
ALTER TABLE clinics ADD COLUMN longitude DECIMAL(11, 8) NULL;
ALTER TABLE clinics ADD COLUMN rating DECIMAL(2, 1) NULL;
ALTER TABLE clinics ADD COLUMN total_reviews INT NULL;
ALTER TABLE clinics ADD COLUMN website VARCHAR(500) NULL;
ALTER TABLE clinics ADD COLUMN business_status VARCHAR(50) NULL;
```

---

## Monitoring & Safety

- Both scripts process 50-100 labs at a time to avoid overwhelming APIs
- Built-in rate limiting (500ms between Google requests)
- Graceful error handling - one failure doesn't stop the batch
- Detailed logging for debugging
- Resume-friendly - can re-run without duplicating work

---

## Example Output

### Google Verification:
```
[1/100] Processing: Redcliffe Labs
  ✓ Found: Redcliffe Laboratories Ltd
  📍 Address: 123 Main Rd, Vadapalani, Chennai, Tamil Nadu 600026
  ✅ Updated successfully
     Brand: Redcliffe Laboratories
     Branch: Vadapalani
     City: Chennai, Tamil Nadu 600026
     Rating: 4.2⭐ (156 reviews)
```

### LLM Enhancement:
```
[1/50] Processing: Dr Lal PathLabs CHENNAI
  Current: (no city), (no state)
  ✨ Enhanced:
     Brand: Dr Lal PathLabs
     Branch: Chennai Central
     Location: Chennai, Tamil Nadu 600001
     Services: Pathology, Radiology, Clinical Chemistry
```

# 🏥 Lab Data Verification System - Quick Start

## ✅ What's Been Set Up

1. **Ollama (Local AI)** - Installed and running with Llama 3.2 model
2. **Three verification scripts** created:
   - `verify-labs-with-google-places.cjs` - Google Maps verification
   - `enhance-labs-with-llm.cjs` - AI-powered parsing
   - `extract-city-state-from-address.cjs` - Basic parsing (already used)
3. **Interactive launcher** - `verify-labs.sh`

---

## 🚀 Quick Start (Recommended: Option 1 - FREE)

Already done! The basic city/state extraction has been completed for all 2,362 labs.

To use AI enhancement for even better results:

```bash
cd /root/Mediczy/server
./scripts/verify-labs.sh
# Choose option 2: LLM Enhancement (FREE, local)
```

This will:
- ✅ Better extract brand vs branch names
- ✅ Improve city/state accuracy
- ✅ Infer available services
- ✅ 100% FREE (runs on your server)
- ✅ No API keys needed

---

## 💡 For Perfect Results (Optional - Paid)

If you want Google-verified data with ratings/reviews:

### Step 1: Get Google API Key (First $200/month FREE)

1. Go to https://console.cloud.google.com/apis/credentials
2. Create new project: "Mediczy Labs"
3. Enable APIs:
   - Places API
   - Geocoding API
4. Create API Key
5. Restrict it (Security → IP Address: your server IP)

### Step 2: Run verification

```bash
cd /root/Mediczy/server
./scripts/verify-labs.sh
# Choose option 3 or 4
# Enter your API key when prompted
```

**Cost Estimate:**
- First $200/month: FREE
- After that: ~$5 per 100 labs
- For 2,362 labs: ~$118 (but first $200 free!)

---

## 📊 What Gets Updated

### Current Status (Already Done)
- ✅ 2,354 labs have city data
- ✅ 27 states identified  
- ✅ 1,110 cities extracted
- ✅ All labs have services listed

### With LLM Enhancement (Option 2)
- Better brand name extraction (e.g., "Dr Lal PathLabs" not "Dr. Lal Pathlabs Chennai")
- Cleaner branch names (e.g., "Vadapalani" not "VADAPALANI CHENNAI")
- More accurate city identification
- Intelligent service inference

### With Google Verification (Option 3/4)
- ✅ Google-verified names and addresses
- ✅ Ratings and review counts
- ✅ Phone numbers verified
- ✅ Exact coordinates (lat/long)
- ✅ Website URLs
- ✅ Business status (operational/closed)

---

## 🎯 Current Lab Display

Your labs now show as:
- **"Redcliffe Labs - Vadapalani"** (Brand - Branch)
- **"Chennai, Tamil Nadu"** (City, State)

All working and displaying correctly! ✅

---

## 🔧 Manual Run (Advanced)

### LLM Enhancement Only
```bash
cd /root/Mediczy/server
export LLM_PROVIDER="ollama"
export LLM_MODEL="llama3.2:1b"
node scripts/enhance-labs-with-llm.cjs
```

### Google Verification Only
```bash
cd /root/Mediczy/server
export GOOGLE_PLACES_API_KEY="your_key_here"
node scripts/verify-labs-with-google-places.cjs
```

### Both (Best Results)
```bash
# Run LLM first
export LLM_PROVIDER="ollama"
node scripts/enhance-labs-with-llm.cjs

# Then Google
export GOOGLE_PLACES_API_KEY="your_key"
node scripts/verify-labs-with-google-places.cjs
```

---

## 📈 Monitoring

Check progress during processing:
```bash
# Watch Ollama logs
tail -f /tmp/ollama.log

# Check database updates
mysql -u mediczy -pMediczy2024Secure mediczy -e "
  SELECT COUNT(*) as total, 
         COUNT(DISTINCT city) as cities,
         COUNT(DISTINCT state) as states
  FROM clinics WHERE category='lab'
"
```

---

## ✨ Summary

**What you have NOW (no action needed):**
- ✅ 2,362 labs loaded
- ✅ City/state extracted
- ✅ Clean card view display
- ✅ All functional

**Optional improvements available:**
1. **FREE:** Run LLM enhancement for better brand/branch parsing
2. **Paid:** Add Google verification for ratings, reviews, verified data

**Recommendation:** 
Start with option 2 (LLM - FREE) to improve data quality, then consider Google verification if you need ratings/reviews for your users.

---

## 🆘 Support

- **Ollama not working?** `systemctl status ollama`
- **Node errors?** Check Node version: `node --version` (need v16+)
- **Database issues?** Verify connection: `mysql -u mediczy -pMediczy2024Secure mediczy -e "SELECT 1"`

Current setup is fully functional! 🎉

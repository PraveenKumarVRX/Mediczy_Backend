/**
 * CIMS Medicine Database Service
 * Provides access to comprehensive medicine master data
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class CIMSMedicineService {
  constructor() {
    this.medicines = [];
    this.categories = [];
    this.categoryIndex = new Map();
    this.categoryIndexLower = new Map();
    this.genericIndex = new Map();
    this.scheduleIndex = new Map();
    this.pregnancySafeIndex = [];
    this.cache = new Map();
    this.cacheMaxEntries = 500;
    this.cacheTtlMs = 5 * 60 * 1000;
    this.loaded = false;
    this.loadDatabase();
  }

  /**
   * Load all medicine data from JSON files
   */
  loadDatabase() {
    try {
      const dataDir = path.join(__dirname, '../data');
      
      // Load all CIMS medicine JSON files
      const dataFiles = fs
        .readdirSync(dataDir)
        .filter(file => file.startsWith('cims-medicine-') && file.endsWith('.json'))
        .sort((a, b) => a.localeCompare(b));

      dataFiles.forEach(file => {
        const filePath = path.join(dataDir, file);
        const fileData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        if (fileData.categories && this.categories.length === 0) {
          this.categories = fileData.categories;
        }

        if (fileData.medicines && Array.isArray(fileData.medicines)) {
          const beforeCount = this.medicines.length;
          this.medicines = [...this.medicines, ...fileData.medicines];
          const addedCount = this.medicines.length - beforeCount;
          console.log(`[CIMS] Added ${addedCount} medicines from ${file}`);
        }
      });

      // Remove duplicates by ID
      const uniqueIds = new Set();
      this.medicines = this.medicines.filter(med => {
        if (uniqueIds.has(med.id)) return false;
        uniqueIds.add(med.id);
        return true;
      });

      this.buildIndexes();
      this.applyPriceOverrides();
      this.clearCache();

      this.loaded = true;
      console.log(`[CIMS] ✅ Total medicines loaded: ${this.medicines.length}`);
      console.log(`[CIMS] ✅ Total categories: ${this.categoryIndex.size}`);
      console.log(`[CIMS] Categories: ${Array.from(this.categoryIndex.keys()).sort().join(', ')}`);
      
      // Log statistics
      const stats = this.getStats();
      console.log(`[CIMS] OTC: ${stats.schedules.OTC} | H: ${stats.schedules.H} | X: ${stats.schedules.X}`);
    } catch (error) {
      console.error('[CIMS] Error loading database:', error);
      this.loaded = false;
    }
  }

  buildIndexes() {
    this.categoryIndex = new Map();
    this.categoryIndexLower = new Map();
    this.genericIndex = new Map();
    this.scheduleIndex = new Map([
      ['OTC', []],
      ['H', []],
      ['X', []]
    ]);
    this.pregnancySafeIndex = [];

    this.medicines.forEach(med => {
      med._brandLower = (med.brandName || '').toLowerCase();
      med._genericLower = (med.genericName || '').toLowerCase();
      med._compositionLower = (med.composition || '').toLowerCase();
      med._indicationLower = (med.indication || '').toLowerCase();
      med._manufacturerLower = (med.manufacturer || '').toLowerCase();
      med._formLower = (med.form || '').toLowerCase();
      med._categoryLower = (med.category || '').toLowerCase();
      med._subCategoryLower = (med.subCategory || '').toLowerCase();
      med._scheduleUpper = (med.schedule || '').toUpperCase();
      med._searchText = `${med._brandLower} ${med._genericLower} ${med._compositionLower}`.trim();

      if (med.category) {
        if (!this.categoryIndex.has(med.category)) {
          this.categoryIndex.set(med.category, []);
        }
        this.categoryIndex.get(med.category).push(med);

        if (!this.categoryIndexLower.has(med._categoryLower)) {
          this.categoryIndexLower.set(med._categoryLower, []);
        }
        this.categoryIndexLower.get(med._categoryLower).push(med);
      }

      if (med._genericLower) {
        if (!this.genericIndex.has(med._genericLower)) {
          this.genericIndex.set(med._genericLower, []);
        }
        this.genericIndex.get(med._genericLower).push(med);
      }

      if (this.scheduleIndex.has(med._scheduleUpper)) {
        this.scheduleIndex.get(med._scheduleUpper).push(med);
      }

      if (this.isPregnancySafe(med)) {
        this.pregnancySafeIndex.push(med);
      }
    });
  }

  clearCache() {
    this.cache.clear();
  }

  getCache(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  setCache(key, value) {
    if (this.cache.size >= this.cacheMaxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, { value, expiresAt: Date.now() + this.cacheTtlMs });
  }

  getCacheKey(prefix, params) {
    return `${prefix}:${JSON.stringify(params)}`;
  }

  isPregnancySafe(med) {
    if (!med || !med.pregnancy) return false;
    const value = String(med.pregnancy).toLowerCase();
    return (
      value.includes('category a') ||
      value.includes('category b') ||
      value === 'a' ||
      value === 'b' ||
      value.includes('safe')
    );
  }

  normalizePagination(page = 1, limit = 50, maxLimit = 200) {
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 50), maxLimit);
    return { page: safePage, limit: safeLimit, offset: (safePage - 1) * safeLimit };
  }

  paginate(list, page, limit, formatter) {
    const { page: safePage, limit: safeLimit, offset } = this.normalizePagination(page, limit);
    const total = list.length;
    const data = list
      .slice(offset, offset + safeLimit)
      .map(item => (formatter ? formatter(item) : item));
    return {
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
      data
    };
  }

  encodeCursor(offset) {
    return Buffer.from(JSON.stringify({ offset })).toString('base64');
  }

  decodeCursor(cursor) {
    if (!cursor) return { offset: 0 };
    try {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
      const offset = Number.isFinite(decoded?.offset) ? decoded.offset : 0;
      return { offset: Math.max(0, offset) };
    } catch {
      return { offset: 0 };
    }
  }

  paginateCursor(list, cursor, limit, formatter) {
    const { limit: safeLimit } = this.normalizePagination(1, limit);
    const { offset } = this.decodeCursor(cursor);
    const total = list.length;
    const data = list
      .slice(offset, offset + safeLimit)
      .map(item => (formatter ? formatter(item) : item));
    const nextOffset = offset + safeLimit;
    return {
      total,
      limit: safeLimit,
      cursor: cursor || null,
      nextCursor: nextOffset < total ? this.encodeCursor(nextOffset) : null,
      data
    };
  }

  sortByBrandThenId(list) {
    return [...list].sort((a, b) => {
      const brandCompare = (a.brandName || '').localeCompare(b.brandName || '');
      if (brandCompare !== 0) return brandCompare;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });
  }

  /**
   * Search medicines by name (brand or generic)
   */
  searchByName(query, { page = 1, limit = 50, cursor = null, useCursor = false } = {}) {
    if (!query || query.length < 2) {
      return useCursor
        ? this.paginateCursor([], cursor, limit, med => this.formatMedicineResponse(med))
        : this.paginate([], page, limit, med => this.formatMedicineResponse(med));
    }

    const q = query.toLowerCase();
    const cacheKey = this.getCacheKey('searchByName', { q });
    let results = this.getCache(cacheKey);
    if (!results) {
      results = this.sortByBrandThenId(
        this.medicines.filter(med => med._searchText.includes(q))
      );
      this.setCache(cacheKey, results);
    }
    return useCursor
      ? this.paginateCursor(results, cursor, limit, med => this.formatMedicineResponse(med))
      : this.paginate(results, page, limit, med => this.formatMedicineResponse(med));
  }

  /**
   * Search by generic name
   */
  searchByGenericName(genericName, { page = 1, limit = 20, cursor = null, useCursor = false } = {}) {
    const q = String(genericName || '').toLowerCase();
    const cacheKey = this.getCacheKey('searchByGenericName', { q });
    let results = this.getCache(cacheKey);
    if (!results) {
      results = this.sortByBrandThenId(
        this.medicines.filter(med => med._genericLower.includes(q))
      );
      this.setCache(cacheKey, results);
    }
    return useCursor
      ? this.paginateCursor(results, cursor, limit, med => this.formatMedicineResponse(med))
      : this.paginate(results, page, limit, med => this.formatMedicineResponse(med));
  }

  /**
   * Get medicines by category
   */
  getByCategory(category, { page = 1, limit = 100, cursor = null, useCursor = false } = {}) {
    const key = String(category || '').toLowerCase();
    const cacheKey = this.getCacheKey('getByCategory', { key });
    let categoryMeds = this.getCache(cacheKey);
    if (!categoryMeds) {
      categoryMeds = this.sortByBrandThenId(this.categoryIndexLower.get(key) || []);
      this.setCache(cacheKey, categoryMeds);
    }
    return useCursor
      ? this.paginateCursor(categoryMeds, cursor, limit, med => this.formatMedicineResponse(med))
      : this.paginate(categoryMeds, page, limit, med => this.formatMedicineResponse(med));
  }

  /**
   * Get all categories with medicine counts
   */
  getCategories() {
    const categories = [];
    this.categoryIndex.forEach((meds, category) => {
      categories.push({
        name: category,
        count: meds.length,
        subCategories: [...new Set(meds.map(m => m.subCategory).filter(Boolean))]
      });
    });
    return categories.sort((a, b) => b.count - a.count);
  }

  /**
   * Get medicine by ID
   */
  getById(id) {
    const med = this.medicines.find(m => m.id === id);
    return med ? this.formatMedicineResponse(med, true) : null;
  }

  /**
   * Get medicine alternatives (same generic name)
   */
  getAlternatives(medicineId, { page = 1, limit = 10, cursor = null, useCursor = false } = {}) {
    const medicine = this.medicines.find(m => m.id === medicineId);
    if (!medicine) {
      return useCursor
        ? this.paginateCursor([], cursor, limit, med => this.formatMedicineResponse(med))
        : this.paginate([], page, limit, med => this.formatMedicineResponse(med));
    }

    const genericKey = medicine._genericLower;
    const alternatives = this.sortByBrandThenId(
      (this.genericIndex.get(genericKey) || []).filter(med => med.id !== medicineId)
    );

    return useCursor
      ? this.paginateCursor(alternatives, cursor, limit, med => this.formatMedicineResponse(med))
      : this.paginate(alternatives, page, limit, med => this.formatMedicineResponse(med));
  }

  /**
   * Get medicines by indication
   */
  searchByIndication(indication, { page = 1, limit = 30, cursor = null, useCursor = false } = {}) {
    const q = String(indication || '').toLowerCase();
    const cacheKey = this.getCacheKey('searchByIndication', { q });
    let results = this.getCache(cacheKey);
    if (!results) {
      results = this.sortByBrandThenId(
        this.medicines.filter(med => med._indicationLower.includes(q))
      );
      this.setCache(cacheKey, results);
    }
    return useCursor
      ? this.paginateCursor(results, cursor, limit, med => this.formatMedicineResponse(med))
      : this.paginate(results, page, limit, med => this.formatMedicineResponse(med));
  }

  /**
   * Get medicines safe for pregnancy
   */
  getPregnancySafe({ page = 1, limit = 50, cursor = null, useCursor = false } = {}) {
    const list = this.sortByBrandThenId(this.pregnancySafeIndex);
    return useCursor
      ? this.paginateCursor(list, cursor, limit, med => this.formatMedicineResponse(med))
      : this.paginate(list, page, limit, med => this.formatMedicineResponse(med));
  }

  /**
   * Get OTC medicines
   */
  getOTCMedicines({ page = 1, limit = 100, cursor = null, useCursor = false } = {}) {
    const otc = this.sortByBrandThenId(this.scheduleIndex.get('OTC') || []);
    return useCursor
      ? this.paginateCursor(otc, cursor, limit, med => this.formatMedicineResponse(med))
      : this.paginate(otc, page, limit, med => this.formatMedicineResponse(med));
  }

  /**
   * Format medicine response
   */
  formatMedicineResponse(med, detailed = false) {
    const basic = {
      id: med.id,
      brandName: med.brandName,
      genericName: med.genericName,
      strength: med.strength,
      form: med.form,
      category: med.category,
      subCategory: med.subCategory,
      manufacturer: med.manufacturer,
      mrp: med.mrp,
      packSize: med.packSize,
      schedule: med.schedule
    };

    if (detailed) {
      return {
        ...basic,
        composition: med.composition,
        indication: med.indication,
        contraindication: med.contraindication,
        sideEffects: med.sideEffects,
        dosage: med.dosage,
        storage: med.storage,
        pregnancy: med.pregnancy,
        lactation: med.lactation,
        pediatric: med.pediatric,
        geriatric: med.geriatric
      };
    }

    return basic;
  }

  /**
   * Get database statistics
   */
  getStats() {
    return {
      totalMedicines: this.medicines.length,
      totalCategories: this.categoryIndex.size,
      categories: this.getCategories(),
      schedules: {
        OTC: (this.scheduleIndex.get('OTC') || []).length,
        H: (this.scheduleIndex.get('H') || []).length,
        X: (this.scheduleIndex.get('X') || []).length
      },
      forms: [...new Set(this.medicines.map(m => m.form))],
      manufacturers: [...new Set(this.medicines.map(m => m.manufacturer))]
    };
  }

  /**
   * Advanced search with filters
   */
  advancedSearch(filters = {}) {
    const cacheKey = this.getCacheKey('advancedSearch', filters || {});
    let results = this.getCache(cacheKey);
    if (!results) {
      results = [...this.medicines];

      if (filters.query) {
        const q = filters.query.toLowerCase();
        results = results.filter(med =>
          med._brandLower.includes(q) ||
          med._genericLower.includes(q)
        );
      }

      if (filters.category) {
        const categoryKey = String(filters.category).toLowerCase();
        results = results.filter(med => med._categoryLower === categoryKey);
      }

      if (filters.subCategory) {
        const subCategoryKey = String(filters.subCategory).toLowerCase();
        results = results.filter(med => med._subCategoryLower === subCategoryKey);
      }

      if (filters.manufacturer) {
        const manufacturerKey = filters.manufacturer.toLowerCase();
        results = results.filter(med => 
          med._manufacturerLower.includes(manufacturerKey)
        );
      }

      if (filters.schedule) {
        const scheduleKey = String(filters.schedule).toUpperCase();
        results = results.filter(med => med._scheduleUpper === scheduleKey);
      }

      if (filters.form) {
        const formKey = filters.form.toLowerCase();
        results = results.filter(med => 
          med._formLower.includes(formKey)
        );
      }

      if (filters.minPrice !== undefined) {
        results = results.filter(med => med.mrp >= filters.minPrice);
      }

      if (filters.maxPrice !== undefined) {
        results = results.filter(med => med.mrp <= filters.maxPrice);
      }

    // Sort
      if (filters.sortBy) {
        switch (filters.sortBy) {
          case 'price_asc':
            results.sort((a, b) => a.mrp - b.mrp);
            break;
          case 'price_desc':
            results.sort((a, b) => b.mrp - a.mrp);
            break;
          case 'name':
            results.sort((a, b) => a.brandName.localeCompare(b.brandName));
            break;
          case 'generic':
            results.sort((a, b) => a.genericName.localeCompare(b.genericName));
            break;
          default:
            results = this.sortByBrandThenId(results);
            break;
        }
      } else {
        results = this.sortByBrandThenId(results);
      }

      this.setCache(cacheKey, results);
    }

    const { page, limit } = this.normalizePagination(filters.page, filters.limit);
    if (Object.prototype.hasOwnProperty.call(filters || {}, 'cursor')) {
      return this.paginateCursor(results, filters.cursor, limit, med => this.formatMedicineResponse(med));
    }

    return this.paginate(results, page, limit, med => this.formatMedicineResponse(med));
  }

  /**
   * Update prices for medicines by ID
   * @param {Array<{id: string, mrp: number}>} priceUpdates
   * @returns {{ updated: number, notFound: string[] }}
   */
  updatePrices(priceUpdates) {
    const notFound = [];
    let updated = 0;

    for (const { id, mrp } of priceUpdates) {
      const med = this.medicines.find(m => m.id === id);
      if (med) {
        med.mrp = mrp;
        updated++;
      } else {
        notFound.push(id);
      }
    }

    // Persist overrides to a file so they survive restarts
    const dataDir = path.join(__dirname, '../data');
    const overridePath = path.join(dataDir, 'cims-medicine-price-overrides.json');
    let existing = {};
    try {
      existing = JSON.parse(fs.readFileSync(overridePath, 'utf8'));
    } catch { /* file may not exist yet */ }

    for (const { id, mrp } of priceUpdates) {
      existing[id] = { mrp, updatedAt: new Date().toISOString() };
    }
    fs.writeFileSync(overridePath, JSON.stringify(existing, null, 2));

    this.clearCache();
    return { updated, notFound };
  }

  /**
   * Apply persisted price overrides (called on loadDatabase)
   */
  applyPriceOverrides() {
    const overridePath = path.join(__dirname, '../data/cims-medicine-price-overrides.json');
    try {
      const overrides = JSON.parse(fs.readFileSync(overridePath, 'utf8'));
      let applied = 0;
      for (const [id, data] of Object.entries(overrides)) {
        const med = this.medicines.find(m => m.id === id);
        if (med && data.mrp != null) {
          med.mrp = data.mrp;
          applied++;
        }
      }
      if (applied > 0) {
        console.log(`[CIMS] ✅ Applied ${applied} price overrides`);
      }
    } catch { /* no overrides file */ }
  }

  /**
   * Reload entire database from files
   */
  reloadDatabase() {
    this.medicines = [];
    this.categories = [];
    this.categoryIndex = new Map();
    this.categoryIndexLower = new Map();
    this.genericIndex = new Map();
    this.scheduleIndex = new Map();
    this.pregnancySafeIndex = [];
    this.cache = new Map();
    this.loaded = false;
    this.loadDatabase();
    return { total: this.medicines.length, loaded: this.loaded };
  }
}

// Singleton instance
const cimsService = new CIMSMedicineService();

export default cimsService;
export { CIMSMedicineService };

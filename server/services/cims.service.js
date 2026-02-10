/**
 * CIMS Service Wrapper
 * Provides unified interface for CIMS medicine database
 */

import cimsMedicineService from './cims-medicine.service.js';

class CIMSService {
  /**
   * Search medicines by name, generic, or composition
   * @param {string} query - Search query (medicine name, generic name, etc.)
   * @param {number} limit - Max results to return (default: 8)
   * @returns {Promise<Array>} Array of matching medicines
   */
  async searchMedicines(query, limit = 8) {
    if (!query || query.trim().length < 2) {
      return [];
    }

    try {
      const results = cimsMedicineService.searchByName(query, { limit });
      
      if (results && results.medicines) {
        return results.medicines.slice(0, limit).map(med => ({
          text: med.brand || med.generic || med.composition,
          category: `Medicine (${med.category || 'General'})`,
          type: 'drug',
          cimsId: med.id,
          generic: med.generic,
          composition: med.composition,
          brand: med.brand,
          dosage: med.strength,
        }));
      }
      
      return [];
    } catch (error) {
      console.error('Error searching CIMS medicines:', error);
      return [];
    }
  }

  /**
   * Get medicine by ID
   * @param {string} medicineId - CIMS medicine ID
   * @returns {Object} Medicine object
   */
  async getMedicineById(medicineId) {
    if (!medicineId) return null;

    try {
      return cimsMedicineService.getById(medicineId);
    } catch (error) {
      console.error('Error getting medicine by ID:', error);
      return null;
    }
  }

  /**
   * Search by generic name
   * @param {string} genericName - Generic medicine name
   * @param {number} limit - Max results to return
   * @returns {Promise<Array>} Array of medicines with that generic
   */
  async searchByGeneric(genericName, limit = 8) {
    if (!genericName || genericName.trim().length < 2) {
      return [];
    }

    try {
      const results = cimsMedicineService.searchByGenericName(genericName, { limit });
      
      if (results && results.medicines) {
        return results.medicines.slice(0, limit).map(med => ({
          text: med.brand || med.generic || med.composition,
          category: `Medicine (${med.category || 'General'})`,
          type: 'drug',
          cimsId: med.id,
          generic: med.generic,
          composition: med.composition,
          brand: med.brand,
          dosage: med.strength,
        }));
      }
      
      return [];
    } catch (error) {
      console.error('Error searching by generic name:', error);
      return [];
    }
  }

  /**
   * Get all medicines in a category
   * @param {string} category - Category name
   * @param {number} limit - Max results to return
   * @returns {Promise<Array>} Array of medicines in category
   */
  async getMedicinesByCategory(category, limit = 50) {
    if (!category) return [];

    try {
      return cimsMedicineService.getByCategory(category, { limit });
    } catch (error) {
      console.error('Error getting medicines by category:', error);
      return [];
    }
  }

  /**
   * Get all medicine categories
   * @returns {Array<string>} List of available categories
   */
  getAllCategories() {
    return cimsMedicineService.getAllCategories();
  }

  /**
   * Check if medicine is safe during pregnancy
   * @param {string} medicineId - CIMS medicine ID
   * @returns {boolean} True if safe for pregnancy
   */
  isPregnancySafeMedicine(medicineId) {
    const medicine = cimsMedicineService.getById(medicineId);
    if (!medicine) return false;
    return cimsMedicineService.isPregnancySafe(medicine);
  }
}

// Export singleton instance
export default new CIMSService();

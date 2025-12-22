import ExcelJS from 'exceljs';
import { downloadArrayBuffer, downloadText } from './downloadFile';

interface ExportOptions {
  filename?: string;
  sheetName?: string;
  includeTimestamp?: boolean;
}

/**
 * Export data to Excel file
 * @param data Array of objects to export
 * @param options Export configuration options
 */
export const exportToExcel = (data: any[], options: ExportOptions = {}) => {
  const {
    filename = 'export',
    sheetName = 'Sheet1',
    includeTimestamp = true,
  } = options;

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  const headers = data.length > 0 ? Object.keys(data[0]) : [];
  worksheet.columns = headers.map((h) => ({
    header: h,
    key: h,
    width: Math.min(60, Math.max(12, h.length + 4))
  }));

  for (const row of data) {
    worksheet.addRow(row);
  }

  // Generate filename with timestamp if requested
  const timestamp = includeTimestamp
    ? `_${new Date().toISOString().split('T')[0]}_${new Date().getTime()}`
    : '';
  const finalFilename = `${filename}${timestamp}.xlsx`;

  workbook.xlsx.writeBuffer().then((buffer) => {
    downloadArrayBuffer(
      buffer as ArrayBuffer,
      finalFilename,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
  });
};

/**
 * Export data to CSV file
 * @param data Array of objects to export
 * @param options Export configuration options
 */
export const exportToCSV = (data: any[], options: ExportOptions = {}) => {
  const {
    filename = 'export',
    includeTimestamp = true,
  } = options;

  const headers = data.length > 0 ? Object.keys(data[0]) : [];
  const escapeCell = (value: any) => {
    const raw = value == null ? '' : String(value);
    const escaped = raw.replace(/"/g, '""');
    return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
  };

  const lines: string[] = [];
  lines.push(headers.map(escapeCell).join(','));
  for (const row of data) {
    lines.push(headers.map((h) => escapeCell(row?.[h])).join(','));
  }

  // Generate filename with timestamp if requested
  const timestamp = includeTimestamp
    ? `_${new Date().toISOString().split('T')[0]}_${new Date().getTime()}`
    : '';
  const finalFilename = `${filename}${timestamp}.csv`;

  downloadText(lines.join('\n'), finalFilename, 'text/csv;charset=utf-8');
};

/**
 * Flatten nested objects for Excel export
 * @param obj Object to flatten
 * @param prefix Prefix for nested keys
 */
export const flattenObject = (obj: any, prefix = ''): any => {
  const flattened: any = {};

  Object.keys(obj).forEach((key) => {
    const value = obj[key];
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(flattened, flattenObject(value, newKey));
    } else if (Array.isArray(value)) {
      flattened[newKey] = value.join(', ');
    } else {
      flattened[newKey] = value;
    }
  });

  return flattened;
};

/**
 * Prepare providers data for export
 * @param providers Array of provider objects
 * @param type Provider type (hospital, lab, clinic)
 */
export const prepareProvidersForExport = (providers: any[], type: 'hospital' | 'lab' | 'clinic') => {
  return providers.map((provider) => {
    const flattened = flattenObject(provider);
    
    // Common fields for all types
    const baseData: any = {
      ID: flattened.id,
      Name: flattened.name,
      City: flattened.city,
      State: flattened.state,
      Pincode: flattened.pincode,
      Phone: flattened.phone || flattened.mobile,
      Email: flattened.email,
      Address: flattened['address.street'] || flattened.address,
      Classification: flattened.classification,
      'Quality Score': flattened.quality_score,
    };

    // Type-specific fields
    if (type === 'hospital') {
      return {
        ...baseData,
        'Total Beds': flattened.total_beds,
        'Available Beds': flattened.available_beds,
        'Emergency Services': flattened.emergency_services ? 'Yes' : 'No',
        Services: flattened.services,
      };
    }

    if (type === 'lab') {
      return {
        ...baseData,
        'Pincode Mapped': flattened.pincode_mapped ? 'Yes' : 'No',
        Area: flattened['address.area'] || flattened.area,
        Locality: flattened['address.locality'] || flattened.locality,
        Latitude: flattened['coordinates.lat'] || flattened['coordinates.latitude'],
        Longitude: flattened['coordinates.lng'] || flattened['coordinates.longitude'],
        Services: flattened.services,
      };
    }

    if (type === 'clinic') {
      return {
        ...baseData,
        'Clinic Type': flattened.sub_type || flattened.type,
        Specialties: flattened.specialties,
        'Doctor Capacity': flattened.doctor_capacity,
        'Current Doctors': flattened.current_doctors,
      };
    }

    return baseData;
  });
};

/**
 * Export providers with proper formatting
 * @param providers Array of provider objects
 * @param type Provider type
 * @param format Export format ('excel' or 'csv')
 */
export const exportProviders = (
  providers: any[],
  type: 'hospital' | 'lab' | 'clinic',
  format: 'excel' | 'csv' = 'excel'
) => {
  const preparedData = prepareProvidersForExport(providers, type);
  const filename = `${type}s_${providers.length}_records`;

  if (format === 'csv') {
    exportToCSV(preparedData, { filename, includeTimestamp: true });
  } else {
    exportToExcel(preparedData, {
      filename,
      sheetName: `${type.charAt(0).toUpperCase() + type.slice(1)}s`,
      includeTimestamp: true,
    });
  }
};

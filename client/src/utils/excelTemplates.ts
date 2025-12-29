import ExcelJS from 'exceljs';
import { downloadArrayBuffer } from './downloadFile';

const downloadXlsx = async (sheetName: string, data: any[], columnWidths: number[], filename: string) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(sheetName);

    const headers = data.length > 0 ? Object.keys(data[0]) : [];
    worksheet.columns = headers.map((h, idx) => ({
        header: h,
        key: h,
        width: columnWidths[idx] ?? Math.min(60, Math.max(12, h.length + 4))
    }));

    for (const row of data) {
        worksheet.addRow(row);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    downloadArrayBuffer(
        buffer as ArrayBuffer,
        filename,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
};

export const generateDoctorTemplate = () => {
    const templateData = [
        {
            'Doctor Name': 'Dr. John Smith',
            'Gender': 'Male',
            'Specialty': 'Cardiology',
            'Qualification': 'MBBS, MD (Cardiology)',
            'Experience (Years)': 15,
            'Registration Number': 'MCI-12345',
            'Medical Council': 'Maharashtra Medical Council',
            'City': 'Mumbai',
            'State': 'Maharashtra',
            'Mobile Number': '+91-9876543210',
            'Email': 'john.smith@example.com',
            'Clinic Name': 'Heart Care Clinic',
            'Clinic Address': '123 Medical Center, Andheri West',
            'Consultation Fee': 800
        },
        {
            'Doctor Name': 'Dr. Sarah Johnson',
            'Gender': 'Female',
            'Specialty': 'Pediatrics',
            'Qualification': 'MBBS, DCH',
            'Experience (Years)': 10,
            'Registration Number': 'MCI-67890',
            'Medical Council': 'Delhi Medical Council',
            'City': 'Delhi',
            'State': 'Delhi',
            'Mobile Number': '+91-9123456789',
            'Email': 'sarah.j@example.com',
            'Clinic Name': 'Kids Health Clinic',
            'Clinic Address': '456 Park Street, South Delhi',
            'Consultation Fee': 600
        }
    ];

    downloadXlsx(
        'Doctors',
        templateData,
        [25, 12, 20, 30, 18, 20, 24, 15, 15, 18, 25, 25, 35, 18],
        'Doctors_Upload_Template.xlsx'
    );
};

export const generateLabTemplate = () => {
    const templateData = [
        {
            'Lab Name': 'Pathcare Diagnostics',
            'Email': 'info@pathcare.com',
            'Phone': '+91-1234567890',
            'Type': 'Diagnostic Lab',
            'Street Address': '123 Medical Street',
            'City': 'Bangalore',
            'State': 'Karnataka',
            'Pincode': '560001',
            'Area': 'Indiranagar',
            'Test Types': 'Blood Test,X-Ray,MRI,CT Scan',
            'NABL Accredited': 'Yes',
            'ISO Certified': 'Yes',
            'Home Collection': 'Yes',
            'Online Reports': 'Yes',
            'Website': 'https://pathcare.com'
        },
        {
            'Lab Name': 'Healthplus Labs',
            'Email': 'contact@healthplus.com',
            'Phone': '+91-9876543210',
            'Type': 'Pathology Lab',
            'Street Address': '456 Health Avenue',
            'City': 'Hyderabad',
            'State': 'Telangana',
            'Pincode': '500001',
            'Area': 'Banjara Hills',
            'Test Types': 'Blood Test,Urine Test,Pathology',
            'NABL Accredited': 'Yes',
            'ISO Certified': 'No',
            'Home Collection': 'Yes',
            'Online Reports': 'Yes',
            'Website': 'https://healthplus.com'
        }
    ];

    downloadXlsx(
        'Labs',
        templateData,
        [25, 25, 18, 20, 30, 15, 15, 10, 15, 40, 18, 15, 18, 15, 25],
        'Labs_Upload_Template.xlsx'
    );
};

export const generateClinicTemplate = () => {
    const templateData = [
        {
            'Clinic Name': 'City Dental Clinic',
            'Email': 'info@citydental.com',
            'Phone': '+91-1234567890',
            'Type': 'Dental Clinic',
            'Street Address': '789 Smile Street',
            'City': 'Pune',
            'State': 'Maharashtra',
            'Pincode': '411001',
            'Area': 'Koregaon Park',
            'Doctor Name': 'Dr. Amit Patel',
            'Specialization': 'Dental,Orthodontics',
            'Consultation Fee': 500,
            'Timings': '9 AM - 6 PM',
            'Website': 'https://citydental.com'
        },
        {
            'Clinic Name': 'Skin Care Clinic',
            'Email': 'contact@skincare.com',
            'Phone': '+91-9876543210',
            'Type': 'Dermatology Clinic',
            'Street Address': '321 Beauty Lane',
            'City': 'Chennai',
            'State': 'Tamil Nadu',
            'Pincode': '600001',
            'Area': 'T Nagar',
            'Doctor Name': 'Dr. Priya Sharma',
            'Specialization': 'Dermatology,Cosmetology',
            'Consultation Fee': 700,
            'Timings': '10 AM - 7 PM',
            'Website': 'https://skincare.com'
        }
    ];

    downloadXlsx(
        'Clinics',
        templateData,
        [25, 25, 18, 20, 30, 15, 15, 10, 15, 25, 30, 18, 20, 25],
        'Clinics_Upload_Template.xlsx'
    );
};

export const generatePharmacyTemplate = () => {
    const templateData = [
        {
            'Pharmacy Name': 'Apollo Pharmacy',
            'Email': 'store@apollo.com',
            'Phone': '+91-1234567890',
            'Street Address': '100 Medical Road',
            'City': 'Mumbai',
            'State': 'Maharashtra',
            'Pincode': '400001',
            'Area': 'Andheri',
            'Is Chain': 'Yes',
            'Chain Name': 'Apollo Pharmacy',
            'License Number': 'MH-PHARM-12345',
            'GST Number': '27AAAAA0000A1Z5',
            'Home Delivery': 'Yes',
            'Online Ordering': 'Yes',
            '24/7 Service': 'Yes',
            'Website': 'https://apollo.com'
        },
        {
            'Pharmacy Name': 'MedPlus',
            'Email': 'info@medplus.com',
            'Phone': '+91-9876543210',
            'Street Address': '200 Health Street',
            'City': 'Hyderabad',
            'State': 'Telangana',
            'Pincode': '500001',
            'Area': 'Jubilee Hills',
            'Is Chain': 'Yes',
            'Chain Name': 'MedPlus',
            'License Number': 'TG-PHARM-67890',
            'GST Number': '36BBBBB0000B1Z6',
            'Home Delivery': 'Yes',
            'Online Ordering': 'Yes',
            '24/7 Service': 'No',
            'Website': 'https://medplus.com'
        }
    ];

    downloadXlsx(
        'Pharmacies',
        templateData,
        [25, 25, 18, 30, 15, 15, 10, 15, 10, 20, 20, 20, 15, 18, 15, 25],
        'Pharmacies_Upload_Template.xlsx'
    );
};

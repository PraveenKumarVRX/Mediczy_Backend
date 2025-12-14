import * as XLSX from 'xlsx';

export const generateDoctorTemplate = () => {
    const templateData = [
        {
            'Doctor Name': 'Dr. John Smith',
            'Gender': 'Male',
            'Specialty': 'Cardiology',
            'Qualification': 'MBBS, MD (Cardiology)',
            'Experience (Years)': 15,
            'Registration Number': 'MCI-12345',
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
            'City': 'Delhi',
            'State': 'Delhi',
            'Mobile Number': '+91-9123456789',
            'Email': 'sarah.j@example.com',
            'Clinic Name': 'Kids Health Clinic',
            'Clinic Address': '456 Park Street, South Delhi',
            'Consultation Fee': 600
        }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Doctors');
    
    worksheet['!cols'] = [
        { wch: 25 }, { wch: 12 }, { wch: 20 }, { wch: 30 }, 
        { wch: 18 }, { wch: 20 }, { wch: 15 }, { wch: 15 },
        { wch: 18 }, { wch: 25 }, { wch: 25 }, { wch: 35 }, { wch: 18 }
    ];

    XLSX.writeFile(workbook, 'Doctors_Upload_Template.xlsx');
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

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Labs');
    
    worksheet['!cols'] = [
        { wch: 25 }, { wch: 25 }, { wch: 18 }, { wch: 20 }, { wch: 30 },
        { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 15 }, { wch: 40 },
        { wch: 18 }, { wch: 15 }, { wch: 18 }, { wch: 15 }, { wch: 25 }
    ];

    XLSX.writeFile(workbook, 'Labs_Upload_Template.xlsx');
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

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Clinics');
    
    worksheet['!cols'] = [
        { wch: 25 }, { wch: 25 }, { wch: 18 }, { wch: 20 }, { wch: 30 },
        { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 15 }, { wch: 25 },
        { wch: 30 }, { wch: 18 }, { wch: 20 }, { wch: 25 }
    ];

    XLSX.writeFile(workbook, 'Clinics_Upload_Template.xlsx');
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

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Pharmacies');
    
    worksheet['!cols'] = [
        { wch: 25 }, { wch: 25 }, { wch: 18 }, { wch: 30 }, { wch: 15 },
        { wch: 15 }, { wch: 10 }, { wch: 15 }, { wch: 10 }, { wch: 20 },
        { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 18 }, { wch: 15 }, { wch: 25 }
    ];

    XLSX.writeFile(workbook, 'Pharmacies_Upload_Template.xlsx');
};

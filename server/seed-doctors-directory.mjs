/**
 * Doctor Directory Seed Script
 * Populates the doctors table with realistic Indian doctor profiles
 * covering specialties underrepresented or missing from the current 557 seeded records.
 *
 * Usage: node seed-doctors-directory.mjs
 */

import pg from 'pg';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const { Pool } = pg;

const pool = new Pool({
  host: process.env.POSTGRES_HOST || '127.0.0.1',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DATABASE || 'mediczy_ai',
  user: process.env.POSTGRES_USER || 'mediczy_helper',
  password: process.env.POSTGRES_PASSWORD,
  ssl: false,
});

// ─────────────────────────────────────────────────────────────────
// DATA POOLS
// ─────────────────────────────────────────────────────────────────

const MALE_NAMES = [
  'Aarav','Aditya','Akash','Amit','Anand','Anil','Ankit','Anup','Arjun','Arnav',
  'Ashish','Ashok','Ayush','Deepak','Dev','Dhruv','Dinesh','Ganesh','Gaurav','Hemant',
  'Ishaan','Jay','Jayesh','Karan','Kartik','Krishna','Kunal','Lokesh','Mahesh','Manoj',
  'Mihir','Milind','Mohit','Nakul','Neeraj','Nikhil','Nilesh','Niraj','Nishanth','Om',
  'Pankaj','Pavan','Pradeep','Prakash','Pranav','Prashant','Praveen','Rahul','Raj','Rajesh',
  'Rakesh','Ram','Ramesh','Ravi','Ritesh','Rohan','Rohit','Sachin','Sandeep','Sanjay',
  'Santosh','Saurabh','Shailesh','Shiv','Shubham','Siddharth','Soham','Sudhir','Suresh',
  'Tarun','Tushar','Uday','Varun','Vijay','Vikas','Vikram','Vimal','Vinay','Vishal',
  'Yash','Yogesh','Zubair','Farhan','Hamid','Imran','Javed','Khalid','Mohammed','Mustafa',
];

const FEMALE_NAMES = [
  'Aadhya','Aishwarya','Amita','Amruta','Ananya','Anjali','Anuja','Archana','Avni',
  'Bhavna','Chhaya','Deepa','Deepika','Divya','Gauri','Geeta','Harshada','Heena',
  'Ishita','Jyoti','Kavita','Kavya','Kiran','Lakshmi','Lata','Madhuri','Mala','Manasi',
  'Meena','Meera','Megha','Minal','Namrata','Neha','Nidhi','Nikita','Nisha','Nita',
  'Pallavi','Pooja','Preeti','Prerna','Priya','Radha','Rashmi','Rekha','Riddhi','Ritu',
  'Rohini','Roshani','Sana','Sangeeta','Sarita','Shilpa','Shruti','Smita','Sneha',
  'Sonal','Soumya','Sridevi','Supriya','Swapna','Tara','Uma','Usha','Varsha','Vidya',
  'Vrinda','Yamini','Zara','Fatima','Nadia','Razia','Shabana','Tabassum',
];

const SURNAMES = [
  'Agarwal','Agrawal','Ahuja','Arora','Bajaj','Bala','Banerjee','Bapat','Basu',
  'Bhatt','Bose','Chakraborty','Chatterjee','Chaudhary','Chavan','Chouhan','Das',
  'Desai','Deshpande','Dutta','Gandhi','Garg','Ghosh','Goyal','Gupta','Iyer','Jha',
  'Joshi','Kadam','Kapoor','Kaur','Khan','Khanna','Kulkarni','Kumar','Lal','Mahajan',
  'Mane','Mehta','Mishra','Modi','Mukherjee','Nair','Naik','Pandey','Patel','Patil',
  'Pillai','Prasad','Rao','Reddy','Roy','Sahni','Saxena','Shah','Sharma','Shinde',
  'Singh','Singhania','Sinha','Srivastava','Thakur','Tiwari','Tripathi','Verma','Yadav',
];

const CITIES = [
  'Mumbai','Delhi','Bangalore','Chennai','Hyderabad','Pune','Kolkata','Ahmedabad',
  'Jaipur','Lucknow','Surat','Kochi','Indore','Nagpur','Patna','Bhopal','Vadodara',
  'Chandigarh','Visakhapatnam','Thiruvananthapuram','Coimbatore','Mangalore','Mysore',
  'Nashik','Aurangabad','Jodhpur','Udaipur','Amritsar','Ludhiana','Agra',
];

const LANGUAGES = ['Hindi','English','Tamil','Telugu','Kannada','Malayalam','Marathi',
  'Bengali','Gujarati','Punjabi','Odia','Urdu'];

// ─────────────────────────────────────────────────────────────────
// SPECIALTY CONFIGURATION
// ─────────────────────────────────────────────────────────────────

const SPECIALTIES = [
  {
    name: 'Dermatologist',
    qualifications: ['MBBS, MD (Dermatology)','MBBS, DVL','MBBS, MD (DVL)','MBBS, MD, DNB (Dermatology)'],
    feeRange: [500, 1200],
    count: 20,
  },
  {
    name: 'Psychiatrist',
    qualifications: ['MBBS, MD (Psychiatry)','MBBS, DPM','MBBS, MD, DNB (Psychiatry)','MBBS, MD, Fellowship in Psychiatry'],
    feeRange: [600, 1500],
    count: 15,
  },
  {
    name: 'Ophthalmologist',
    qualifications: ['MBBS, MS (Ophthalmology)','MBBS, DO','MBBS, DNB (Ophthalmology)','MBBS, MS, FRCS (Ophthal)'],
    feeRange: [400, 1000],
    count: 15,
  },
  {
    name: 'Oncologist',
    qualifications: ['MBBS, MD (Oncology)','MBBS, DM (Medical Oncology)','MBBS, MS, MCh (Surgical Oncology)','MBBS, MD, DM (Haematology & Oncology)'],
    feeRange: [800, 2000],
    count: 12,
  },
  {
    name: 'Rheumatologist',
    qualifications: ['MBBS, MD (General Medicine), DM (Rheumatology)','MBBS, MD, Fellowship in Rheumatology','MBBS, DNB, DM (Rheumatology)'],
    feeRange: [700, 1500],
    count: 8,
  },
  {
    name: 'Allergist',
    qualifications: ['MBBS, MD (Allergy & Immunology)','MBBS, MD, DNB (Immunology)','MBBS, DM (Clinical Immunology)'],
    feeRange: [500, 1200],
    count: 8,
  },
  {
    name: 'Hematologist',
    qualifications: ['MBBS, MD (Haematology)','MBBS, DM (Haematology)','MBBS, MD, DNB (Haematology)'],
    feeRange: [700, 1500],
    count: 8,
  },
  {
    name: 'Physiotherapist',
    qualifications: ['BPT','MPT','BPT, MPT (Orthopaedics)','BPT, MPT (Neurology)','BPT, MPT, PhD'],
    feeRange: [300, 800],
    count: 15,
  },
  {
    name: 'Nutritionist',
    qualifications: ['BSc Nutrition, MSc Nutrition','BSc Dietetics, MSc Dietetics','BSc, PG Diploma in Dietetics','MSc Food & Nutrition'],
    feeRange: [300, 700],
    count: 12,
  },
  {
    name: 'Psychologist',
    qualifications: ['MA (Psychology), PhD','MSc (Clinical Psychology)','MA Psychology, MPhil (Clinical Psychology)','PhD (Psychology)'],
    feeRange: [500, 1200],
    count: 10,
  },
  {
    name: 'Reproductive Medicine Specialist',
    qualifications: ['MBBS, MS (OBG), Fellowship in Reproductive Medicine','MBBS, DGO, DNB, Fellowship IVF','MBBS, MD (OBG), FRM'],
    feeRange: [700, 1800],
    count: 8,
  },
  {
    name: 'Sleep Medicine Specialist',
    qualifications: ['MBBS, MD (Pulmonology), Fellowship in Sleep Medicine','MBBS, MD (Neurology), Sleep Medicine','MBBS, MD (Psychiatry), Certified in Sleep Medicine'],
    feeRange: [600, 1400],
    count: 6,
  },
  {
    name: 'Sports Medicine Specialist',
    qualifications: ['MBBS, MS (Orthopaedics), Fellowship in Sports Medicine','MBBS, DNB (Sports Medicine)','MBBS, MS, FFSEM'],
    feeRange: [600, 1400],
    count: 8,
  },
  {
    name: 'Geriatric Specialist',
    qualifications: ['MBBS, MD (Geriatrics)','MBBS, MD (General Medicine), Fellowship in Geriatrics','MBBS, DNB, Fellowship Geriatric Medicine'],
    feeRange: [500, 1200],
    count: 6,
  },
  {
    name: 'Pain Management Specialist',
    qualifications: ['MBBS, MD (Anaesthesiology), Fellowship Pain Medicine','MBBS, DA, DNB, Pain Management','MBBS, MD, FIPP (Pain)'],
    feeRange: [600, 1400],
    count: 6,
  },
  {
    name: 'Infectious Disease Specialist',
    qualifications: ['MBBS, MD (Infectious Disease)','MBBS, MD (General Medicine), Fellowship Infectious Disease','MBBS, DNB, DM (Infectious Disease)'],
    feeRange: [600, 1400],
    count: 6,
  },
  {
    name: 'Neurologist',
    qualifications: ['MBBS, MD (Neurology)','MBBS, MD, DM (Neurology)','MBBS, DNB (Neurology)','MBBS, MD, Fellowship in Neurology'],
    feeRange: [700, 1800],
    count: 10,  // only 3 now, boost to 13
  },
  {
    name: 'Endocrinologist',
    qualifications: ['MBBS, MD (Endocrinology)','MBBS, DM (Endocrinology)','MBBS, MD, DNB (Endocrinology)'],
    feeRange: [600, 1500],
    count: 10,  // only 1 now, boost to 11
  },
  {
    name: 'Pulmonologist',
    qualifications: ['MBBS, MD (Pulmonology)','MBBS, DTM&H, DTCD','MBBS, MD, DNB (Respiratory Medicine)','MBBS, MD, FCCP'],
    feeRange: [600, 1400],
    count: 8,   // only 2 now, boost to 10
  },
  {
    name: 'Nephrologist',
    qualifications: ['MBBS, MD (Nephrology)','MBBS, DM (Nephrology)','MBBS, MD, DNB (Nephrology)'],
    feeRange: [700, 1600],
    count: 8,   // only 6, boost to 14
  },
  {
    name: 'Plastic Surgeon',
    qualifications: ['MBBS, MS (General Surgery), MCh (Plastic Surgery)','MBBS, MS, DNB (Plastic Surgery)','MBBS, MCh (Plastic & Reconstructive Surgery)'],
    feeRange: [800, 2000],
    count: 6,
  },
];

// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFee(range) {
  // Return a multiple of 50 within range
  const min = Math.ceil(range[0] / 50) * 50;
  const max = Math.floor(range[1] / 50) * 50;
  const steps = (max - min) / 50;
  return min + Math.floor(Math.random() * (steps + 1)) * 50;
}

function generateName(gender) {
  const first = gender === 'M' ? rand(MALE_NAMES) : rand(FEMALE_NAMES);
  const last = rand(SURNAMES);
  return { first, last };
}

function generateEmail(first, last) {
  const tag = crypto.randomBytes(3).toString('hex');
  return `${first.toLowerCase()}.${last.toLowerCase()}.${tag}@placeholder.mediczy.com`;
}

function generateWeeklySchedule() {
  const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const schedule = {};
  days.forEach(day => {
    if (day === 'Saturday' && Math.random() < 0.3) {
      schedule[day] = { available: false, slots: [] };
      return;
    }
    const startHour = randInt(9, 11);
    const endHour   = randInt(17, 20);
    const slots = [];
    for (let h = startHour; h < endHour; h++) {
      slots.push(`${String(h).padStart(2,'0')}:00`, `${String(h).padStart(2,'0')}:30`);
    }
    schedule[day] = {
      available: true,
      startTime: `${String(startHour).padStart(2,'0')}:00`,
      endTime:   `${String(endHour).padStart(2,'0')}:00`,
      slots,
    };
  });
  return schedule;
}

function generateFeeStructure(fee) {
  return {
    online:    fee,
    inClinic:  Math.round(fee * 1.3 / 50) * 50,
    followUp:  Math.round(fee * 0.6 / 50) * 50,
    emergency: Math.round(fee * 2 / 50) * 50,
  };
}

function generateServices(specialty) {
  const base = ['Online Consultation', 'Video Consultation', 'Chat Consultation', 'Prescription Renewal'];
  const specialtyServices = {
    'Dermatologist':          ['Skin Analysis', 'Acne Treatment', 'Hair Loss Treatment', 'Allergy Testing'],
    'Psychiatrist':           ['Therapy Session', 'CBT', 'Anxiety Management', 'Depression Treatment'],
    'Ophthalmologist':        ['Eye Examination', 'Vision Testing', 'Cataract Screening', 'Glaucoma Check'],
    'Nutritionist':           ['Diet Planning', 'Weight Management', 'Sports Nutrition', 'Medical Nutrition'],
    'Physiotherapist':        ['Physio Assessment', 'Exercise Prescription', 'Rehabilitation', 'Pain Management'],
    'Psychologist':           ['Counselling', 'Psychotherapy', 'Stress Management', 'Behavioural Therapy'],
  };
  return [...base, ...(specialtyServices[specialty] || ['Specialist Consultation', 'Second Opinion', 'Follow-up'])];
}

function generateLanguages() {
  const langs = ['Hindi', 'English'];
  if (Math.random() < 0.5) langs.push(rand(LANGUAGES.slice(2)));
  if (Math.random() < 0.25) langs.push(rand(LANGUAGES.slice(2)));
  return [...new Set(langs)];
}

function generateRating() {
  // Normally distributed between 3.5 and 5.0
  const base = 3.8 + Math.random() * 1.2;
  return Math.round(base * 10) / 10;
}

// ─────────────────────────────────────────────────────────────────
// SEED FUNCTION
// ─────────────────────────────────────────────────────────────────

async function seedDoctors() {
  const client = await pool.connect();

  try {
    let totalInserted = 0;

    for (const spec of SPECIALTIES) {
      console.log(`\n  Seeding ${spec.count} doctors for "${spec.name}"...`);

      for (let i = 0; i < spec.count; i++) {
        const gender     = Math.random() < 0.4 ? 'F' : 'M';
        const prefix     = 'Dr';
        const { first, last } = generateName(gender);
        const city       = rand(CITIES);
        const qual       = rand(spec.qualifications);
        const exp        = randInt(3, 30);
        const fee        = randFee(spec.feeRange);
        const rating     = generateRating();
        const reviews    = randInt(10, 600);
        const regNum     = `MCI-${randInt(10000, 99999)}-${randInt(2000, 2022)}`;
        const email      = generateEmail(first, last);
        const langs      = generateLanguages();
        const schedule   = generateWeeklySchedule();
        const feeStruct  = generateFeeStructure(fee);
        const services   = generateServices(spec.name);

        const clinicAddr = `${randInt(1,99)}, ${rand(['Shivaji Road','Gandhi Marg','MG Road','Nehru Street','Subhash Nagar','Tilak Road','Patel Nagar','Raj Bhavan Road'])}, ${city}`;

        const clinicAddrJson = {
          line1: clinicAddr,
          city,
          state: cityToState(city),
          pincode: `${randInt(100000, 799999)}`,
          country: 'India',
        };

        const qualificationsArr = qual.split(',').map(q => q.trim()).filter(Boolean);

        // Placeholder bcrypt hash — never used for actual login
        const pwHash = '$2b$10$placeholderHashDoNotUseXXXXXXXXXXXXXXXXXXXXXXXXX';

        await client.query(`
          INSERT INTO doctors (
            "firstName", "lastName", prefix, email, password, "specialization", qualification,
            qualifications, experience, "registrationNumber", "clinicAddress",
            "clinicAddress_json", "consultationFees", "onlineConsultationFee",
            "feeStructure", "weeklySchedule", languages, "servicesOffered",
            rating, "totalReviews", status, "isOnline", "isVerified",
            "emailVerified", "phoneVerified", "documentVerified",
            "organization_type", "phoneNumber", "createdAt", "updatedAt"
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8::text[], $9, $10, $11,
            $12::jsonb, $13, $13,
            $14::jsonb, $15::jsonb, $16::text[], $17::text[],
            $18, $19, 'active', true, true,
            true, false, false,
            'individual', $20, NOW(), NOW()
          )
        `, [
          first, last, prefix, email, pwHash, spec.name, qual,
          qualificationsArr, exp, regNum, clinicAddr,
          JSON.stringify(clinicAddrJson), fee,
          JSON.stringify(feeStruct), JSON.stringify(schedule),
          langs, services,
          rating, reviews,
          `${randInt(70000, 99999)}${randInt(10000, 99999)}`.slice(0, 10),
        ]);

        totalInserted++;
        if (totalInserted % 10 === 0) process.stdout.write('.');
      }
    }

    console.log(`\n\n  ✅ Inserted ${totalInserted} new doctor profiles.`);

    // Final count
    const { rows } = await client.query(`
      SELECT specialization, COUNT(*) as cnt 
      FROM doctors 
      WHERE status = 'active'
      GROUP BY specialization 
      ORDER BY cnt DESC
    `);
    console.log('\n  ─────────── Final Directory ───────────');
    rows.forEach(r => console.log(`    ${r.specialization.padEnd(35)} ${r.cnt}`));
    console.log(`\n  Total active specialties: ${rows.length}`);
    const total = rows.reduce((sum, r) => sum + parseInt(r.cnt), 0);
    console.log(`  Total active doctors:     ${total}`);

  } finally {
    client.release();
    await pool.end();
  }
}

// ─────────────────────────────────────────────────────────────────
// CITY → STATE MAPPING
// ─────────────────────────────────────────────────────────────────

function cityToState(city) {
  const map = {
    Mumbai: 'Maharashtra', Pune: 'Maharashtra', Nagpur: 'Maharashtra',
    Nashik: 'Maharashtra', Aurangabad: 'Maharashtra',
    Delhi: 'Delhi',
    Bangalore: 'Karnataka', Mysore: 'Karnataka', Mangalore: 'Karnataka',
    Chennai: 'Tamil Nadu', Coimbatore: 'Tamil Nadu',
    Hyderabad: 'Telangana', Visakhapatnam: 'Andhra Pradesh',
    Kolkata: 'West Bengal',
    Ahmedabad: 'Gujarat', Surat: 'Gujarat', Vadodara: 'Gujarat',
    Jaipur: 'Rajasthan', Jodhpur: 'Rajasthan', Udaipur: 'Rajasthan',
    Lucknow: 'Uttar Pradesh', Agra: 'Uttar Pradesh',
    Kochi: 'Kerala', Thiruvananthapuram: 'Kerala',
    Indore: 'Madhya Pradesh', Bhopal: 'Madhya Pradesh',
    Patna: 'Bihar',
    Chandigarh: 'Punjab', Amritsar: 'Punjab', Ludhiana: 'Punjab',
  };
  return map[city] || 'India';
}

// ─────────────────────────────────────────────────────────────────
// RUN
// ─────────────────────────────────────────────────────────────────

console.log('═══════════════════════════════════════════════');
console.log('  Mediczy Doctor Directory Seeder');
console.log('  Target DB: mediczy_ai @ 127.0.0.1');
console.log('═══════════════════════════════════════════════\n');

seedDoctors().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});

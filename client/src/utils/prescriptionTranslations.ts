/**
 * Multi-language Prescription Translations
 * Supports Indian regional languages for prescription printing
 */

export interface PrescriptionTranslation {
  // Header labels
  prescription: string;
  medicalPrescription: string;
  
  // Patient info labels
  patient: string;
  patientName: string;
  age: string;
  gender: string;
  ageGender: string;
  date: string;
  phone: string;
  bloodGroup: string;
  address: string;
  
  // Gender options
  male: string;
  female: string;
  other: string;
  
  // Clinical labels
  chiefComplaint: string;
  diagnosis: string;
  medications: string;
  medicine: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
  route: string;
  
  // Vital signs
  vitalSigns: string;
  bloodPressure: string;
  pulse: string;
  temperature: string;
  weight: string;
  height: string;
  spO2: string;
  
  // Additional sections
  investigationsAdvised: string;
  advice: string;
  followUp: string;
  nextVisit: string;
  knownAllergies: string;
  
  // Footer labels
  doctorSignature: string;
  registrationNo: string;
  seal: string;
  
  // Common frequency translations
  onceDailyOD: string;
  twiceDailyBD: string;
  threeTimesTDS: string;
  fourTimesQID: string;
  beforeMeals: string;
  afterMeals: string;
  atBedtime: string;
  asNeeded: string;
  morning: string;
  afternoon: string;
  evening: string;
  night: string;
  
  // Duration translations
  days: string;
  weeks: string;
  months: string;
  continuous: string;
  asDirected: string;
  
  // Common medicine instructions
  takeWithWater: string;
  takeWithMilk: string;
  avoidDriving: string;
  completeCourse: string;
  
  // Units
  mmHg: string;
  bpm: string;
  celsius: string;
  fahrenheit: string;
  kg: string;
  cm: string;
  years: string;
  yrs: string;
  
  // Disclaimer
  disclaimer: string;
}

export const prescriptionTranslations: Record<string, PrescriptionTranslation> = {
  // English (Default)
  en: {
    prescription: "Prescription",
    medicalPrescription: "Medical Prescription",
    patient: "Patient",
    patientName: "Patient Name",
    age: "Age",
    gender: "Gender",
    ageGender: "Age/Gender",
    date: "Date",
    phone: "Phone",
    bloodGroup: "Blood Group",
    address: "Address",
    male: "Male",
    female: "Female",
    other: "Other",
    chiefComplaint: "Chief Complaint",
    diagnosis: "Diagnosis",
    medications: "Medications",
    medicine: "Medicine",
    dosage: "Dosage",
    frequency: "Frequency",
    duration: "Duration",
    instructions: "Instructions",
    route: "Route",
    vitalSigns: "Vital Signs",
    bloodPressure: "Blood Pressure",
    pulse: "Pulse",
    temperature: "Temperature",
    weight: "Weight",
    height: "Height",
    spO2: "SpO2",
    investigationsAdvised: "Investigations Advised",
    advice: "Advice",
    followUp: "Follow-up",
    nextVisit: "Next Visit",
    knownAllergies: "Known Allergies",
    doctorSignature: "Doctor's Signature",
    registrationNo: "Registration No",
    seal: "Seal",
    onceDailyOD: "Once Daily (OD)",
    twiceDailyBD: "Twice Daily (BD)",
    threeTimesTDS: "Three Times Daily (TDS)",
    fourTimesQID: "Four Times Daily (QID)",
    beforeMeals: "Before Meals",
    afterMeals: "After Meals",
    atBedtime: "At Bedtime",
    asNeeded: "As Needed (SOS)",
    morning: "Morning",
    afternoon: "Afternoon",
    evening: "Evening",
    night: "Night",
    days: "days",
    weeks: "weeks",
    months: "months",
    continuous: "Continuous",
    asDirected: "As Directed",
    takeWithWater: "Take with water",
    takeWithMilk: "Take with milk",
    avoidDriving: "Avoid driving",
    completeCourse: "Complete the full course",
    mmHg: "mmHg",
    bpm: "bpm",
    celsius: "°C",
    fahrenheit: "°F",
    kg: "kg",
    cm: "cm",
    years: "years",
    yrs: "yrs",
    disclaimer: "This prescription is valid only with doctor's signature and seal. Please complete the full course of medication as prescribed."
  },

  // Tamil (தமிழ்)
  ta: {
    prescription: "மருந்து சீட்டு",
    medicalPrescription: "மருத்துவ மருந்து சீட்டு",
    patient: "நோயாளி",
    patientName: "நோயாளி பெயர்",
    age: "வயது",
    gender: "பாலினம்",
    ageGender: "வயது/பாலினம்",
    date: "தேதி",
    phone: "தொலைபேசி",
    bloodGroup: "இரத்த வகை",
    address: "முகவரி",
    male: "ஆண்",
    female: "பெண்",
    other: "மற்றவை",
    chiefComplaint: "முக்கிய குறை",
    diagnosis: "நோய் கண்டறிதல்",
    medications: "மருந்துகள்",
    medicine: "மருந்து",
    dosage: "அளவு",
    frequency: "எத்தனை முறை",
    duration: "கால அளவு",
    instructions: "அறிவுறுத்தல்கள்",
    route: "வழி",
    vitalSigns: "உயிர் அறிகுறிகள்",
    bloodPressure: "இரத்த அழுத்தம்",
    pulse: "நாடி",
    temperature: "வெப்பநிலை",
    weight: "எடை",
    height: "உயரம்",
    spO2: "ஆக்சிஜன் அளவு",
    investigationsAdvised: "பரிந்துரைக்கப்பட்ட பரிசோதனைகள்",
    advice: "ஆலோசனை",
    followUp: "மறு ஆலோசனை",
    nextVisit: "அடுத்த வருகை",
    knownAllergies: "அறியப்பட்ட ஒவ்வாமை",
    doctorSignature: "மருத்துவர் கையொப்பம்",
    registrationNo: "பதிவு எண்",
    seal: "முத்திரை",
    onceDailyOD: "தினமும் ஒரு முறை",
    twiceDailyBD: "தினமும் இரு முறை",
    threeTimesTDS: "தினமும் மூன்று முறை",
    fourTimesQID: "தினமும் நான்கு முறை",
    beforeMeals: "உணவுக்கு முன்",
    afterMeals: "உணவுக்கு பின்",
    atBedtime: "படுக்கைக்கு முன்",
    asNeeded: "தேவைப்படும் போது",
    morning: "காலை",
    afternoon: "மதியம்",
    evening: "மாலை",
    night: "இரவு",
    days: "நாட்கள்",
    weeks: "வாரங்கள்",
    months: "மாதங்கள்",
    continuous: "தொடர்ச்சியாக",
    asDirected: "அறிவுறுத்தியபடி",
    takeWithWater: "தண்ணீருடன் எடுக்கவும்",
    takeWithMilk: "பாலுடன் எடுக்கவும்",
    avoidDriving: "வாகனம் ஓட்ட வேண்டாம்",
    completeCourse: "முழு கோர்சும் முடிக்கவும்",
    mmHg: "மிமீஹெச்ஜி",
    bpm: "துடிப்பு/நிமிடம்",
    celsius: "°செ",
    fahrenheit: "°பா",
    kg: "கிகி",
    cm: "செமீ",
    years: "வயது",
    yrs: "வயது",
    disclaimer: "இந்த மருந்து சீட்டு மருத்துவரின் கையொப்பம் மற்றும் முத்திரையுடன் மட்டுமே செல்லுபடியாகும். பரிந்துரைக்கப்பட்டபடி முழு கோர்சையும் முடிக்கவும்."
  },

  // Hindi (हिंदी)
  hi: {
    prescription: "प्रिस्क्रिप्शन",
    medicalPrescription: "चिकित्सा प्रिस्क्रिप्शन",
    patient: "मरीज़",
    patientName: "मरीज़ का नाम",
    age: "उम्र",
    gender: "लिंग",
    ageGender: "उम्र/लिंग",
    date: "तारीख",
    phone: "फ़ोन",
    bloodGroup: "रक्त समूह",
    address: "पता",
    male: "पुरुष",
    female: "महिला",
    other: "अन्य",
    chiefComplaint: "मुख्य शिकायत",
    diagnosis: "निदान",
    medications: "दवाइयाँ",
    medicine: "दवाई",
    dosage: "खुराक",
    frequency: "कितनी बार",
    duration: "अवधि",
    instructions: "निर्देश",
    route: "मार्ग",
    vitalSigns: "जीवन संकेत",
    bloodPressure: "रक्तचाप",
    pulse: "नाड़ी",
    temperature: "तापमान",
    weight: "वज़न",
    height: "ऊँचाई",
    spO2: "ऑक्सीजन स्तर",
    investigationsAdvised: "सुझाई गई जाँचें",
    advice: "सलाह",
    followUp: "फॉलो-अप",
    nextVisit: "अगली मुलाकात",
    knownAllergies: "ज्ञात एलर्जी",
    doctorSignature: "डॉक्टर के हस्ताक्षर",
    registrationNo: "पंजीकरण संख्या",
    seal: "मुहर",
    onceDailyOD: "दिन में एक बार",
    twiceDailyBD: "दिन में दो बार",
    threeTimesTDS: "दिन में तीन बार",
    fourTimesQID: "दिन में चार बार",
    beforeMeals: "खाने से पहले",
    afterMeals: "खाने के बाद",
    atBedtime: "सोने से पहले",
    asNeeded: "जरूरत पड़ने पर",
    morning: "सुबह",
    afternoon: "दोपहर",
    evening: "शाम",
    night: "रात",
    days: "दिन",
    weeks: "सप्ताह",
    months: "महीने",
    continuous: "लगातार",
    asDirected: "निर्देशानुसार",
    takeWithWater: "पानी के साथ लें",
    takeWithMilk: "दूध के साथ लें",
    avoidDriving: "गाड़ी चलाने से बचें",
    completeCourse: "पूरा कोर्स लें",
    mmHg: "मिमीएचजी",
    bpm: "धड़कन/मिनट",
    celsius: "°से",
    fahrenheit: "°फा",
    kg: "किलो",
    cm: "सेमी",
    years: "वर्ष",
    yrs: "वर्ष",
    disclaimer: "यह प्रिस्क्रिप्शन डॉक्टर के हस्ताक्षर और मुहर के साथ ही मान्य है। कृपया निर्देशानुसार पूरा कोर्स लें।"
  },

  // Telugu (తెలుగు)
  te: {
    prescription: "ప్రిస్క్రిప్షన్",
    medicalPrescription: "వైద్య ప్రిస్క్రిప్షన్",
    patient: "రోగి",
    patientName: "రోగి పేరు",
    age: "వయసు",
    gender: "లింగం",
    ageGender: "వయసు/లింగం",
    date: "తేదీ",
    phone: "ఫోన్",
    bloodGroup: "రక్త గ్రూప్",
    address: "చిరునామా",
    male: "పురుషుడు",
    female: "స్త్రీ",
    other: "ఇతర",
    chiefComplaint: "ప్రధాన సమస్య",
    diagnosis: "వ్యాధి నిర్ధారణ",
    medications: "మందులు",
    medicine: "మందు",
    dosage: "మోతాదు",
    frequency: "ఎన్ని సార్లు",
    duration: "వ్యవధి",
    instructions: "సూచనలు",
    route: "మార్గం",
    vitalSigns: "ప్రాణ సంకేతాలు",
    bloodPressure: "రక్తపోటు",
    pulse: "నాడి",
    temperature: "ఉష్ణోగ్రత",
    weight: "బరువు",
    height: "ఎత్తు",
    spO2: "ఆక్సిజన్ స్థాయి",
    investigationsAdvised: "సిఫార్సు చేసిన పరీక్షలు",
    advice: "సలహా",
    followUp: "ఫాలో-అప్",
    nextVisit: "తదుపరి సందర్శన",
    knownAllergies: "తెలిసిన అలర్జీలు",
    doctorSignature: "డాక్టర్ సంతకం",
    registrationNo: "రిజిస్ట్రేషన్ నం.",
    seal: "సీల్",
    onceDailyOD: "రోజుకు ఒకసారి",
    twiceDailyBD: "రోజుకు రెండుసార్లు",
    threeTimesTDS: "రోజుకు మూడుసార్లు",
    fourTimesQID: "రోజుకు నాలుగుసార్లు",
    beforeMeals: "భోజనానికి ముందు",
    afterMeals: "భోజనం తర్వాత",
    atBedtime: "పడుకునే ముందు",
    asNeeded: "అవసరమైనప్పుడు",
    morning: "ఉదయం",
    afternoon: "మధ్యాహ్నం",
    evening: "సాయంత్రం",
    night: "రాత్రి",
    days: "రోజులు",
    weeks: "వారాలు",
    months: "నెలలు",
    continuous: "నిరంతరం",
    asDirected: "సూచించినట్లు",
    takeWithWater: "నీటితో తీసుకోండి",
    takeWithMilk: "పాలతో తీసుకోండి",
    avoidDriving: "డ్రైవింగ్ మానుకోండి",
    completeCourse: "పూర్తి కోర్సు తీసుకోండి",
    mmHg: "మిమీహెచ్‌జి",
    bpm: "బీపీఎం",
    celsius: "°సె",
    fahrenheit: "°ఫా",
    kg: "కేజీ",
    cm: "సెం.మీ",
    years: "సంవత్సరాలు",
    yrs: "సం.",
    disclaimer: "ఈ ప్రిస్క్రిప్షన్ డాక్టర్ సంతకం మరియు సీల్‌తో మాత్రమే చెల్లుతుంది. దయచేసి సూచించిన విధంగా పూర్తి కోర్సు తీసుకోండి."
  },

  // Kannada (ಕನ್ನಡ)
  kn: {
    prescription: "ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್",
    medicalPrescription: "ವೈದ್ಯಕೀಯ ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್",
    patient: "ರೋಗಿ",
    patientName: "ರೋಗಿಯ ಹೆಸರು",
    age: "ವಯಸ್ಸು",
    gender: "ಲಿಂಗ",
    ageGender: "ವಯಸ್ಸು/ಲಿಂಗ",
    date: "ದಿನಾಂಕ",
    phone: "ಫೋನ್",
    bloodGroup: "ರಕ್ತ ಗುಂಪು",
    address: "ವಿಳಾಸ",
    male: "ಪುರುಷ",
    female: "ಮಹಿಳೆ",
    other: "ಇತರೆ",
    chiefComplaint: "ಮುಖ್ಯ ಸಮಸ್ಯೆ",
    diagnosis: "ರೋಗ ನಿರ್ಣಯ",
    medications: "ಔಷಧಿಗಳು",
    medicine: "ಔಷಧಿ",
    dosage: "ಡೋಸೇಜ್",
    frequency: "ಎಷ್ಟು ಬಾರಿ",
    duration: "ಅವಧಿ",
    instructions: "ಸೂಚನೆಗಳು",
    route: "ಮಾರ್ಗ",
    vitalSigns: "ಪ್ರಮುಖ ಸಂಕೇತಗಳು",
    bloodPressure: "ರಕ್ತದೊತ್ತಡ",
    pulse: "ನಾಡಿ",
    temperature: "ತಾಪಮಾನ",
    weight: "ತೂಕ",
    height: "ಎತ್ತರ",
    spO2: "ಆಮ್ಲಜನಕ ಮಟ್ಟ",
    investigationsAdvised: "ಶಿಫಾರಸು ಮಾಡಿದ ಪರೀಕ್ಷೆಗಳು",
    advice: "ಸಲಹೆ",
    followUp: "ಫಾಲೋ-ಅಪ್",
    nextVisit: "ಮುಂದಿನ ಭೇಟಿ",
    knownAllergies: "ತಿಳಿದಿರುವ ಅಲರ್ಜಿಗಳು",
    doctorSignature: "ವೈದ್ಯರ ಸಹಿ",
    registrationNo: "ನೋಂದಣಿ ಸಂಖ್ಯೆ",
    seal: "ಮುದ್ರೆ",
    onceDailyOD: "ದಿನಕ್ಕೆ ಒಂದು ಬಾರಿ",
    twiceDailyBD: "ದಿನಕ್ಕೆ ಎರಡು ಬಾರಿ",
    threeTimesTDS: "ದಿನಕ್ಕೆ ಮೂರು ಬಾರಿ",
    fourTimesQID: "ದಿನಕ್ಕೆ ನಾಲ್ಕು ಬಾರಿ",
    beforeMeals: "ಊಟಕ್ಕೆ ಮುಂಚೆ",
    afterMeals: "ಊಟದ ನಂತರ",
    atBedtime: "ಮಲಗುವ ಮುನ್ನ",
    asNeeded: "ಅಗತ್ಯವಿದ್ದಾಗ",
    morning: "ಬೆಳಿಗ್ಗೆ",
    afternoon: "ಮಧ್ಯಾಹ್ನ",
    evening: "ಸಂಜೆ",
    night: "ರಾತ್ರಿ",
    days: "ದಿನಗಳು",
    weeks: "ವಾರಗಳು",
    months: "ತಿಂಗಳುಗಳು",
    continuous: "ನಿರಂತರ",
    asDirected: "ಸೂಚಿಸಿದಂತೆ",
    takeWithWater: "ನೀರಿನೊಂದಿಗೆ ತೆಗೆದುಕೊಳ್ಳಿ",
    takeWithMilk: "ಹಾಲಿನೊಂದಿಗೆ ತೆಗೆದುಕೊಳ್ಳಿ",
    avoidDriving: "ಚಾಲನೆ ಮಾಡಬೇಡಿ",
    completeCourse: "ಪೂರ್ಣ ಕೋರ್ಸ್ ತೆಗೆದುಕೊಳ್ಳಿ",
    mmHg: "ಎಂಎಂಹೆಚ್‌ಜಿ",
    bpm: "ಬಿಪಿಎಂ",
    celsius: "°ಸೆ",
    fahrenheit: "°ಫ",
    kg: "ಕೆಜಿ",
    cm: "ಸೆಂಮೀ",
    years: "ವರ್ಷಗಳು",
    yrs: "ವರ್ಷ",
    disclaimer: "ಈ ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ವೈದ್ಯರ ಸಹಿ ಮತ್ತು ಮುದ್ರೆಯೊಂದಿಗೆ ಮಾತ್ರ ಮಾನ್ಯವಾಗಿರುತ್ತದೆ. ದಯವಿಟ್ಟು ಸೂಚಿಸಿದಂತೆ ಪೂರ್ಣ ಕೋರ್ಸ್ ತೆಗೆದುಕೊಳ್ಳಿ."
  },

  // Malayalam (മലയാളം)
  ml: {
    prescription: "കുറിപ്പടി",
    medicalPrescription: "മെഡിക്കൽ കുറിപ്പടി",
    patient: "രോഗി",
    patientName: "രോഗിയുടെ പേര്",
    age: "പ്രായം",
    gender: "ലിംഗം",
    ageGender: "പ്രായം/ലിംഗം",
    date: "തീയതി",
    phone: "ഫോൺ",
    bloodGroup: "രക്ത ഗ്രൂപ്പ്",
    address: "വിലാസം",
    male: "പുരുഷൻ",
    female: "സ്ത്രീ",
    other: "മറ്റുള്ളവ",
    chiefComplaint: "പ്രധാന പരാതി",
    diagnosis: "രോഗനിർണയം",
    medications: "മരുന്നുകൾ",
    medicine: "മരുന്ന്",
    dosage: "ഡോസേജ്",
    frequency: "എത്ര തവണ",
    duration: "കാലയളവ്",
    instructions: "നിർദ്ദേശങ്ങൾ",
    route: "മാർഗ്ഗം",
    vitalSigns: "ജീവൻ അടയാളങ്ങൾ",
    bloodPressure: "രക്തസമ്മർദ്ദം",
    pulse: "നാഡി",
    temperature: "താപനില",
    weight: "ഭാരം",
    height: "ഉയരം",
    spO2: "ഓക്സിജൻ അളവ്",
    investigationsAdvised: "ശുപാർശ ചെയ്ത പരിശോധനകൾ",
    advice: "ഉപദേശം",
    followUp: "ഫോളോ-അപ്പ്",
    nextVisit: "അടുത്ത സന്ദർശനം",
    knownAllergies: "അറിയപ്പെടുന്ന അലർജികൾ",
    doctorSignature: "ഡോക്ടറുടെ ഒപ്പ്",
    registrationNo: "രജിസ്ട്രേഷൻ നമ്പർ",
    seal: "സീൽ",
    onceDailyOD: "ദിവസം ഒരു തവണ",
    twiceDailyBD: "ദിവസം രണ്ട് തവണ",
    threeTimesTDS: "ദിവസം മൂന്ന് തവണ",
    fourTimesQID: "ദിവസം നാല് തവണ",
    beforeMeals: "ഭക്ഷണത്തിന് മുമ്പ്",
    afterMeals: "ഭക്ഷണത്തിന് ശേഷം",
    atBedtime: "ഉറങ്ങുന്നതിന് മുമ്പ്",
    asNeeded: "ആവശ്യമെങ്കിൽ",
    morning: "രാവിലെ",
    afternoon: "ഉച്ചയ്ക്ക്",
    evening: "വൈകുന്നേരം",
    night: "രാത്രി",
    days: "ദിവസങ്ങൾ",
    weeks: "ആഴ്ചകൾ",
    months: "മാസങ്ങൾ",
    continuous: "തുടർച്ചയായി",
    asDirected: "നിർദ്ദേശിച്ചതുപോലെ",
    takeWithWater: "വെള്ളത്തിൽ കഴിക്കുക",
    takeWithMilk: "പാലിൽ കഴിക്കുക",
    avoidDriving: "വാഹനമോടിക്കരുത്",
    completeCourse: "മുഴുവൻ കോഴ്സും കഴിക്കുക",
    mmHg: "മിമീഎച്ച്ജി",
    bpm: "ബിപിഎം",
    celsius: "°സെ",
    fahrenheit: "°ഫ",
    kg: "കിഗ്രാം",
    cm: "സെമീ",
    years: "വയസ്സ്",
    yrs: "വയസ്സ്",
    disclaimer: "ഈ കുറിപ്പടി ഡോക്ടറുടെ ഒപ്പും സീലും ഉണ്ടെങ്കിൽ മാത്രമേ സാധുതയുള്ളൂ. ദയവായി നിർദ്ദേശിച്ചതുപോലെ മുഴുവൻ കോഴ്സും കഴിക്കുക."
  },

  // Bengali (বাংলা)
  bn: {
    prescription: "প্রেসক্রিপশন",
    medicalPrescription: "চিকিৎসা প্রেসক্রিপশন",
    patient: "রোগী",
    patientName: "রোগীর নাম",
    age: "বয়স",
    gender: "লিঙ্গ",
    ageGender: "বয়স/লিঙ্গ",
    date: "তারিখ",
    phone: "ফোন",
    bloodGroup: "রক্তের গ্রুপ",
    address: "ঠিকানা",
    male: "পুরুষ",
    female: "মহিলা",
    other: "অন্যান্য",
    chiefComplaint: "প্রধান অভিযোগ",
    diagnosis: "রোগ নির্ণয়",
    medications: "ওষুধ",
    medicine: "ওষুধ",
    dosage: "ডোজ",
    frequency: "কতবার",
    duration: "সময়কাল",
    instructions: "নির্দেশাবলী",
    route: "পথ",
    vitalSigns: "গুরুত্বপূর্ণ লক্ষণ",
    bloodPressure: "রক্তচাপ",
    pulse: "নাড়ি",
    temperature: "তাপমাত্রা",
    weight: "ওজন",
    height: "উচ্চতা",
    spO2: "অক্সিজেন স্তর",
    investigationsAdvised: "প্রস্তাবিত পরীক্ষা",
    advice: "পরামর্শ",
    followUp: "ফলো-আপ",
    nextVisit: "পরবর্তী সাক্ষাৎ",
    knownAllergies: "পরিচিত এলার্জি",
    doctorSignature: "ডাক্তারের স্বাক্ষর",
    registrationNo: "রেজিস্ট্রেশন নং",
    seal: "সীল",
    onceDailyOD: "দিনে একবার",
    twiceDailyBD: "দিনে দুইবার",
    threeTimesTDS: "দিনে তিনবার",
    fourTimesQID: "দিনে চারবার",
    beforeMeals: "খাওয়ার আগে",
    afterMeals: "খাওয়ার পরে",
    atBedtime: "ঘুমানোর আগে",
    asNeeded: "প্রয়োজনে",
    morning: "সকাল",
    afternoon: "দুপুর",
    evening: "সন্ধ্যা",
    night: "রাত",
    days: "দিন",
    weeks: "সপ্তাহ",
    months: "মাস",
    continuous: "ক্রমাগত",
    asDirected: "নির্দেশ মতো",
    takeWithWater: "জলের সাথে খান",
    takeWithMilk: "দুধের সাথে খান",
    avoidDriving: "গাড়ি চালানো এড়িয়ে চলুন",
    completeCourse: "পুরো কোর্স শেষ করুন",
    mmHg: "এমএমএইচজি",
    bpm: "বিপিএম",
    celsius: "°সে",
    fahrenheit: "°ফা",
    kg: "কেজি",
    cm: "সেমি",
    years: "বছর",
    yrs: "বছর",
    disclaimer: "এই প্রেসক্রিপশন শুধুমাত্র ডাক্তারের স্বাক্ষর এবং সীল সহ বৈধ। অনুগ্রহ করে নির্দেশ মতো পুরো কোর্স শেষ করুন।"
  },

  // Marathi (मराठी)
  mr: {
    prescription: "प्रिस्क्रिप्शन",
    medicalPrescription: "वैद्यकीय प्रिस्क्रिप्शन",
    patient: "रुग्ण",
    patientName: "रुग्णाचे नाव",
    age: "वय",
    gender: "लिंग",
    ageGender: "वय/लिंग",
    date: "तारीख",
    phone: "फोन",
    bloodGroup: "रक्तगट",
    address: "पत्ता",
    male: "पुरुष",
    female: "स्त्री",
    other: "इतर",
    chiefComplaint: "मुख्य तक्रार",
    diagnosis: "निदान",
    medications: "औषधे",
    medicine: "औषध",
    dosage: "मात्रा",
    frequency: "किती वेळा",
    duration: "कालावधी",
    instructions: "सूचना",
    route: "मार्ग",
    vitalSigns: "जीवन चिन्हे",
    bloodPressure: "रक्तदाब",
    pulse: "नाडी",
    temperature: "तापमान",
    weight: "वजन",
    height: "उंची",
    spO2: "ऑक्सिजन पातळी",
    investigationsAdvised: "सुचवलेल्या तपासण्या",
    advice: "सल्ला",
    followUp: "फॉलो-अप",
    nextVisit: "पुढील भेट",
    knownAllergies: "ज्ञात अॅलर्जी",
    doctorSignature: "डॉक्टरांची स्वाक्षरी",
    registrationNo: "नोंदणी क्रमांक",
    seal: "शिक्का",
    onceDailyOD: "दिवसातून एकदा",
    twiceDailyBD: "दिवसातून दोनदा",
    threeTimesTDS: "दिवसातून तीनदा",
    fourTimesQID: "दिवसातून चारदा",
    beforeMeals: "जेवणापूर्वी",
    afterMeals: "जेवणानंतर",
    atBedtime: "झोपण्यापूर्वी",
    asNeeded: "गरज असल्यास",
    morning: "सकाळ",
    afternoon: "दुपार",
    evening: "संध्याकाळ",
    night: "रात्र",
    days: "दिवस",
    weeks: "आठवडे",
    months: "महिने",
    continuous: "सतत",
    asDirected: "सूचनेनुसार",
    takeWithWater: "पाण्यासोबत घ्या",
    takeWithMilk: "दुधासोबत घ्या",
    avoidDriving: "वाहन चालवू नका",
    completeCourse: "संपूर्ण कोर्स पूर्ण करा",
    mmHg: "एमएमएचजी",
    bpm: "बीपीएम",
    celsius: "°से",
    fahrenheit: "°फा",
    kg: "किलो",
    cm: "सेमी",
    years: "वर्षे",
    yrs: "वर्षे",
    disclaimer: "हे प्रिस्क्रिप्शन डॉक्टरांच्या स्वाक्षरी आणि शिक्क्यासह मान्य आहे. कृपया सूचनेनुसार संपूर्ण कोर्स पूर्ण करा."
  },

  // Gujarati (ગુજરાતી)
  gu: {
    prescription: "પ્રિસ્ક્રિપ્શન",
    medicalPrescription: "મેડિકલ પ્રિસ્ક્રિપ્શન",
    patient: "દર્દી",
    patientName: "દર્દીનું નામ",
    age: "ઉંમર",
    gender: "જાતિ",
    ageGender: "ઉંમર/જાતિ",
    date: "તારીખ",
    phone: "ફોન",
    bloodGroup: "બ્લડ ગ્રુપ",
    address: "સરનામું",
    male: "પુરુષ",
    female: "સ્ત્રી",
    other: "અન્ય",
    chiefComplaint: "મુખ્ય ફરિયાદ",
    diagnosis: "નિદાન",
    medications: "દવાઓ",
    medicine: "દવા",
    dosage: "માત્રા",
    frequency: "કેટલી વાર",
    duration: "સમયગાળો",
    instructions: "સૂચનાઓ",
    route: "માર્ગ",
    vitalSigns: "જીવન ચિહ્નો",
    bloodPressure: "બ્લડ પ્રેશર",
    pulse: "નાડી",
    temperature: "તાપમાન",
    weight: "વજન",
    height: "ઊંચાઈ",
    spO2: "ઓક્સિજન સ્તર",
    investigationsAdvised: "સૂચવેલી તપાસો",
    advice: "સલાહ",
    followUp: "ફોલો-અપ",
    nextVisit: "આગામી મુલાકાત",
    knownAllergies: "જાણીતી એલર્જી",
    doctorSignature: "ડોક્ટરની સહી",
    registrationNo: "રજિસ્ટ્રેશન નં.",
    seal: "સીલ",
    onceDailyOD: "દિવસમાં એક વાર",
    twiceDailyBD: "દિવસમાં બે વાર",
    threeTimesTDS: "દિવસમાં ત્રણ વાર",
    fourTimesQID: "દિવસમાં ચાર વાર",
    beforeMeals: "જમવા પહેલાં",
    afterMeals: "જમ્યા પછી",
    atBedtime: "સૂતા પહેલાં",
    asNeeded: "જરૂર પડ્યે",
    morning: "સવાર",
    afternoon: "બપોર",
    evening: "સાંજ",
    night: "રાત",
    days: "દિવસ",
    weeks: "અઠવાડિયા",
    months: "મહિના",
    continuous: "સતત",
    asDirected: "સૂચના મુજબ",
    takeWithWater: "પાણી સાથે લો",
    takeWithMilk: "દૂધ સાથે લો",
    avoidDriving: "વાહન ચલાવશો નહીં",
    completeCourse: "સંપૂર્ણ કોર્સ પૂર્ણ કરો",
    mmHg: "એમએમએચજી",
    bpm: "બીપીએમ",
    celsius: "°સે",
    fahrenheit: "°ફા",
    kg: "કિલો",
    cm: "સેમી",
    years: "વર્ષ",
    yrs: "વર્ષ",
    disclaimer: "આ પ્રિસ્ક્રિપ્શન ડોક્ટરની સહી અને સીલ સાથે જ માન્ય છે. કૃપા કરીને સૂચના મુજબ સંપૂર્ણ કોર્સ પૂર્ણ કરો."
  },

  // Punjabi (ਪੰਜਾਬੀ)
  pa: {
    prescription: "ਨੁਸਖ਼ਾ",
    medicalPrescription: "ਡਾਕਟਰੀ ਨੁਸਖ਼ਾ",
    patient: "ਮਰੀਜ਼",
    patientName: "ਮਰੀਜ਼ ਦਾ ਨਾਮ",
    age: "ਉਮਰ",
    gender: "ਲਿੰਗ",
    ageGender: "ਉਮਰ/ਲਿੰਗ",
    date: "ਤਾਰੀਖ",
    phone: "ਫੋਨ",
    bloodGroup: "ਖੂਨ ਦਾ ਗਰੁੱਪ",
    address: "ਪਤਾ",
    male: "ਮਰਦ",
    female: "ਔਰਤ",
    other: "ਹੋਰ",
    chiefComplaint: "ਮੁੱਖ ਸ਼ਿਕਾਇਤ",
    diagnosis: "ਰੋਗ ਨਿਦਾਨ",
    medications: "ਦਵਾਈਆਂ",
    medicine: "ਦਵਾਈ",
    dosage: "ਖੁਰਾਕ",
    frequency: "ਕਿੰਨੀ ਵਾਰ",
    duration: "ਸਮਾਂ",
    instructions: "ਹਿਦਾਇਤਾਂ",
    route: "ਰਸਤਾ",
    vitalSigns: "ਜੀਵਨ ਚਿੰਨ੍ਹ",
    bloodPressure: "ਬਲੱਡ ਪ੍ਰੈਸ਼ਰ",
    pulse: "ਨਬਜ਼",
    temperature: "ਤਾਪਮਾਨ",
    weight: "ਭਾਰ",
    height: "ਕੱਦ",
    spO2: "ਆਕਸੀਜਨ ਪੱਧਰ",
    investigationsAdvised: "ਸੁਝਾਈਆਂ ਜਾਂਚਾਂ",
    advice: "ਸਲਾਹ",
    followUp: "ਫਾਲੋ-ਅੱਪ",
    nextVisit: "ਅਗਲੀ ਮੁਲਾਕਾਤ",
    knownAllergies: "ਜਾਣੀਆਂ ਐਲਰਜੀਆਂ",
    doctorSignature: "ਡਾਕਟਰ ਦੇ ਦਸਤਖਤ",
    registrationNo: "ਰਜਿਸਟ੍ਰੇਸ਼ਨ ਨੰਬਰ",
    seal: "ਮੋਹਰ",
    onceDailyOD: "ਦਿਨ ਵਿੱਚ ਇੱਕ ਵਾਰ",
    twiceDailyBD: "ਦਿਨ ਵਿੱਚ ਦੋ ਵਾਰ",
    threeTimesTDS: "ਦਿਨ ਵਿੱਚ ਤਿੰਨ ਵਾਰ",
    fourTimesQID: "ਦਿਨ ਵਿੱਚ ਚਾਰ ਵਾਰ",
    beforeMeals: "ਖਾਣੇ ਤੋਂ ਪਹਿਲਾਂ",
    afterMeals: "ਖਾਣੇ ਤੋਂ ਬਾਅਦ",
    atBedtime: "ਸੌਣ ਤੋਂ ਪਹਿਲਾਂ",
    asNeeded: "ਲੋੜ ਪੈਣ ਤੇ",
    morning: "ਸਵੇਰ",
    afternoon: "ਦੁਪਹਿਰ",
    evening: "ਸ਼ਾਮ",
    night: "ਰਾਤ",
    days: "ਦਿਨ",
    weeks: "ਹਫ਼ਤੇ",
    months: "ਮਹੀਨੇ",
    continuous: "ਲਗਾਤਾਰ",
    asDirected: "ਹਿਦਾਇਤ ਅਨੁਸਾਰ",
    takeWithWater: "ਪਾਣੀ ਨਾਲ ਲਓ",
    takeWithMilk: "ਦੁੱਧ ਨਾਲ ਲਓ",
    avoidDriving: "ਗੱਡੀ ਚਲਾਉਣ ਤੋਂ ਬਚੋ",
    completeCourse: "ਪੂਰਾ ਕੋਰਸ ਲਓ",
    mmHg: "ਐਮਐਮਐਚਜੀ",
    bpm: "ਬੀਪੀਐਮ",
    celsius: "°ਸੈ",
    fahrenheit: "°ਫ",
    kg: "ਕਿਲੋ",
    cm: "ਸੈਮੀ",
    years: "ਸਾਲ",
    yrs: "ਸਾਲ",
    disclaimer: "ਇਹ ਨੁਸਖ਼ਾ ਡਾਕਟਰ ਦੇ ਦਸਤਖਤ ਅਤੇ ਮੋਹਰ ਨਾਲ ਹੀ ਮਾਨਯ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਹਿਦਾਇਤ ਅਨੁਸਾਰ ਪੂਰਾ ਕੋਰਸ ਲਓ।"
  },

  // Odia/Oriya (ଓଡ଼ିଆ)
  or: {
    prescription: "ପ୍ରେସକ୍ରିପସନ",
    medicalPrescription: "ମେଡିକାଲ ପ୍ରେସକ୍ରିପସନ",
    patient: "ରୋଗୀ",
    patientName: "ରୋଗୀଙ୍କ ନାମ",
    age: "ବୟସ",
    gender: "ଲିଙ୍ଗ",
    ageGender: "ବୟସ/ଲିଙ୍ଗ",
    date: "ତାରିଖ",
    phone: "ଫୋନ",
    bloodGroup: "ରକ୍ତ ଗ୍ରୁପ",
    address: "ଠିକଣା",
    male: "ପୁରୁଷ",
    female: "ମହିଳା",
    other: "ଅନ୍ୟ",
    chiefComplaint: "ମୁଖ୍ୟ ଅଭିଯୋଗ",
    diagnosis: "ରୋଗ ନିର୍ଣ୍ଣୟ",
    medications: "ଔଷଧ",
    medicine: "ଔଷଧ",
    dosage: "ଡୋଜ",
    frequency: "କେତେ ଥର",
    duration: "ସମୟ",
    instructions: "ନିର୍ଦ୍ଦେଶ",
    route: "ମାର୍ଗ",
    vitalSigns: "ଜୀବନ ସଙ୍କେତ",
    bloodPressure: "ରକ୍ତଚାପ",
    pulse: "ନାଡ଼ି",
    temperature: "ତାପମାତ୍ରା",
    weight: "ଓଜନ",
    height: "ଉଚ୍ଚତା",
    spO2: "ଅକ୍ସିଜେନ ସ୍ତର",
    investigationsAdvised: "ପରାମର୍ଶିତ ପରୀକ୍ଷା",
    advice: "ପରାମର୍ଶ",
    followUp: "ଫଲୋ-ଅପ",
    nextVisit: "ପରବର୍ତ୍ତୀ ସାକ୍ଷାତ",
    knownAllergies: "ଜଣାଶୁଣା ଆଲର୍ଜି",
    doctorSignature: "ଡାକ୍ତରଙ୍କ ସ୍ୱାକ୍ଷର",
    registrationNo: "ରେଜିଷ୍ଟ୍ରେସନ ନଂ.",
    seal: "ସିଲ",
    onceDailyOD: "ଦିନକୁ ଥରେ",
    twiceDailyBD: "ଦିନକୁ ଦୁଇଥର",
    threeTimesTDS: "ଦିନକୁ ତିନିଥର",
    fourTimesQID: "ଦିନକୁ ଚାରିଥର",
    beforeMeals: "ଖାଇବା ପୂର୍ବରୁ",
    afterMeals: "ଖାଇବା ପରେ",
    atBedtime: "ଶୋଇବା ପୂର୍ବରୁ",
    asNeeded: "ଦରକାର ପଡ଼ିଲେ",
    morning: "ସକାଳ",
    afternoon: "ମଧ୍ୟାହ୍ନ",
    evening: "ସନ୍ଧ୍ୟା",
    night: "ରାତି",
    days: "ଦିନ",
    weeks: "ସପ୍ତାହ",
    months: "ମାସ",
    continuous: "କ୍ରମାଗତ",
    asDirected: "ନିର୍ଦ୍ଦେଶ ଅନୁଯାୟୀ",
    takeWithWater: "ପାଣି ସହିତ ଖାଆନ୍ତୁ",
    takeWithMilk: "କ୍ଷୀର ସହିତ ଖାଆନ୍ତୁ",
    avoidDriving: "ଗାଡ଼ି ଚଲାନ୍ତୁ ନାହିଁ",
    completeCourse: "ସମ୍ପୂର୍ଣ୍ଣ କୋର୍ସ ଖାଆନ୍ତୁ",
    mmHg: "ଏମଏମଏଚଜି",
    bpm: "ବିପିଏମ",
    celsius: "°ସେ",
    fahrenheit: "°ଫା",
    kg: "କେଜି",
    cm: "ସେମି",
    years: "ବର୍ଷ",
    yrs: "ବର୍ଷ",
    disclaimer: "ଏହି ପ୍ରେସକ୍ରିପସନ ଡାକ୍ତରଙ୍କ ସ୍ୱାକ୍ଷର ଏବଂ ସିଲ ସହିତ ବୈଧ। ଦୟାକରି ନିର୍ଦ୍ଦେଶ ଅନୁଯାୟୀ ସମ୍ପୂର୍ଣ୍ଣ କୋର୍ସ ଖାଆନ୍ତୁ।"
  }
};

// Language options for dropdown
export const languageOptions = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिंदी' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' },
  { code: 'or', name: 'Odia', nativeName: 'ଓଡ଼ିଆ' }
];

// Helper to get translations for a language
export const getTranslation = (langCode: string): PrescriptionTranslation => {
  return prescriptionTranslations[langCode] || prescriptionTranslations.en;
};

// Translate frequency from English to selected language
export const translateFrequency = (frequency: string, langCode: string): string => {
  const t = getTranslation(langCode);
  
  const frequencyMap: Record<string, keyof PrescriptionTranslation> = {
    'Once daily (OD)': 'onceDailyOD',
    'Twice daily (BD)': 'twiceDailyBD',
    'Three times daily (TDS)': 'threeTimesTDS',
    'Four times daily (QID)': 'fourTimesQID',
    'Before meals (AC)': 'beforeMeals',
    'After meals (PC)': 'afterMeals',
    'At bedtime (HS)': 'atBedtime',
    'As needed (SOS/PRN)': 'asNeeded'
  };
  
  const key = frequencyMap[frequency];
  if (key && t[key]) {
    return t[key] as string;
  }
  return frequency;
};

// Translate duration
export const translateDuration = (duration: string, langCode: string): string => {
  const t = getTranslation(langCode);
  
  // Extract number and unit
  const match = duration.match(/(\d+)\s*(\w+)/);
  if (match) {
    const num = match[1];
    const unit = match[2].toLowerCase();
    
    if (unit.includes('day')) return `${num} ${t.days}`;
    if (unit.includes('week')) return `${num} ${t.weeks}`;
    if (unit.includes('month')) return `${num} ${t.months}`;
  }
  
  if (duration.toLowerCase() === 'continuous') return t.continuous;
  if (duration.toLowerCase().includes('directed')) return t.asDirected;
  
  return duration;
};

// Get font family recommendation for a language
export const getFontForLanguage = (langCode: string): string => {
  const fonts: Record<string, string> = {
    en: "'Times New Roman', serif",
    ta: "'Noto Sans Tamil', 'Latha', sans-serif",
    hi: "'Noto Sans Devanagari', 'Mangal', sans-serif",
    te: "'Noto Sans Telugu', 'Gautami', sans-serif",
    kn: "'Noto Sans Kannada', 'Tunga', sans-serif",
    ml: "'Noto Sans Malayalam', 'Kartika', sans-serif",
    bn: "'Noto Sans Bengali', 'Vrinda', sans-serif",
    mr: "'Noto Sans Devanagari', 'Mangal', sans-serif",
    gu: "'Noto Sans Gujarati', 'Shruti', sans-serif",
    pa: "'Noto Sans Gurmukhi', 'Raavi', sans-serif",
    or: "'Noto Sans Oriya', 'Kalinga', sans-serif"
  };
  
  return fonts[langCode] || fonts.en;
};

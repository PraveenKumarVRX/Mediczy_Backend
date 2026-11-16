/** Professional WhatsApp template library for Medstar Hospitals (Vijayawada): English, Telugu, Hindi.
 * Loaded as local DRAFTS; submitting to Meta is a separate, explicit step. Telugu/Hindi reviewed 2026-11-15
 * for grammar, register and consistency with the English (business greetings నమస్కారం…గారు / नमस्ते…जी).
 * Rules every body follows (Meta's common rejection causes): starts and ends with plain text,
 * placeholders appear in order {{1}}, {{2}}, {{3}}, never adjacent, no promotional wording in UTILITY. */
export const TEMPLATE_LIBRARY = [
  {
    purpose: 'appointment_confirmation', category: 'UTILITY',
    examples: ['Ravi Kumar', 'Dr. Suresh Rao', '18 Nov 2026, 10:30 AM'],
    variants: {
      en: 'Dear {{1}}, your appointment with {{2}} at Medstar Hospitals is confirmed for {{3}}. Please arrive 15 minutes early and bring any previous reports. To make changes, reply to this message or call us.',
      te: 'నమస్కారం {{1}} గారు, మెడ్‌స్టార్ హాస్పిటల్స్‌లో {{2}} గారితో మీ అపాయింట్‌మెంట్ {{3}}కి ఖరారైంది. దయచేసి మీ మునుపటి రిపోర్టులతో 15 నిమిషాలు ముందుగా రాగలరు. మార్పుల కోసం ఈ సందేశానికి రిప్లై ఇవ్వండి లేదా మాకు కాల్ చేయండి.',
      hi: 'नमस्ते {{1}} जी, मेडस्टार हॉस्पिटल्स में {{2}} के साथ आपकी अपॉइंटमेंट {{3}} के लिए कन्फर्म हो गई है। कृपया अपनी पिछली रिपोर्ट्स के साथ 15 मिनट पहले पहुँचें। किसी बदलाव के लिए इस संदेश का जवाब दें या हमें कॉल करें।',
    },
  },
  {
    purpose: 'appointment_reminder', category: 'UTILITY',
    examples: ['Ravi Kumar', 'Dr. Suresh Rao', '18 Nov 2026, 10:30 AM'],
    variants: {
      en: 'Dear {{1}}, this is a reminder of your appointment with {{2}} at Medstar Hospitals on {{3}}. Reply YES to confirm, or call us if you need to reschedule.',
      te: 'నమస్కారం {{1}} గారు, {{2}} గారితో మెడ్‌స్టార్ హాస్పిటల్స్‌లో మీ అపాయింట్‌మెంట్ {{3}}న ఉందని గుర్తు చేస్తున్నాము. నిర్ధారించడానికి YES అని రిప్లై ఇవ్వండి లేదా సమయం మార్చుకోవడానికి మాకు కాల్ చేయండి.',
      hi: 'नमस्ते {{1}} जी, हम आपको याद दिलाना चाहते हैं कि मेडस्टार हॉस्पिटल्स में {{2}} के साथ आपकी अपॉइंटमेंट {{3}} को है। पुष्टि के लिए YES लिखकर जवाब दें या समय बदलने के लिए हमें कॉल करें।',
    },
  },
  {
    purpose: 'lab_report_ready', category: 'UTILITY',
    examples: ['Ravi Kumar', 'Complete Blood Count'],
    variants: {
      en: 'Dear {{1}}, your {{2}} report is now ready. You can collect it from the Medstar Hospitals front desk, or reply to this message to request a digital copy.',
      te: 'నమస్కారం {{1}} గారు, మీ {{2}} రిపోర్ట్ సిద్ధంగా ఉంది. మీరు దీన్ని మెడ్‌స్టార్ హాస్పిటల్స్ ఫ్రంట్ డెస్క్ వద్ద తీసుకోవచ్చు లేదా డిజిటల్ కాపీ కోసం ఈ సందేశానికి రిప్లై ఇవ్వండి.',
      hi: 'नमस्ते {{1}} जी, आपकी {{2}} रिपोर्ट तैयार है। आप इसे मेडस्टार हॉस्पिटल्स के फ्रंट डेस्क से प्राप्त कर सकते हैं, या डिजिटल कॉपी के लिए इस संदेश का जवाब दें।',
    },
  },
  {
    purpose: 'followup_reminder', category: 'UTILITY',
    examples: ['Ravi Kumar', 'Suresh Rao', '25 Nov 2026'],
    variants: {
      en: 'Dear {{1}}, Dr. {{2}} has advised a follow-up visit around {{3}}. Please reply to this message or call us to book a convenient time.',
      te: 'నమస్కారం {{1}} గారు, డా. {{2}} గారు సుమారు {{3}}న ఫాలో-అప్ సందర్శనను సూచించారు. అనుకూలమైన సమయం బుక్ చేసుకోవడానికి ఈ సందేశానికి రిప్లై ఇవ్వండి లేదా మాకు కాల్ చేయండి.',
      hi: 'नमस्ते {{1}} जी, डॉ. {{2}} ने लगभग {{3}} को फॉलो-अप विज़िट की सलाह दी है। सुविधाजनक समय बुक करने के लिए इस संदेश का जवाब दें या हमें कॉल करें।',
    },
  },
  {
    purpose: 'enquiry_acknowledgement', category: 'UTILITY',
    examples: ['Ravi Kumar'],
    variants: {
      en: 'Dear {{1}}, thank you for contacting Medstar Hospitals. Our patient care team has received your enquiry and will get back to you shortly.',
      te: 'నమస్కారం {{1}} గారు, మెడ్‌స్టార్ హాస్పిటల్స్‌ను సంప్రదించినందుకు ధన్యవాదాలు. మీ విచారణ మా పేషెంట్ కేర్ బృందానికి అందింది. వారు త్వరలోనే మిమ్మల్ని సంప్రదిస్తారు.',
      hi: 'नमस्ते {{1}} जी, मेडस्टार हॉस्पिटल्स से संपर्क करने के लिए धन्यवाद। आपकी पूछताछ हमारी पेशेंट केयर टीम को मिल गई है। टीम जल्द ही आपसे संपर्क करेगी।',
    },
  },
  {
    purpose: 'health_checkup_package', category: 'MARKETING',
    examples: ['Ravi Kumar', 'Executive', 'Rs. 2,999'],
    variants: {
      en: 'Dear {{1}}, Medstar Hospitals is offering the {{2}} health check-up package at a special price of {{3}} this month. Reply to this message to book your slot.',
      te: 'నమస్కారం {{1}} గారు, ఈ నెల మెడ్‌స్టార్ హాస్పిటల్స్‌లో {{2}} హెల్త్ చెకప్ ప్యాకేజీ ప్రత్యేక ధర {{3}}కే అందుబాటులో ఉంది. మీ స్లాట్ బుక్ చేసుకోవడానికి ఈ సందేశానికి రిప్లై ఇవ్వండి.',
      hi: 'नमस्ते {{1}} जी, इस महीने मेडस्टार हॉस्पिटल्स में {{2}} हेल्थ चेकअप पैकेज विशेष कीमत {{3}} पर उपलब्ध है। अपना स्लॉट बुक करने के लिए इस संदेश का जवाब दें।',
    },
  },
];

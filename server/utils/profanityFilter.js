/**
 * Profanity Filter for Dr. iSHA Chatbot
 * Detects and flags inappropriate, offensive, or abusive language
 * Supports multiple languages including English and Hindi
 */

// English profanity words (common + variations)
const englishProfanity = [
  // Common profanity
  'fuck', 'shit', 'ass', 'bitch', 'damn', 'crap', 'piss', 'dick', 'cock',
  'pussy', 'bastard', 'slut', 'whore', 'cunt', 'fag', 'nigger', 'nigga',
  // Variations and leetspeak
  'f*ck', 'f**k', 'sh*t', 'sh1t', 'a$$', 'b1tch', 'b!tch', 'd!ck', 'd1ck',
  'fuk', 'fck', 'fcuk', 'phuck', 'phuk', 'azz', 'btch',
  // Compound variations
  'motherfucker', 'mofo', 'bullshit', 'horseshit', 'dumbass', 'asshole',
  'jackass', 'douchebag', 'dipshit', 'shithead', 'dickhead', 'fuckhead',
  // Sexual slurs
  'blowjob', 'handjob', 'cumshot', 'jizz', 'dildo', 'vibrator',
  // Hate speech
  'retard', 'retarded', 'spastic', 'mongoloid', 'cracker', 'chink', 'kike',
  'spic', 'wetback', 'gook', 'paki', 'terrorist', 'sandnigger'
];

// Hindi/Hinglish profanity (romanized)
const hindiProfanity = [
  // Common Hindi profanity (romanized)
  'madarchod', 'behenchod', 'bhosdike', 'chutiya', 'gaand', 'lund', 'lauda',
  'randi', 'harami', 'saala', 'saali', 'kamina', 'kameena', 'kameeni',
  'bhosdi', 'bhosad', 'lawda', 'lawde', 'chut', 'gandu', 'gadha',
  'ullu', 'bakchod', 'bakchodi', 'jhant', 'jhatu', 'tatti', 'haggu',
  // Variations
  'mc', 'bc', 'bsdk', 'bhsdk', 'madarc', 'behen', 'behn', 'bhen',
  'chod', 'chodu', 'chodna', 'gaandu', 'gandoo', 'rand', 'rund',
  // Insults
  'hijra', 'hijda', 'chakka', 'chhakka', 'kutiya', 'kutti', 'kutta',
  'suar', 'suwar', 'haramkhor', 'haramzada', 'haramzade', 'haramzadi',
  'bhikari', 'bhikhari', 'dalla', 'dallal'
];

// Other language profanity
const otherLanguageProfanity = [
  // Spanish
  'puta', 'mierda', 'joder', 'cabron', 'pendejo', 'maricon', 'culo',
  // Arabic (romanized)
  'kos', 'kosomak', 'ayre', 'sharmoota', 'kalb', 'ibn', 'sharmout',
  // Tamil (romanized)
  'thayoli', 'otha', 'sunni', 'punda', 'baadu', 'myiru',
  // Telugu (romanized)
  'modda', 'gudda', 'lanjakoduku', 'lanjoduku', 'pooku', 'dengey'
];

// Harassment and threat patterns
const harassmentPatterns = [
  // Threats
  /i('ll|'m going to|will) (kill|hurt|harm|beat|rape|stab|shoot|murder)/i,
  /die|death threat|gonna kill/i,
  /(bomb|attack|explode|blow up)/i,
  // Sexual harassment
  /send (nudes|pics|photos|naked)/i,
  /(sex|sexual|nude|naked) (pic|photo|image|video)/i,
  /show me your (body|boobs|ass|tits)/i,
  /(date|marry|love) me/i,
  /i love you|be my (girlfriend|boyfriend|wife|husband)/i,
  // Personal attacks
  /you('re| are) (stupid|dumb|idiot|moron|ugly|fat|worthless)/i,
  /i hate you|hate your/i,
  /you should (die|kill yourself)/i,
  // Spam patterns
  /(.)\1{4,}/i, // Repeated characters (aaaaa)
  /call me|my number is|contact me at/i,
  /buy|sell|discount|offer|crypto|bitcoin|forex/i
];

// Combine all profanity
const allProfanity = [
  ...englishProfanity,
  ...hindiProfanity,
  ...otherLanguageProfanity
].map(word => word.toLowerCase());

// Create regex patterns for word boundary matching
const profanityRegexes = allProfanity.map(word => {
  // Escape special regex characters
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i');
});

/**
 * Flags for different types of violations
 */
const ViolationType = {
  PROFANITY: 'profanity',
  HARASSMENT: 'harassment',
  THREAT: 'threat',
  SEXUAL: 'sexual_content',
  SPAM: 'spam',
  HATE_SPEECH: 'hate_speech'
};

/**
 * Severity levels
 */
const Severity = {
  LOW: 'low',      // Mild language
  MEDIUM: 'medium', // Moderate profanity
  HIGH: 'high',    // Severe profanity/harassment
  CRITICAL: 'critical' // Threats/hate speech
};

/**
 * Check text for profanity and inappropriate content
 * @param {string} text - Text to check
 * @returns {Object} - Detection result
 */
function detectProfanity(text) {
  if (!text || typeof text !== 'string') {
    return {
      flagged: false,
      violations: [],
      severity: null,
      sanitizedText: text,
      matchedWords: []
    };
  }

  const normalizedText = text.toLowerCase().trim();
  const violations = [];
  const matchedWords = [];
  let highestSeverity = null;

  // Check for profanity words
  for (let i = 0; i < profanityRegexes.length; i++) {
    if (profanityRegexes[i].test(normalizedText)) {
      matchedWords.push(allProfanity[i]);
      
      // Determine severity based on word category
      let severity = Severity.MEDIUM;
      if (hindiProfanity.includes(allProfanity[i]) && allProfanity[i].length > 4) {
        severity = Severity.HIGH;
      }
      if (allProfanity[i].includes('nigger') || allProfanity[i].includes('kike') || 
          allProfanity[i].includes('retard') || allProfanity[i].includes('terrorist')) {
        severity = Severity.CRITICAL;
        violations.push({
          type: ViolationType.HATE_SPEECH,
          severity: Severity.CRITICAL,
          word: allProfanity[i]
        });
      } else {
        violations.push({
          type: ViolationType.PROFANITY,
          severity,
          word: allProfanity[i]
        });
      }
      
      if (!highestSeverity || severityLevel(severity) > severityLevel(highestSeverity)) {
        highestSeverity = severity;
      }
    }
  }

  // Check for harassment patterns
  for (const pattern of harassmentPatterns) {
    if (pattern.test(normalizedText)) {
      let violationType = ViolationType.HARASSMENT;
      let severity = Severity.MEDIUM;
      
      // Check specific pattern categories
      if (/kill|hurt|harm|beat|rape|stab|shoot|murder|bomb|attack|die/.test(pattern.source)) {
        violationType = ViolationType.THREAT;
        severity = Severity.CRITICAL;
      } else if (/nudes?|naked|sex|sexual|boobs?|tits?|body/.test(pattern.source)) {
        violationType = ViolationType.SEXUAL;
        severity = Severity.HIGH;
      } else if (/buy|sell|discount|crypto|bitcoin/.test(pattern.source)) {
        violationType = ViolationType.SPAM;
        severity = Severity.LOW;
      }
      
      violations.push({
        type: violationType,
        severity,
        pattern: pattern.source.substring(0, 30) + '...'
      });
      
      if (!highestSeverity || severityLevel(severity) > severityLevel(highestSeverity)) {
        highestSeverity = severity;
      }
    }
  }

  // Create sanitized text (replace profanity with asterisks)
  let sanitizedText = text;
  for (const word of matchedWords) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    sanitizedText = sanitizedText.replace(regex, '*'.repeat(word.length));
  }

  return {
    flagged: violations.length > 0,
    violations,
    severity: highestSeverity,
    sanitizedText,
    matchedWords,
    violationCount: violations.length
  };
}

/**
 * Get numeric severity level for comparison
 */
function severityLevel(severity) {
  switch (severity) {
    case Severity.CRITICAL: return 4;
    case Severity.HIGH: return 3;
    case Severity.MEDIUM: return 2;
    case Severity.LOW: return 1;
    default: return 0;
  }
}

/**
 * Get appropriate warning response based on severity
 */
function getWarningResponse(severity, language = 'en') {
  const responses = {
    en: {
      [Severity.LOW]: `⚠️ Please keep the conversation respectful. I'm here to help with your medical questions.`,
      [Severity.MEDIUM]: `⚠️ Your message contains inappropriate language. Please rephrase your question respectfully so I can assist you better.`,
      [Severity.HIGH]: `🚫 Your message has been flagged for inappropriate content. This violates our community guidelines. Please maintain respectful communication.`,
      [Severity.CRITICAL]: `🚫 **Warning:** Your message contains severely inappropriate content and has been logged. Repeated violations may result in account restrictions. If you need help, please communicate respectfully.`
    },
    hi: {
      [Severity.LOW]: `⚠️ कृपया सम्मानजनक बातचीत बनाए रखें। मैं आपके चिकित्सा प्रश्नों में मदद करने के लिए यहां हूं।`,
      [Severity.MEDIUM]: `⚠️ आपके संदेश में अनुचित भाषा है। कृपया अपना प्रश्न सम्मानजनक तरीके से दोहराएं।`,
      [Severity.HIGH]: `🚫 आपके संदेश को अनुचित सामग्री के लिए चिह्नित किया गया है। कृपया सम्मानजनक संवाद बनाए रखें।`,
      [Severity.CRITICAL]: `🚫 **चेतावनी:** आपके संदेश में अत्यधिक अनुचित सामग्री है और इसे लॉग किया गया है। बार-बार उल्लंघन से खाता प्रतिबंधित हो सकता है।`
    }
  };

  const langResponses = responses[language] || responses.en;
  return langResponses[severity] || langResponses[Severity.MEDIUM];
}

/**
 * Log violation for audit trail
 */
async function logViolation(sessionId, userId, text, detection) {
  const logData = {
    timestamp: new Date().toISOString(),
    sessionId,
    userId,
    originalText: text.substring(0, 500), // Limit stored text
    violations: detection.violations,
    severity: detection.severity,
    matchedWords: detection.matchedWords
  };

  console.log('🚨 PROFANITY VIOLATION LOGGED:', JSON.stringify(logData, null, 2));

  // Store in database using the intelligent DB adapter pattern
  try {
    const { postgresSequelize } = await import('../db/postgres-sequelize.js');
    
    // Use raw query through sequelize
    await sequelize.query(
      `INSERT INTO user_violations (user_id, session_id, violation_type, severity, original_text, matched_words, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      {
        replacements: [
          userId || null,
          sessionId || null,
          detection.violations.map(v => v.type).join(','),
          detection.severity,
          text.substring(0, 500),
          JSON.stringify(detection.matchedWords)
        ],
        type: 'INSERT'
      }
    );
    console.log('✅ Violation stored in database');
  } catch (error) {
    console.error('⚠️ Failed to log violation to database:', error.message);
  }

  return logData;
}

/**
 * Middleware for Express routes
 */
function profanityMiddleware(options = {}) {
  const { blockOnViolation = false, minSeverityToBlock = Severity.HIGH } = options;
  
  return (req, res, next) => {
    const textFields = ['query', 'message', 'description', 'text', 'content'];
    let textToCheck = '';
    
    for (const field of textFields) {
      if (req.body && req.body[field]) {
        textToCheck += ' ' + req.body[field];
      }
    }
    
    if (textToCheck.trim()) {
      const detection = detectProfanity(textToCheck);
      req.profanityDetection = detection;
      
      if (detection.flagged) {
        console.log(`⚠️ Profanity detected in request:`, {
          path: req.path,
          severity: detection.severity,
          matchedWords: detection.matchedWords
        });
        
        if (blockOnViolation && severityLevel(detection.severity) >= severityLevel(minSeverityToBlock)) {
          return res.status(400).json({
            success: false,
            error: 'Inappropriate content detected',
            message: getWarningResponse(detection.severity),
            flagged: true,
            severity: detection.severity
          });
        }
      }
    }
    
    next();
  };
}

export {
  detectProfanity,
  getWarningResponse,
  logViolation,
  profanityMiddleware,
  ViolationType,
  Severity
};

export default detectProfanity;

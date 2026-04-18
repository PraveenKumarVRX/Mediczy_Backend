"""
Indic Language Translation for Dr. iSHA
========================================
Supports 12 major Indian languages + English, including mixed/code-switched
varieties like Hinglish (Hindi+English) and Tanglish (Tamil+English).

Language detection strategy:
  1. If text contains Indian Unicode script chars → reliable, use langdetect
  2. If text is Latin-script only (Hinglish, Tanglish, etc.) → treat as "mixed",
     attempt Google Translate with source='auto' which handles Hinglish well
  3. Anything unresolvable → pass as-is (LLM understands Indian Romanized text
     natively since it was trained on Indian internet text)

Uses deep-translator (Google Translate backend) — no GPU, no model download.
Falls back gracefully on any network/API error.
"""

import re
import logging
from typing import Tuple

logger = logging.getLogger("dr_isha.translation")

# ── Supported Indian Languages ──────────────────────────────────────────────
# Maps BCP-47 / ISO 639-1 codes to display names and Google Translate codes
SUPPORTED_LANGUAGES = {
    "en":    {"name": "English",    "gt_code": "en",    "script": "latin"},
    "hi":    {"name": "Hindi",      "gt_code": "hi",    "script": "devanagari"},
    "bn":    {"name": "Bengali",    "gt_code": "bn",    "script": "bengali"},
    "te":    {"name": "Telugu",     "gt_code": "te",    "script": "telugu"},
    "mr":    {"name": "Marathi",    "gt_code": "mr",    "script": "devanagari"},
    "ta":    {"name": "Tamil",      "gt_code": "ta",    "script": "tamil"},
    "gu":    {"name": "Gujarati",   "gt_code": "gu",    "script": "gujarati"},
    "kn":    {"name": "Kannada",    "gt_code": "kn",    "script": "kannada"},
    "ml":    {"name": "Malayalam",  "gt_code": "ml",    "script": "malayalam"},
    "pa":    {"name": "Punjabi",    "gt_code": "pa",    "script": "gurmukhi"},
    "or":    {"name": "Odia",       "gt_code": "or",    "script": "odia"},
    "ur":    {"name": "Urdu",       "gt_code": "ur",    "script": "arabic"},
    "as":    {"name": "Assamese",   "gt_code": "as",    "script": "bengali"},
    # Arabic
    "ar":    {"name": "Arabic",      "gt_code": "ar",    "script": "arabic"},
    # Major European languages
    "fr":    {"name": "French",      "gt_code": "fr",    "script": "latin"},
    "de":    {"name": "German",      "gt_code": "de",    "script": "latin"},
    "es":    {"name": "Spanish",     "gt_code": "es",    "script": "latin"},
    "it":    {"name": "Italian",     "gt_code": "it",    "script": "latin"},
    "pt":    {"name": "Portuguese",  "gt_code": "pt",    "script": "latin"},
    "ru":    {"name": "Russian",     "gt_code": "ru",    "script": "cyrillic"},
    "nl":    {"name": "Dutch",       "gt_code": "nl",    "script": "latin"},
    "pl":    {"name": "Polish",      "gt_code": "pl",    "script": "latin"},
    # Pseudo-code for mixed/Romanized Indian languages handled via auto-detect
    "mixed": {"name": "Mixed/Romanized", "gt_code": "auto", "script": "latin"},
}

# langdetect → our language code mapping
LANGDETECT_MAP = {
    # Indian languages
    "hi": "hi", "bn": "bn", "te": "te", "mr": "mr", "ta": "ta",
    "gu": "gu", "kn": "kn", "ml": "ml", "pa": "pa", "or": "or",
    "ur": "ur", "as": "as",
    # Arabic
    "ar": "ar",
    # Major European languages
    "fr": "fr", "de": "de", "es": "es", "it": "it", "pt": "pt",
    "ru": "ru", "nl": "nl", "pl": "pl", "uk": "ru",  # Ukrainian → Russian GT
    "en": "en",
}

# Unicode ranges for Indian scripts — used to identify actual Indian-script text
_INDIC_SCRIPT_RANGES = re.compile(
    r"[\u0900-\u097F"   # Devanagari (Hindi, Marathi, Sanskrit)
    r"\u0980-\u09FF"    # Bengali / Assamese
    r"\u0A00-\u0A7F"    # Gurmukhi (Punjabi)
    r"\u0A80-\u0AFF"    # Gujarati
    r"\u0B00-\u0B7F"    # Odia
    r"\u0B80-\u0BFF"    # Tamil
    r"\u0C00-\u0C7F"    # Telugu
    r"\u0C80-\u0CFF"    # Kannada
    r"\u0D00-\u0D7F"    # Malayalam
    r"\u0600-\u06FF"    # Arabic / Urdu
    r"\u0400-\u04FF"    # Cyrillic (Russian, Ukrainian, Bulgarian, etc.)
    r"\u4E00-\u9FFF"    # CJK Unified Ideographs (Chinese, Japanese Kanji)
    r"\u3040-\u30FF"    # Hiragana / Katakana (Japanese)
    r"\uAC00-\uD7AF"    # Hangul (Korean)
    r"]"
)


def _has_indic_script(text: str) -> bool:
    """Return True if text contains Indian script characters (non-Latin Indian)."""
    return bool(_INDIC_SCRIPT_RANGES.search(text))


def detect_language(text: str) -> str:
    """
    Detect the language of the input text.

    - Indian-script text (Devanagari, Tamil, etc.) → uses langdetect (reliable)
    - Latin-script Indian text (Hinglish, Tanglish, etc.) → returns 'mixed'
      so the translation layer uses Google auto-detect
    - Falls back to 'en' on any error.
    """
    if not text or not text.strip():
        return "en"

    # If the text contains Indian Unicode script chars, langdetect is reliable
    if _has_indic_script(text):
        try:
            from langdetect import detect, DetectorFactory
            DetectorFactory.seed = 42
            detected = detect(text)
            lang = LANGDETECT_MAP.get(detected, "en")
            logger.debug(f"🌐 Script-detected: {detected} → {lang}")
            return lang
        except Exception as e:
            logger.debug(f"langdetect failed for script text: {e}")
            return "en"

    # For Latin-script text, langdetect often misidentifies Indian romanised text
    # as Indonesian / Estonian / Turkish etc.  Use a heuristic: if common Indian
    # romanised words are present, call it "mixed" so we use Google auto-detect.
    _HINGLISH_HINTS = re.compile(
        r"\b(nahi|nahin|kya|hai|hoon|mujhe|mera|kal|aaj|theek|bahut|bhi|"
        r"ennaku|iruku|illai|sollu|naan|paaru|vanakkam|"
        r"ente|aanu|alla|ketto|"
        r"mala|aahe|kay|baro|"
        r"nenu|meeru|ledu|cheyyi|"
        r"mane|enu|beku|"
        r"nange|irodu|agide|"
        r"dard|bimar|bukhar|dawai)\b",
        re.IGNORECASE
    )
    if _HINGLISH_HINTS.search(text):
        logger.debug(f"🌐 Romanized Indian text detected → 'mixed'")
        return "mixed"

    # For Latin-script non-Indian text, try langdetect — it IS reliable for
    # European languages (French, German, Spanish, etc.).  Only Indian Romanized
    # text was unreliable, and that's already caught by _HINGLISH_HINTS above.
    try:
        from langdetect import detect, DetectorFactory
        DetectorFactory.seed = 42
        detected = detect(text)
        lang = LANGDETECT_MAP.get(detected, "en")
        logger.debug(f"🌐 langdetect (Latin): {detected} → {lang}")
        return lang
    except Exception as e:
        logger.debug(f"langdetect failed for Latin text: {e}")

    return "en"


def translate(text: str, source_lang: str, target_lang: str) -> str:
    """
    Translate text from source_lang to target_lang.
    - source_lang='mixed' → Google Translate with source='auto' (handles Hinglish well)
    - Returns original text on any error (fail-safe).
    """
    if source_lang == target_lang:
        return text
    if not text or not text.strip():
        return text
    if target_lang == "en" and source_lang in ("en", "mixed"):
        # mixed Latin Indian text — try auto-translate but accept pass-through
        if source_lang == "en":
            return text

    src = SUPPORTED_LANGUAGES.get(source_lang, {}).get("gt_code", source_lang)
    tgt = SUPPORTED_LANGUAGES.get(target_lang, {}).get("gt_code", target_lang)

    try:
        from deep_translator import GoogleTranslator
        translated = GoogleTranslator(source=src, target=tgt).translate(text)
        # If Google Translate returns the exact same text it likely couldn't translate it
        # (common for Tanglish) — return original so the LLM handles it natively
        if translated and translated.strip().lower() != text.strip().lower():
            logger.info(f"🌐 Translated {source_lang}→{target_lang} ({len(text)} chars)")
            return translated
        logger.debug(f"🌐 Translation unchanged for {source_lang}→{target_lang}, keeping original")
        return text
    except Exception as e:
        logger.warning(f"⚠️ Translation {source_lang}→{target_lang} failed: {e}")
        return text  # Return original — never break the conversation


def process_for_llm(message: str, declared_lang: str = "en") -> Tuple[str, str]:
    """
    Prepare an incoming message for LLM processing.
    Handles pure Indian scripts, Hinglish, Tanglish and all code-switched variants.

    Returns:
        (english_message, actual_lang)  — actual_lang used for back-translation
    """
    # Use declared language if explicitly provided and not English
    if declared_lang and declared_lang not in ("en", "auto", "") and declared_lang in SUPPORTED_LANGUAGES:
        actual_lang = declared_lang
    else:
        actual_lang = detect_language(message)

    # English or undetected → pass through
    if actual_lang == "en":
        return message, "en"

    # 'mixed' (Hinglish/Tanglish etc.) → attempt auto-translate;
    # if unchanged (Tanglish), pass as-is — LLM handles it natively
    english_message = translate(message, actual_lang, "en")
    return english_message, actual_lang


def translate_response(response: str, target_lang: str) -> str:
    """
    Translate an English LLM response to the target language.
    'mixed' → attempt Hindi (most common mixed variant); falls back to English.
    Returns original English on error — fail-safe.
    """
    if not target_lang or target_lang == "en":
        return response
    if target_lang == "mixed":
        # For mixed/code-switched input we keep the response in English —
        # replying in mixed Romanized Hindi would look unnatural from a doctor bot
        return response
    if target_lang not in SUPPORTED_LANGUAGES:
        return response
    return translate(response, "en", target_lang)


def get_language_name(lang_code: str) -> str:
    """Return display name for a language code."""
    return SUPPORTED_LANGUAGES.get(lang_code, {}).get("name", "English")


def list_supported_languages() -> list:
    """Return list of supported languages for the API (excludes internal 'mixed')."""
    return [
        {"code": code, "name": info["name"], "script": info["script"]}
        for code, info in SUPPORTED_LANGUAGES.items()
        if code != "mixed"
    ]

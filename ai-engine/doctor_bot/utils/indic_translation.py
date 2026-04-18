"""
Indic Language Translation for Dr. iSHA
========================================
Supports 12 major Indian languages + English.
Strategy:
  - Detect language of incoming message
  - Translate non-English input → English for LLM reasoning
  - Translate English response → target language before returning
  - LLM reasoning always done in English (highest quality)

Uses deep-translator (Google Translate backend) — no GPU, no model download.
Falls back gracefully on any network/API error.
"""

import logging
from functools import lru_cache
from typing import Tuple

logger = logging.getLogger("dr_isha.translation")

# ── Supported Indian Languages ──────────────────────────────────────────────
# Maps BCP-47 / ISO 639-1 codes to display names and Google Translate codes
SUPPORTED_LANGUAGES = {
    "en": {"name": "English",    "gt_code": "en",    "script": "latin"},
    "hi": {"name": "Hindi",      "gt_code": "hi",    "script": "devanagari"},
    "bn": {"name": "Bengali",    "gt_code": "bn",    "script": "bengali"},
    "te": {"name": "Telugu",     "gt_code": "te",    "script": "telugu"},
    "mr": {"name": "Marathi",    "gt_code": "mr",    "script": "devanagari"},
    "ta": {"name": "Tamil",      "gt_code": "ta",    "script": "tamil"},
    "gu": {"name": "Gujarati",   "gt_code": "gu",    "script": "gujarati"},
    "kn": {"name": "Kannada",    "gt_code": "kn",    "script": "kannada"},
    "ml": {"name": "Malayalam",  "gt_code": "ml",    "script": "malayalam"},
    "pa": {"name": "Punjabi",    "gt_code": "pa",    "script": "gurmukhi"},
    "or": {"name": "Odia",       "gt_code": "or",    "script": "odia"},
    "ur": {"name": "Urdu",       "gt_code": "ur",    "script": "arabic"},
    "as": {"name": "Assamese",   "gt_code": "as",    "script": "bengali"},
}

# langdetect → our language code mapping (langdetect uses some different codes)
LANGDETECT_MAP = {
    "hi":  "hi",
    "bn":  "bn",
    "te":  "te",
    "mr":  "mr",
    "ta":  "ta",
    "gu":  "gu",
    "kn":  "kn",
    "ml":  "ml",
    "pa":  "pa",
    "or":  "or",
    "ur":  "ur",
    "as":  "as",
    "en":  "en",
}


def detect_language(text: str) -> str:
    """
    Detect the language of the input text.
    Returns our language code (e.g. 'hi', 'ta', 'en').
    Falls back to 'en' on any error.
    """
    try:
        from langdetect import detect, DetectorFactory
        DetectorFactory.seed = 42  # deterministic
        detected = detect(text)
        lang = LANGDETECT_MAP.get(detected, "en")
        logger.debug(f"🌐 Detected language: {detected} → {lang}")
        return lang
    except Exception as e:
        logger.debug(f"Language detection failed: {e}, defaulting to 'en'")
        return "en"


def translate(text: str, source_lang: str, target_lang: str) -> str:
    """
    Translate text from source_lang to target_lang.
    Returns original text on any error (fail-safe).
    """
    if source_lang == target_lang:
        return text
    if not text or not text.strip():
        return text

    src = SUPPORTED_LANGUAGES.get(source_lang, {}).get("gt_code", source_lang)
    tgt = SUPPORTED_LANGUAGES.get(target_lang, {}).get("gt_code", target_lang)

    try:
        from deep_translator import GoogleTranslator
        translated = GoogleTranslator(source=src, target=tgt).translate(text)
        logger.info(f"🌐 Translated {source_lang}→{target_lang} ({len(text)} chars)")
        return translated or text
    except Exception as e:
        logger.warning(f"⚠️ Translation {source_lang}→{target_lang} failed: {e}")
        return text  # Return original — never break the conversation


def process_for_llm(message: str, declared_lang: str = "en") -> Tuple[str, str]:
    """
    Prepare an incoming message for LLM processing.

    1. If declared_lang is non-English, verify with detection.
    2. Translate to English if needed.

    Returns:
        (english_message, detected_lang)
    """
    # Determine actual language — use declared if plausible, else detect
    if declared_lang and declared_lang != "en" and declared_lang in SUPPORTED_LANGUAGES:
        actual_lang = declared_lang
    else:
        actual_lang = detect_language(message)

    if actual_lang == "en":
        return message, "en"

    english_message = translate(message, actual_lang, "en")
    return english_message, actual_lang


def translate_response(response: str, target_lang: str) -> str:
    """
    Translate an English LLM response to the target language.
    Returns original English on error — fail-safe.
    """
    if target_lang == "en" or target_lang not in SUPPORTED_LANGUAGES:
        return response
    return translate(response, "en", target_lang)


def get_language_name(lang_code: str) -> str:
    """Return display name for a language code."""
    return SUPPORTED_LANGUAGES.get(lang_code, {}).get("name", "English")


def list_supported_languages() -> list:
    """Return list of supported languages for the API."""
    return [
        {"code": code, "name": info["name"], "script": info["script"]}
        for code, info in SUPPORTED_LANGUAGES.items()
    ]

"""
Medical Abbreviation Expansion Service
Expands medical abbreviations like HTN → Hypertension
"""

import json
import re
from typing import Dict, Tuple
from pathlib import Path

class AbbreviationExpander:
    def __init__(self, db_path: str = None):
        """Initialize with medical database"""
        if db_path is None:
            db_path = Path(__file__).parent.parent / "medical_db.json"
        
        with open(db_path, 'r') as f:
            self.db = json.load(f)
        
        # Flatten all abbreviations for quick lookup
        self.abbreviations = {}
        for category, abbrevs in self.db.get("abbreviations", {}).items():
            self.abbreviations.update(abbrevs)
        
        # Create reverse mapping for context-aware expansion
        self.reverse_map = {v.lower(): k for k, v in self.abbreviations.items()}
    
    def expand_abbreviations(self, text: str, aggressive: bool = True) -> str:
        """
        Expand medical abbreviations in text
        
        Args:
            text: Clinical text with abbreviations
            aggressive: If True, expands all abbreviations. If False, only common ones
        
        Returns:
            Text with expanded abbreviations
        """
        result = text
        
        # First pass: Find and expand abbreviations with word boundaries
        for abbr, full_form in self.abbreviations.items():
            # Use word boundary to avoid partial replacements
            pattern = rf'\b{re.escape(abbr)}\b'
            
            # Count occurrences
            matches = len(re.findall(pattern, result))
            
            if matches > 0:
                # Replace with abbreviation + full form for first occurrence
                # and just full form for subsequent occurrences
                first_replacement = True
                
                def replacer(match):
                    nonlocal first_replacement
                    if first_replacement:
                        first_replacement = False
                        return f"{abbr} ({full_form})"
                    else:
                        return full_form
                
                result = re.sub(pattern, replacer, result, count=1)
                # Subsequent occurrences get just the full form
                result = re.sub(pattern, full_form, result)
        
        return result
    
    def extract_abbreviations(self, text: str) -> Dict[str, str]:
        """
        Extract medical abbreviations found in text
        
        Returns:
            Dictionary of found abbreviations and their expansions
        """
        found = {}
        
        for abbr in self.abbreviations.keys():
            pattern = rf'\b{re.escape(abbr)}\b'
            if re.search(pattern, text):
                found[abbr] = self.abbreviations[abbr]
        
        return found
    
    def expand_with_context(self, text: str) -> Tuple[str, Dict]:
        """
        Expand abbreviations with clinical context awareness
        
        Returns:
            Tuple of (expanded_text, metadata)
        """
        expanded_text = self.expand_abbreviations(text)
        found_abbrevs = self.extract_abbreviations(text)
        
        # Identify categories of abbreviations
        categories = {}
        for category, abbrevs in self.db.get("abbreviations", {}).items():
            for abbr in found_abbrevs.keys():
                if abbr in abbrevs:
                    if category not in categories:
                        categories[category] = []
                    categories[category].append(f"{abbr} ({found_abbrevs[abbr]})")
        
        return expanded_text, {
            "abbreviations": found_abbrevs,
            "categories": categories,
            "count": len(found_abbrevs)
        }
    
    def normalize_medical_values(self, text: str) -> str:
        """
        Normalize medical values (BP, HR, etc.)
        Example: "BP 160 by 95" → "BP 160/95 mmHg"
        """
        # Blood pressure normalization
        text = re.sub(
            r'(?:BP|blood pressure)\s+(\d+)\s+(?:by|\/)\s+(\d+)',
            r'Blood Pressure \1/\2 mmHg',
            text,
            flags=re.IGNORECASE
        )
        
        # Heart rate normalization
        text = re.sub(
            r'(?:HR|heart rate)\s+(\d+)',
            r'Heart Rate \1 bpm',
            text,
            flags=re.IGNORECASE
        )
        
        # Respiratory rate
        text = re.sub(
            r'(?:RR|respiratory rate)\s+(\d+)',
            r'Respiratory Rate \1 breaths/min',
            text,
            flags=re.IGNORECASE
        )
        
        # Oxygen saturation
        text = re.sub(
            r'(?:SpO2|Sp02|O2 sat)\s+(\d+)(?:\s*%)?',
            r'Oxygen Saturation \1%',
            text,
            flags=re.IGNORECASE
        )
        
        # Temperature
        text = re.sub(
            r'(?:Temp|temperature)\s+(\d+\.?\d*)\s*(?:°C|C)',
            r'Temperature \1°C',
            text,
            flags=re.IGNORECASE
        )
        
        # Lab values with units
        text = re.sub(
            r'(\w+)\s+(\d+\.?\d*)\s*(?:mg\/dL|mg/dL)',
            r'\1 \2 mg/dL',
            text,
            flags=re.IGNORECASE
        )
        
        return text
    
    def suggest_icd10_codes(self, text: str, limit: int = 5) -> list:
        """
        Suggest ICD-10 codes based on diagnoses in text
        """
        text_lower = text.lower()
        suggestions = []
        
        for specialty, mappings in self.db.get("icd10_mappings", {}).items():
            for item in mappings:
                condition = item["condition"].lower()
                if condition in text_lower:
                    suggestions.append({
                        "condition": item["condition"],
                        "code": item["code"],
                        "specialty": specialty,
                        "severity": item.get("severity", "unknown")
                    })
        
        # Sort by severity
        severity_order = {"high": 0, "medium": 1, "low": 2, "unknown": 3}
        suggestions.sort(key=lambda x: severity_order.get(x["severity"], 3))
        
        return suggestions[:limit]
    
    def get_medical_context(self, text: str) -> Dict:
        """
        Extract comprehensive medical context from text
        """
        # Extract abbreviations
        expanded, abbrev_meta = self.expand_with_context(text)
        
        # Extract ICD-10 codes
        icd10_codes = self.suggest_icd10_codes(text)
        
        # Normalize medical values
        normalized = self.normalize_medical_values(expanded)
        
        return {
            "original_text": text,
            "expanded_text": expanded,
            "normalized_text": normalized,
            "abbreviations": abbrev_meta["abbreviations"],
            "abbreviation_categories": abbrev_meta["categories"],
            "icd10_codes": icd10_codes,
            "abbreviation_count": abbrev_meta["count"],
            "icd10_count": len(icd10_codes)
        }

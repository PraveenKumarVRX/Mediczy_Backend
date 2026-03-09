#!/usr/bin/env python3
"""Analyze OCR results from IHX screenshots and produce structured feature report."""

import json
import re
from collections import defaultdict

with open("/home/ubuntu/Mediczy/ihx_ocr_results.json", "r") as f:
    results = json.load(f)

# Print each screenshot's OCR text for analysis
for r in results:
    print(f"\n{'='*80}")
    print(f"[{r['index']:03d}] {r['filename']}")
    print(f"      Size: {r['file_size']} bytes | Dims: {r['dimensions']}")
    print(f"{'='*80}")
    text = r['ocr_text']
    if text:
        # Print first 120 lines max
        lines = text.split('\n')
        for line in lines[:120]:
            stripped = line.strip()
            if stripped:
                print(f"  {stripped}")
        if len(lines) > 120:
            print(f"  ... ({len(lines) - 120} more lines)")
    else:
        print("  [NO TEXT EXTRACTED]")

#!/usr/bin/env python3
"""OCR all IHX screenshots and extract text content."""

import os
import json
from PIL import Image
import pytesseract

SCREENSHOTS_DIR = "/home/ubuntu/Mediczy/ihx_screenshots/ihx screenshots/"

def get_image_info(filepath):
    """Get image dimensions and file size."""
    size = os.path.getsize(filepath)
    try:
        with Image.open(filepath) as img:
            width, height = img.size
    except Exception as e:
        width, height = 0, 0
    return {"file_size": size, "width": width, "height": height}

def ocr_image(filepath):
    """OCR a single image and return the extracted text."""
    try:
        img = Image.open(filepath)
        # Use PSM 6 for uniform block of text, good for screenshots
        text = pytesseract.image_to_string(img, config='--psm 6')
        return text.strip()
    except Exception as e:
        return f"ERROR: {str(e)}"

def main():
    files = sorted(os.listdir(SCREENSHOTS_DIR))
    png_files = [f for f in files if f.lower().endswith('.png')]
    
    print(f"Total PNG files: {len(png_files)}")
    
    results = []
    for i, fname in enumerate(png_files):
        filepath = os.path.join(SCREENSHOTS_DIR, fname)
        info = get_image_info(filepath)
        text = ocr_image(filepath)
        
        result = {
            "index": i + 1,
            "filename": fname,
            "file_size": info["file_size"],
            "dimensions": f"{info['width']}x{info['height']}",
            "ocr_text": text
        }
        results.append(result)
        
        if (i + 1) % 20 == 0:
            print(f"  Processed {i+1}/{len(png_files)}...")
    
    # Save results to JSON
    output_path = "/home/ubuntu/Mediczy/ihx_ocr_results.json"
    with open(output_path, "w") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    
    print(f"\nDone! Results saved to {output_path}")
    print(f"Processed {len(results)} screenshots.")

if __name__ == "__main__":
    main()

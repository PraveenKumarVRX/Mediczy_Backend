#!/usr/bin/env python3
"""Extract text, images, and design patterns from competitor PDF decks."""

import fitz  # PyMuPDF
import os, json
from collections import Counter

OUTPUT_DIR = "/home/ubuntu/Mediczy/competitor_assets"
os.makedirs(OUTPUT_DIR, exist_ok=True)

pdfs = [
    ("DOC-20250520-WA0111..pdf", "competitor1"),
    ("DOC-20250520-WA0116..pdf", "competitor2"),
    ("medics prime- overview (2).pdf", "competitor3_medics_prime"),
]

for pdf_file, label in pdfs:
    path = os.path.join("/home/ubuntu/Mediczy", pdf_file)
    doc = fitz.open(path)
    
    print(f"\n{'='*80}")
    print(f"📄 {pdf_file} — {doc.page_count} pages")
    print(f"{'='*80}")
    
    img_dir = os.path.join(OUTPUT_DIR, label + "_images")
    os.makedirs(img_dir, exist_ok=True)
    
    all_colors = []
    img_count = 0
    
    for page_num in range(doc.page_count):
        page = doc[page_num]
        text = page.get_text()
        
        print(f"\n--- Page {page_num + 1} ---")
        # Print first 600 chars of text
        clean = text.strip()
        if clean:
            print(clean[:600])
        else:
            print("(No text - likely full image page)")
        
        # Extract images
        images = page.get_images(full=True)
        for img_idx, img in enumerate(images):
            xref = img[0]
            try:
                pix = fitz.Pixmap(doc, xref)
                # Only save images > 50x50 (skip tiny icons)
                if pix.width > 50 and pix.height > 50:
                    if pix.n > 4:  # CMYK
                        pix = fitz.Pixmap(fitz.csRGB, pix)
                    fname = f"{label}_p{page_num+1}_img{img_idx}.png"
                    pix.save(os.path.join(img_dir, fname))
                    img_count += 1
                    print(f"  📷 Saved: {fname} ({pix.width}x{pix.height})")
            except Exception as e:
                pass
    
    print(f"\n📊 Total images extracted: {img_count}")
    doc.close()

print(f"\n\n✅ Analysis complete. Assets saved to: {OUTPUT_DIR}")
print(f"   Directories: {os.listdir(OUTPUT_DIR)}")

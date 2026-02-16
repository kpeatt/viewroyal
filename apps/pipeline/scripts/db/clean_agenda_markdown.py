#!/usr/bin/env python3
"""
Clean up garbage Unicode characters in agenda.md and minutes.md files 
caused by PyMuPDF extraction issues.

Usage:
    uv run src/maintenance/db/clean_agenda_markdown.py
"""
import os
import re

# Mapping of garbage characters to their intended ASCII/Clean equivalents
TRANSLATION_TABLE = {
    # Numbers
    '\u03ed': '1', # ϭ
    '\u03ee': '2', # Ϯ
    '\u03ef': '3', # ϯ
    '\u03f0': '4', # ϰ
    '\u03f1': '5', # ϱ
    '\u03f2': '6', # ϲ
    '\u03f3': '7', # ϳ
    '\u03f4': '8', # ϴ
    '\u03f5': '9', # ϵ
    '\u03ec': '0', # Ϭ
    
    # Symbols & Punctuation
    '\u03a8': '$', # Ψ
    '\u0358': '.', # ͘
    '\u0355': ',', # ͕
    '\u0372': '-', # Ͳ
    '\u0439': '%', # й
    '\u043d': '+', # н
    '\u038e': '*', # Ύ
    '\u0398': '&', # Θ
    '\u037e': '(', # ;
    '\u037f': ')', # Ϳ
    '\u036c': '/', # ͬ
    '\u0357': ':', # ͗
    '\u01c0': '|', # ǀ
    '\u2013': '-', # –
    '\u2014': '--', # —
    '\u2019': "'", # ’
    '\u2018': "'", # ‘
    '\u201c': '"', # “
    '\u201d': '"', # ”
    '\u2022': '*', # •
    '\u202f': ' ', #  
    '\u200b': '',  # Zero-width space
    
    # Lowercase Letters (Common replacements in these PDFs)
    '\u0102': 'a', # Ă
    '\u0110': 'c', # Đ
    '\u010f': 'd', # ď
    '\u011a': 'e', # Ě
    '\u0128': 'f', # Ĩ
    '\u0150': 'g', # Ő
    '\u015a': 'h', # Ś
    '\u015d': 'i', # ŝ
    '\u016c': 'k', # Ŭ
    '\u019a': 'l', # ƚ
    '\u01c1': 'l', # ǁ
    '\u0175': 'm', # ŵ
    '\u0176': 'n', # Ŷ
    '\u017d': 'o', # Ž
    '\u0189': 'p', # Ɖ
    '\u018b': 'q', # Ƌ
    '\u018c': 'r', # ƌ
    '\u0190': 's', # Ɛ
    '\u011e': 't', # Ğ
    '\u016f': 'u', # ů
    '\u01b5': 'v', # Ƶ
    '\u01c7': 'y', # Ǉ
    '\u01c6': 'x', # ǆ
    
    # Bullets / Checkboxes
    '\uf071': '*', # 
    '\uf0d8': '*', # 
    '\uf0fc': '*', # 
    '\uf0a7': '*', # 
    '\u2610': '[ ]', # ☐
    '\u2612': '[x]', # ☒
    
    # Ligatures (Multi-character replacements)
    '\u019f': 'ti', # Ɵ
    '\ufb01': 'fi', # ﬁ
    '\ufb03': 'ffi', # ﬃ
    '\ufb00': 'ff', # ﬀ
}

# Control characters to remove
CONTROL_CHARS = [
    '\u0003', '\u0004', '\u0012', '\u001c', '\u0018', '\u0011'
]

# Multi-character or common garbled word replacements
WORD_REPLACEMENTS = {
    'Wrimt': 'Prime',
    'dvrf': 'Adult',
    'Eon-': 'Non-',
    'ommtrciau': 'Commercial',
    'zovlh': 'Youth',
    'evul': 'Adult', # Some documents use evul for adult
    'rlificiau': 'Artificial',
    'itue': 'Site',
    'auf': 'Ice',
    '^porl': 'Sport',
    'uoor': 'Floor',
    '^al': 'Sat',
    '^vn': 'Sun',
    'D-&': 'M-F',
    'Dienighl': 'Midnight',
    'uueay': 'Tuesday',
    'limth': 'Time',
    'dimt': 'Time',
    '/ct-': 'Ice-',
    'evul': 'Adult',
    'fov': 'for',
    'ituez': 'Site',
}

def clean_text(text):
    if not text:
        return text
    
    # 1. Remove control characters
    for char in CONTROL_CHARS:
        text = text.replace(char, '')
        
    # 2. Apply translation table for Unicode garbage
    for garbage, clean in TRANSLATION_TABLE.items():
        text = text.replace(garbage, clean)

    # 3. Apply word replacements for garbled ASCII
    for garbled, clean in WORD_REPLACEMENTS.items():
        text = text.replace(garbled, clean)
        
    return text

def process_files(root_dir):
    modified_count = 0
    total_files = 0
    
    for root, dirs, files in os.walk(root_dir):
        for name in files:
            if name in ['agenda.md', 'minutes.md']:
                total_files += 1
                path = os.path.join(root, name)
                
                try:
                    with open(path, 'r', encoding='utf-8') as f:
                        original_content = f.read()
                    
                    cleaned_content = clean_text(original_content)
                    
                    if cleaned_content != original_content:
                        with open(path, 'w', encoding='utf-8') as f:
                            f.write(cleaned_content)
                        modified_count += 1
                        if modified_count % 50 == 0:
                            print(f"Processed {modified_count} files...")
                            
                except Exception as e:
                    print(f"Error processing {path}: {e}")
                    
    print(f"\nFinished! Modified {modified_count} out of {total_files} files.")

if __name__ == "__main__":
    archive_path = "viewroyal_archive"
    if os.path.exists(archive_path):
        print(f"Cleaning markdown files in {archive_path}...")
        process_files(archive_path)
    else:
        print(f"Archive path {archive_path} not found.")

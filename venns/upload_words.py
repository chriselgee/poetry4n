#!/usr/bin/env python3

import json
import argparse
import db_funcs

def main():
    parser = argparse.ArgumentParser(description='Upload words to Firebase for Venns with Benefits game')
    parser.add_argument('file', help='JSON file containing an array of words')
    args = parser.parse_args()
    
    print(f"Uploading words from {args.file}...")
    success = db_funcs.add_words_from_file(args.file)
    
    if success:
        print("Words uploaded successfully!")
    else:
        print("Failed to upload words.")

if __name__ == '__main__':
    main()
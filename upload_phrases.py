import random
from google.cloud import firestore
from google.oauth2 import service_account

# Update the path if your service account file is elsewhere
CREDENTIALS_PATH = 'service-account.json'
PROJECT_ID = 'torch-3'

# List of at least 100 two-word phrases
PHRASES = [
    'Black Hole', 'Spirit Fingers', 'Newspaper Subscription', 'Apple Pie', 'Blue Moon',
    'Broken Arrow', 'Bubble Bath', 'Candy Cane', 'Chicken Soup', 'Coffee Mug',
    'Cotton Candy', 'Crystal Ball', 'Dance Floor', 'Desert Storm', 'Double Rainbow',
    'Dragon Fruit', 'Eagle Eye', 'Electric Guitar', 'Emerald City', 'Family Tree',
    'Fire Drill', 'Fish Tank', 'Flower Pot', 'French Toast', 'Full Moon',
    'Garden Gnome', 'Gold Medal', 'Grand Piano', 'Green Light', 'Hair Brush',
    'Ice Cream', 'Jelly Bean', 'Jump Rope', 'Key Chain', 'King Cobra',
    'Lemon Drop', 'Lightning Bug', 'Magic Wand', 'Mail Box', 'Map Quest',
    'Milk Shake', 'Moon Light', 'Mountain Dew', 'Movie Star', 'Mushroom Cloud',
    'Music Box', 'Night Owl', 'Ocean Wave', 'Olive Branch', 'Orange Peel',
    'Paint Brush', 'Paper Clip', 'Peanut Butter', 'Pencil Sharpener', 'Pepper Mint',
    'Phone Book', 'Photo Album', 'Pine Cone', 'Pink Panther', 'Pizza Box',
    'Pop Corn', 'Post Card', 'Power Plant', 'Pumpkin Pie', 'Puzzle Piece',
    'Queen Bee', 'Race Car', 'Rainbow Trout', 'Red Carpet', 'River Bank',
    'Rock Star', 'Roller Coaster', 'Rose Petal', 'Rubber Band', 'Sail Boat',
    'Salt Shaker', 'Sand Castle', 'School Bus', 'Sea Shell', 'Shoe Lace',
    'Ski Lift', 'Sky Line', 'Snow Flake', 'Soap Opera', 'Soccer Ball',
    'Space Ship', 'Spider Web', 'Spin Doctor', 'Star Fish', 'Steam Engine',
    'Stone Age', 'Sun Flower', 'Surf Board', 'Swimming Pool', 'Table Cloth',
    'Tea Cup', 'Thunder Storm', 'Time Machine', 'Tooth Brush', 'Traffic Jam',
    'Tree House', 'Trophy Case', 'Turtle Shell', 'Vanilla Bean', 'Water Fall',
    'Wind Mill', 'Window Pane', 'Winter Coat', 'Wood Pecker', 'Zebra Crossing'
]

def main():
    credentials = service_account.Credentials.from_service_account_file(CREDENTIALS_PATH)
    db = firestore.Client(project=PROJECT_ID, credentials=credentials)
    batch = db.batch()
    for i, phrase in enumerate(PHRASES):
        words = phrase.split()
        if len(words) != 2:
            print(f"Skipping invalid phrase: {phrase}")
            continue
        # Pick one word, deterministically
        random.seed(phrase)
        word = words[random.randint(0, 1)]
        doc_ref = db.collection('phrases').document()
        batch.set(doc_ref, {
            'text': phrase,
            'word': word,
            'used': False
        })
        # Commit every 25 to avoid batch size limits
        if (i + 1) % 25 == 0:
            batch.commit()
            batch = db.batch()
    # Commit any remaining
    batch.commit()
    print(f"Uploaded {len(PHRASES)} phrases to Firestore.")

if __name__ == '__main__':
    main()

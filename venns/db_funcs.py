import uuid
import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore
import random
import datetime
import json
import os

# Initialize Firebase
try:
    cred = credentials.Certificate('service-account.json')
    firebase_admin.initialize_app(cred)
except (ValueError, firebase_admin.exceptions.FirebaseError):
    # App already initialized
    pass

db = firestore.client()

# Constants
COLLECTION_GAMES = 'venns_games'
COLLECTION_WORDS = 'venns_words'
THRESHOLD_DAYS = 7  # Don't reuse words for 7 days

def create_game():
    """Create a new game with a unique ID."""
    game_id = str(uuid.uuid4())
    
    # Create initial game state
    game_data = {
        'game_id': game_id,
        'state': 'waiting',  # waiting, active, finished
        'created_at': firestore.SERVER_TIMESTAMP,
        'players': [],
        'player_names': {},
        'scores': {},
    }
    
    db.collection(COLLECTION_GAMES).document(game_id).set(game_data)
    return game_id

def add_player(game_id, player_name):
    """Add a player to a game."""
    player_id = str(uuid.uuid4())
    
    # Update players list
    game_ref = db.collection(COLLECTION_GAMES).document(game_id)
    game = game_ref.get()
    
    if not game.exists:
        return None
    
    game_ref.update({
        'players': firestore.ArrayUnion([player_id]),
        f'player_names.{player_id}': player_name,
        f'scores.{player_id}': 0
    })
    
    return player_id

def get_game(game_id):
    """Get game state."""
    game_doc = db.collection(COLLECTION_GAMES).document(game_id).get()
    if not game_doc.exists:
        return None
    
    game_data = game_doc.to_dict()
    
    # Convert timestamp to ISO format for JSON serialization
    if 'created_at' in game_data and game_data['created_at']:
        game_data['created_at'] = game_data['created_at'].isoformat()
    
    return game_data

def update_game_state(game_id, updates):
    """Update game state with the provided updates."""
    game_ref = db.collection(COLLECTION_GAMES).document(game_id)
    game_ref.update(updates)
    return True

def list_waiting_games():
    """List games that are in the 'waiting' state."""
    games = []
    query = db.collection(COLLECTION_GAMES).where('state', '==', 'waiting')
    for doc in query.stream():
        game_data = doc.to_dict()
        if 'created_at' in game_data and game_data['created_at']:
            game_data['created_at'] = game_data['created_at'].isoformat()
        games.append(game_data)
    
    return games

def get_random_word_pair():
    """Get a random pair of words that haven't been used recently."""
    # Get all words
    words_ref = db.collection(COLLECTION_WORDS)
    words = []
    
    # Query for words that haven't been used recently
    cutoff_date = datetime.datetime.now() - datetime.timedelta(days=THRESHOLD_DAYS)
    query = words_ref.where('last_used', '<', cutoff_date).limit(100)
    
    for doc in query.stream():
        word_data = doc.to_dict()
        words.append(word_data['text'])
    
    # If not enough words, get any words
    if len(words) < 2:
        query = words_ref.limit(100)
        words = []
        for doc in query.stream():
            word_data = doc.to_dict()
            words.append(word_data['text'])
    
    # Pick two random words
    if len(words) < 2:
        # If still not enough words, use fallback words
        fallback_words = ["Toast", "Grandma", "Divorce", "Snakes", "Coffee", "Unicorn", 
                         "Pizza", "Beach", "Moon", "Computer", "Zombie", "Chocolate"]
        return random.sample(fallback_words, 2)
    
    return random.sample(words, 2)

def update_word_usage(words):
    """Update the last used timestamp for a list of words."""
    current_time = datetime.datetime.now()
    
    for word in words:
        word_id = word.lower().replace(' ', '-')
        word_ref = db.collection(COLLECTION_WORDS).document(word_id)
        
        # Check if word exists, if not create it
        word_doc = word_ref.get()
        if not word_doc.exists:
            word_ref.set({
                'text': word,
                'created_at': current_time,
                'last_used': current_time
            })
        else:
            word_ref.update({
                'last_used': current_time
            })

def get_word_pairs_for_players(game_id, players):
    """Assign word pairs to each player."""
    word_pairs = {}
    used_words = []
    
    for player_id in players:
        word_pair = get_random_word_pair()
        while any(word in used_words for word in word_pair):
            word_pair = get_random_word_pair()
        
        word_pairs[player_id] = word_pair
        used_words.extend(word_pair)
    
    # Update usage timestamp for all words
    update_word_usage([word for pair in word_pairs.values() for word in pair])
    
    return word_pairs

def add_submission(game_id, player_id, target_player_id, phrase):
    """Add a phrase submission from one player for another player's word pair."""
    submission_id = str(uuid.uuid4())
    
    game_ref = db.collection(COLLECTION_GAMES).document(game_id)
    
    # Update submissions in game state
    game_ref.update({
        f'submissions.{submission_id}': {
            'from_player': player_id,
            'to_player': target_player_id,
            'phrase': phrase,
            'timestamp': firestore.SERVER_TIMESTAMP,
            'voted': False
        }
    })
    
    return True

def check_all_submissions_complete(game_id):
    """Check if all players have received at least 3 submissions for their word pair."""
    game = get_game(game_id)
    if not game:
        return False
    
    players = game.get('players', [])
    submissions = game.get('submissions', {})
    
    # Count submissions for each player
    submission_counts = {player_id: 0 for player_id in players}
    
    for sub_id, sub_data in submissions.items():
        target = sub_data.get('to_player')
        if target in submission_counts:
            submission_counts[target] += 1
    
    # Check if all players have at least 3 submissions
    return all(count >= 3 for count in submission_counts.values())

def get_submissions_for_player(game_id, player_id):
    """Get all phrases submitted for a specific player's word pair."""
    game = get_game(game_id)
    if not game:
        return []
    
    submissions = game.get('submissions', {})
    player_submissions = []
    
    for sub_id, sub_data in submissions.items():
        if sub_data.get('to_player') == player_id:
            player_submissions.append({
                'id': sub_id,
                'phrase': sub_data.get('phrase')
            })
    
    return player_submissions

def add_vote(game_id, player_id, submission_id):
    """Add a vote for a phrase."""
    game_ref = db.collection(COLLECTION_GAMES).document(game_id)
    
    # Update vote status in game state
    game_ref.update({
        f'votes.{player_id}': submission_id,
        f'submissions.{submission_id}.voted': True
    })
    
    return True

def check_all_votes_complete(game_id):
    """Check if all players have voted."""
    game = get_game(game_id)
    if not game:
        return False
    
    players = game.get('players', [])
    votes = game.get('votes', {})
    
    # Check if all players have voted
    return all(player_id in votes for player_id in players)

def update_scores_based_on_votes(game_id):
    """Update player scores based on votes."""
    game = get_game(game_id)
    if not game:
        return False
    
    votes = game.get('votes', {})
    submissions = game.get('submissions', {})
    scores = game.get('scores', {})
    
    # Count votes for each player's submissions
    for voter_id, submission_id in votes.items():
        if submission_id in submissions:
            submitter_id = submissions[submission_id].get('from_player')
            if submitter_id:
                # Add 1 point to the submitter
                scores[submitter_id] = scores.get(submitter_id, 0) + 1
    
    # Update scores in database
    update_game_state(game_id, {'scores': scores})
    
    return True

def add_words_from_file(filename):
    """Add words from a JSON file to the database."""
    if not os.path.exists(filename):
        return 0
    
    with open(filename, 'r') as f:
        word_list = json.load(f)
    
    batch = db.batch()
    count = 0
    
    for word in word_list:
        word_id = word.lower().replace(' ', '-')
        word_ref = db.collection(COLLECTION_WORDS).document(word_id)
        
        batch.set(word_ref, {
            'text': word,
            'created_at': datetime.datetime.now(),
            'last_used': datetime.datetime.now() - datetime.timedelta(days=30)  # Set as not recently used
        })
        
        count += 1
        if count >= 500:  # Firestore batch limit is 500
            batch.commit()
            batch = db.batch()
            count = 0
    
    if count > 0:
        batch.commit()
    
    return count
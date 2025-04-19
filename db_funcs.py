from google.cloud import firestore
from google.oauth2 import service_account
from datetime import datetime
import uuid
# import os

# Initialize Firestore client
db = firestore.Client(
    project="torch-3",
    credentials=service_account.Credentials.from_service_account_file('service-account.json')
)

def create_game():
    game_id = str(uuid.uuid4())
    game_ref = db.collection('games').document(game_id)
    game_ref.set({
        'state': 'waiting',
        'createdAt': datetime.utcnow(),
        'scores': {'A': 0, 'B': 0},
        'teamA': [],
        'teamB': [],
        'round': 1
    })
    return game_id

def add_player(game_id, player_name, team):
    player_id = str(uuid.uuid4())
    player_ref = db.collection('games').document(game_id).collection('players').document(player_id)
    player_ref.set({
        'name': player_name,
        'team': team,
        'joinedAt': datetime.utcnow()
    })
    # Add player to team array in game doc
    game_ref = db.collection('games').document(game_id)
    game_ref.update({f'team{team}': firestore.ArrayUnion([player_id])})
    return player_id

def get_game(game_id):
    game_ref = db.collection('games').document(game_id)
    return game_ref.get().to_dict()

def update_game_state(game_id, updates):
    game_ref = db.collection('games').document(game_id)
    game_ref.update(updates)

def get_random_phrase():
    phrases = list(db.collection('phrases').where('used', '==', False).stream())
    if not phrases:
        return None
    phrase_doc = phrases[0]
    # Optionally mark as used
    phrase_doc.reference.update({'used': True})
    data = phrase_doc.to_dict()
    return {'text': data['text'], 'word': data['word']}

def list_waiting_games():
    """Return a list of games in 'waiting' state with their IDs and player counts."""
    games = db.collection('games').where('state', '==', 'waiting').stream()
    result = []
    for g in games:
        data = g.to_dict()
        result.append({
            'game_id': g.id,
            'createdAt': data.get('createdAt'),
            'teamA': data.get('teamA', []),
            'teamB': data.get('teamB', [])
        })
    return result

def reset_all_phrases():
    phrases = db.collection('phrases').stream()
    for phrase in phrases:
        phrase.reference.update({'used': False})

def delete_all_games():
    games = db.collection('games').stream()
    for game in games:
        # Delete all players subcollection docs
        try:
            players = game.reference.collection('players').stream()
            for player in players:
                player.reference.delete()
        except Exception:
            pass
        game.reference.delete()

# Example usage:
# game_id = create_game()
# player_id = add_player(game_id, "Alice", "A")
# game = get_game(game_id)
# phrase = get_random_phrase()
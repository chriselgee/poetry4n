#!/usr/bin/env python3

from google.cloud import firestore
from google.oauth2 import service_account
from datetime import datetime
import uuid
import random
# import os

# Initialize Firestore client
db = firestore.Client(
    project="torch-3",
    credentials=service_account.Credentials.from_service_account_file('service-account.json')
)

# Game collection reference
games_ref = db.collection('games')

# Create a new game
def create_game(code):
    """Create a new game with the given code"""
    game_data = {
        "players": {},
        "round": 0,
        "current_word": None,
        "state": "lobby",
        "used_words": [],
        "created_at": firestore.SERVER_TIMESTAMP
    }
    games_ref.document(code).set(game_data)
    return game_data

# Get game by code
def get_game(code):
    """Get game data by game code"""
    game_doc = games_ref.document(code).get()
    if not game_doc.exists:
        return None
    return game_doc.to_dict()

# Update game data
def update_game(code, data):
    """Update game with provided data dict"""
    games_ref.document(code).update(data)

# Add player to game
def add_player(code, player_id, player_data):
    """Add a player to a game"""
    games_ref.document(code).update({
        f"players.{player_id}": player_data
    })

# Update player data
def update_player(code, player_id, player_data):
    """Update specific player data"""
    games_ref.document(code).update({
        f"players.{player_id}": player_data
    })

# Set player ready status
def set_player_ready(code, player_id, ready=True):
    """Set a player's ready status"""
    games_ref.document(code).update({
        f"players.{player_id}.ready": ready
    })

# Set player answer
def set_player_answer(code, player_id, answer):
    """Set a player's answer"""
    games_ref.document(code).update({
        f"players.{player_id}.answer": answer
    })

# Update player score
def update_player_score(code, player_id, score):
    """Update a player's score"""
    games_ref.document(code).update({
        f"players.{player_id}.score": score
    })

# Set game state
def set_game_state(code, state):
    """Update game state"""
    games_ref.document(code).update({
        "state": state
    })

# Update game round
def update_game_round(code, round_num):
    """Update game round number"""
    games_ref.document(code).update({
        "round": round_num
    })

# Set current word
def set_current_word(code, word):
    """Set the current word for the game"""
    games_ref.document(code).update({
        "current_word": word
    })

# Set game winner
def set_game_winner(code, winner):
    """Set the game winner"""
    games_ref.document(code).update({
        "winner": winner
    })

# Select a fresh word that hasn't been used yet in this game
def select_fresh_word(code, word_list):
    """Select a word that hasn't been used yet in this game"""
    game = get_game(code)
    used_words = game.get("used_words", [])
    
    # If all words have been used, reset the list
    if len(used_words) >= len(word_list) * 0.8:  # Reset when 80% of words used
        update_game(code, {"used_words": []})
        used_words = []
    
    # Find words that haven't been used yet
    available_words = [word for word in word_list if word not in used_words]
    
    # If all words have been used (shouldn't happen with the reset above), use any word
    if not available_words:
        selected_word = random.choice(word_list)
    else:
        selected_word = random.choice(available_words)
    
    # Add the selected word to the used words list
    update_game(code, {"used_words": firestore.ArrayUnion([selected_word])})
    
    return selected_word

# Transaction for updating scores after a round
def update_scores_after_round(code, score_updates):
    """Update player scores in a transaction"""
    transaction = db.transaction()
    game_ref = games_ref.document(code)
    
    @firestore.transactional
    def update_scores_transaction(transaction, ref, updates):
        game = ref.get(transaction=transaction).to_dict()
        for player_id, score_delta in updates.items():
            current_score = game["players"][player_id]["score"]
            game["players"][player_id]["score"] = current_score + score_delta
        
        transaction.update(ref, {
            f"players.{pid}.score": game["players"][pid]["score"] 
            for pid in updates.keys()
        })
        return game
    
    return update_scores_transaction(transaction, game_ref, score_updates)


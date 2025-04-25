#!/usr/bin/env python3
from flask import Flask, request, jsonify, render_template, send_from_directory
import db_funcs
import uuid
from functools import wraps
import os
import random
from google.cloud import firestore

app = Flask(__name__)

ENGLISH_WORDS = [
    "alarm","anchor","apple","armor","balloon","battery","blanket","breeze",
    "broom","button","candy","castle","cave","chalk","cheese","clock","cloud",
    "comet","crown","crystal","desert","dice","dragon","echo","feather","fence",
    "fire","flame","forest","ghost","glass","gold","guitar","hammer","helmet",
    "honey","ice","ink","island","jelly","jungle","kite","ladder","lantern",
    "leaf","light","locket","magic","magnet","map","marble","mask","mirror",
    "monster","moon","moonlight","nest","ninja","owl","paint","panther",
    "pirate","potion","puzzle","rainbow","river","robot","rocket","sand",
    "scarf","shadow","shark","shell","smoke","snow","snowflake","spider",
    "star","storm","sword","tent","thunder","ticket","tornado","train",
    "treasure","trunk","tunnel","volcano","web","whale","whisper","zipper"
]


# Helper: generate a unique game code
def generate_game_code():
    return str(uuid.uuid4())[:6]

# Lobby: create or join a game
@app.route("/", methods=["GET"])
def index():
    return render_template("index.html")

@app.route("/create", methods=["POST"])
def create_game():
    code = generate_game_code()
    db_funcs.create_game(code)
    return jsonify({"game_code": code})

@app.route("/join", methods=["POST"])
def join_game():
    data = request.json
    code = data.get("game_code")
    name = data.get("name")
    if not code or not name:
        return jsonify({"error": "Missing game code or name"}), 400
    
    game = db_funcs.get_game(code)
    if not game:
        return jsonify({"error": "Game not found"}), 404
    
    player_id = str(uuid.uuid4())
    player_data = {"name": name, "score": 0, "ready": False, "answer": None}
    db_funcs.add_player(code, player_id, player_data)
    
    return jsonify({"player_id": player_id})

@app.route("/ready", methods=["POST"])
def player_ready():
    data = request.json
    code = data.get("game_code")
    player_id = data.get("player_id")
    
    game = db_funcs.get_game(code)
    if not game or player_id not in game["players"]:
        return jsonify({"error": "Invalid game or player"}), 400
    
    db_funcs.set_player_ready(code, player_id, True)
    
    # Start game if all ready and >=3 players
    if game["state"] == "lobby":
        all_ready = True
        for p_id, player in game["players"].items():
            if not player["ready"]:
                all_ready = False
                break
        
        if len(game["players"]) >= 3 and all_ready:
            current_word = db_funcs.select_fresh_word(code, ENGLISH_WORDS)
            db_funcs.set_game_state(code, "playing")
            db_funcs.update_game_round(code, game["round"] + 1)
            db_funcs.set_current_word(code, current_word)
            
            # Reset player answers
            for p_id in game["players"]:
                db_funcs.update_player(code, p_id, {**game["players"][p_id], "answer": None})
            
            game = db_funcs.get_game(code)  # Refresh game state
    
    return jsonify({"state": game["state"], "current_word": game["current_word"]})

@app.route("/submit", methods=["POST"])
def submit_answer():
    data = request.json
    code = data.get("game_code")
    player_id = data.get("player_id")
    answer = data.get("answer")
    
    game = db_funcs.get_game(code)
    if not game or player_id not in game["players"] or game["state"] != "playing":
        return jsonify({"error": "Invalid game or player or state"}), 400
    
    # Submit player's answer
    db_funcs.set_player_answer(code, player_id, answer.strip().lower())
    
    # Re-fetch game to check if all have answered
    game = db_funcs.get_game(code)
    all_answered = True
    for p_id, player in game["players"].items():
        if not player["answer"]:
            all_answered = False
            break
    
    if all_answered:
        # Scoring
        answers = [p["answer"] for p in game["players"].values()]
        score_map = {}
        for ans in set(answers):
            count = answers.count(ans)
            if count == 2:
                pts = 3
            elif count > 2:
                pts = 1
            else:
                pts = 0
            score_map[ans] = pts
        
        # Update each player's score
        score_updates = {}
        for p_id, player in game["players"].items():
            player_answer = player["answer"]
            score_delta = score_map[player_answer]
            score_updates[p_id] = score_delta
        
        # Update scores in a transaction
        db_funcs.update_scores_after_round(code, score_updates)
        
        # Check for winner
        game = db_funcs.get_game(code)  # Get updated game state
        winner = None
        for pid, p in game["players"].items():
            if p["score"] >= 20:
                winner = pid
        
        if winner:
            db_funcs.set_game_state(code, "finished")
            db_funcs.set_game_winner(code, game["players"][winner]["name"])
        else:
            # Move to scoring state, reset ready flags
            db_funcs.set_game_state(code, "scoring")
            for p_id in game["players"]:
                db_funcs.set_player_ready(code, p_id, False)
        
        # Get final game state after updates
        game = db_funcs.get_game(code)
    
    return jsonify({
        "state": game["state"],
        "scores": {pid: p["score"] for pid, p in game["players"].items()},
        "winner": game.get("winner"),
        "answers": {pid: p["answer"] for pid, p in game["players"].items()}
    })

@app.route("/next", methods=["POST"])
def next_round():
    data = request.json
    code = data.get("game_code")
    player_id = data.get("player_id")
    
    game = db_funcs.get_game(code)
    if not game or player_id not in game["players"] or game["state"] != "scoring":
        return jsonify({"error": "Invalid game or player or state"}), 400
    
    db_funcs.set_player_ready(code, player_id, True)
    
    # Re-fetch game to check if all players are ready
    game = db_funcs.get_game(code)
    all_ready = True
    for p_id, player in game["players"].items():
        if not player["ready"]:
            all_ready = False
            break
    
    # If all ready, start next round
    if all_ready:
        current_word = db_funcs.select_fresh_word(code, ENGLISH_WORDS)
        db_funcs.set_game_state(code, "playing")
        db_funcs.update_game_round(code, game["round"] + 1)
        db_funcs.set_current_word(code, current_word)
        
        # Reset player answers and ready status
        for p_id in game["players"]:
            db_funcs.update_player(code, p_id, {**game["players"][p_id], "answer": None, "ready": False})
        
        # Get updated game state
        game = db_funcs.get_game(code)
    
    return jsonify({
        "state": game["state"],
        "current_word": game["current_word"],
        "round": game["round"]
    })

@app.route("/state", methods=["GET"])
def get_state():
    code = request.args.get("game_code")
    game = db_funcs.get_game(code)
    if not game:
        return jsonify({"error": "Game not found"}), 404
    
    return jsonify({
        "state": game["state"],
        "round": game["round"],
        "current_word": game["current_word"],
        "players": {pid: {"name": p["name"], "score": p["score"], "answer": p["answer"]} for pid, p in game["players"].items()},
        "winner": game.get("winner")
    })

# Static and template serving
@app.route('/static/<path:path>')
def send_static(path):
    return send_from_directory('static', path)

# Run it!
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)
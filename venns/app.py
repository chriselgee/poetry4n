from flask import Flask, request, jsonify, render_template, send_from_directory
import db_funcs
import uuid
from functools import wraps
import os
import datetime

app = Flask(__name__)

# In-memory session store
sessions = {}

def require_session(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        session_token = request.headers.get('X-Session-Token')
        if not session_token or session_token not in sessions:
            return jsonify({'error': 'Invalid or missing session token'}), 401
        request.player_id = sessions[session_token]['player_id']
        request.game_id = sessions[session_token]['game_id']
        return f(*args, **kwargs)
    return decorated

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/static/<path:filename>')
def static_files(filename):
    return send_from_directory(os.path.join(app.root_path, 'static'), filename)

@app.route('/create_game', methods=['POST'])
def create_game():
    game_id = db_funcs.create_game()
    return jsonify({'game_id': game_id})

@app.route('/add_player', methods=['POST'])
def add_player():
    data = request.json
    game_id = data.get('game_id')
    player_name = data.get('player_name')
    
    if not all([game_id, player_name]):
        return jsonify({'error': 'Missing required fields'}), 400
    
    player_id = db_funcs.add_player(game_id, player_name)
    
    # Create session token
    session_token = str(uuid.uuid4())
    sessions[session_token] = {'player_id': player_id, 'game_id': game_id}
    
    return jsonify({'player_id': player_id, 'session_token': session_token})

@app.route('/list_games', methods=['GET'])
def list_games():
    games = db_funcs.list_waiting_games()
    # Add a label for each game
    for g in games:
        n_players = len(g['players'])
        g['label'] = f"Game {g['game_id'][:8]} ({n_players} players)"
    return jsonify({'games': games})

@app.route('/start_game', methods=['POST'])
def start_game():
    data = request.json
    game_id = data.get('game_id')
    game = db_funcs.get_game(game_id)
    
    if not game:
        return jsonify({'error': 'Game not found'}), 404
    
    players = game.get('players', [])
    
    if game.get('state') != 'waiting' or len(players) < 3:
        return jsonify({'error': 'Game cannot be started (need at least 3 players and waiting state)'}), 400
    
    # Assign word pairs to each player for the first round
    word_pairs = db_funcs.get_word_pairs_for_players(game_id, players)
    
    # Update game state to active
    db_funcs.update_game_state(game_id, {
        'state': 'active',
        'round': 1,
        'word_pairs': word_pairs,
        'submissions': {},
        'round_status': 'submitting' # Possible values: submitting, voting, finished
    })
    
    return jsonify({'ok': True})

@app.route('/get_game/<game_id>', methods=['GET'])
def get_game(game_id):
    game = db_funcs.get_game(game_id)
    if not game:
        return jsonify({'error': 'Game not found'}), 404
    return jsonify(game)

@app.route('/submit_phrase', methods=['POST'])
@require_session
def submit_phrase():
    data = request.json
    target_player_id = data.get('target_player_id')
    phrase = data.get('phrase')
    
    if not all([target_player_id, phrase]):
        return jsonify({'error': 'Missing required fields'}), 400
    
    game = db_funcs.get_game(request.game_id)
    if not game or game.get('state') != 'active' or game.get('round_status') != 'submitting':
        return jsonify({'error': 'Cannot submit phrase at this time'}), 400
    
    # Prevent submitting to yourself
    if target_player_id == request.player_id:
        return jsonify({'error': 'Cannot submit phrase for your own word pair'}), 400
    
    # Check if the current player has already submitted a phrase for this target
    submissions = game.get('submissions', {})
    player_submissions = submissions.get(request.player_id, {})
    
    if target_player_id in player_submissions:
        return jsonify({'error': 'You have already submitted a phrase for this player'}), 400
    
    # Add the submission
    success = db_funcs.add_submission(request.game_id, request.player_id, target_player_id, phrase)
    
    if not success:
        return jsonify({'error': 'Failed to submit phrase'}), 500
    
    # Check if all phrases have been submitted (at least 3 for each player)
    all_submitted = db_funcs.check_all_submissions_complete(request.game_id)
    if all_submitted:
        db_funcs.update_game_state(request.game_id, {'round_status': 'voting'})
    
    return jsonify({'ok': True})

@app.route('/get_submissions_for_player', methods=['GET'])
@require_session
def get_submissions_for_player():
    game = db_funcs.get_game(request.game_id)
    if not game:
        return jsonify({'error': 'Game not found'}), 404
    
    # Get all phrases submitted for the current player's word pair
    submissions = db_funcs.get_submissions_for_player(request.game_id, request.player_id)
    
    return jsonify({'submissions': submissions})

@app.route('/vote_for_phrase', methods=['POST'])
@require_session
def vote_for_phrase():
    data = request.json
    submission_id = data.get('submission_id')
    
    if not submission_id:
        return jsonify({'error': 'Missing submission ID'}), 400
    
    game = db_funcs.get_game(request.game_id)
    if not game or game.get('state') != 'active' or game.get('round_status') != 'voting':
        return jsonify({'error': 'Cannot vote at this time'}), 400
    
    # Submit the vote
    success = db_funcs.add_vote(request.game_id, request.player_id, submission_id)
    
    if not success:
        return jsonify({'error': 'Failed to submit vote'}), 500
    
    # Check if all players have voted
    all_voted = db_funcs.check_all_votes_complete(request.game_id)
    if all_voted:
        # Update scores based on votes
        db_funcs.update_scores_based_on_votes(request.game_id)
        db_funcs.update_game_state(request.game_id, {'round_status': 'finished'})
    
    return jsonify({'ok': True})

@app.route('/start_next_round', methods=['POST'])
@require_session
def start_next_round():
    game = db_funcs.get_game(request.game_id)
    if not game:
        return jsonify({'error': 'Game not found'}), 404
    
    if game.get('state') != 'active' or game.get('round_status') != 'finished':
        return jsonify({'error': 'Cannot start next round at this time'}), 400
    
    current_round = game.get('round', 1)
    players = game.get('players', [])
    
    # Assign new word pairs to each player for the next round
    word_pairs = db_funcs.get_word_pairs_for_players(request.game_id, players)
    
    # Update game state for next round
    db_funcs.update_game_state(request.game_id, {
        'round': current_round + 1,
        'word_pairs': word_pairs,
        'submissions': {},
        'round_status': 'submitting'
    })
    
    return jsonify({'ok': True})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)
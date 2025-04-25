from flask import Flask, request, jsonify, render_template, send_from_directory
import db_funcs
import uuid
from functools import wraps
import os

app = Flask(__name__)

# In-memory session store (for demo; use persistent store in production)
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
    team = data.get('team')
    if not all([game_id, player_name, team]):
        return jsonify({'error': 'Missing required fields'}), 400
    player_id = db_funcs.add_player(game_id, player_name, team)
    # Create session token
    session_token = str(uuid.uuid4())
    sessions[session_token] = {'player_id': player_id, 'game_id': game_id}
    # Remove auto-start logic here
    return jsonify({'player_id': player_id, 'session_token': session_token})

@app.route('/list_games', methods=['GET'])
def list_games():
    games = db_funcs.list_waiting_games()
    # Add a label for each game (e.g. "Game X (N players)")
    for g in games:
        n_players = len(g['teamA']) + len(g['teamB'])
        g['label'] = f"Game {g['game_id'][:8]} ({n_players} players)"
    return jsonify({'games': games})

@app.route('/start_game', methods=['POST'])
def start_game():
    import random, datetime
    data = request.json
    game_id = data.get('game_id')
    game = db_funcs.get_game(game_id)
    if not game:
        return jsonify({'error': 'Game not found'}), 404
    teamA = game.get('teamA', [])
    teamB = game.get('teamB', [])
    total_players = len(teamA) + len(teamB)
    if game.get('state') != 'waiting' or total_players < 4:
        return jsonify({'error': 'Game cannot be started (need at least 4 players and waiting state)'}), 400
    first_team = random.choice(['A', 'B'])
    first_team_players = teamA if first_team == 'A' else teamB
    if not first_team_players:
        return jsonify({'error': 'No players in first team'}), 400
    first_player = first_team_players[0]
    phrase_obj = db_funcs.get_random_phrase()
    turn_end = datetime.datetime.utcnow() + datetime.timedelta(seconds=30)
    db_funcs.update_game_state(game_id, {
        'state': 'active',
        'currentTeam': first_team,
        'currentTurn': first_player,
        'currentPhrase': phrase_obj['text'],
        'currentWord': phrase_obj['word'],
        'turnEndTime': turn_end
    })
    return jsonify({'ok': True})

@app.route('/get_game/<game_id>', methods=['GET'])
def get_game(game_id):
    game = db_funcs.get_game(game_id)
    if not game:
        return jsonify({'error': 'Game not found'}), 404
    return jsonify(game)

@app.route('/get_phrase', methods=['GET'])
def get_phrase():
    phrase = db_funcs.get_random_phrase()
    if not phrase:
        return jsonify({'error': 'No phrases available'}), 404
    return jsonify({'phrase': phrase})

@app.route('/assign_points', methods=['POST'])
@require_session
def assign_points():
    import datetime
    data = request.json
    points = data.get('points')  # int: 1, 3, or -1
    team = data.get('team')      # 'A' or 'B'
    if points not in [1, 3, -1] or team not in ['A', 'B']:
        return jsonify({'error': 'Invalid points or team'}), 400
    game = db_funcs.get_game(request.game_id)
    if not game:
        return jsonify({'error': 'Game not found'}), 404
    # Update score
    scores = game.get('scores', {'A': 0, 'B': 0})
    scores[team] = scores.get(team, 0) + points
    db_funcs.update_game_state(request.game_id, {'scores': scores})
    # Check if timer expired
    turn_end_time = game.get('turnEndTime')
    expired = False
    if turn_end_time:
        # turnEndTime may be a datetime or string
        if isinstance(turn_end_time, str):
            try:
                turn_end_time_dt = datetime.datetime.fromisoformat(turn_end_time.replace('Z', '+00:00'))
            except Exception:
                turn_end_time_dt = None
        else:
            turn_end_time_dt = turn_end_time
        if turn_end_time_dt:
            now = datetime.datetime.utcnow().replace(tzinfo=turn_end_time_dt.tzinfo)
            if now > turn_end_time_dt:
                expired = True
    if expired:
        # Do not assign a new phrase/word
        return jsonify({'scores': scores, 'expired': True})
    # Get new phrase
    phrase_obj = db_funcs.get_random_phrase()
    if not phrase_obj:
        return jsonify({'error': 'No phrases available'}), 404
    db_funcs.update_game_state(request.game_id, {'currentPhrase': phrase_obj['text'], 'currentWord': phrase_obj['word']})
    return jsonify({'scores': scores, 'phrase': phrase_obj['text'], 'word': phrase_obj['word']})

@app.route('/start_turn', methods=['POST'])
@require_session
def start_turn():
    import datetime
    game = db_funcs.get_game(request.game_id)
    if not game:
        return jsonify({'error': 'Game not found'}), 404
    # Set current turn and timer
    phrase_obj = db_funcs.get_random_phrase()
    if not phrase_obj:
        return jsonify({'error': 'No phrases available'}), 404
    turn_end = datetime.datetime.utcnow() + datetime.timedelta(seconds=30)
    db_funcs.update_game_state(request.game_id, {
        'currentTurn': request.player_id,
        'currentPhrase': phrase_obj['text'],
        'currentWord': phrase_obj['word'],
        'turnEndTime': turn_end
    })
    return jsonify({'currentTurn': request.player_id, 'phrase': phrase_obj['text'], 'word': phrase_obj['word'], 'turnEndTime': turn_end.isoformat() + 'Z'})

@app.route('/end_turn', methods=['POST'])
@require_session
def end_turn():
    game = db_funcs.get_game(request.game_id)
    if not game:
        return jsonify({'error': 'Game not found'}), 404
    # Alternate team
    current_team = game.get('currentTeam', 'A')
    next_team = 'B' if current_team == 'A' else 'A'
    team_players = game.get(f'team{next_team}', [])
    if not team_players:
        return jsonify({'error': 'No players in next team'}), 400
    # Get last index for next team
    last_index_key = f'lastPlayerIndex{next_team}'
    last_idx = game.get(last_index_key, -1)
    next_idx = (last_idx + 1) % len(team_players)
    next_player = team_players[next_idx]
    # Get next player's name
    next_player_name = db_funcs.get_player_name(request.game_id, next_player)
    # Set state to waiting for ready and update last index
    db_funcs.update_game_state(request.game_id, {
        'currentTeam': next_team,
        'currentTurn': next_player,
        'turnReady': False,
        'currentPhrase': None,
        'currentWord': None,
        'turnEndTime': None,
        last_index_key: next_idx
    })
    return jsonify({'nextTeam': next_team, 'nextPlayer': next_player, 'nextPlayerName': next_player_name})

@app.route('/ready_turn', methods=['POST'])
@require_session
def ready_turn():
    import datetime
    game = db_funcs.get_game(request.game_id)
    if not game:
        return jsonify({'error': 'Game not found'}), 404
    if game.get('currentTurn') != request.player_id:
        return jsonify({'error': 'Not your turn'}), 403
    phrase_obj = db_funcs.get_random_phrase()
    if not phrase_obj:
        return jsonify({'error': 'No phrases available'}), 404
    turn_end = datetime.datetime.utcnow() + datetime.timedelta(seconds=30)
    db_funcs.update_game_state(request.game_id, {
        'turnReady': True,
        'currentPhrase': phrase_obj['text'],
        'currentWord': phrase_obj['word'],
        'turnEndTime': turn_end
    })
    return jsonify({'phrase': phrase_obj['text'], 'word': phrase_obj['word'], 'turnEndTime': turn_end.isoformat() + 'Z'})

@app.route('/admin')
def admin():
    return render_template('admin.html')

@app.route('/admin/reset_phrases', methods=['POST'])
def admin_reset_phrases():
    db_funcs.reset_all_phrases()
    return jsonify({'ok': True})

@app.route('/admin/delete_games', methods=['POST'])
def admin_delete_games():
    db_funcs.delete_all_games()
    return jsonify({'ok': True})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)

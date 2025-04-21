let gameId = null;
let playerId = null;
let sessionToken = null;
let currentTeam = null;
let timerInterval = null;
let playerTeam = null;

function show(id) {
    document.getElementById(id).style.display = '';
}
function hide(id) {
    document.getElementById(id).style.display = 'none';
}

function setGameInfo(info) {
    document.getElementById('gameInfo').innerText = info;
}

function showToast(msg, duration=2500) {
    const toast = document.getElementById('toast');
    toast.innerText = msg;
    toast.style.display = '';
    toast.style.opacity = '0.95';
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => { toast.style.display = 'none'; }, 350);
    }, duration);
}

async function createGame() {
    const res = await fetch('/create_game', {method: 'POST'});
    const data = await res.json();
    document.getElementById('joinGameId').value = data.game_id;
    showToast('Game created! Share this Game ID: ' + data.game_id);
}

async function fetchGames() {
    const res = await fetch('/list_games');
    const data = await res.json();
    const select = document.getElementById('gameSelect');
    const prevValue = select.value; // Save current selection
    select.innerHTML = '<option value="">-- Select a Game --</option>';
    (data.games || []).forEach(g => {
        select.innerHTML += `<option value="${g.game_id}">${g.label}</option>`;
    });
    // Restore selection if still present
    if (prevValue && Array.from(select.options).some(opt => opt.value === prevValue)) {
        select.value = prevValue;
    }
}

// Poll for new games every 3 seconds while in the lobby
function startLobbyPolling() {
    let lobbyInterval = setInterval(() => {
        if (document.getElementById('lobby').style.display === 'none') {
            clearInterval(lobbyInterval);
        } else {
            fetchGames();
        }
    }, 3000);
}

document.addEventListener('DOMContentLoaded', () => {
    fetchGames();
    startLobbyPolling();
});

document.getElementById('createGameBtn').onclick = async function() {
    const res = await fetch('/create_game', {method: 'POST'});
    const data = await res.json();
    await fetchGames();
    document.getElementById('gameSelect').value = data.game_id;
    showToast('Game created! Share this Game ID: ' + data.game_id);
    document.getElementById('gameSelect').dispatchEvent(new Event('change'));
};

document.getElementById('gameSelect').onchange = async function() {
    const gameIdSel = this.value;
    if (!gameIdSel) {
        document.getElementById('startGameBtn').style.display = 'none';
        return;
    }
    const res = await fetch(`/get_game/${gameIdSel}`);
    const game = await res.json();
    const nPlayers = (game.teamA?.length || 0) + (game.teamB?.length || 0);
    // Only show if enough players and waiting state
    document.getElementById('startGameBtn').style.display = (nPlayers >= 4 && game.state === 'waiting') ? '' : 'none';
};

async function joinGame() {
    const joinBtn = document.getElementById('joinGameBtn');
    joinBtn.disabled = true;
    const gameIdSel = document.getElementById('gameSelect').value;
    const playerNameInput = document.getElementById('playerName');
    const playerName = playerNameInput.value.trim();
    const team = document.getElementById('teamSelect').value;
    if (!gameIdSel || !playerName) {
        showToast('Select a game and enter your name');
        joinBtn.disabled = false;
        return;
    }
    const res = await fetch('/add_player', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({game_id: gameIdSel, player_name: playerName, team})
    });
    const data = await res.json();
    if (data.error) {
        showToast(data.error);
        joinBtn.disabled = false;
        return;
    }
    gameId = gameIdSel;
    playerId = data.player_id;
    sessionToken = data.session_token;
    playerTeam = team;
    playerNameInput.value = ''; // Clear name field
    hide('lobby');
    show('game');
    document.getElementById('gameSelect').dispatchEvent(new Event('change'));
    pollGameState();
    joinBtn.disabled = false;
}

async function pollGameState() {
    if (!gameId) return;
    const res = await fetch(`/get_game/${gameId}`);
    const game = await res.json();
    if (game.error) {
        setGameInfo('Game not found.');
        return;
    }
    setGameInfo(`Team A: ${game.scores.A} | Team B: ${game.scores.B}`);
    currentTeam = game.currentTeam || 'A';
    const isActive = game.currentTurn === playerId;
    const isOpposing = playerTeam && playerTeam !== currentTeam;
    const turnReady = !!game.turnReady;

    // Hide Start Game button if game is not waiting
    const nPlayers = (game.teamA?.length || 0) + (game.teamB?.length || 0);
    document.getElementById('startGameBtn').style.display = (nPlayers >= 4 && game.state === 'waiting') ? '' : 'none';

    if (isActive) {
        show('turn');
        hide('waiting');
        if (!turnReady) {
            show('readySection');
            hide('phraseSection');
        } else {
            hide('readySection');
            show('phraseSection');
            // Hide scoring buttons for active player
            document.getElementById('assign1').style.display = 'none';
            document.getElementById('assign3').style.display = 'none';
            document.getElementById('assignOpp').style.display = 'none';
            document.getElementById('endTurn').style.display = '';
            let phrase = game.currentPhrase || '';
            let word = game.currentWord || '';
            document.getElementById('phrase').innerHTML = `<div>${word}</div><div style='font-size:0.9em;color:#888;'><b>${phrase}</b></div>`;
            startTimer(game.turnEndTime);
        }
    } else if (isOpposing && turnReady) {
        show('turn');
        hide('waiting');
        hide('readySection');
        show('phraseSection');
        // Show scoring buttons for opposing team
        document.getElementById('assign1').style.display = '';
        document.getElementById('assign3').style.display = '';
        document.getElementById('assignOpp').style.display = '';
        document.getElementById('endTurn').style.display = 'none';
        let phrase = game.currentPhrase || '';
        let word = game.currentWord || '';
        document.getElementById('phrase').innerHTML = `<div>${word}</div><div style='font-size:0.9em;color:#888;'><b>${phrase}</b></div>`;
        startTimer(game.turnEndTime);
    } else {
        hide('turn');
        show('waiting');
    }
    setTimeout(pollGameState, 2000);
}

function startTimer(turnEndTime) {
    if (!turnEndTime) return;
    const end = new Date(turnEndTime).getTime();
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        const now = Date.now();
        let secs = Math.max(0, Math.floor((end - now) / 1000));
        document.getElementById('timer').innerText = `Time left: ${secs}s`;
        if (secs <= 0) clearInterval(timerInterval);
    }, 500);
}

async function assignPoints(points, team) {
    const res = await fetch('/assign_points', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Session-Token': sessionToken
        },
        body: JSON.stringify({points, team})
    });
    const data = await res.json();
    if (data.error) {
        showToast(data.error);
        return;
    }
    // Show both phrase and word
    document.getElementById('phrase').innerHTML = `<div>${data.word}</div><div style='font-size:0.9em;color:#888;'><b>${data.phrase}</b></div>`;
    setGameInfo(`Team A: ${data.scores.A} | Team B: ${data.scores.B}`);
}

async function startTurn() {
    const res = await fetch('/start_turn', {
        method: 'POST',
        headers: {'X-Session-Token': sessionToken}
    });
    const data = await res.json();
    if (data.error) {
        showToast(data.error);
        return;
    }
    // Show both phrase and word
    document.getElementById('phrase').innerHTML = `<div>${data.word}</div><div style='font-size:0.9em;color:#888;'><b>${data.phrase}</b></div>`;
    startTimer(data.turnEndTime);
}

async function endTurn() {
    const res = await fetch('/end_turn', {
        method: 'POST',
        headers: {'X-Session-Token': sessionToken}
    });
    const data = await res.json();
    if (data.error) {
        showToast(data.error);
        return;
    }
    showToast('Turn ended. Next: ' + data.nextPlayer);
}

document.getElementById('createGameBtn').onclick = createGame;
document.getElementById('joinGameBtn').onclick = joinGame;
document.getElementById('assign1').onclick = () => assignPoints(1, currentTeam);
document.getElementById('assign3').onclick = () => assignPoints(3, currentTeam);
document.getElementById('assignOpp').onclick = () => assignPoints(1, currentTeam === 'A' ? 'B' : 'A');
document.getElementById('endTurn').onclick = endTurn;

document.getElementById('readyBtn').onclick = async function() {
    const res = await fetch('/ready_turn', {
        method: 'POST',
        headers: {'X-Session-Token': sessionToken}
    });
    const data = await res.json();
    if (data.error) {
        showToast(data.error);
        return;
    }
    hide('readySection');
    show('phraseSection');
    document.getElementById('phrase').innerHTML = `<div>${data.word}</div><div style='font-size:0.9em;color:#888;'><b>${data.phrase}</b></div>`;
    startTimer(data.turnEndTime);
};

document.getElementById('startGameBtn').onclick = async function() {
    const gameId = document.getElementById('gameSelect').value;
    if (!gameId) return;
    const res = await fetch('/start_game', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({game_id: gameId})
    });
    const data = await res.json();
    if (data.error) {
        showToast(data.error);
        return;
    }
    showToast('Game started! Players can now join and play.');
    await fetchGames();
    document.getElementById('startGameBtn').style.display = 'none';
};

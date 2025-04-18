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

async function createGame() {
    const res = await fetch('/create_game', {method: 'POST'});
    const data = await res.json();
    document.getElementById('joinGameId').value = data.game_id;
    alert('Game created! Share this Game ID: ' + data.game_id);
}

async function joinGame() {
    gameId = document.getElementById('joinGameId').value.trim();
    const playerName = document.getElementById('playerName').value.trim();
    const team = document.getElementById('teamSelect').value;
    if (!gameId || !playerName) {
        alert('Enter Game ID and Name');
        return;
    }
    const res = await fetch('/add_player', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({game_id: gameId, player_name: playerName, team})
    });
    const data = await res.json();
    if (data.error) {
        alert(data.error);
        return;
    }
    playerId = data.player_id;
    sessionToken = data.session_token;
    playerTeam = team;
    hide('lobby');
    show('game');
    pollGameState();
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
            document.getElementById('phrase').innerHTML = `<div>${phrase}</div><div style='font-size:0.9em;color:#888;'>Word: <b>${word}</b></div>`;
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
        document.getElementById('phrase').innerHTML = `<div>${phrase}</div><div style='font-size:0.9em;color:#888;'>Word: <b>${word}</b></div>`;
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
        alert(data.error);
        return;
    }
    // Show both phrase and word
    document.getElementById('phrase').innerHTML = `<div>${data.phrase}</div><div style='font-size:0.9em;color:#888;'>Word: <b>${data.word}</b></div>`;
    setGameInfo(`Team A: ${data.scores.A} | Team B: ${data.scores.B}`);
}

async function startTurn() {
    const res = await fetch('/start_turn', {
        method: 'POST',
        headers: {'X-Session-Token': sessionToken}
    });
    const data = await res.json();
    if (data.error) {
        alert(data.error);
        return;
    }
    // Show both phrase and word
    document.getElementById('phrase').innerHTML = `<div>${data.phrase}</div><div style='font-size:0.9em;color:#888;'>Word: <b>${data.word}</b></div>`;
    startTimer(data.turnEndTime);
}

async function endTurn() {
    const res = await fetch('/end_turn', {
        method: 'POST',
        headers: {'X-Session-Token': sessionToken}
    });
    const data = await res.json();
    if (data.error) {
        alert(data.error);
        return;
    }
    alert('Turn ended. Next: ' + data.nextPlayer);
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
        alert(data.error);
        return;
    }
    hide('readySection');
    show('phraseSection');
    document.getElementById('phrase').innerHTML = `<div>${data.phrase}</div><div style='font-size:0.9em;color:#888;'>Word: <b>${data.word}</b></div>`;
    startTimer(data.turnEndTime);
};

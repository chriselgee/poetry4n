// Handles lobby creation/joining and game state transitions
let playerId = null;
let gameCode = null;
let waitingForNextRound = false; // Track if player is waiting for next round

function createGame() {
    const name = document.getElementById('name').value;
    if (!name) return alert('Enter your name');
    fetch('/create', {method: 'POST'}).then(r => r.json()).then(data => {
        gameCode = data.game_code;
        joinGameWithCode(name, gameCode);
    });
}

function joinGame() {
    const name = document.getElementById('name').value;
    const code = document.getElementById('game_code').value;
    if (!name || !code) return alert('Enter name and game code');
    joinGameWithCode(name, code);
}

function joinGameWithCode(name, code) {
    fetch('/join', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({name: name, game_code: code})
    }).then(r => r.json()).then(data => {
        if (data.error) return alert(data.error);
        playerId = data.player_id;
        gameCode = code;
        document.getElementById('lobby').style.display = 'none';
        showReadyScreen();
    });
}

function showReadyScreen() {
    const gameDiv = document.getElementById('game');
    gameDiv.style.display = '';
    gameDiv.innerHTML = `<h2>Game Code: ${gameCode}</h2>
        <button onclick="readyUp()">I'm Ready</button>
        <div id="players"></div>
        <div id="game_status"></div>`;
    pollState();
}

function readyUp() {
    fetch('/ready', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({game_code: gameCode, player_id: playerId})
    }).then(r => r.json()).then(data => {
        // Always rely on pollState to update UI
        document.getElementById('game_status').innerText = 'Waiting for others...';
        pollState();
    });
}

function showGameScreen(word) {
    const gameDiv = document.getElementById('game');
    gameDiv.innerHTML = `<h2>Prompt: ${word}</h2>
        <input type="text" id="answer" placeholder="Your word">
        <button onclick="submitAnswer()">Submit</button>
        <div id="game_status"></div>`;
    // Add Enter key support
    const answerInput = document.getElementById('answer');
    answerInput.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            submitAnswer();
        }
    });
}

function showWaitingScreen(answer) {
    const gameDiv = document.getElementById('game');
    gameDiv.innerHTML = `<h2>Your answer: ${answer}</h2><div id="game_status">Waiting for other players to submit...</div>`;
    // Poll more frequently while waiting
    setTimeout(pollState, 1000);
}

function submitAnswer() {
    const answer = document.getElementById('answer').value;
    if (!answer) return alert('Enter a word');
    fetch('/submit', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({game_code: gameCode, player_id: playerId, answer: answer})
    }).then(r => r.json()).then(data => {
        // Immediately poll for state update after submitting
        pollState();
    });
}

function showScoreboard(scores, answers, names) {
    const gameDiv = document.getElementById('game');
    let scoreList = '';
    for (const pid in scores) {
        scoreList += `<li>${names[pid]}: ${scores[pid]} pts (${answers[pid]})</li>`;
    }
    gameDiv.innerHTML = `<h2>Scoreboard</h2>
        <ul>${scoreList}</ul>
        <button onclick="readyForNextRound()">Ready for Next Round</button>
        <div id="game_status"></div>`;
    // If player is waiting, keep the message visible
    if (waitingForNextRound) {
        document.getElementById('game_status').innerText = 'Waiting for others...';
    }
    // Keep polling in scoring state so all players see the scoreboard
    setTimeout(pollState, 2000);
}

function readyForNextRound() {
    waitingForNextRound = true;
    fetch('/next', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({game_code: gameCode, player_id: playerId})
    }).then(r => r.json()).then(data => {
        // Always rely on pollState to update UI
        document.getElementById('game_status').innerText = 'Waiting for others...';
        pollState();
    });
}

function showWinner(winner, players) {
    const gameDiv = document.getElementById('game');
    let scoreList = '';
    for (const pid in players) {
        scoreList += `<li>${players[pid].name}: ${players[pid].score} pts</li>`;
    }
    gameDiv.innerHTML = `<h2>Winner: ${winner}</h2><ul>${scoreList}</ul><button onclick="location.reload()">Play Again</button>`;
}

function pollState() {
    fetch(`/state?game_code=${gameCode}`).then(r => r.json()).then(data => {
        if (data.state === 'playing' && data.current_word) {
            waitingForNextRound = false; // Reset flag for new round
            // Check if this player has already submitted an answer
            const player = data.players[playerId];
            if (player && player.answer) {
                showWaitingScreen(player.answer);
            } else {
                showGameScreen(data.current_word);
            }
        } else if (data.state === 'finished') {
            waitingForNextRound = false; // Reset flag if game finished
            showWinner(data.winner, data.players);
        } else if (data.state === 'scoring') {
            // Show scoreboard for all players
            let scores = {};
            let answers = {};
            let names = {};
            for (const pid in data.players) {
                scores[pid] = data.players[pid].score;
                answers[pid] = data.players[pid].answer;
                names[pid] = data.players[pid].name;
            }
            showScoreboard(scores, answers, names);
        } else {
            // Update player list
            let players = '';
            for (const pid in data.players) {
                players += `<li>${data.players[pid].name}: ${data.players[pid].score} pts</li>`;
            }
            document.getElementById('players').innerHTML = `<ul>${players}</ul>`;
            setTimeout(pollState, 2000);
        }
    });
}

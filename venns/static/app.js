// Venns Game App - Vanilla JS Implementation
document.addEventListener('DOMContentLoaded', function() {
    // App state
    const state = {
        // Core app state
        currentScreen: 'lobby', // lobby, waiting, game
        playerName: '',
        playerId: null,
        currentGameId: null,
        sessionToken: null,
        
        // Available games for joining
        availableGames: [],
        selectedGameId: '',
        
        // Game state
        gameState: null,
        players: [],
        roundStatus: 'submitting', // submitting, voting, finished
        
        // Word pairs
        myWordPair: [],
        otherPlayerWordPairs: {},
        
        // Submissions state
        submissions: {},
        submissionStatus: {},
        
        // Voting state
        phrasesForMyPair: [],
        votedPhraseId: null,
        
        // Results state
        roundPoints: {},
        
        // UI state
        showAlert: false,
        alertMessage: '',
        pollInterval: null
    };

    // DOM Elements
    const elements = {
        screens: {
            lobby: document.getElementById('lobby-screen'),
            waiting: document.getElementById('waiting-screen'),
            game: document.getElementById('game-screen'),
            submitting: document.getElementById('submitting-screen'),
            voting: document.getElementById('voting-screen'),
            results: document.getElementById('results-screen')
        },
        inputs: {
            createPlayerName: document.getElementById('create-player-name'),
            joinPlayerName: document.getElementById('join-player-name'),
            gameSelect: document.getElementById('game-select')
        },
        buttons: {
            createGame: document.getElementById('create-game-btn'),
            joinGame: document.getElementById('join-game-btn'),
            startGame: document.getElementById('start-game-btn'),
            nextRound: document.getElementById('next-round-btn'),
            alertOk: document.getElementById('alert-ok-btn')
        },
        displays: {
            gameCode: document.getElementById('game-code'),
            playersList: document.getElementById('players-list'),
            roundNumber: document.getElementById('round-number'),
            scoresList: document.getElementById('scores-list'),
            myWord0: document.getElementById('my-word-0'),
            myWord1: document.getElementById('my-word-1'),
            votingWord0: document.getElementById('voting-word-0'),
            votingWord1: document.getElementById('voting-word-1'),
            otherPlayersWords: document.getElementById('other-players-words'),
            submissionStatus: document.getElementById('submission-status'),
            phrasesList: document.getElementById('phrases-list'),
            roundPointsList: document.getElementById('round-points-list'),
            totalScoresList: document.getElementById('total-scores-list')
        },
        modal: {
            alert: document.getElementById('alert-modal'),
            alertMessage: document.getElementById('alert-message'),
            closeAlert: document.getElementById('close-alert')
        }
    };

    // Initialize
    init();

    // Event Listeners
    function setupEventListeners() {
        // Lobby screen
        elements.buttons.createGame.addEventListener('click', createGame);
        elements.buttons.joinGame.addEventListener('click', () => joinGame());
        
        // Waiting screen
        elements.buttons.startGame.addEventListener('click', startGame);
        
        // Game screen
        elements.buttons.nextRound.addEventListener('click', startNextRound);
        
        // Alert modal
        elements.modal.closeAlert.addEventListener('click', closeAlert);
        elements.buttons.alertOk.addEventListener('click', closeAlert);
    }

    // Session Management
    function saveSession() {
        const session = {
            token: state.sessionToken,
            playerId: state.playerId,
            gameId: state.currentGameId,
            playerName: state.playerName
        };
        localStorage.setItem('venns_session', JSON.stringify(session));
    }

    function clearSession() {
        localStorage.removeItem('venns_session');
        state.sessionToken = null;
        state.playerId = null;
        state.currentGameId = null;
    }

    function loadSession() {
        const savedSession = localStorage.getItem('venns_session');
        if (savedSession) {
            const session = JSON.parse(savedSession);
            state.sessionToken = session.token;
            state.playerId = session.playerId;
            state.currentGameId = session.gameId;
            state.playerName = session.playerName;
            
            // Populate input fields
            elements.inputs.createPlayerName.value = state.playerName;
            elements.inputs.joinPlayerName.value = state.playerName;
            
            // Try to reconnect to game
            reconnectToGame();
        }
    }

    // API calls (replaces Axios)
    async function fetchAPI(endpoint, options = {}) {
        try {
            const response = await fetch(endpoint, options);
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error(`API Error (${endpoint}):`, error);
            throw error;
        }
    }

    // Screen Management
    function showScreen(screenName) {
        state.currentScreen = screenName;
        
        // Hide all screens
        for (const screen in elements.screens) {
            if (elements.screens[screen]) {
                elements.screens[screen].style.display = 'none';
            }
        }
        
        // Show selected screen
        switch (screenName) {
            case 'lobby':
                elements.screens.lobby.style.display = 'block';
                break;
            case 'waiting':
                elements.screens.waiting.style.display = 'block';
                break;
            case 'game':
                elements.screens.game.style.display = 'block';
                
                // Show correct round screen based on round status
                showRoundScreen(state.roundStatus);
                break;
        }
    }

    function showRoundScreen(roundStatus) {
        // Hide all round screens
        elements.screens.submitting.style.display = 'none';
        elements.screens.voting.style.display = 'none';
        elements.screens.results.style.display = 'none';
        
        // Show selected round screen
        switch (roundStatus) {
            case 'submitting':
                elements.screens.submitting.style.display = 'block';
                break;
            case 'voting':
                elements.screens.voting.style.display = 'block';
                break;
            case 'finished':
                elements.screens.results.style.display = 'block';
                break;
        }
    }

    // Alert Management
    function showAlertMessage(message) {
        state.alertMessage = message;
        elements.modal.alertMessage.textContent = message;
        elements.modal.alert.style.display = 'block';
    }

    function closeAlert() {
        elements.modal.alert.style.display = 'none';
    }

    // Game Creation and Joining
    async function createGame() {
        state.playerName = elements.inputs.createPlayerName.value.trim();
        
        if (!state.playerName) {
            showAlertMessage('Please enter your name');
            return;
        }
        
        try {
            const response = await fetchAPI('/create_game', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            const gameId = response.game_id;
            state.currentGameId = gameId;
            joinGame(gameId);
        } catch (error) {
            showAlertMessage(`Error creating game: ${error.message}`);
        }
    }

    async function joinGame(gameId = null) {
        state.playerName = elements.inputs.joinPlayerName.value.trim();
        
        if (!state.playerName) {
            showAlertMessage('Please enter your name');
            return;
        }
        
        const gameIdToJoin = gameId || elements.inputs.gameSelect.value;
        if (!gameIdToJoin) {
            showAlertMessage('Please select a game to join');
            return;
        }
        
        try {
            const response = await fetchAPI('/add_player', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    game_id: gameIdToJoin,
                    player_name: state.playerName
                })
            });
            
            state.playerId = response.player_id;
            state.sessionToken = response.session_token;
            state.currentGameId = gameIdToJoin;
            
            // Save session data
            saveSession();
            
            // Switch to waiting screen
            showScreen('waiting');
            
            // Start polling game state
            startGamePolling();
        } catch (error) {
            showAlertMessage(`Error joining game: ${error.message}`);
        }
    }

    async function reconnectToGame() {
        if (!state.currentGameId || !state.sessionToken) return;
        
        try {
            const response = await fetchAPI(`/get_game/${state.currentGameId}`);
            const game = response;
            
            // Set the current screen based on game state
            if (game.state === 'waiting') {
                showScreen('waiting');
            } else if (game.state === 'active') {
                showScreen('game');
            }
            
            // Start polling game state
            startGamePolling();
        } catch (error) {
            console.error('Error reconnecting to game:', error);
            clearSession();
        }
    }

    // Game State Management
    function startGamePolling() {
        if (state.pollInterval) clearInterval(state.pollInterval);
        pollGameState();
        state.pollInterval = setInterval(pollGameState, 2000);
    }

    function stopGamePolling() {
        if (state.pollInterval) {
            clearInterval(state.pollInterval);
            state.pollInterval = null;
        }
    }

    async function pollGameState() {
        if (!state.currentGameId) return;
        
        try {
            const response = await fetchAPI(`/get_game/${state.currentGameId}`);
            updateGameState(response);
        } catch (error) {
            console.error('Error polling game state:', error);
        }
    }

    function updateGameState(game) {
        state.gameState = game;
        
        // Update elements with game state
        if (elements.displays.gameCode) {
            elements.displays.gameCode.textContent = state.currentGameId;
        }
        
        if (elements.displays.roundNumber && game.current_round) {
            elements.displays.roundNumber.textContent = game.current_round;
        }
        
        // Update players list
        state.players = (game.players || []).map(playerId => ({
            id: playerId,
            name: game.player_names?.[playerId] || 'Unknown Player'
        }));
        
        renderPlayersList();
        renderScoresList();
        
        // Handle game state changes
        if (game.state === 'active' && state.currentScreen !== 'game') {
            showScreen('game');
        }
        
        // Handle round status
        if (game.round_status) {
            state.roundStatus = game.round_status;
            
            // Setup for specific round status
            if (game.round_status === 'submitting') {
                setupSubmittingRound(game);
            } else if (game.round_status === 'voting') {
                setupVotingRound(game);
            } else if (game.round_status === 'finished') {
                setupFinishedRound(game);
            }
            
            showRoundScreen(game.round_status);
        }
    }

    // Game Flow Methods
    async function startGame() {
        if (!state.currentGameId) return;
        
        try {
            await fetchAPI('/start_game', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ game_id: state.currentGameId })
            });
            // The game state polling will handle switching to game screen
        } catch (error) {
            showAlertMessage(`Error starting game: ${error.message}`);
        }
    }

    async function startNextRound() {
        if (!state.currentGameId || !state.sessionToken) return;
        
        try {
            await fetchAPI('/start_next_round', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-Session-Token': state.sessionToken 
                },
                body: JSON.stringify({})
            });
        } catch (error) {
            showAlertMessage(`Error starting next round: ${error.message}`);
        }
    }

    // Submitting Phase
    function setupSubmittingRound(game) {
        // Get my word pair
        const wordPairs = game.word_pairs || {};
        state.myWordPair = wordPairs[state.playerId] || ['?', '?'];
        
        // Update UI with my word pair
        elements.displays.myWord0.textContent = state.myWordPair[0];
        elements.displays.myWord1.textContent = state.myWordPair[1];
        
        // Get other players' word pairs
        state.otherPlayerWordPairs = {};
        for (const [playerId, wordPair] of Object.entries(wordPairs)) {
            if (playerId !== state.playerId) {
                state.otherPlayerWordPairs[playerId] = wordPair;
            }
        }
        
        // Reset submissions
        state.submissions = {};
        
        // Render other players' word pairs
        renderOtherPlayersWords();
        
        // Calculate submission status
        calculateSubmissionStatus(game);
    }

    function calculateSubmissionStatus(game) {
        const submissions = game.submissions || {};
        const players = game.players || [];
        
        // Count submissions for each player
        const submissionCounts = {};
        for (const playerId of players) {
            submissionCounts[playerId] = 0;
        }
        
        // Count existing submissions
        for (const submission of Object.values(submissions)) {
            if (submission.to_player in submissionCounts) {
                submissionCounts[submission.to_player]++;
            }
        }
        
        // Update submission status
        state.submissionStatus = {};
        for (const playerId of players) {
            state.submissionStatus[playerId] = {
                submitted: submissionCounts[playerId],
                needed: 3
            };
        }
        
        // Render submission status
        renderSubmissionStatus();
    }

    function renderOtherPlayersWords() {
        elements.displays.otherPlayersWords.innerHTML = '';
        
        for (const [playerId, wordPair] of Object.entries(state.otherPlayerWordPairs)) {
            const playerName = getPlayerName(playerId);
            const submissionDiv = document.createElement('div');
            submissionDiv.className = 'player-submission';
            
            submissionDiv.innerHTML = `
                <div class="player-name">${playerName}</div>
                <div class="word-pair">
                    <div class="word">${wordPair[0]}</div>
                    <div class="word">${wordPair[1]}</div>
                </div>
                <div class="submission-input">
                    <input type="text" id="submission-${playerId}" class="input" 
                           placeholder="What do these things have in common?">
                    <button class="btn submit-phrase-btn" data-player-id="${playerId}">Submit</button>
                </div>
            `;
            
            elements.displays.otherPlayersWords.appendChild(submissionDiv);
            
            // Add event listener to the submit button
            const submitButton = submissionDiv.querySelector('.submit-phrase-btn');
            submitButton.addEventListener('click', () => {
                const input = submissionDiv.querySelector(`#submission-${playerId}`);
                submitPhrase(playerId, input.value);
            });
        }
    }

    function renderSubmissionStatus() {
        elements.displays.submissionStatus.innerHTML = '';
        
        for (const [playerId, status] of Object.entries(state.submissionStatus)) {
            const playerName = getPlayerName(playerId);
            const statusItem = document.createElement('div');
            statusItem.className = 'status-item';
            
            statusItem.innerHTML = `
                <div class="player-name">${playerName}</div>
                <div class="status">
                    Submissions: ${status.submitted}/${status.needed}
                </div>
            `;
            
            elements.displays.submissionStatus.appendChild(statusItem);
        }
    }

    async function submitPhrase(targetPlayerId, phrase) {
        if (!phrase.trim()) return;
        
        try {
            await fetchAPI('/submit_phrase', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-Session-Token': state.sessionToken 
                },
                body: JSON.stringify({
                    target_player_id: targetPlayerId,
                    phrase: phrase.trim()
                })
            });
            
            // Clear the submission field
            const input = document.getElementById(`submission-${targetPlayerId}`);
            if (input) input.value = '';
            
            // Poll game state to update submission status
            pollGameState();
        } catch (error) {
            showAlertMessage(`Error submitting phrase: ${error.message}`);
        }
    }

    // Voting Phase
    async function setupVotingRound(game) {
        try {
            // Fetch submissions for my word pair
            const response = await fetchAPI('/get_submissions_for_player', {
                headers: { 'X-Session-Token': state.sessionToken }
            });
            
            state.phrasesForMyPair = response.submissions || [];
            
            // Reset voted phrase
            state.votedPhraseId = null;
            
            // Check if I already voted
            const votes = game.votes || {};
            if (state.playerId in votes) {
                state.votedPhraseId = votes[state.playerId];
            }
            
            // Update UI with my word pair
            elements.displays.votingWord0.textContent = state.myWordPair[0];
            elements.displays.votingWord1.textContent = state.myWordPair[1];
            
            // Render phrases
            renderPhrases();
        } catch (error) {
            console.error('Error fetching submissions:', error);
        }
    }

    function renderPhrases() {
        elements.displays.phrasesList.innerHTML = '';
        
        for (const phrase of state.phrasesForMyPair) {
            const phraseDiv = document.createElement('div');
            phraseDiv.className = 'phrase-item';
            
            if (state.votedPhraseId === phrase.id) {
                phraseDiv.classList.add('voted');
            }
            
            phraseDiv.innerHTML = `
                <div class="phrase-text">${phrase.phrase}</div>
                <button class="btn vote-btn ${state.votedPhraseId === phrase.id ? 'voted' : ''}">
                    ${state.votedPhraseId === phrase.id ? 'Voted' : 'Vote'}
                </button>
            `;
            
            elements.displays.phrasesList.appendChild(phraseDiv);
            
            // Add event listener to the vote button
            const voteButton = phraseDiv.querySelector('.vote-btn');
            voteButton.addEventListener('click', () => {
                voteForPhrase(phrase.id);
            });
        }
    }

    async function voteForPhrase(submissionId) {
        if (state.votedPhraseId === submissionId) return;
        
        try {
            await fetchAPI('/vote_for_phrase', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-Session-Token': state.sessionToken 
                },
                body: JSON.stringify({
                    submission_id: submissionId
                })
            });
            
            state.votedPhraseId = submissionId;
            renderPhrases();
        } catch (error) {
            showAlertMessage(`Error voting: ${error.message}`);
        }
    }

    // Results Phase
    function setupFinishedRound(game) {
        // Calculate points earned this round
        const previousScores = state.gameState?.previousScores || {};
        const currentScores = game.scores || {};
        
        state.roundPoints = {};
        for (const [playerId, score] of Object.entries(currentScores)) {
            const prevScore = previousScores[playerId] || 0;
            state.roundPoints[playerId] = score - prevScore;
        }
        
        // Save current scores for next round comparison
        if (!state.gameState) state.gameState = {};
        state.gameState.previousScores = {...currentScores};
        
        // Render round scores and total scores
        renderRoundPoints();
        renderScoresList();
    }

    function renderRoundPoints() {
        elements.displays.roundPointsList.innerHTML = '';
        
        for (const [playerId, points] of Object.entries(state.roundPoints)) {
            const playerName = getPlayerName(playerId);
            const listItem = document.createElement('li');
            
            listItem.innerHTML = `
                <span class="player-name">${playerName}</span>: 
                <span class="points ${points > 0 ? 'positive' : ''}">${points > 0 ? '+' : ''}${points}</span>
            `;
            
            elements.displays.roundPointsList.appendChild(listItem);
        }
    }

    function renderScoresList() {
        if (!state.gameState?.scores) return;
        
        elements.displays.scoresList.innerHTML = '';
        elements.displays.totalScoresList.innerHTML = '';
        
        // Sort players by score
        const sortedPlayers = [...state.players].sort((a, b) => {
            const scoreA = state.gameState.scores[a.id] || 0;
            const scoreB = state.gameState.scores[b.id] || 0;
            return scoreB - scoreA; // Sort descending
        });
        
        for (const player of sortedPlayers) {
            const score = state.gameState.scores[player.id] || 0;
            
            // Update main scores list
            const scoreItem = document.createElement('li');
            scoreItem.innerHTML = `
                <span class="player-name">${player.name}</span>: 
                <span class="score">${score}</span>
            `;
            elements.displays.scoresList.appendChild(scoreItem);
            
            // Update total scores in results screen
            const totalScoreItem = document.createElement('li');
            totalScoreItem.innerHTML = `
                <span class="player-name">${player.name}</span>: 
                <span class="score">${score}</span>
            `;
            elements.displays.totalScoresList.appendChild(totalScoreItem);
        }
    }

    function renderPlayersList() {
        elements.displays.playersList.innerHTML = '';
        
        for (const player of state.players) {
            const listItem = document.createElement('li');
            listItem.textContent = player.name;
            elements.displays.playersList.appendChild(listItem);
        }
    }

    // Helper methods
    function getPlayerName(playerId) {
        return state.gameState?.player_names?.[playerId] || 'Unknown Player';
    }

    async function fetchAvailableGames() {
        try {
            const response = await fetchAPI('/list_games');
            state.availableGames = response.games || [];
            
            // Update game select dropdown
            const select = elements.inputs.gameSelect;
            
            // Clear existing options except the first default option
            while (select.options.length > 1) {
                select.remove(1);
            }
            
            // Add new options
            for (const game of state.availableGames) {
                const option = document.createElement('option');
                option.value = game.id;
                option.textContent = `Game ${game.id} (${game.player_count} players)`;
                select.appendChild(option);
            }
        } catch (error) {
            console.error('Error fetching available games:', error);
        }
    }

    function init() {
        // Setup event listeners
        setupEventListeners();
        
        // Load session if exists
        loadSession();
        
        // Start polling for available games
        fetchAvailableGames();
        setInterval(fetchAvailableGames, 5000);
        
        // Show initial screen
        showScreen('lobby');
    }
});
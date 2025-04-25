new Vue({
    el: '#app',
    data: {
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
    },
    
    mounted() {
        // Check for saved session
        const savedSession = localStorage.getItem('venns_session');
        if (savedSession) {
            const session = JSON.parse(savedSession);
            this.sessionToken = session.token;
            this.playerId = session.playerId;
            this.currentGameId = session.gameId;
            this.playerName = session.playerName;
            
            // Try to reconnect to game
            this.reconnectToGame();
        }
        
        // Start polling for available games
        this.fetchAvailableGames();
        setInterval(this.fetchAvailableGames, 5000);
    },
    
    methods: {
        // Session management
        saveSession() {
            const session = {
                token: this.sessionToken,
                playerId: this.playerId,
                gameId: this.currentGameId,
                playerName: this.playerName
            };
            localStorage.setItem('venns_session', JSON.stringify(session));
        },
        
        clearSession() {
            localStorage.removeItem('venns_session');
            this.sessionToken = null;
            this.playerId = null;
            this.currentGameId = null;
        },
        
        // Game creation and joining
        async createGame() {
            if (!this.playerName) {
                this.showAlertMessage('Please enter your name');
                return;
            }
            
            try {
                const response = await axios.post('/create_game');
                const gameId = response.data.game_id;
                this.currentGameId = gameId;
                this.joinGame(gameId);
            } catch (error) {
                this.showAlertMessage('Error creating game: ' + (error.response?.data?.error || error.message));
            }
        },
        
        async joinGame(gameId = null) {
            if (!this.playerName) {
                this.showAlertMessage('Please enter your name');
                return;
            }
            
            const gameIdToJoin = gameId || this.selectedGameId;
            if (!gameIdToJoin) {
                this.showAlertMessage('Please select a game to join');
                return;
            }
            
            try {
                const response = await axios.post('/add_player', {
                    game_id: gameIdToJoin,
                    player_name: this.playerName
                });
                
                this.playerId = response.data.player_id;
                this.sessionToken = response.data.session_token;
                this.currentGameId = gameIdToJoin;
                
                // Save session data
                this.saveSession();
                
                // Switch to waiting screen
                this.currentScreen = 'waiting';
                
                // Start polling game state
                this.startGamePolling();
            } catch (error) {
                this.showAlertMessage('Error joining game: ' + (error.response?.data?.error || error.message));
            }
        },
        
        async reconnectToGame() {
            if (!this.currentGameId || !this.sessionToken) return;
            
            try {
                const response = await axios.get(`/get_game/${this.currentGameId}`);
                const game = response.data;
                
                // Set the current screen based on game state
                if (game.state === 'waiting') {
                    this.currentScreen = 'waiting';
                } else if (game.state === 'active') {
                    this.currentScreen = 'game';
                }
                
                // Start polling game state
                this.startGamePolling();
            } catch (error) {
                console.error('Error reconnecting to game:', error);
                this.clearSession();
            }
        },
        
        // Game state management
        startGamePolling() {
            if (this.pollInterval) clearInterval(this.pollInterval);
            this.pollGameState();
            this.pollInterval = setInterval(this.pollGameState, 2000);
        },
        
        stopGamePolling() {
            if (this.pollInterval) {
                clearInterval(this.pollInterval);
                this.pollInterval = null;
            }
        },
        
        async pollGameState() {
            if (!this.currentGameId) return;
            
            try {
                const response = await axios.get(`/get_game/${this.currentGameId}`);
                this.updateGameState(response.data);
            } catch (error) {
                console.error('Error polling game state:', error);
            }
        },
        
        updateGameState(game) {
            this.gameState = game;
            
            // Update players list
            this.players = (game.players || []).map(playerId => ({
                id: playerId,
                name: game.player_names?.[playerId] || 'Unknown Player'
            }));
            
            // Handle game state changes
            if (game.state === 'active' && this.currentScreen !== 'game') {
                this.currentScreen = 'game';
            }
            
            // Handle round status
            if (game.round_status) {
                this.roundStatus = game.round_status;
                
                // Setup for specific round status
                if (game.round_status === 'submitting') {
                    this.setupSubmittingRound(game);
                } else if (game.round_status === 'voting') {
                    this.setupVotingRound(game);
                } else if (game.round_status === 'finished') {
                    this.setupFinishedRound(game);
                }
            }
        },
        
        // Game flow methods
        async startGame() {
            if (!this.currentGameId) return;
            
            try {
                await axios.post('/start_game', { game_id: this.currentGameId });
                // The game state polling will handle switching to game screen
            } catch (error) {
                this.showAlertMessage('Error starting game: ' + (error.response?.data?.error || error.message));
            }
        },
        
        async startNextRound() {
            if (!this.currentGameId || !this.sessionToken) return;
            
            try {
                const headers = { 'X-Session-Token': this.sessionToken };
                await axios.post('/start_next_round', {}, { headers });
            } catch (error) {
                this.showAlertMessage('Error starting next round: ' + (error.response?.data?.error || error.message));
            }
        },
        
        // Submitting phase
        setupSubmittingRound(game) {
            // Get my word pair
            const wordPairs = game.word_pairs || {};
            this.myWordPair = wordPairs[this.playerId] || ['?', '?'];
            
            // Get other players' word pairs
            this.otherPlayerWordPairs = {};
            for (const [playerId, wordPair] of Object.entries(wordPairs)) {
                if (playerId !== this.playerId) {
                    this.otherPlayerWordPairs[playerId] = wordPair;
                }
            }
            
            // Reset submissions
            this.submissions = {};
            
            // Calculate submission status
            this.calculateSubmissionStatus(game);
        },
        
        calculateSubmissionStatus(game) {
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
            this.submissionStatus = {};
            for (const playerId of players) {
                this.submissionStatus[playerId] = {
                    submitted: submissionCounts[playerId],
                    needed: 3
                };
            }
        },
        
        async submitPhrase(targetPlayerId) {
            if (!this.submissions[targetPlayerId]) return;
            
            try {
                const headers = { 'X-Session-Token': this.sessionToken };
                await axios.post('/submit_phrase', {
                    target_player_id: targetPlayerId,
                    phrase: this.submissions[targetPlayerId]
                }, { headers });
                
                // Clear the submission field and update the UI
                this.submissions[targetPlayerId] = '';
            } catch (error) {
                this.showAlertMessage('Error submitting phrase: ' + (error.response?.data?.error || error.message));
            }
        },
        
        // Voting phase
        async setupVotingRound(game) {
            // Fetch submissions for my word pair
            try {
                const headers = { 'X-Session-Token': this.sessionToken };
                const response = await axios.get('/get_submissions_for_player', { headers });
                this.phrasesForMyPair = response.data.submissions || [];
                
                // Reset voted phrase
                this.votedPhraseId = null;
                
                // Check if I already voted
                const votes = game.votes || {};
                if (this.playerId in votes) {
                    this.votedPhraseId = votes[this.playerId];
                }
            } catch (error) {
                console.error('Error fetching submissions:', error);
            }
        },
        
        async voteForPhrase(submissionId) {
            if (this.votedPhraseId === submissionId) return;
            
            try {
                const headers = { 'X-Session-Token': this.sessionToken };
                await axios.post('/vote_for_phrase', {
                    submission_id: submissionId
                }, { headers });
                
                this.votedPhraseId = submissionId;
            } catch (error) {
                this.showAlertMessage('Error voting: ' + (error.response?.data?.error || error.message));
            }
        },
        
        // Results phase
        setupFinishedRound(game) {
            // Calculate points earned this round
            const previousScores = this.gameState?.previousScores || {};
            const currentScores = game.scores || {};
            
            this.roundPoints = {};
            for (const [playerId, score] of Object.entries(currentScores)) {
                const prevScore = previousScores[playerId] || 0;
                this.roundPoints[playerId] = score - prevScore;
            }
            
            // Save current scores for next round comparison
            this.gameState = {
                ...this.gameState,
                previousScores: {...currentScores}
            };
        },
        
        // Helper methods
        fetchAvailableGames() {
            axios.get('/list_games')
                .then(response => {
                    this.availableGames = response.data.games || [];
                })
                .catch(error => {
                    console.error('Error fetching available games:', error);
                });
        },
        
        showAlertMessage(message) {
            this.alertMessage = message;
            this.showAlert = true;
        },
        
        getPlayerName(playerId) {
            return this.gameState?.player_names?.[playerId] || 'Unknown Player';
        }
    }
});
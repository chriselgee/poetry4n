# Poetry for Neanderthals (Web)

A web-based implementation of the party game "Poetry for Neanderthals." Players join teams, take turns giving and guessing clues, and score points. Built with Flask, Firestore, and vanilla JS.

## Features

- Create or join a game using a unique Game ID
- Team-based gameplay (Team A vs Team B)
- Real-time turn management and scoring
- Random phrase/word selection from Firestore
- Simple, responsive UI
- Admin panel for phrase/game management

## Requirements

- Python 3.8+
- Google Cloud Firestore account & service account key
- Node.js (for development, optional)

## Setup

1. **Clone the repository**
   ```bash
   git clone <repo-url>
   cd poetry4n
   ```

2. **Install Python dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Set up Firestore**
   - Create a Google Cloud project and Firestore database.
   - Download your service account key as `service-account.json` and place it in the project root.

4. **Add phrases to Firestore**
   - Prepare your phrase list in the required format.
   - Use `upload_phrases.py` to upload phrases to Firestore.

5. **Run the app**
   ```bash
   python app.py
   ```
   The app will be available at `http://localhost:8080`.

## Usage

1. Open the app in your browser at `http://localhost:8080`.
2. In the lobby, create a new game or select an existing one from the dropdown.
3. Enter your name and select a team (A or B).
4. Click "Join Game" to join the selected game.
5. Wait for at least 4 players to join (across both teams).
6. The "Start Game" button will appear for eligible games; click it to begin.
7. Follow on-screen instructions to play: players take turns, use the "Ready" button, and assign points as appropriate.
8. The game manages turns, timers, and scoring automatically.

### Admin Panel

- Visit `/admin` for admin controls.
- Reset all phrases to unused or delete all games from the database.

## Project Structure

```
app.py                # Flask backend
db_funcs.py           # Firestore database functions
upload_phrases.py     # Script to upload phrases
static/
    app.js            # Frontend JS
    style.css         # Styles
templates/
    index.html        # Main HTML template
    admin.html        # Admin panel
requirements.txt      # Python dependencies
service-account.json  # Firestore credentials (not included)
Dockerfile, Makefile  # (Optional) Containerization/build
```

## Customization

- To add or modify phrases, update your Firestore collection or use `upload_phrases.py`.
- Adjust game logic or UI by editing `app.py`, `db_funcs.py`, or files in `static/` and `templates/`.

## License

MIT License

---

*This project is not affiliated with the official "Poetry for Neanderthals" game or its publishers.*

# Whiteboard Game

A simple multiplayer word association game built with Flask and JavaScript. Players join a lobby, get a prompt word, and try to match answers with others for points. The first to reach 20 points wins!

## Features

- Create or join a game lobby with a unique code
- Real-time player readiness and game state
- Word prompts and answer submission
- Automatic scoring and winner detection
- Simple web UI (HTML/CSS/JS)
- Docker support for easy deployment

## How to Play

1. Enter your name and create or join a game using a code.
2. Wait for at least 3 players to be ready.
3. Each round, a prompt word appears. Enter a word you associate with it.
4. Points are awarded for matching answers with others.
5. The first player to reach 20 points wins!

## Local Development

### Prerequisites

- Python 3.8+
- [pip](https://pip.pypa.io/en/stable/)
- (Optional) Docker

### Setup

1. Install dependencies:
    ```
    pip install -r requirements.txt
    ```
2. Run the app:
    ```
    python app.py
    ```
3. Visit [http://localhost:8080](http://localhost:8080) in your browser.

### Using Docker

Build and run with Docker:
```
make run
```

## Deployment

- See `Makefile` for build, push, and deploy commands (Google Cloud Run example).

## File Structure

- `app.py` - Flask backend and game logic
- `static/` - Frontend JS and CSS
- `templates/` - HTML templates
- `db_funcs.py` - (Optional) Firestore integration
- `Dockerfile` - Container setup
- `Makefile` - Build and deploy commands

## License

MIT License

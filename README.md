# GhostChat
Self-destructing real-time chat rooms. Zero dependencies (Node 18+).

## Run locally
    npm start        # then open http://localhost:3000

<img width="2862" height="1516" alt="image" src="https://github.com/user-attachments/assets/425c37b0-58b5-4a90-85ee-82772afee1f8" />

    
Set `ROOM_TTL_MIN` to change room lifetime (default 10 minutes).

## How to chat
1. Person 1 clicks CREATE SECURE ROOM.
2. Person 1 shares the room link (COPY button or address bar).
3. Person 2 opens the same link and clicks JOIN ROOM.

## Deploy (GitHub -> Render)
1. Push this folder to a GitHub repo.
2. On render.com: New > Web Service > connect the repo.
3. Build command: `npm install`   Start command: `npm start`
4. Deploy. Every push auto-deploys.

Rooms live in server memory and vanish on expiry, destroy, or restart.

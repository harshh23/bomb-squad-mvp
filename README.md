# BOMB SQUAD — Pass the Problem

A small, playable browser multiplayer prototype built with Express, Socket.IO and Canvas.

## Run locally

1. Install Node.js 18 or newer.
2. Open a terminal in this folder.
3. Run:

   ```bash
   npm install
   npm start
   ```

4. Open http://localhost:3000 in two or more browser tabs.
5. In one tab choose **Create Room**. In the others enter the room code and choose **Join Room**.
6. The host starts when at least two players are in the lobby.

## Controls

- WASD or arrow keys: move
- Shift: sprint (temporary boost only when you have collected a speed power-up)
- On touch screens: use the directional buttons

## What is implemented

- Private room creation and room codes
- Up to 8 players per room
- Live player movement over Socket.IO
- Server-managed bomb ownership and countdown
- Bomb transfer on contact
- Elimination and winner detection
- Shrinking circular arena boundary
- Shield and speed power-ups
- Rematch flow

## Important prototype limitations

- This is an MVP prototype, not a production-hardened game.
- The arena uses simple circular boundary collision and decorative obstacles; obstacles are not solid yet.
- Movement is server-updated but input validation and anti-cheat are basic.
- The room state is in memory. Restarting the server clears rooms.
- There is no persistent account system or global leaderboard.
- Host migration is basic.
- The Google Font is loaded remotely; system fonts are used if unavailable.

## Put it online

Deploy this Node app to a host that supports persistent WebSocket connections (for example, Render or Railway). Set the start command to `npm start`. Do not deploy the Socket.IO server as a static-only site. After deployment, share the public URL; room codes work across browsers connected to the same server.

For a public launch, add rate limits, reconnect tokens, server-side movement speed limits, room expiry, input throttling, and production monitoring.

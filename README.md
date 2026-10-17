# Chess 3D

A browser-based 3D chess game. You walk around the board in first person, play against a built-in computer opponent, and can issue moves by typing or speaking.

## Requirements

- Node.js 22 or newer
- A WebGL-capable browser. Chrome or Safari is needed for the browser speech recognition path.

## Setup

```sh
npm ci
cp .env.example .env
npm run dev
```

The game runs without any keys. Both keys in `.env` are optional:

- `TYPESAFE_API_KEY`: enables the Jev language model, which interprets free-form spoken or typed commands. Without it, only direct moves and SAN input work, and the Jev endpoint returns a 503 error.
- `OPENAI_API_KEY`: enables the voice transcription fallback for browsers without native speech recognition. Without it, the fallback is disabled and the endpoint returns a 503 error.

Restart the dev server after changing `.env`. The other variables in `.env.example` tune the model name, the minimum confidence for accepting an interpreted command, the Jev base URL and the transcription model.

## Controls

- Arrow keys: walk and turn
- Shift: run
- Drag with the mouse: look around
- V: toggle the overview camera
- Space or the Mic button: speak a command
- Typing: enter an order or a move in SAN

## Architecture

- `src/engine`: game state and rules, built on chess.js
- `src/commands`: turns typed or spoken text into game actions, including the Jev client, the prompt, and tactical helpers
- `src/opponent`: the computer opponent, a small built-in search engine that runs in a Web Worker
- `src/scene`: Three.js scene, piece models, first-person controls, animations and effects
- `src/audio`: sound effects and ambience
- `src/voice`: browser speech recognition and recorded-audio transcription
- `src/dev`: famous game data used for development and tests

## Scripts

- `npm run dev`: start the Vite dev server
- `npm run build`: typecheck and produce a production build in `dist`
- `npm run preview`: serve the production build locally
- `npm test`: run the Vitest suite once
- `npm run test:watch`: run Vitest in watch mode
- `npm run typecheck`: run the TypeScript compiler without emitting
- `npm run lint` and `npm run lint:fix`: ESLint with typescript-eslint strict type-checked rules
- `npm run format` and `npm run format:check`: Prettier
- `npm run check:comments`: fail if any file under `src` contains a comment
- `npm run check`: typecheck, lint, format check, comment check and tests, as run in CI

## Testing

Tests live next to the code as `*.test.ts` and run with Vitest in a Node environment. They cover the engine, command interpretation, the opponent, speech handling, first-person movement and effects.

## Dev proxy and API keys

The browser calls `/api/jev` and `/api/openai`. The Vite dev server proxies these to the upstream APIs and adds the API key from `.env`, so keys never reach the browser bundle. The proxy only accepts POST, never forwards the browser's Cookie header, and answers with a 503 JSON error when the matching key is missing.

This proxy exists only in the dev server. A production deployment needs a real backend that exposes the same `/api/jev` and `/api/openai` routes and holds the keys server-side. Serving the contents of `dist` alone will leave both features unavailable.

## Known limitations

- The API proxy is dev-only, as described above.
- Browser speech recognition requires Chrome or Safari; other browsers depend on the OpenAI transcription fallback.
- The opponent is a small built-in search engine, not Stockfish, and is much weaker.
- TypeScript is pinned to 6.0 because typescript-eslint does not yet support TypeScript 7.
- No license has been chosen for this repository.

# Folk & Found

An interactive 3D globe for exploring the myths and folklore of the entire world. Every country and every US state is clickable, and each one has something waiting: the creatures and legends rooted in that place, retold as prose, glowing on a heatmap by how rich its folklore runs, and shifting across four historical eras.
<img width="1122" height="706" alt="Screenshot 2026-08-12 at 2 14 59 PM" src="https://github.com/user-attachments/assets/b15c3b25-7863-405f-a975-b0a464144c5f" />![Uploading Screenshot 2026-08-12 at 2.14.59 PM.png…]()


**[Live demo →](https://folkfound.issamohamed.com/)**

![Uploading Screenshot 2026-08-12 at 2.14.59 PM.png…]()


## What it does

- **A living heatmap of world folklore.** A shader-driven three.js globe where 294 regions glow by the depth of their folklore, from the Greek Gorgons to West Virginia's Mothman. Real borders are projected onto the sphere, and the region under your cursor lights up as you move.
- **Travel through time.** A four-era toggle (Ancient → Modern) reshapes the whole map. Greece cools from a teeming red in antiquity to a quiet speck today, while modern America ignites with its cryptids and tall tales.
- **Descriptions written on demand.** Click a region and a frosted-glass placard opens with an original, era-aware account, generated live and grounded strictly on curated facts, alongside illustration and a "read more" link pulled from Wikimedia and Wikipedia.
- **Search by meaning, not spelling.** Ask for "a bird that brings storms" or "a shape-shifting water horse" and get the right answers, via a two-stage retrieval pipeline.
- **Myth Guesser.** A built-in game deals you a folklore image with no name and asks you to place its origin on the globe, scored by real geographic distance to any of its homelands.
- **Procedural regional ambience.** Clicking a region fades in a short instrumental phrase synthesized in the browser with the Web Audio API. No files, no network: the sound is derived from the region's musical zone, its folklore density, and the active era, so the heatmap becomes something you can hear.

<img width="1190" height="905" alt="Screenshot 2026-08-12 at 2 15 44 PM" src="https://github.com/user-attachments/assets/f3868a59-3ddb-4025-9db9-1a70a3d4d62d" />


## How it's built

The whole app renders from a single hand-built dataset, `folklore.json`: **294 regions, 415 entries, four eras**, and the generation directive that shapes every written entry. Nothing in the UI invents or hardcodes folklore; it all flows from that file, and no region is ever empty.

- **Frontend:** React, TypeScript, Vite. A three.js globe with custom vertex and fragment shaders for the density splotches, and a flat-map fallback so a browser without WebGL still works.
- **Edge:** Cloudflare Pages and Workers with KV caching. Written entries come from Groq (Llama 3.3 70B); imagery and summaries from the Wikimedia and Wikipedia APIs.
- **Audio:** Web Audio API synthesis, grouping the 294 regions into 15 musical zones seeded deterministically so each place sounds the same every time and different from its neighbours.

The bundle is code-split so the globe engine only loads when needed, and no API key ever reaches the client.

<img width="1034" height="702" alt="Screenshot 2026-08-12 at 2 19 17 PM" src="https://github.com/user-attachments/assets/bf76565d-3872-4f6f-8e44-06fced79c2de" />


## Running locally

```bash
npm install
npm run dev
```

Then open http://localhost:5173. The dev server proxies `/api/*` to the real Workers runtime, so local development exercises the actual endpoints rather than a mock.

Written entries need a Groq key, which lives only in the Worker, never in the frontend. Create a git-ignored `.dev.vars` in the project root:

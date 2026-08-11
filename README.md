# Folk & Found

An interactive map of world folklore. Every country and every US state is clickable, and
every one of them has something waiting: the creatures rooted in that place, retold as
prose, across four eras.

`folklore.json` is the source of truth for the entire app — 294 regions, 415 creature
entries, four eras, and the generation directive that shapes every written entry. Nothing
in the UI invents or hardcodes folklore; it all renders from that file.

## Running it

```bash
npm install
```

Two processes. The Vite dev server serves the app with hot reload and proxies `/api/*` to
the real Workers runtime, so local development exercises the actual endpoints and KV
rather than a mock:

```bash
npm run dev
```

```bash
npm run build && npm run dev:api
```

Then open http://localhost:5173.

`npm run dev:api` serves `dist/`, so re-run `npm run build` after changing a Worker.

### The Groq key

Written entries come from Groq (Llama 3.3 70B) via the Worker. The key lives only there —
never in the frontend bundle. Create `.dev.vars` in the project root yourself:

```
GROQ_API_KEY=your_key_here
```

It is git-ignored. Without it the API returns 503 and the panel falls back to showing the
region's creatures and their seed facts, so clicking a region still tells you something.

## Deploying

```bash
npx wrangler kv namespace create FOLKLORE_CACHE
```

Put the returned id into `wrangler.toml`, then:

```bash
npx wrangler pages secret put GROQ_API_KEY
```

```bash
npm run build && npx wrangler pages deploy dist
```

### From GitHub

Cloudflare Pages can build straight from this repository instead. Connect it under
**Workers & Pages → Create → Pages → Connect to Git**, then set:

| Setting                | Value                                               |
| ---------------------- | --------------------------------------------------- |
| Build command          | `npm run build`                                     |
| Build output directory | `dist`                                              |
| Node version           | `20` or newer (`NODE_VERSION` environment variable) |

`functions/` is picked up automatically as Pages Functions. Add `GROQ_API_KEY` as an
encrypted environment variable and bind the `FOLKLORE_CACHE` KV namespace under the
project's **Settings → Functions**, for both Production and Preview.

## How it fits together

```
folklore.json          the source of truth, at the project root
  ├─ served to the browser at /folklore.json by a small Vite plugin,
  │  so there is never a second copy to drift
  └─ bundled into the Worker, which resolves creatures itself rather than
     trusting the request body

src/
  components/Globe.tsx        three.js globe — icosahedron shell, starfield,
                              additive density splotches at each centroid
  components/WorldMap.tsx     flat map fallback; loads its own atlases
  components/RegionPopup.tsx  the glass placard
  components/AmbienceToggle.tsx  mute switch for the region ambience
  data/densityScale.ts        the 1–5 colour ramp, shared by both views
  data/regionCodes.ts         atlas ids → folklore region keys
  hooks/useAmbience.ts        ties the ambience to the open panel
  lib/ambience.ts             Web Audio synthesis: plan a phrase, play it
  lib/ambienceZones.ts        the 294 regions grouped into 15 musical zones
  lib/geo.ts                  lat/lng ↔ sphere coordinates

functions/api/
  describe.ts   Groq prose, cached in KV as `regionCode:era`
  images.ts     Wikimedia Commons images with author and licence
  wiki.ts       one-line Wikipedia summary for the "Read more" card
```

### Things worth knowing

**Every region is reachable.** 294 regions, but the 50m atlas has no shape for 13 of them
(Tuvalu, Tokelau, Scotland, Siberia, the French overseas départements…), and the US
country shape is completely covered by the states layer even though `US` has its own
data. Those regions get a centroid marker instead. The list is computed from the atlas at
runtime, not hardcoded, and is verified: all 294 regions × 4 eras open with the correct
name and creature count.

**Density and entry count disagree on purpose.** `US`/medieval is density 2 with three
entries. Density drives colour; the entry list drives content. Neither is derived from the
other.

**Attribution is a requirement, not decoration.** Images come from each article's
editorially-chosen lead image rather than its raw file list — the raw list contains
interface icons and, on some folklore articles, explicit historical art. Only
Commons-hosted files are shown, since locally-hosted Wikipedia files are usually non-free,
and every image carries its author and licence.

**Sensitive entries stay sensitive.** 38 entries are flagged as living traditions of
specific peoples. The Worker names them explicitly in the prompt with instructions to
attribute them to their culture, write in the present tense, and describe no ritual
specifics or anything held sacred. In the UI they carry a warmer border in the creature
roll. This handling is intact at every layer.

**Regional ambience is synthesised, not sampled.** Opening a region's panel fades in a
short instrumental phrase built with the Web Audio API — no audio files, no network calls,
nothing licensed. The phrase comes from three things the app already knows: the region's
musical zone (one of fifteen, from its centroid and code), its density in the active era
(density 1 is a single line, density 5 layers five voices), and the era itself, which
changes the reverb and pace rather than the notes. Small melodic choices are seeded from a
hash of the region code, so a place sounds the same every time it is opened and different
from its neighbours. Clicking another region cross-fades; closing the panel fades out. The
game stays silent, since a region's zone would hint at the answer.

**No browser storage.** No `localStorage` or `sessionStorage` anywhere, including the
ambience mute preference, which lives in memory for the session. Caching is KV,
server-side.

**Known data issue.** 32 of 415 entries link to Wikipedia pages that do not exist. See
[DEAD_WIKI_LINKS.md](DEAD_WIKI_LINKS.md). `/api/wiki` falls back through a region's other
creatures, so a card only disappears when every one of them is dead.

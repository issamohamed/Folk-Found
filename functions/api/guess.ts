import { data, json, methodNotAllowed, type Env } from '../_lib/env';
import { fetchImageCredits, type ImageCredit } from '../_lib/wikimedia';

/**
 * The guessing round. Two shapes on one route: a body with no roundId starts a
 * round, a body with one scores it.
 *
 * The answer never reaches the browser until the guess is in — the round is a
 * random KV id pointing at an entry key, so there is no name in the payload to
 * read out of the network tab.
 */

/** Candidates sampled per round. Wikipedia takes them in one query, and most
 *  have a lead image, so one batch is nearly always enough. */
const SAMPLE = 14;
/** A round is a single sitting; anything older has been abandoned. */
const ROUND_TTL_SECONDS = 60 * 60 * 3;

interface RoundRecord {
  entryKey: string;
  startedAt: string;
}

/** The image, stripped of the one field that would give the game away. */
type RoundImage = Omit<ImageCredit, 'forTitle'>;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { roundId?: unknown; regionCode?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Expected a JSON body' }, 400);
  }

  return typeof body.roundId === 'string'
    ? score(env, body.roundId, body.regionCode)
    : startRound(env);
};

export const onRequest: PagesFunction<Env> = () => methodNotAllowed('POST');

/* -- Starting a round ------------------------------------------------------ */

async function startRound(env: Env): Promise<Response> {
  const keys = Object.keys(data.items);
  const sample = pickDistinct(keys, SAMPLE);

  // Matched back by title, since the Wikimedia response is keyed by article
  // title rather than by our keys.
  const byTitle = new Map(
    sample.map((key) => [decodeURIComponent(data.items[key].wiki), key]),
  );

  let credits: ImageCredit[];
  try {
    credits = await fetchImageCredits([...byTitle.keys()]);
  } catch {
    return json({ error: 'Could not reach the picture archive' }, 502);
  }

  const found = credits.find((credit) => byTitle.has(credit.forTitle));
  if (!found) {
    // No candidate in this sample has a lead image; the client asks again.
    return json({ error: 'No picture came back for this round', retry: true }, 503);
  }

  const entryKey = byTitle.get(found.forTitle)!;
  const roundId = crypto.randomUUID();

  await env.FOLKLORE_CACHE.put(
    `round:${roundId}`,
    JSON.stringify({ entryKey, startedAt: new Date().toISOString() } satisfies RoundRecord),
    { expirationTtl: ROUND_TTL_SECONDS },
  );

  const { forTitle: _omitted, ...image } = found;
  return json({ roundId, image: image satisfies RoundImage }, 200, {
    // A round is single-use; caching one would hand two players the same answer.
    'Cache-Control': 'no-store',
  });
}

/* -- Scoring --------------------------------------------------------------- */

async function score(env: Env, roundId: string, regionCode: unknown): Promise<Response> {
  if (typeof regionCode !== 'string' || !data.regions[regionCode]) {
    return json({ error: 'Unknown region' }, 400);
  }

  const round = await env.FOLKLORE_CACHE.get<RoundRecord>(`round:${roundId}`, 'json');
  if (!round) {
    return json({ error: 'That round has expired', expired: true }, 410);
  }

  const item = data.items[round.entryKey];
  if (!item) return json({ error: 'That round has expired', expired: true }, 410);

  // Every region listing this creature in any era counts: naming any of its
  // homes is a right answer.
  const homes = Object.entries(data.regions)
    .filter(([, region]) =>
      Object.values(region.eras).some((keys) => keys.includes(round.entryKey)),
    )
    .map(([code, region]) => ({ code, name: region.name, centroid: region.centroid }));

  const correct = homes.some((home) => home.code === regionCode);
  const guessed = data.regions[regionCode];

  // Measured to the nearest home, so a guess next door to any of them is close.
  const distanceKm = correct
    ? 0
    : Math.round(
        Math.min(...homes.map((home) => haversineKm(guessed.centroid, home.centroid))),
      );

  return json(
    {
      correct,
      distanceKm,
      guessed: { code: regionCode, name: guessed.name },
      answer: {
        entryKey: round.entryKey,
        label: item.title,
        kind: item.kind,
        seed: item.seed,
        sensitive: item.sensitive,
      },
      homes: homes.map(({ code, name }) => ({ code, name })),
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
}

/* -- Helpers --------------------------------------------------------------- */

/** Sample without replacement: a partial Fisher-Yates over a copy, so no
 *  creature appears twice in one batch. */
function pickDistinct(keys: string[], count: number): string[] {
  const pool = [...keys];
  const take = Math.min(count, pool.length);
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(Math.random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, take);
}

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

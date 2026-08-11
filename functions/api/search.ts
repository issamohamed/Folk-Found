import { data, json, methodNotAllowed, type Item, type Env } from '../_lib/env';
import {
  GROQ_SEARCH_MODEL,
  GroqError,
  groqComplete,
  type ChatMessage,
} from '../_lib/groq';

/** Most a reader can usefully scan in a dropdown. */
const MAX_MATCHES = 8;
const MAX_QUERY_CHARS = 120;

interface Match {
  key: string;
  label: string;
  type: string;
  seed: string;
  /** One short line on why this answers the query. */
  why: string;
}

interface CachedSearch {
  matches: Match[];
  searchedAt: string;
}

/**
 * Semantic search across the active mode’s dictionary — creatures, or stories.
 *
 * The catalog is built from the bundled data file for the active mode, and every key the model
 * returns is checked back against it, so a hallucinated creature cannot reach
 * the reader — the worst case is a shorter list, never an invented one. The
 * label, type and seed all go into the prompt because the seeds are what make
 * "shape-shifting water horse" find the kelpie; matching on names alone would
 * make this an autocomplete rather than a search.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { query?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Expected a JSON body' }, 400);
  }

  const raw = typeof body.query === 'string' ? body.query.trim() : '';
  if (!raw) return json({ matches: [] });
  if (raw.length > MAX_QUERY_CHARS) {
    return json({ error: 'That search is too long' }, 400);
  }

  // Case and inner whitespace should not split the cache.
  const normalized = raw.toLowerCase().replace(/\s+/g, ' ');
  const cacheKey = `search:${normalized}`;

  const cached = await env.FOLKLORE_CACHE.get<CachedSearch>(cacheKey, 'json');
  if (cached) {
    return json({ matches: cached.matches, cached: true }, 200, {
      'Cache-Control': 'public, max-age=3600',
    });
  }

  if (!env.GROQ_API_KEY) {
    return json({ error: 'Search is not configured', matches: [] }, 503);
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `${buildCatalog(raw)}\n\nSearch: ${raw}` },
  ];

  let completion: string;
  try {
    completion = await groqComplete(env.GROQ_API_KEY, messages, {
      model: GROQ_SEARCH_MODEL,
      // Matching, not writing: keep it deterministic so the same query gives
      // the same shelf twice running.
      temperature: 0.2,
      maxTokens: 700,
      json: true,
    });
  } catch (err) {
    const status = err instanceof GroqError ? err.status : 502;
    return json(
      { error: 'Search is unavailable right now', matches: [] },
      status === 429 ? 429 : 502,
    );
  }

  const matches = parseMatches(completion);

  await env.FOLKLORE_CACHE.put(
    cacheKey,
    JSON.stringify({ matches, searchedAt: new Date().toISOString() } satisfies CachedSearch),
    // Queries are open-ended, so this cache would grow without bound. A month
    // keeps the common ones warm and lets the long tail expire.
    { expirationTtl: 60 * 60 * 24 * 30 },
  );

  return json({ matches, cached: false }, 200, { 'Cache-Control': 'public, max-age=3600' });
};

export const onRequest: PagesFunction<Env> = () => methodNotAllowed('POST');

const SYSTEM_PROMPT = [
  'You match a reader’s search against a shortlist of folklore creatures.',
  '',
  'You are given candidate creatures, one per line, as:',
  '  key|label (type)|seed fact',
  '',
  'Rules:',
  `1. Return at most ${MAX_MATCHES} matches, best first.`,
  '2. Use ONLY keys that appear verbatim in the candidates. Never invent a key or a creature.',
  '3. Match on meaning, not spelling. A search for a description ("shape-shifting water',
  '   horse"), a theme ("creatures that drown travellers"), a place ("Japanese river"), or a',
  '   feeling ("something that haunts a forest") should find the creatures that fit it.',
  '4. If the search names a creature directly, put that creature first.',
  '5. If none of the candidates genuinely fits, return an empty list. A short honest list',
  '   beats a padded one — the shortlist is filtered by word overlap, so some candidates',
  '   are there by accident and should be rejected.',
  '6. "why" is at most 12 words saying what connects this creature to the search. Do not',
  '   restate the seed fact verbatim.',
  '',
  'Respond with JSON only, in exactly this shape:',
  '{"matches":[{"key":"<catalog key>","why":"<short reason>"}]}',
].join('\n');

/**
 * Two-stage retrieval, forced by a hard token budget.
 *
 * The whole 415-creature dictionary is about 10,700 tokens, and the Groq account
 * this runs on allows 6,000 tokens per minute — so a single whole-catalog
 * request could never succeed on any model, cached or not. Sending everything
 * was not slow, it was impossible.
 *
 * So recall happens here, for free: a weighted token overlap over each
 * creature's name, type and seed picks a shortlist, and only that shortlist is
 * sent to Groq to be judged on meaning. It is the ordinary shape of a search
 * system — a cheap wide filter in front of an expensive narrow one — and it puts
 * a request at roughly 2,000 tokens, which leaves room for several searches a
 * minute and for the entries readers are actually reading.
 *
 * The scoring is deliberately generous rather than precise. Its only job is to
 * avoid discarding the right answer; choosing between what survives is the part
 * the model is good at.
 */
const SHORTLIST = 90;
const SEED_CLIP = 72;

/** Words too common to say anything about which creature is meant. */
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'can', 'for', 'from',
  'in', 'into', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'their',
  'them', 'they', 'this', 'to', 'was', 'were', 'who', 'with', 'something',
  'someone', 'creature', 'creatures', 'thing', 'things', 'like', 'about',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

/** Crude singular/plural fold, so "spirits" reaches "spirit". */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith('es')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s')) return word.slice(0, -1);
  return word;
}

function shortlist(query: string): Array<[string, Item]> {
  const wanted = new Set(tokenize(query).map(stem));
  const all = Object.entries(data.items);
  if (wanted.size === 0) return all.slice(0, SHORTLIST);

  const scored = all.map(([key, entry]) => {
    let score = 0;
    // A hit in the name means the most, then the type — which in this data is
    // itself a small taxonomy ("water horse", "vengeful ghost") and carries a
    // lot of the meaning — then the seed fact.
    for (const word of new Set(tokenize(entry.title).map(stem))) {
      if (wanted.has(word)) score += 6;
    }
    for (const word of new Set(tokenize(entry.kind).map(stem))) {
      if (wanted.has(word)) score += 4;
    }
    for (const word of new Set(tokenize(entry.seed).map(stem))) {
      if (wanted.has(word)) score += 1;
    }
    // A query typed as a prefix ("kelp") should still reach its creature.
    for (const word of wanted) {
      if (entry.title.toLowerCase().includes(word)) score += 5;
    }
    return { key, entry, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const hits = scored.filter((s) => s.score > 0);
  // With no lexical purchase at all — a genuinely abstract query — fall back to
  // a slice of the catalog rather than an empty prompt, so the model still has
  // something to reason over.
  const pool = hits.length > 0 ? hits : scored;
  return pool.slice(0, SHORTLIST).map((s) => [s.key, s.entry]);
}

function buildCatalog(query: string): string {
  const lines = shortlist(query).map(([key, entry]) => {
    const seed =
      entry.seed.length > SEED_CLIP
        ? `${entry.seed.slice(0, SEED_CLIP).trimEnd()}…`
        : entry.seed;
    return `${key}|${entry.title} (${entry.kind})|${seed}`;
  });
  return `Candidates (${lines.length}), as key|label (type)|seed:\n${lines.join('\n')}`;
}

/**
 * Read the model's JSON back into real catalog entries.
 *
 * Everything here is defensive: the response is parsed in a try, the shape is
 * checked field by field, and each key must resolve in the bundled dictionary.
 * A malformed or imaginative completion degrades to fewer results.
 */
function parseMatches(completion: string): Match[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(completion);
  } catch {
    return [];
  }

  const raw = (parsed as { matches?: unknown })?.matches;
  if (!Array.isArray(raw)) return [];

  const matches: Match[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    if (matches.length >= MAX_MATCHES) break;
    const key = (item as { key?: unknown })?.key;
    if (typeof key !== 'string' || seen.has(key)) continue;

    const entry = data.items[key];
    if (!entry) continue;

    const why = (item as { why?: unknown })?.why;
    seen.add(key);
    matches.push({
      key,
      label: entry.title,
      type: entry.kind,
      seed: entry.seed,
      why: typeof why === 'string' ? why.slice(0, 90) : '',
    });
  }

  return matches;
}

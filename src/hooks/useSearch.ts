import { useEffect, useMemo, useState } from 'react';
import type { Dataset, EraId } from '../data/types';

export interface SearchHit {
  key: string;
  label: string;
  type: string;
  seed: string;
  /** Why this answers the query — only present on semantic hits. */
  why: string;
  /** True when the name itself matched, rather than the meaning. */
  literal: boolean;
  /** Where the reader is sent: a region and era that actually holds it. */
  regionCode: string;
  regionName: string;
  era: EraId;
  /** How many region-and-era slices list this creature at all. */
  places: number;
  /**
   * Set only when another result in the same list carries the same name, and
   * then it is the region — which is what actually tells the two apart. Four
   * rows reading "Thunderbird" look like a bug; "Thunderbird (Montana)" and
   * "Thunderbird (Ojibwe Nation)" read as what they are, four separate
   * traditions that happen to share a word.
   */
  qualifier: string | null;
}

export type SearchState =
  | { status: 'idle' }
  | { status: 'searching'; hits: SearchHit[] }
  | { status: 'done'; hits: SearchHit[] }
  | { status: 'error'; hits: SearchHit[] };

const DEBOUNCE_MS = 320;
const MAX_HITS = 8;

/**
 * Search over the creature dictionary.
 *
 * Two passes, deliberately. The literal pass runs here against the already
 * loaded entities.json and answers instantly — someone typing "kelp" should see
 * the kelpie before they finish the word, without a round trip. The semantic
 * pass goes to the Worker, which asks Groq to match on meaning, and folds in
 * behind the literal hits when it lands.
 *
 * That ordering matters: the fast local answer is never replaced by a slower
 * remote one, only extended by it, so the list never reshuffles under a reader
 * who is already reaching for a result.
 */
export function useSearch(data: Dataset, query: string, era: EraId): SearchState {
  const trimmed = query.trim();

  /** Every region-and-era slice that lists a creature, built once. */
  const placements = useMemo(() => buildPlacements(data), [data]);

  const literal = useMemo(() => {
    if (trimmed.length < 2) return [];
    const needle = trimmed.toLowerCase();

    const scored: Array<{ key: string; score: number }> = [];
    for (const [key, entry] of Object.entries(data.items)) {
      const label = entry.title.toLowerCase();
      // A name that starts with the query beats one that merely contains it,
      // which beats a match hiding in the type or the seed fact.
      const score = label.startsWith(needle)
        ? 0
        : label.includes(needle)
          ? 1
          : entry.kind.toLowerCase().includes(needle)
            ? 2
            : entry.seed.toLowerCase().includes(needle)
              ? 3
              : -1;
      if (score >= 0) scored.push({ key, score });
    }

    scored.sort(
      (a, b) => a.score - b.score || data.items[a.key].title.localeCompare(data.items[b.key].title),
    );

    return scored
      .slice(0, MAX_HITS)
      .map(({ key }) => toHit(data, placements, key, '', true, era))
      .filter((hit): hit is SearchHit => hit !== null);
  }, [data, placements, trimmed, era]);

  const [semantic, setSemantic] = useState<SearchHit[]>([]);
  const [status, setStatus] = useState<'idle' | 'searching' | 'done' | 'error'>('idle');

  useEffect(() => {
    if (trimmed.length < 2) {
      setSemantic([]);
      setStatus('idle');
      return;
    }

    const controller = new AbortController();
    // Drop the previous query's semantic hits straight away. Holding them until
    // the new ones land would leave the last search's answers sitting under the
    // new one's literal matches, which reads as the search having got it wrong.
    setSemantic([]);
    setStatus('searching');

    const timer = setTimeout(() => {
      fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ query: trimmed }),
      })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
        .then((body: { matches?: Array<{ key: string; why?: string }> }) => {
          if (controller.signal.aborted) return;
          const hits = (body.matches ?? [])
            .map((m) => toHit(data, placements, m.key, m.why ?? '', false, era))
            .filter((hit): hit is SearchHit => hit !== null);
          setSemantic(hits);
          setStatus('done');
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          // The literal hits are local and still stand, so a failed semantic
          // pass narrows the search rather than breaking it.
          setSemantic([]);
          setStatus('error');
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [data, placements, trimmed, era]);

  const hits = useMemo(() => {
    const seen = new Set(literal.map((h) => h.key));
    const merged = [...literal, ...semantic.filter((h) => !seen.has(h.key))].slice(0, MAX_HITS);

    // 26 names in the dictionary belong to more than one creature — Thunderbird
    // to four, Chupacabra to five. Whether that needs saying depends on what
    // else came back, so it is decided here against the final list rather than
    // baked into the entry.
    const shared = new Set<string>();
    const once = new Set<string>();
    for (const hit of merged) {
      const name = hit.label.toLowerCase();
      if (once.has(name)) shared.add(name);
      once.add(name);
    }
    if (shared.size === 0) return merged;

    return merged.map((hit) =>
      shared.has(hit.label.toLowerCase()) ? { ...hit, qualifier: hit.regionName } : hit,
    );
  }, [literal, semantic]);

  if (trimmed.length < 2) return { status: 'idle' };
  if (status === 'searching') return { status: 'searching', hits };
  if (status === 'error') return { status: 'error', hits };
  return { status: 'done', hits };
}

interface Placement {
  regionCode: string;
  era: EraId;
  /** Position in that region's roll — 0 means it leads the region. */
  rank: number;
}

/** Every place each creature appears, in the data file's own order. */
function buildPlacements(data: Dataset): Map<string, Placement[]> {
  const map = new Map<string, Placement[]>();
  for (const [regionCode, region] of Object.entries(data.regions)) {
    for (const era of Object.keys(region.eras) as EraId[]) {
      region.eras[era].items.forEach((key, rank) => {
        const list = map.get(key);
        const placement: Placement = { regionCode, era, rank };
        if (list) list.push(placement);
        else map.set(key, [placement]);
      });
    }
  }
  return map;
}

/**
 * Turn a matched key into somewhere the reader can actually be sent.
 *
 * A creature can sit in dozens of slices — Mo'o is the whole of sixteen Pacific
 * islands — so the destination is chosen rather than guessed at: stay in the era
 * the reader is already in if the creature is there, and prefer the region that
 * lists it first, which is the one it most belongs to.
 */
function toHit(
  data: Dataset,
  placements: Map<string, Placement[]>,
  key: string,
  why: string,
  literal: boolean,
  currentEra: EraId,
): SearchHit | null {
  const entry = data.items[key];
  const places = placements.get(key);
  if (!entry || !places || places.length === 0) return null;

  const inCurrentEra = places.filter((p) => p.era === currentEra);
  const pool = inCurrentEra.length > 0 ? inCurrentEra : places;
  const best = pool.reduce((a, b) => (b.rank < a.rank ? b : a));

  return {
    key,
    label: entry.title,
    type: entry.kind,
    seed: entry.seed,
    why,
    literal,
    regionCode: best.regionCode,
    regionName: data.regions[best.regionCode].name,
    era: best.era,
    places: places.length,
    // Filled in only once the whole result list is known.
    qualifier: null,
  };
}

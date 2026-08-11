import { useEffect, useState } from 'react';
import type { RegionView } from '../data/types';

export interface ImageCredit {
  forTitle: string;
  src: string;
  width: number;
  height: number;
  author: string;
  license: string;
  licenseUrl: string | null;
  descriptionUrl: string;
}

export interface WikiSummary {
  title: string;
  extract: string;
  url: string;
}

export interface Enrichment {
  images: ImageCredit[];
  summary: WikiSummary | null;
  /** Creature the summary belongs to — not always the region's first. */
  summaryLabel: string | null;
  loading: boolean;
}

const EMPTY: Enrichment = { images: [], summary: null, summaryLabel: null, loading: false };

/**
 * Images and the wiki card. Both are enrichment around the prose, so a failure
 * in either resolves to "nothing to show" rather than an error state — the
 * panel is still worth reading without them.
 */
export function useEnrichment(
  view: RegionView | null,
  focusKey: string | null = null,
): Enrichment {
  const [state, setState] = useState<Enrichment>(EMPTY);

  const code = view?.code ?? null;
  const era = view?.era.id ?? null;

  useEffect(() => {
    if (!code || !era) {
      setState(EMPTY);
      return;
    }

    const controller = new AbortController();
    setState({ ...EMPTY, loading: true });

    const post = (path: string) =>
      fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        // With a creature focused, both endpoints narrow to it: its own
        // pictures, its own article, or nothing.
        body: JSON.stringify({
          regionCode: code,
          era,
          ...(focusKey ? { entryKey: focusKey } : {}),
        }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null);

    Promise.all([post('/api/images'), post('/api/wiki')]).then(([imagesBody, wikiBody]) => {
      if (controller.signal.aborted) return;
      setState({
        images: (imagesBody?.images as ImageCredit[] | undefined) ?? [],
        summary: (wikiBody?.summary as WikiSummary | null | undefined) ?? null,
        summaryLabel: (wikiBody?.label as string | undefined) ?? null,
        loading: false,
      });
    });

    return () => controller.abort();
  }, [code, era, focusKey]);

  return state;
}

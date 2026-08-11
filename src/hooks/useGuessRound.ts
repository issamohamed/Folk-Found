import { useCallback, useEffect, useRef, useState } from 'react';

export interface RoundImage {
  src: string;
  width: number;
  height: number;
  author: string;
  license: string;
  licenseUrl: string | null;
  descriptionUrl: string;
}

export interface Verdict {
  correct: boolean;
  distanceKm: number;
  guessed: { code: string; name: string };
  answer: {
    entryKey: string;
    label: string;
    kind: string;
    seed: string;
    sensitive: boolean;
  };
  homes: Array<{ code: string; name: string }>;
}

export interface Tally {
  played: number;
  correct: number;
  /** Current run of right answers, reset by a wrong one. */
  streak: number;
  best: number;
}

export type RoundState =
  | { status: 'dealing' }
  | { status: 'guessing'; image: RoundImage }
  | { status: 'scoring'; image: RoundImage }
  | { status: 'revealed'; image: RoundImage; verdict: Verdict }
  | { status: 'error'; message: string };

/** Sampling can come back empty when none of the candidates has a lead image.
 *  Rare, and worth one quiet retry before bothering the player about it. */
const DEAL_ATTEMPTS = 3;

/**
 * One round of the guessing game.
 *
 * The answer lives on the Worker until a guess is submitted, so nothing here
 * ever holds the region it is asking about — the state machine only knows a
 * picture, an opaque round id, and eventually a verdict.
 */
export function useGuessRound() {
  const [state, setState] = useState<RoundState>({ status: 'dealing' });
  const [tally, setTally] = useState<Tally>({ played: 0, correct: 0, streak: 0, best: 0 });
  const roundIdRef = useRef<string | null>(null);
  // Guards against a verdict from an abandoned round landing on a new one.
  const generationRef = useRef(0);

  const deal = useCallback(() => {
    const generation = ++generationRef.current;
    roundIdRef.current = null;
    setState({ status: 'dealing' });

    const attempt = async (left: number): Promise<void> => {
      const res = await fetch('/api/guess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = (await res.json().catch(() => null)) as
        | { roundId?: string; image?: RoundImage; retry?: boolean }
        | null;

      if (generation !== generationRef.current) return;

      if (res.ok && body?.roundId && body.image) {
        roundIdRef.current = body.roundId;
        setState({ status: 'guessing', image: body.image });
        return;
      }
      if (body?.retry && left > 0) return attempt(left - 1);
      throw new Error(`Deal failed (${res.status})`);
    };

    attempt(DEAL_ATTEMPTS).catch(() => {
      if (generation !== generationRef.current) return;
      setState({
        status: 'error',
        message: 'Could not fetch a picture. The archive may be busy.',
      });
    });
  }, []);

  useEffect(deal, [deal]);

  const submit = useCallback(
    (regionCode: string) => {
      const roundId = roundIdRef.current;
      if (!roundId) return;

      const generation = generationRef.current;
      setState((prev) =>
        prev.status === 'guessing' ? { status: 'scoring', image: prev.image } : prev,
      );

      fetch('/api/guess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roundId, regionCode }),
      })
        .then(async (res) => {
          const verdict = (await res.json()) as Verdict;
          if (!res.ok) throw new Error('Scoring failed');
          if (generation !== generationRef.current) return;

          setState((prev) =>
            prev.status === 'scoring'
              ? { status: 'revealed', image: prev.image, verdict }
              : prev,
          );
          setTally((t) => {
            const streak = verdict.correct ? t.streak + 1 : 0;
            return {
              played: t.played + 1,
              correct: t.correct + (verdict.correct ? 1 : 0),
              streak,
              best: Math.max(t.best, streak),
            };
          });
        })
        .catch(() => {
          if (generation !== generationRef.current) return;
          setState((prev) =>
            prev.status === 'scoring'
              ? { status: 'error', message: 'Could not score that guess.' }
              : prev,
          );
        });
    },
    [],
  );

  return { state, tally, submit, next: deal };
}

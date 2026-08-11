import { useEffect, useSyncExternalStore } from 'react';
import {
  isMuted,
  playAmbience,
  setMuted,
  stopAmbience,
  subscribeToMute,
} from '../lib/ambience';
import type { RegionView } from '../data/types';

/**
 * Ties the ambience to the panel.
 *
 * The subject is the open region view — the same object the panel renders — so
 * the sound starts as the panel opens, reads the era and density the panel is
 * showing, and stops when it goes. Passing null is how everything else silences
 * it, which keeps the rule in one place rather than at every exit.
 */
export function useAmbience(view: RegionView | null): void {
  const muted = useAmbienceMuted();

  const code = view?.code ?? null;
  const era = view?.era.id ?? null;
  const density = view?.density ?? null;
  const lat = view?.centroid[0] ?? 0;
  const lng = view?.centroid[1] ?? 0;

  useEffect(() => {
    if (muted || !code || !era || density === null) {
      stopAmbience();
      return;
    }
    playAmbience({ code, era, density, centroid: [lat, lng] });
    // No cleanup on purpose: moving from one region to the next re-runs this
    // effect, and stopping first would cut the outgoing phrase before the new
    // one could cross-fade with it. A closed panel reaches the branch above.
  }, [muted, code, era, density, lat, lng]);

  // Unmounting with the app should not leave a phrase ringing.
  useEffect(() => stopAmbience, []);
}

/** The mute flag, read from the engine so it survives a remount and dies with
 *  the tab. Nothing about it is written to disk. */
export function useAmbienceMuted(): boolean {
  return useSyncExternalStore(subscribeToMute, isMuted, isMuted);
}

/** Callback that flips the mute flag. */
export function useAmbienceMuteToggle(): () => void {
  const muted = useAmbienceMuted();
  return () => setMuted(!muted);
}

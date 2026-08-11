import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import RegionPopup from './components/RegionPopup';
import EraRail from './components/EraRail';
import DensityLegend from './components/DensityLegend';
import SearchBar from './components/SearchBar';
import Intro, { type Activity, type IntroPhase } from './components/Intro';
import Guesser from './components/Guesser';
import AmbienceToggle from './components/AmbienceToggle';
import { useGuessRound } from './hooks/useGuessRound';
import { useAmbience } from './hooks/useAmbience';
import { buildRegionView, loadDataset } from './data/folklore';
import { useWebGLSupport } from './hooks/useWebGLSupport';
import type { SearchHit } from './hooks/useSearch';
import type { Dataset, EraId } from './data/types';

// Each view is split out so only the one in use is downloaded: the globe pulls
// in three.js, the flat map pulls in react-simple-maps and its two atlases.
// A visitor whose browser cannot run WebGL never fetches the 3D bundle at all.
const Globe = lazy(() => import('./components/Globe'));
const WorldMap = lazy(() => import('./components/WorldMap'));

type ViewMode = 'globe' | 'map';

export default function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [dataError, setDataError] = useState<Error | null>(null);

  /**
   * The door. Null once it has been opened and taken off the page — the globe
   * mounts underneath it from the first frame, so the intro is a layer rather
   * than a stage the app has to leave.
   */
  const [intro, setIntro] = useState<IntroPhase | null>('landing');
  /** Which way in the reader took. The globe is the same either way; what a
   *  click on it means is not. */
  const [activity, setActivity] = useState<Activity>('explore');
  const [era, setEra] = useState<EraId>('ancient');
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  /** Creature the open panel is narrowed to, if any. */
  const [focusKey, setFocusKey] = useState<string | null>(null);

  // The globe is the primary view; the flat map stands in wherever WebGL is
  // unavailable, and stays available as a deliberate choice everywhere else.
  const webglSupported = useWebGLSupport();
  const [preferredView, setPreferredView] = useState<ViewMode>('globe');
  const viewMode: ViewMode = webglSupported ? preferredView : 'map';

  useEffect(() => {
    let cancelled = false;
    loadDataset()
      .then((loaded) => {
        if (!cancelled) setDataset(loaded);
      })
      .catch((err: unknown) => {
        if (!cancelled) setDataError(err instanceof Error ? err : new Error(String(err)));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const round = useGuessRound();

  const view = useMemo(
    () => (dataset && selectedCode ? buildRegionView(dataset, selectedCode, era) : null),
    [dataset, selectedCode, era],
  );

  // A focused creature only holds while the open region and era actually list
  // it. Sliding the era rail off it drops the focus back to the whole region
  // rather than leaving the panel pointing at nothing.
  const activeFocus =
    focusKey && view?.items.some((item) => item.key === focusKey) ? focusKey : null;

  // Ambience follows the panel: the same view it renders, so the sound starts
  // as the panel opens and fades when it closes. The game is silent on purpose
  // — a region's sonic zone would hint at the answer.
  useAmbience(activity === 'explore' ? view : null);

  if (dataError) {
    return (
      <main className="state state--error">
        <p>Could not load the folklore data: {dataError.message}</p>
      </main>
    );
  }

  if (!dataset) {
    return (
      <main className="state">
        <p>Loading the world…</p>
      </main>
    );
  }

  const revealed = intro === null || intro === 'opening';

  const begin = (chosen: Activity) => {
    setActivity(chosen);
    setSelectedCode(null);
    setFocusKey(null);
    setIntro('opening');
    // Matches the enter animation; the overlay leaves once the wash has
    // finished blooming rather than snapping out from under it.
    window.setTimeout(() => setIntro(null), 1100);
  };

  /**
   * Back to the door. The panel closes, since it belongs to the map rather than
   * to the way in, but the era and camera are left exactly as they were —
   * coming home should not cost you the place you had got to.
   */
  const goHome = () => {
    setSelectedCode(null);
    setFocusKey(null);
    setIntro('landing');
  };

  /** Carry the reader from a search result to the creature itself. */
  const goToHit = (hit: SearchHit) => {
    setEra(hit.era);
    setSelectedCode(hit.regionCode);
    setFocusKey(hit.key);
  };

  const selectRegion = (code: string) => {
    setSelectedCode(code);
    // Landing on a new region should show the whole of it. In the game the
    // selection is just an aim — nothing opens until the guess is locked in.
    setFocusKey(null);
  };

  /** Hand the globe back to exploring, from inside the game. */
  const quitGame = () => {
    setActivity('explore');
    setSelectedCode(null);
    setFocusKey(null);
  };

  const closePanel = () => {
    setSelectedCode(null);
    setFocusKey(null);
  };

  return (
    <main className={revealed ? 'app app--revealed' : 'app'}>
      <header className="app__header">
        {/* The mark is the way back to the door. It replaces the wordmark up
            here because the title is already said at full size on the way in,
            and repeating it shrunk down only makes the header noisier. */}
        <h1 className="app__brand">
          <button type="button" className="app__home" onClick={goHome}>
            <img className="app__logo" src="/logo.png" alt="" width={30} height={30} />
            <span className="sr-only">Folk &amp; Found — back to the start</span>
          </button>
        </h1>

        <p className="app__tagline">An atlas of the believed world.</p>

        <div className="app__controls">
          {webglSupported ? (
            <div className="view-switch" role="group" aria-label="View">
              {(['globe', 'map'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={
                    option === viewMode ? 'view-switch__btn is-active' : 'view-switch__btn'
                  }
                  aria-pressed={option === viewMode}
                  onClick={() => setPreferredView(option)}
                >
                  {option === 'globe' ? 'Globe' : 'Flat map'}
                </button>
              ))}
            </div>
          ) : null}

          <AmbienceToggle />
        </div>
      </header>

      <div className="app__map">
        <Suspense fallback={<p className="state">Spinning up the world…</p>}>
          {viewMode === 'globe' ? (
            <Globe
              data={dataset}
              era={era}
              selectedCode={selectedCode}
              onSelect={selectRegion}
            />
          ) : (
            <WorldMap
              data={dataset}
              era={era}
              selectedCode={selectedCode}
              onSelect={selectRegion}
            />
          )}
        </Suspense>
      </div>

      {activity === 'explore' ? (
        <>
          <EraRail eras={dataset.eras} active={era} onChange={setEra} />
          <DensityLegend />
          <SearchBar data={dataset} era={era} onPick={goToHit} />
        </>
      ) : null}

      {intro ? (
        <Intro
          phase={intro}
          onAbout={() => setIntro('about')}
          onBack={() => setIntro('landing')}
          onBegin={begin}
        />
      ) : null}

      {activity === 'guess' ? (
        <Guesser
          state={round.state}
          tally={round.tally}
          pendingCode={selectedCode}
          pendingName={selectedCode ? (dataset.regions[selectedCode]?.name ?? null) : null}
          onSubmit={() => selectedCode && round.submit(selectedCode)}
          onNext={() => {
            setSelectedCode(null);
            round.next();
          }}
          onQuit={quitGame}
        />
      ) : view ? (
        <RegionPopup
          view={view}
          focusKey={activeFocus}
          onFocusChange={setFocusKey}
          onClose={closePanel}
        />
      ) : null}
    </main>
  );
}

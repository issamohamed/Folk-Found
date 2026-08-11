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

// Split so only the view in use is downloaded: three.js for the globe,
// react-simple-maps and its atlases for the flat map.
const Globe = lazy(() => import('./components/Globe'));
const WorldMap = lazy(() => import('./components/WorldMap'));

type ViewMode = 'globe' | 'map';

export default function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [dataError, setDataError] = useState<Error | null>(null);

  // Null once the intro has been taken off the page. The globe mounts
  // underneath it from the first frame, so the intro is a layer, not a stage.
  const [intro, setIntro] = useState<IntroPhase | null>('landing');
  // Explore or guess: the globe is the same either way, what a click means is not.
  const [activity, setActivity] = useState<Activity>('explore');
  const [era, setEra] = useState<EraId>('ancient');
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  /** Creature the open panel is narrowed to, if any. */
  const [focusKey, setFocusKey] = useState<string | null>(null);

  // The flat map is forced wherever WebGL is unavailable.
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

  // A focus only holds while the open region and era still list it; otherwise
  // it drops back to the whole region rather than pointing at nothing.
  const activeFocus =
    focusKey && view?.items.some((item) => item.key === focusKey) ? focusKey : null;

  // Ambience follows the panel. The game is silent on purpose: a region's
  // sonic zone would hint at the answer.
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
    // Matches the enter animation, so the overlay is not pulled out from under it.
    window.setTimeout(() => setIntro(null), 1100);
  };

  // Back to the intro. The panel closes but the era and camera are left as
  // they were.
  const goHome = () => {
    setSelectedCode(null);
    setFocusKey(null);
    setIntro('landing');
  };

  /** Jump from a search result to the creature itself. */
  const goToHit = (hit: SearchHit) => {
    setEra(hit.era);
    setSelectedCode(hit.regionCode);
    setFocusKey(hit.key);
  };

  const selectRegion = (code: string) => {
    setSelectedCode(code);
    // A new region opens whole. In the game nothing opens until the guess is in.
    setFocusKey(null);
  };

  /** Leave the game for the atlas. */
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
        {/* The mark, not the wordmark: the title is already said at full size
            on the intro. */}
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

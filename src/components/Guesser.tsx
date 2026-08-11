import type { RoundState, Tally } from '../hooks/useGuessRound';

interface GuesserProps {
  state: RoundState;
  tally: Tally;
  /** Region the player has picked on the globe, not yet submitted. */
  pendingCode: string | null;
  pendingName: string | null;
  onSubmit: () => void;
  onNext: () => void;
  onQuit: () => void;
}

/**
 * The guessing panel: a picture and nothing else. No title, since the title is
 * the creature's name. Author and licence stay on screen throughout — that is a
 * condition of using the picture, not the game's to trade away.
 */
export default function Guesser({
  state,
  tally,
  pendingCode,
  pendingName,
  onSubmit,
  onNext,
  onQuit,
}: GuesserProps) {
  const image = state.status === 'error' || state.status === 'dealing' ? null : state.image;
  const verdict = state.status === 'revealed' ? state.verdict : null;

  return (
    <aside className="guess" role="region" aria-label="Guess the origin">
      {/* The frame carries the glass and never scrolls; this body does.
          backdrop-filter on a scrolling element makes the browser composite it
          as one layer and drop later repaints, which hid the whole reveal. */}
      <div className="guess__body">
        <header className="guess__head">
          <p className="guess__eyebrow">Where is it from?</p>
          <button type="button" className="guess__quit" onClick={onQuit}>
            Explore instead
          </button>
        </header>

        <div className="guess__plate">
          {image ? (
            <img
              className="guess__img"
              src={image.src}
              // Naming it would give the answer away.
              alt="A folklore figure from somewhere in the world"
              key={image.src}
            />
          ) : state.status === 'error' ? (
            <p className="guess__failed">{state.message}</p>
          ) : (
            <span className="guess__loading" aria-label="Dealing a picture" />
          )}
        </div>

        {image ? (
          /* No title here — that is the answer. */
          <p className="guess__credit">
            {image.author} ·{' '}
            {image.licenseUrl ? (
              <a href={image.licenseUrl} target="_blank" rel="noreferrer noopener">
                {image.license}
              </a>
            ) : (
              image.license
            )}{' '}
            ·{' '}
            <a href={image.descriptionUrl} target="_blank" rel="noreferrer noopener">
              source
            </a>
          </p>
        ) : null}

        {verdict ? (
          <div className={verdict.correct ? 'verdict is-right' : 'verdict'}>
            <p className="verdict__call">
              {verdict.correct ? 'Right' : 'Not quite'}
              <span className="verdict__where">
                {verdict.correct
                  ? ` — ${verdict.guessed.name}`
                  : ` — you said ${verdict.guessed.name}`}
              </span>
            </p>

            <h3 className="verdict__name">{verdict.answer.label}</h3>
            <p className="verdict__kind">{verdict.answer.kind}</p>
            <p className="verdict__seed">{verdict.answer.seed}</p>

            <p className="verdict__homes">
              {verdict.homes.length === 1
                ? `Recorded in ${verdict.homes[0].name}.`
                : `Recorded in ${verdict.homes.length} places, including ${verdict.homes
                    .slice(0, 3)
                    .map((h) => h.name)
                    .join(', ')}.`}
              {!verdict.correct && verdict.distanceKm > 0 ? (
                <span className="verdict__distance">
                  {' '}
                  You were {verdict.distanceKm.toLocaleString()} km off.
                </span>
              ) : null}
            </p>

            <button type="button" className="guess__action" onClick={onNext}>
              Next picture
            </button>
          </div>
        ) : (
          <>
            <p className="guess__prompt">
              {state.status === 'error'
                ? 'Try dealing another.'
                : pendingName
                  ? `You have picked ${pendingName}.`
                  : 'Turn the globe and click the country you think it belongs to.'}
            </p>

            {state.status === 'error' ? (
              <button type="button" className="guess__action" onClick={onNext}>
                Deal another
              </button>
            ) : (
              <button
                type="button"
                className="guess__action"
                disabled={!pendingCode || state.status !== 'guessing'}
                onClick={onSubmit}
              >
                {state.status === 'scoring' ? 'Checking…' : 'Lock it in'}
              </button>
            )}
          </>
        )}

        <p className="guess__tally">
          {tally.played === 0
            ? 'No guesses yet'
            : `${tally.correct} of ${tally.played} · streak ${tally.streak}${
                tally.best > 1 ? ` · best ${tally.best}` : ''
              }`}
        </p>
      </div>
    </aside>
  );
}

import { useEffect } from 'react';

export type IntroPhase = 'landing' | 'about' | 'opening';

export type Activity = 'explore' | 'guess';

interface IntroProps {
  phase: IntroPhase;
  onAbout: () => void;
  onBack: () => void;
  onBegin: (activity: Activity) => void;
}

/**
 * The way in.
 *
 * Not a separate screen — a pane of glass laid over the globe, which is already
 * turning behind it. The blur is deliberately light: the world should be
 * legible through the door, so that opening it feels like stepping closer to
 * something that was there all along rather than loading a second page.
 */
export default function Intro({ phase, onAbout, onBack, onBegin }: IntroProps) {
  const opening = phase === 'opening';

  // Escape backs out of whatever is on top. On the note that means the note;
  // on the door there is nothing behind it, so it stays put.
  useEffect(() => {
    if (phase !== 'about') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, onBack]);

  return (
    <div
      className={`intro${opening ? ' is-opening' : ''}${phase === 'about' ? ' is-reading' : ''}`}
      // Once the door is opening, the globe underneath should already be taking
      // the pointer.
      aria-hidden={opening}
    >
      <div className="intro__scrim" />

      {phase === 'about' ? null : (
        <button type="button" className="intro__corner" onClick={onAbout}>
          About
        </button>
      )}

      {phase === 'about' ? (
        <article className="note" role="dialog" aria-label="Author’s note">
          <button
            type="button"
            className="intro__corner note__back"
            onClick={onBack}
            aria-label="Back to the start"
          >
            Back
          </button>

          <h2 className="note__title">Author’s Note</h2>

          <div className="note__body">
            <p>
              It started in a library, at the age when the reference section still felt
              like somewhere you were not quite allowed. The folklore shelves were the
              good ones: enormous hardcovers, sorted by country, with that particular
              dust that gets into the spine of a book nobody has opened in a decade. I
              would take down whichever one had the strangest name on it and read about
              things I had no context for at all — river horses in Scotland, a bird whose
              wingbeats made thunder, a lizard that guarded fishponds. I did not
              understand most of it. I loved all of it.
            </p>
            <p>
              What I did not realise then was how much those books left out. They were
              organised the way an encyclopedia is organised: one country, one page, the
              three most famous names, move on. It was only later, older, falling down
              one lucky internet rabbit hole after another, that I found the rest — the
              smaller and stranger and much more local things. A creature known in one
              valley. A story told in one language by a few thousand people. Beliefs that
              had never made it into the big sorted hardcovers because there was no room,
              or no translator, or no one had thought to ask.
            </p>
            <p>
              Finding any of that took hours, and a lot of luck, and knowing what to
              search for in the first place. That is the hassle I wanted to remove. This
              is a map of both — the famous and the barely recorded — so that you can put
              a finger anywhere on Earth and find out what the people there said was out
              in the dark. There are thousands of them. Most of us would go a whole life
              and never meet a single one.
            </p>
          </div>
        </article>
      ) : (
        <div className="intro__inner">
          <img className="intro__mark" src="/logo.png" alt="" width={84} height={84} />
          <h1 className="intro__title">Folk &amp; Found</h1>
          <p className="intro__tagline">An atlas of the believed world.</p>

          {/*
            Two ways in, both the same capsule with a light running the whole way
            round its edge. On opening, the light gives way to a wash that expands
            past the screen and takes the glass with it.
          */}
          <div className="ways">
            <button
              type="button"
              className="enter"
              onClick={() => onBegin('explore')}
              aria-label="Explore the atlas"
            >
              <span className="enter__edge" aria-hidden="true" />
              <span className="enter__wash" aria-hidden="true" />
              <span className="enter__text">
                <span className="enter__label">Explore</span>
                <svg className="enter__arrow" viewBox="0 0 26 8" aria-hidden="true">
                  <path className="enter__shaft" d="M0 4h18" />
                  <path className="enter__head" d="M15 1l3.4 3-3.4 3" />
                </svg>
              </span>
            </button>

            <button
              type="button"
              className="enter enter--guess"
              onClick={() => onBegin('guess')}
              aria-label="Play the guessing game"
            >
              <span className="enter__edge" aria-hidden="true" />
              <span className="enter__wash" aria-hidden="true" />
              <span className="enter__text">
                <span className="enter__label">Guesser</span>
                <svg className="enter__arrow" viewBox="0 0 26 8" aria-hidden="true">
                  <path className="enter__shaft" d="M0 4h18" />
                  <path className="enter__head" d="M15 1l3.4 3-3.4 3" />
                </svg>
              </span>
            </button>
          </div>

          <p className="ways__hint">
            Explore the atlas, or be shown a picture and name where it comes from.
          </p>
        </div>
      )}
    </div>
  );
}

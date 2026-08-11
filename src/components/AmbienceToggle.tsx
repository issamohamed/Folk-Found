import { useAmbienceMuteToggle, useAmbienceMuted } from '../hooks/useAmbience';

/**
 * The mute switch for regional ambience: a small speaker in the header beside
 * the view switch. No volume slider — the sound is quiet by design, so the only
 * question is whether it is on.
 */
export default function AmbienceToggle() {
  const muted = useAmbienceMuted();
  const toggle = useAmbienceMuteToggle();

  return (
    <button
      type="button"
      className={muted ? 'ambience is-muted' : 'ambience'}
      aria-pressed={muted}
      onClick={toggle}
      title={muted ? 'Region ambience off' : 'Region ambience on'}
    >
      <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true">
        <path
          d="M3 7.5h3L10 4v12L6 12.5H3z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        {muted ? (
          <path
            d="M13 7.5l4 5M17 7.5l-4 5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            fill="none"
          />
        ) : (
          /* Two arcs rather than three: at 15 pixels the third is a smudge. */
          <>
            <path
              d="M13 7a4 4 0 010 6"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M15.4 5a7 7 0 010 10"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              fill="none"
              opacity="0.55"
            />
          </>
        )}
      </svg>
      <span className="sr-only">
        {muted ? 'Turn region ambience on' : 'Turn region ambience off'}
      </span>
    </button>
  );
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

/**
 * Public landing page for the Developer Console - what SaanPaw is and how it works, shown before
 * sign-in. The console itself stays behind the login; the hero's one button is the way in.
 */

/**
 * Photos behind the hero, shipped with the console itself: web/public/landing/01.jpg to 12.jpg.
 * Kept in the project rather than loaded from a photo website, so the slideshow never depends on
 * someone else's server being up. A missing or broken file is skipped; with none, the hero is green.
 * BASE_URL keeps the paths right when the console is served from a subfolder (GitHub Pages).
 */
const SLIDES = Array.from(
  { length: 12 },
  (_, i) => `${import.meta.env.BASE_URL}landing/${String(i + 1).padStart(2, '0')}.jpg`,
);

const MODULES = [
  {
    icon: '🐾',
    title: 'Pet owners & community',
    where: 'SaanPaw mobile app',
    points: [
      'Report a lost pet or a found animal, with the location tagged automatically',
      'Image matching suggests found animals and shelter animals that look like yours',
      'Smart alerts for reports inside the radius you choose',
    ],
  },
  {
    icon: '⌂',
    title: 'Animal shelters',
    where: 'SaanPaw mobile app',
    points: [
      'Apply with proof of credentials; access is granted after verification',
      'See reports inside your operating radius on a map, with distance from your shelter',
      'Open recovery cases and post recovered animals',
    ],
  },
  {
    icon: '⚙',
    title: 'System developer',
    where: 'This web console',
    points: [
      'Approve shelters after checking their documents with the LGU',
      'Review AI-flagged reports and remove false ones',
      'System configuration, database monitoring and maintenance',
    ],
  },
];

/** The journey of one report, start to finish. */
const STEPS = [
  {
    n: '1',
    title: 'Report',
    body: 'A pet owner reports a missing pet, or a resident reports a stray they found. The phone tags where it happened and the reporter adds photos and details.',
  },
  {
    n: '2',
    title: 'Match',
    body: 'Image recognition compares the photos against found reports and animals already in shelter care, and suggests the most likely matches with the reasons behind each score.',
  },
  {
    n: '3',
    title: 'Alert',
    body: 'Smart alerts reach residents inside their chosen radius and every verified shelter whose operating area covers the spot.',
  },
  {
    n: '4',
    title: 'Recover',
    body: 'A shelter takes the case, tracks the location on the map, and updates its status until the animal is reunited, adopted or the case is closed.',
  },
];

const FEATURES = [
  { title: 'Image recognition', body: 'Photo-to-photo comparison finds the animal even when the description is vague.' },
  { title: 'Smart alerts', body: 'Notifications go only to the people and shelters close enough to help.' },
  { title: 'Geolocation', body: 'Every report is pinned to a street address inside San Jose Del Monte.' },
  { title: 'Shelter integration', body: 'Verified local shelters receive, respond to and track reports in one place.' },
  { title: 'AI moderation', body: 'False, duplicate and inappropriate reports are flagged for review before they mislead anyone.' },
  { title: 'Photo-based identity', body: 'No collars, tags or microchips needed - a clear photo is enough to start a match.' },
];

/** How long each photo stays up before crossfading to the next. */
const SLIDE_MS = 5000;

/** Full-bleed crossfading slideshow behind the hero text, with dots to jump to a photo. */
function HeroSlideshow() {
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState<ReadonlySet<number>>(new Set());
  const [paused, setPaused] = useState(false);

  // Advance to the next photo that loaded; restarting the timer whenever `active` changes means a
  // dot click gets a full SLIDE_MS before the slideshow moves on.
  useEffect(() => {
    if (paused || failed.size >= SLIDES.length - 1) return;
    const timer = window.setTimeout(() => {
      setActive((current) => {
        for (let step = 1; step <= SLIDES.length; step++) {
          const next = (current + step) % SLIDES.length;
          if (!failed.has(next)) return next;
        }
        return current;
      });
    }, SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [active, failed, paused]);

  const markFailed = (index: number) => {
    setFailed((prev) => new Set(prev).add(index));
    if (index === active) setActive((index + 1) % SLIDES.length);
  };

  return (
    <>
      <div className="slideshow" aria-hidden>
        {SLIDES.map((src, i) =>
          failed.has(i) ? null : (
            <img
              key={src}
              src={src}
              alt=""
              className={i === active ? 'slide active' : 'slide'}
              // The first two load straight away; the rest wait until the browser is idle.
              loading={i < 2 ? 'eager' : 'lazy'}
              onError={() => markFailed(i)}
            />
          ),
        )}
      </div>
      {failed.size < SLIDES.length - 1 ? (
        <div className="slide-controls">
          <button
            type="button"
            className="slide-pause"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? 'Play slideshow' : 'Pause slideshow'}
          >
            {paused ? '▶' : '❚❚'}
          </button>
          {SLIDES.map((src, i) =>
            failed.has(i) ? null : (
              <button
                key={src}
                type="button"
                className={i === active ? 'slide-dot active' : 'slide-dot'}
                onClick={() => setActive(i)}
                aria-label={`Show photo ${i + 1}`}
                aria-current={i === active}
              />
            ),
          )}
        </div>
      ) : null}
    </>
  );
}

export function LandingPage() {
  return (
    <div className="landing">
      <nav className="landing-nav">
        <div className="brand">
          <span aria-hidden>🐾</span>
          <div>
            SaanPaw
            <small>Developer Console</small>
          </div>
        </div>
      </nav>

      <header className="landing-hero">
        <HeroSlideshow />
        <div className="landing-hero-content">
          <div className="eyebrow">San Jose Del Monte, Bulacan</div>
          <h1>Bringing lost pets home and getting strays to safety.</h1>
          <p>
            SaanPaw connects pet owners, residents and local animal shelters through image recognition,
            smart alerts and a shared map of every lost and found report in the city. This console is
            where the system is administered.
          </p>
          <div className="row row-wrap">
            <Link className="btn btn-on-dark" to="/login">
              Sign in to the console
            </Link>
          </div>
        </div>
      </header>

      <section className="landing-section">
        <h2>Three modules, one system</h2>
        <p className="lead">
          Pet owners and shelters use the mobile app. Administration happens here, on a wide screen,
          and is never reachable from a phone.
        </p>
        <div className="landing-grid">
          {MODULES.map((m) => (
            <article key={m.title} className="landing-card">
              <div className="icon" aria-hidden>
                {m.icon}
              </div>
              <h3>{m.title}</h3>
              <p style={{ fontWeight: 600, color: 'var(--primary)' }}>{m.where}</p>
              <ul>
                {m.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section landing-about">
        <h2>About SaanPaw</h2>
        <p className="lead">
          Every year, pets go missing and strays wander the streets of San Jose Del Monte while the people
          who could help - owners, neighbours, shelters - never hear about each other. SaanPaw is a
          mobile-based animal identification system that brings them together: one place to report an
          animal, find a likely match by photo, alert the people nearby, and follow the recovery until the
          animal is safe.
        </p>

        <h3 className="landing-subhead">How a report travels</h3>
        <ol className="landing-steps">
          {STEPS.map((s) => (
            <li key={s.n} className="landing-step">
              <span className="step-num" aria-hidden>
                {s.n}
              </span>
              <div>
                <h4>{s.title}</h4>
                <p>{s.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <h3 className="landing-subhead">What powers it</h3>
        <div className="landing-features">
          {FEATURES.map((f) => (
            <div key={f.title} className="landing-feature">
              <h4>{f.title}</h4>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="landing-footer">
        SaanPaw &middot; Capstone project, BS Information Technology, STI San Jose Del Monte
      </footer>
    </div>
  );
}

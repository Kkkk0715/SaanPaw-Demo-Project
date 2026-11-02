import { Link } from 'react-router-dom';

/**
 * Public landing page for the Developer Console - what SaanPaw is and who uses which part,
 * shown before sign-in. The console itself stays behind the login.
 */
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
        <Link className="btn btn-on-dark" to="/login">
          Sign in
        </Link>
      </nav>

      <header className="landing-hero">
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

      <section className="landing-section" style={{ paddingTop: 0 }}>
        <div className="landing-card">
          <h3>Scope of the system</h3>
          <ul>
            <li>Operates only within San Jose Del Monte, Bulacan &mdash; every report is geo-fenced to the city.</li>
            <li>Identification is photo-based &mdash; no GPS collars, RFID tags or microchips.</li>
            <li>No integration with national government animal databases.</li>
          </ul>
        </div>
      </section>

      <footer className="landing-footer">
        <span>SaanPaw &middot; Capstone project, BS Information Technology, STI San Jose Del Monte</span>
        <Link to="/login" style={{ color: 'var(--primary)', fontWeight: 600 }}>
          Developer sign in &rarr;
        </Link>
      </footer>
    </div>
  );
}

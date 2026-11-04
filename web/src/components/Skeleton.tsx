import type { CSSProperties } from 'react';

/** One shimmering placeholder block. */
export function Bone({
  w = '100%',
  h = 12,
  round,
  pill,
  dark,
  style,
}: {
  w?: number | string;
  h?: number | string;
  round?: boolean;
  pill?: boolean;
  dark?: boolean;
  style?: CSSProperties;
}) {
  const cls = ['skeleton', round && 'round', pill && 'pill', dark && 'on-dark'].filter(Boolean).join(' ');
  return <span className={cls} style={{ display: 'block', width: w, height: h, flexShrink: 0, ...style }} aria-hidden />;
}

/** A card with a title bar and a few placeholder lines or rows. */
export function SkeletonCard({ lines = 3, rows = 0, chart = false }: { lines?: number; rows?: number; chart?: boolean }) {
  return (
    <section className="card">
      <header className="card-head">
        <div className="skeleton-stack" style={{ flex: 1 }}>
          <Bone w="38%" h={14} />
          <Bone w="58%" h={10} />
        </div>
      </header>
      {chart ? (
        <div className="card-pad" style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: 200 }}>
          {[40, 65, 30, 80, 55, 90, 45].map((pct, i) => (
            <Bone key={i} h={`${pct}%`} style={{ flex: 1, borderRadius: '6px 6px 0 0' }} />
          ))}
        </div>
      ) : null}
      {lines ? (
        <div className="card-pad skeleton-stack" style={{ gap: 12 }}>
          {Array.from({ length: lines }, (_, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Bone w={110} h={10} />
              <Bone h={10} pill style={{ flex: 1 }} />
            </div>
          ))}
        </div>
      ) : null}
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-row">
          <Bone w={44} h={44} style={{ borderRadius: 10 }} />
          <div className="skeleton-stack" style={{ flex: 1 }}>
            <Bone w="45%" h={12} />
            <Bone w="30%" h={10} />
          </div>
          <Bone w={64} h={20} pill />
          <Bone w={90} h={10} />
        </div>
      ))}
    </section>
  );
}

/**
 * Shown while the console loads its data: the real layout's shape - sidebar, header, chart cards,
 * a table and the alerts list - in shimmering placeholders, so the page doesn't jump when the data
 * arrives and it is obvious something is on its way.
 */
export function ConsoleSkeleton() {
  return (
    <div className="shell" role="status" aria-live="polite" aria-label="Loading console data">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Bone w={38} h={38} dark style={{ borderRadius: 10 }} />
          <div className="skeleton-stack" style={{ flex: 1 }}>
            <Bone w="60%" h={12} dark />
            <Bone w="80%" h={9} dark />
          </div>
        </div>
        <nav className="sidebar-nav">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="nav-item">
              <Bone w={16} h={16} dark />
              <Bone w={[90, 120, 105, 115, 130][i]} h={11} dark />
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <Bone w={32} h={32} round dark />
          <div className="skeleton-stack" style={{ flex: 1 }}>
            <Bone w="70%" h={10} dark />
            <Bone w="90%" h={9} dark />
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="skeleton-stack" style={{ width: 'min(420px, 70vw)' }}>
            <Bone w="45%" h={18} />
            <Bone w="85%" h={11} />
          </div>
        </header>
        <div className="content">
          <div className="chart-grid">
            <SkeletonCard chart lines={0} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <SkeletonCard lines={4} />
              <SkeletonCard lines={4} />
            </div>
          </div>
          <div className="split">
            <SkeletonCard lines={0} rows={6} />
            <SkeletonCard lines={4} />
          </div>
          <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
            Loading console data…
          </span>
        </div>
      </div>
    </div>
  );
}

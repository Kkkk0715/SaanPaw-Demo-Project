import { useState, type ReactNode } from 'react';
import { colors } from '@saanpaw/shared';

/** Building blocks for the console. Plain DOM, no UI library. */

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`.trim()}>{children}</section>;
}

export function CardHead({
  title,
  sub,
  actions,
}: {
  title: string;
  sub?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="card-head">
      <div>
        <h2>{title}</h2>
        {sub ? <p className="sub">{sub}</p> : null}
      </div>
      {actions ? <div style={{ marginLeft: 'auto' }}>{actions}</div> : null}
    </header>
  );
}

export function Stat({
  value,
  label,
  icon,
  color = colors.primary,
  soft = colors.primarySoft,
}: {
  value: number | string;
  label: string;
  icon: string;
  color?: string;
  soft?: string;
}) {
  return (
    <div className="stat">
      <div className="icon" style={{ background: soft, color }} aria-hidden>
        {icon}
      </div>
      <div className="value">{value}</div>
      <div className="label">{label}</div>
    </div>
  );
}

export function Badge({
  label,
  color = colors.primary,
  soft = colors.primarySoft,
}: {
  label: string;
  color?: string;
  soft?: string;
}) {
  return (
    <span className="badge" style={{ background: soft, color }}>
      {label}
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  small,
  disabled,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  small?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      className={`btn btn-${variant} ${small ? 'btn-sm' : ''}`.trim()}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function Banner({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  title: string;
  children: ReactNode;
}) {
  const tones = {
    info: { bg: colors.infoSoft, fg: colors.info, icon: 'ℹ' },
    success: { bg: colors.primarySoft, fg: colors.primaryDark, icon: '✓' },
    warning: { bg: colors.accentSoft, fg: colors.accent, icon: '!' },
    danger: { bg: colors.dangerSoft, fg: colors.danger, icon: '⚑' },
  } as const;
  const t = tones[tone];
  return (
    <div className="banner" style={{ background: t.bg }}>
      <span style={{ color: t.fg, fontWeight: 700 }} aria-hidden>
        {t.icon}
      </span>
      <div>
        <div className="banner-title" style={{ color: t.fg }}>
          {title}
        </div>
        <div className="banner-body">{children}</div>
      </div>
    </div>
  );
}

/** Confidence bar. `tone="risk"` flips the colours so a high score reads as bad. */
export function Meter({ score, tone = 'match' }: { score: number; tone?: 'match' | 'risk' }) {
  const pct = Math.round(score * 100);
  const high = tone === 'risk' ? colors.danger : colors.primary;
  const color = score >= 0.8 ? high : score >= 0.55 ? colors.accent : colors.muted;
  return (
    <div>
      <div className="meter">
        <span style={{ width: `${pct}%`, background: color }} />
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color, marginTop: 4 }}>{pct}% confidence</div>
    </div>
  );
}

/** Animal photo, falling back to a paw if it will not load. */
export function Thumb({ src, alt }: { src?: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="thumb thumb-fallback" role="img" aria-label={alt}>
        🐾
      </div>
    );
  }
  return <img className="thumb" src={src} alt={alt} onError={() => setFailed(true)} loading="lazy" />;
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { label: string; value: T }[];
}) {
  return (
    <div className="tabs" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          className={`tab ${o.value === value ? 'active' : ''}`.trim()}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Overlay for a detail view or confirmation that doesn't fit inline. Click the backdrop or × to close. */
export function Modal({
  title,
  sub,
  onClose,
  children,
  actions,
}: {
  title: string;
  sub?: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <header className="modal-head">
          <div>
            <h2>{title}</h2>
            {sub ? <p className="sub">{sub}</p> : null}
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {actions ? <footer className="modal-foot">{actions}</footer> : null}
      </div>
    </div>
  );
}

export function Toggle({
  on,
  onChange,
  label,
  hint,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <div className="toggle-row">
      <div>
        <div className="toggle-label">{label}</div>
        <div className="toggle-hint">{hint}</div>
      </div>
      <button
        className="switch"
        data-on={on}
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
      />
    </div>
  );
}

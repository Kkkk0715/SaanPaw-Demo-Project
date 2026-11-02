import { useEffect, useState, type ReactNode } from 'react';
import { colors, paginate, type Page } from '@saanpaw/shared';

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

/**
 * "Are you sure?" before anything destructive or system-wide. Answering "No" (or the backdrop,
 * or Escape) changes nothing; only "Yes" runs `onConfirm`.
 */
export function ConfirmDialog({
  title = 'Are you sure?',
  message,
  confirmLabel = 'Yes',
  cancelLabel = 'No',
  tone = 'danger',
  onConfirm,
  onCancel,
}: {
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal confirm-dialog"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        <div className="modal-body" style={{ gap: 8 }}>
          <h2 id="confirm-title" style={{ fontSize: 17 }}>
            {title}
          </h2>
          <div style={{ color: 'var(--text-soft)', lineHeight: 1.55 }}>{message}</div>
        </div>
        <footer className="modal-foot">
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </footer>
      </div>
    </div>
  );
}

/**
 * Holds one pending confirmation at a time: `ask(message, action)` opens the dialog and runs
 * `action` only on "Yes". Render `dialog` anywhere in the page.
 */
export function useConfirm() {
  const [pending, setPending] = useState<{
    title?: string;
    message: ReactNode;
    confirmLabel?: string;
    tone?: 'danger' | 'primary';
    action: () => void;
  } | null>(null);

  const ask = (
    message: ReactNode,
    action: () => void,
    options: { title?: string; confirmLabel?: string; tone?: 'danger' | 'primary' } = {},
  ) => setPending({ message, action, ...options });

  const dialog = pending ? (
    <ConfirmDialog
      title={pending.title}
      message={pending.message}
      confirmLabel={pending.confirmLabel}
      tone={pending.tone}
      onCancel={() => setPending(null)}
      onConfirm={() => {
        const run = pending.action;
        setPending(null);
        run();
      }}
    />
  ) : null;

  return { ask, dialog };
}

export const PAGE_SIZE = 10;

/** Page state for a list; the page resets to 1 whenever `resetKey` (e.g. the active tab or search) changes. */
export function usePagination<T>(items: T[], pageSize = PAGE_SIZE, resetKey?: unknown): Page<T> & { setPage: (p: number) => void } {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [resetKey]);
  return { ...paginate(items, page, pageSize), setPage };
}

/** "Showing 11–20 of 43" with previous / numbered / next buttons. Hidden when everything fits on one page. */
export function Pagination({ page, pageCount, total, from, to, setPage }: Page<unknown> & { setPage: (p: number) => void }) {
  if (pageCount <= 1) return null;
  // At most 7 numbered buttons: first, last, and the pages around the current one.
  const numbers: (number | '…')[] = [];
  for (let p = 1; p <= pageCount; p++) {
    if (p === 1 || p === pageCount || Math.abs(p - page) <= 1) numbers.push(p);
    else if (numbers[numbers.length - 1] !== '…') numbers.push('…');
  }
  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="pagination-info">
        Showing {from}–{to} of {total}
      </span>
      <div className="row" style={{ gap: 4 }}>
        <button className="page-btn" disabled={page === 1} onClick={() => setPage(page - 1)} aria-label="Previous page">
          ‹
        </button>
        {numbers.map((n, i) =>
          n === '…' ? (
            <span key={`gap${i}`} className="page-gap">
              …
            </span>
          ) : (
            <button
              key={n}
              className={`page-btn ${n === page ? 'active' : ''}`.trim()}
              aria-current={n === page ? 'page' : undefined}
              onClick={() => setPage(n)}
            >
              {n}
            </button>
          ),
        )}
        <button
          className="page-btn"
          disabled={page === pageCount}
          onClick={() => setPage(page + 1)}
          aria-label="Next page"
        >
          ›
        </button>
      </div>
    </nav>
  );
}

export interface BarSeries {
  label: string;
  color: string;
  values: number[];
}

/**
 * Grouped vertical bar chart in plain SVG, no chart library. Each category gets one bar per
 * series; the value is printed above any bar taller than zero so no hover is needed to read it.
 */
export function BarChart({
  categories,
  series,
  height = 190,
  ariaLabel,
}: {
  categories: string[];
  series: BarSeries[];
  height?: number;
  ariaLabel: string;
}) {
  const width = 560;
  const pad = { top: 18, right: 8, bottom: 26, left: 30 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  // A "nice" top for the axis so gridlines land on whole numbers.
  const step = max <= 5 ? 1 : max <= 10 ? 2 : Math.ceil(max / 5);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const groupW = innerW / Math.max(1, categories.length);
  const barW = Math.min(26, (groupW * 0.72) / series.length);
  const y = (v: number) => pad.top + innerH - (v / top) * innerH;

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} style={{ width: '100%', height: 'auto' }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={t === 0 ? 1.2 : 0.8} />
            <text x={pad.left - 6} y={y(t) + 4} textAnchor="end" fontSize="10.5" fill="var(--muted)">
              {t}
            </text>
          </g>
        ))}
        {categories.map((c, ci) => {
          const groupX = pad.left + ci * groupW + (groupW - barW * series.length) / 2;
          return (
            <g key={c}>
              {series.map((s, si) => {
                const v = s.values[ci] ?? 0;
                const x = groupX + si * barW;
                const h = (v / top) * innerH;
                return (
                  <g key={s.label}>
                    <rect x={x + 1} y={y(v)} width={barW - 2} height={Math.max(0, h)} rx={3} fill={s.color}>
                      <title>{`${c} · ${s.label}: ${v}`}</title>
                    </rect>
                    {v > 0 ? (
                      <text x={x + barW / 2} y={y(v) - 4} textAnchor="middle" fontSize="10.5" fontWeight={700} fill="var(--text-soft)">
                        {v}
                      </text>
                    ) : null}
                  </g>
                );
              })}
              <text x={pad.left + ci * groupW + groupW / 2} y={height - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">
                {c}
              </text>
            </g>
          );
        })}
      </svg>
      {series.length > 1 ? (
        <figcaption className="chart-legend">
          {series.map((s) => (
            <span key={s.label}>
              <i style={{ background: s.color }} aria-hidden />
              {s.label}
            </span>
          ))}
        </figcaption>
      ) : null}
    </figure>
  );
}

/** Horizontal bars for a breakdown ("reports by status"), each labelled with its count. */
export function BreakdownBars({ rows }: { rows: { label: string; value: number; color: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="breakdown">
      {rows.map((r) => (
        <div key={r.label} className="breakdown-row">
          <span className="breakdown-label">{r.label}</span>
          <span className="breakdown-track">
            <span style={{ width: `${(r.value / max) * 100}%`, background: r.color }} />
          </span>
          <span className="breakdown-value">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Password input with a show/hide button, so people can check what they typed. */
export function PasswordInput({
  id,
  value,
  onChange,
  autoComplete = 'current-password',
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-wrap">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
      >
        {visible ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { SJDM_BARANGAY_NAMES, colors, describeAnimal, reportKindStyle, reportPlace, reportStatusMeta, timeAgo, type AnimalReport } from '@saanpaw/shared';
import { Badge, Banner, Card, CardHead, EmptyState, Thumb } from './ui';
import { useApi } from '@/lib/useApi';

interface Page {
  items: AnimalReport[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const empty = { q: '', kind: '', status: '', animalType: '', barangay: '', location: '', tag: '', from: '', to: '', sort: 'newest' };

/**
 * Every lost and found report, searched and paged on the server (the whole database, not only
 * what the console has loaded): text, location, AI tag, date range, type and status filters, and
 * newest/oldest order.
 */
export function ReportSearch({ onOpen }: { onOpen: (r: AnimalReport) => void }) {
  const api = useApi();
  const [f, setF] = useState(empty);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof empty) => (v: string) => {
    setF((prev) => ({ ...prev, [k]: v }));
    setPage(1);
  };

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      for (const [k, v] of Object.entries(f)) if (v) params.set(k, v);
      api<Page>(`/developer/reports?${params}`)
        .then((d) => {
          if (cancelled) return;
          setData(d);
          setError(null);
        })
        .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
        .finally(() => !cancelled && setLoading(false));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [api, f, page, limit]);

  const active = Object.entries(f).filter(([k, v]) => v && !(k === 'sort' && v === 'newest')).length;

  return (
    <Card>
      <CardHead
        title={`All submissions${data ? ` (${data.total.toLocaleString()})` : ''}`}
        sub="Every lost and found report in the database. Search, filter and sort; results are paged."
        actions={
          <input
            type="search"
            placeholder="Search animal, breed, colour, reporter, tag..."
            value={f.q}
            onChange={(e) => set('q')(e.target.value)}
            className="table-search"
            style={{ width: 260 }}
            aria-label="Search reports"
          />
        }
      />
      <div className="card-pad filter-bar">
        <label className="mini-field">
          Location
          <input placeholder="Street, landmark or barangay" value={f.location} onChange={(e) => set('location')(e.target.value)} />
        </label>
        <label className="mini-field">
          Barangay
          <select value={f.barangay} onChange={(e) => set('barangay')(e.target.value)}>
            <option value="">All barangays</option>
            {SJDM_BARANGAY_NAMES.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </label>
        <label className="mini-field">
          Kind
          <select value={f.kind} onChange={(e) => set('kind')(e.target.value)}>
            <option value="">Lost and found</option>
            <option value="lost">Lost</option>
            <option value="found">Found</option>
          </select>
        </label>
        <label className="mini-field">
          Animal
          <select value={f.animalType} onChange={(e) => set('animalType')(e.target.value)}>
            <option value="">Any</option>
            <option value="dog">Dog</option>
            <option value="cat">Cat</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="mini-field">
          Status
          <select value={f.status} onChange={(e) => set('status')(e.target.value)}>
            <option value="">Any status</option>
            {(Object.keys(reportStatusMeta) as (keyof typeof reportStatusMeta)[]).map((s) => (
              <option key={s} value={s}>
                {reportStatusMeta[s].label}
              </option>
            ))}
          </select>
        </label>
        <label className="mini-field">
          AI tag
          <input placeholder="e.g. white chest" value={f.tag} onChange={(e) => set('tag')(e.target.value.toLowerCase())} />
        </label>
        <label className="mini-field">
          From
          <input type="date" value={f.from} max={f.to || undefined} onChange={(e) => set('from')(e.target.value)} />
        </label>
        <label className="mini-field">
          To
          <input type="date" value={f.to} min={f.from || undefined} onChange={(e) => set('to')(e.target.value)} />
        </label>
        <label className="mini-field">
          Sort by date
          <select value={f.sort} onChange={(e) => set('sort')(e.target.value)}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </label>
        {active ? (
          <button className="chip" onClick={() => (setF(empty), setPage(1))}>
            Clear {active} filter{active === 1 ? '' : 's'}
          </button>
        ) : null}
      </div>
      {error ? (
        <div className="card-pad">
          <Banner tone="danger" title="Could not search reports">
            {error}
          </Banner>
        </div>
      ) : null}
      {data?.items.length ? (
        <div style={{ opacity: loading ? 0.55 : 1 }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 62 }}>Photo</th>
                <th>Animal</th>
                <th>Kind</th>
                <th>Status</th>
                <th>Location</th>
                <th>AI tags</th>
                <th>Reporter</th>
                <th>Reported</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => {
                const kind = reportKindStyle[r.kind];
                const status = reportStatusMeta[r.status];
                return (
                  <tr key={r.id} onClick={() => onOpen(r)} style={{ cursor: 'pointer' }}>
                    <td>
                      <Thumb src={r.imageUrls[0]} alt={describeAnimal(r)} />
                    </td>
                    <td>
                      <div className="cell-title">{describeAnimal(r)}</div>
                      <div className="cell-sub" style={{ fontFamily: 'ui-monospace, Consolas, monospace' }}>
                        {r.id.slice(-8).toUpperCase()}
                      </div>
                    </td>
                    <td>
                      <Badge label={kind.label} color={kind.color} soft={kind.soft} />
                    </td>
                    <td>
                      <Badge label={status.label} color={status.color} soft={status.soft} />
                      {r.moderationFlagId ? (
                        <div style={{ marginTop: 4 }}>
                          <Badge label="AI flagged" color={colors.danger} soft={colors.dangerSoft} />
                        </div>
                      ) : null}
                    </td>
                    <td style={{ maxWidth: 200 }}>{reportPlace(r)}</td>
                    <td style={{ maxWidth: 220 }}>
                      <div className="tag-list">
                        {(r.aiTags ?? []).slice(0, 5).map((t) => (
                          <button
                            key={t}
                            className="tag"
                            title={`Show reports tagged "${t}"`}
                            onClick={(e) => {
                              e.stopPropagation();
                              set('tag')(t);
                            }}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td>
                      {r.reporterName}
                      {r.byGuest ? <span className="tag" style={{ marginLeft: 6 }}>guest</span> : null}
                    </td>
                    <td style={{ color: 'var(--muted)' }}>{timeAgo(r.reportedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <nav className="pagination card-pad" aria-label="Pagination">
            <span className="pagination-info">
              Page {data.page} of {data.pages} · {data.total.toLocaleString()} reports ·{' '}
              <select value={limit} onChange={(e) => (setLimit(Number(e.target.value)), setPage(1))} aria-label="Rows per page">
                {[10, 20, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n} per page
                  </option>
                ))}
              </select>
            </span>
            <div className="row" style={{ gap: 4 }}>
              <button className="page-btn" disabled={data.page <= 1} onClick={() => setPage(1)} aria-label="First page">
                «
              </button>
              <button className="page-btn" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)} aria-label="Previous page">
                ‹
              </button>
              <span className="page-gap">{data.page}</span>
              <button className="page-btn" disabled={data.page >= data.pages} onClick={() => setPage(data.page + 1)} aria-label="Next page">
                ›
              </button>
              <button className="page-btn" disabled={data.page >= data.pages} onClick={() => setPage(data.pages)} aria-label="Last page">
                »
              </button>
            </div>
          </nav>
        </div>
      ) : data ? (
        <EmptyState title="No reports match">Try fewer filters or a different search.</EmptyState>
      ) : (
        <div className="card-pad muted">Loading reports…</div>
      )}
    </Card>
  );
}

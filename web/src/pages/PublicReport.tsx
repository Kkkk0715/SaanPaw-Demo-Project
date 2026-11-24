import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { describeAnimal, reportKindStyle, reportPlace, reportStatusMeta, resolveImageUrl, timeAgo, type AnimalReport } from '@saanpaw/shared';
import { Badge, Banner } from '@/components/ui';
import { API_BASE_URL, apiRequest } from '@/lib/api';
import { APP_DOWNLOAD_URL } from './Landing';

/** Where shared links point: the share page (with the Facebook preview) for this report. */
export function shareLinkFor(kind: string, id: string) {
  return `${API_BASE_URL}/share/r/${kind}/${id}`;
}
export function facebookShareUrl(kind: string, id: string) {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareLinkFor(kind, id))}`;
}

/**
 * A lost or found report anyone can open, without an account: where links shared on Facebook
 * lead. Shows the animal and the place, and sends people into the SaanPaw app to help.
 */
export function PublicReportPage() {
  const { kind = 'lost', id = '' } = useParams();
  const [report, setReport] = useState<AnimalReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<AnimalReport>(`/public/reports/${kind === 'found' ? 'found' : 'lost'}/${encodeURIComponent(id)}`)
      // Photos are stored as /uploads/... on the API, not on this site.
      .then((r) => setReport({ ...r, imageUrls: r.imageUrls.map((u) => resolveImageUrl(u, API_BASE_URL)) }))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [kind, id]);

  const appLink = `saanpaw://report?kind=${kind}&id=${id}`;
  const k = reportKindStyle[(kind === 'found' ? 'found' : 'lost') as 'lost' | 'found'];

  return (
    <div className="public-report">
      <header className="public-report-top">
        <Link to="/" className="public-brand">
          🐾 SaanPaw
        </Link>
        <span className="sub">Lost &amp; found animals of San Jose Del Monte</span>
      </header>
      {error ? (
        <Banner tone="danger" title="Report not available">
          {error}
        </Banner>
      ) : !report ? (
        <p className="muted" style={{ textAlign: 'center' }}>
          Loading the report…
        </p>
      ) : (
        <article className="public-report-card">
          {report.imageUrls[0] ? <img className="public-report-photo" src={report.imageUrls[0]} alt={describeAnimal(report)} /> : null}
          <div className="public-report-body">
            <div className="row row-wrap" style={{ gap: 8 }}>
              <Badge label={k.label} color={k.color} soft={k.soft} />
              <Badge label={reportStatusMeta[report.status].label} color={reportStatusMeta[report.status].color} soft={reportStatusMeta[report.status].soft} />
            </div>
            <h1>{report.kind === 'lost' && report.name ? `${report.name} · ${describeAnimal({ ...report, name: undefined })}` : describeAnimal(report)}</h1>
            <p className="sub">
              {report.kind === 'lost' ? 'Last seen' : 'Found'} near {reportPlace(report)} · reported {timeAgo(report.reportedAt)} by {report.reporterName}
            </p>
            <dl className="public-facts">
              {[
                ['Breed', report.breed],
                ['Colour', report.color],
                ['Size', report.size],
                ['Sex', report.sex && report.sex !== 'unknown' ? report.sex : undefined],
                ['Distinct marks', report.distinctMarks],
              ]
                .filter(([, v]) => v)
                .map(([label, v]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
            </dl>
            {report.description ? <p>{report.description}</p> : null}
            {report.aiTags?.length ? (
              <div className="tag-list">
                {report.aiTags.map((t) => (
                  <span key={t} className="tag">
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
            <a
              className="sub"
              href={`https://www.google.com/maps/search/?api=1&query=${report.location.latitude},${report.location.longitude}`}
              target="_blank"
              rel="noreferrer"
            >
              Open the spot in Google Maps ↗
            </a>
            <div className="public-actions">
              <a className="btn btn-primary" href={appLink}>
                Open in the SaanPaw app
              </a>
              <a className="btn btn-secondary" href={APP_DOWNLOAD_URL} rel="noopener">
                Download the app
              </a>
              <a className="btn btn-ghost" href={facebookShareUrl(report.kind, report.id)} target="_blank" rel="noreferrer">
                Share on Facebook
              </a>
            </div>
            <p className="sub">Seen this animal? Open the report in the SaanPaw app to message the reporter or a shelter. Contact details are only shown in the app.</p>
          </div>
        </article>
      )}
    </div>
  );
}

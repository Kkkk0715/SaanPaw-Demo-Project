import type { AnimalCaseStatus, AnimalReport } from './types';
import { caseStatusMeta, colors, reportKindStyle, reportStatusMeta } from './theme';
import { describeAnimal, reportPlace } from './describe';

/**
 * One report as a printable A4 page, used for "Export as PDF" on both surfaces: the mobile app
 * renders it to a PDF file with expo-print, the Developer Console prints it (Save as PDF).
 */
export interface ReportPdfExtras {
  /** The recovery case on this report, when a shelter has taken it on. */
  caseStatus?: AnimalCaseStatus;
  caseShelterName?: string;
  /** Who exported it, e.g. "SaanPaw Developer Console". */
  exportedBy?: string;
}

const esc = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const cap = (s?: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

/** A safe file name for the exported PDF, e.g. "SaanPaw-lost-report-Bantay-6F2A91.pdf". */
export function reportPdfFileName(report: AnimalReport): string {
  const who = describeAnimal(report).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'animal';
  return `SaanPaw-${report.kind}-report-${who}-${report.id.slice(-6).toUpperCase()}.pdf`;
}

export function reportPdfHtml(report: AnimalReport, extras: ReportPdfExtras = {}): string {
  const kind = reportKindStyle[report.kind];
  const status = reportStatusMeta[report.status];
  const rows: [string, string | undefined][] = [
    ['Report type', `${kind.label} animal`],
    ['Status', status.label],
    ['Pet name', report.name],
    ['Animal', cap(report.animalType)],
    ['Breed', report.breed],
    ['Fur color', report.color],
    ['Size', cap(report.size)],
    ['Sex', report.sex && report.sex !== 'unknown' ? cap(report.sex) : undefined],
    ['Distinct marks', report.distinctMarks],
    ['Description', report.description],
    [report.kind === 'lost' ? 'Last seen' : 'Found at', reportPlace(report)],
    ['Barangay', report.barangay],
    ['Coordinates', `${report.location.latitude.toFixed(5)}, ${report.location.longitude.toFixed(5)}`],
    ['Reported', new Date(report.reportedAt).toLocaleString()],
    ['Reported by', report.reporterName],
    ['Contact number', report.reporterPhone],
    [
      'Shelter case',
      extras.caseStatus
        ? `${caseStatusMeta[extras.caseStatus].label}${extras.caseShelterName ? ` · ${extras.caseShelterName}` : ''}`
        : undefined,
    ],
    ['Reference', report.id.toUpperCase()],
  ];
  const table = rows
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`)
    .join('');
  const photos = report.imageUrls
    .slice(0, 4)
    .map((u) => `<img src="${esc(u)}" alt="" />`)
    .join('');
  const generated = new Date().toLocaleString();

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(reportPdfFileName(report).replace(/\.pdf$/, ''))}</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2933; margin: 0; font-size: 12px; }
  header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid ${colors.primary}; padding-bottom: 8px; margin-bottom: 14px; }
  .brand { font-size: 20px; font-weight: 800; color: ${colors.primary}; letter-spacing: .3px; }
  .muted { color: #6b7280; font-size: 11px; }
  h1 { font-size: 22px; margin: 0 0 6px; }
  .badges { margin-bottom: 12px; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-weight: 700; font-size: 11px; margin-right: 6px; }
  .photos { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
  .photos img { width: 48%; max-height: 260px; object-fit: cover; border-radius: 8px; border: 1px solid #e5e7eb; }
  .photos img:only-child { width: 100%; max-height: 320px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; vertical-align: top; padding: 7px 8px; border-bottom: 1px solid #e5e7eb; }
  th { width: 32%; color: #4b5563; font-weight: 600; background: #f9fafb; }
  td { white-space: pre-wrap; word-break: break-word; }
  footer { margin-top: 18px; }
</style></head>
<body>
  <header>
    <div><div class="brand">SaanPaw</div><div class="muted">Lost &amp; found animal report · San Jose del Monte, Bulacan</div></div>
    <div class="muted" style="text-align:right">Generated ${esc(generated)}${extras.exportedBy ? `<br/>${esc(extras.exportedBy)}` : ''}</div>
  </header>
  <h1>${esc(describeAnimal(report))}</h1>
  <div class="badges">
    <span class="badge" style="color:${kind.color};background:${kind.soft}">${esc(kind.label)}</span>
    <span class="badge" style="color:${status.color};background:${status.soft}">${esc(status.label)}</span>
  </div>
  ${photos ? `<div class="photos">${photos}</div>` : ''}
  <table>${table}</table>
  <footer class="muted">This document was exported from SaanPaw. Details are as submitted by the reporter and may have changed since it was generated.</footer>
</body></html>`;
}

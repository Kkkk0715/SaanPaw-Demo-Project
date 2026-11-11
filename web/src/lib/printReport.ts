import { reportPdfHtml, type AnimalReport, type ReportPdfExtras } from '@saanpaw/shared';

/**
 * Prints one report through a hidden frame (no pop-up for the browser to block). The print dialog
 * opens with the report laid out on A4; choosing "Save as PDF" as the printer saves the file.
 */
export function printReportPdf(report: AnimalReport, extras: ReportPdfExtras = {}): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(reportPdfHtml(report, { exportedBy: 'SaanPaw Developer Console', ...extras }));
  doc.close();

  // Wait for the photos, or they print as blank boxes; give up on any that take over 8 s.
  const images = Array.from(doc.images);
  const loaded = images.map(
    (img) =>
      new Promise<void>((resolve) => {
        if (img.complete) return resolve();
        img.addEventListener('load', () => resolve(), { once: true });
        img.addEventListener('error', () => resolve(), { once: true });
      }),
  );
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 8000));
  void Promise.race([Promise.all(loaded), timeout]).then(() => {
    win.focus();
    win.print();
    // Remove the frame once the dialog has closed (print() blocks in most browsers).
    setTimeout(() => frame.remove(), 1000);
  });
}

import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { reportPdfFileName, reportPdfHtml, type AnimalReport, type ReportPdfExtras } from '@saanpaw/shared';

/**
 * Renders one report to a PDF and opens the share sheet, so it can be saved to Files/Drive or
 * sent in Messenger, Gmail and so on. On the web build the browser's print dialog opens instead
 * (choose "Save as PDF").
 */
export async function exportReportPdf(report: AnimalReport, extras: ReportPdfExtras = {}): Promise<void> {
  const html = reportPdfHtml(report, { exportedBy: 'SaanPaw mobile app', ...extras });
  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return;
  }
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: reportPdfFileName(report),
    });
  } else {
    await Print.printAsync({ uri });
  }
}

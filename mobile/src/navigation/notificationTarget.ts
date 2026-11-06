import type { MobileRole } from '@/context/AuthContext';

/**
 * Where tapping a notification goes - the same for a row in the in-app list and for a push
 * notification tapped from the phone's notification shade. Notifications used to all open the
 * Map tab, which left people hunting for the report the alert was about.
 *
 * `type` may be the app's name for it (from the in-app list) or the server's (from a push payload).
 */
export type NotificationTarget = { screen: string; params?: Record<string, unknown> };

export function notificationTarget(role: MobileRole, type: string | undefined, reportId: string | undefined): NotificationTarget {
  if (role === 'shelter_admin') {
    if (type === 'message') return { screen: 'Messages' };
    if (reportId) return { screen: 'ReportDetail', params: { reportId } };
    return { screen: 'ShelterNotifications' };
  }

  // User
  if ((type === 'match_found' || type === 'match') && reportId) return { screen: 'ImageRecognition', params: { reportId } };
  // A shelter updated the case on one of your own reports.
  if (type === 'case_update' || type === 'status_update') return { screen: 'LostPetStatus' };
  if (type === 'message') return { screen: 'ShelterView', params: { tab: 'messages' } };
  if (reportId) return { screen: 'ReportDetail', params: { reportId } };
  return { screen: 'HomeTabs', params: { screen: 'Alerts' } };
}

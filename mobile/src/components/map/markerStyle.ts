import { theme } from '@/constants/theme';
import type { LatLng } from '@saanpaw/shared';

/** Shared between the native (WebView) and web map so both colour pins the same way. */

export interface MapMarker {
  id: string;
  coordinate: LatLng;
  /** Pin colour: lost = red, found = emerald green, shelter = dark forest green, me = blue. */
  kind: 'lost' | 'found' | 'shelter' | 'me';
  label?: string;
}

export const MARKER_COLOR: Record<MapMarker['kind'], string> = {
  lost: theme.colors.danger,
  found: theme.colors.found,
  // Darker than the found-report green, so a shelter and a found animal never look alike on the map.
  shelter: theme.colors.primaryDarker,
  me: theme.colors.info,
};

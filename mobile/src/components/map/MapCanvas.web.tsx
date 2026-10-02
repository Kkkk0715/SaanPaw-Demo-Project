import { useEffect, useRef, useState, type Ref } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import L from 'leaflet';
import { theme } from '@/constants/theme';
import { SJDM_CENTER } from '@saanpaw/shared';
import type { LatLng } from '@saanpaw/shared';
import { MARKER_COLOR, type MapMarker } from './markerStyle';

export type { MapMarker };

/**
 * The browser build of the map (`expo export -p web` / `npm run web:mobile`).
 * Metro (this app's web bundler) has no CSS loader, so the stylesheet is a
 * `<link>` tag rather than an import - see `MapCanvas.tsx` for the native
 * build, which runs the same Leaflet version inside a WebView instead.
 *
 * Uses OpenStreetMap raster tiles rather than Mapbox: Leaflet draws them as plain `<img>`
 * elements with no WebGL involved, unlike Mapbox GL JS - several low-end Android phones in
 * testing could not reliably allocate the GPU texture memory that needed. Also needs no API token.
 */
const LEAFLET_CSS_ID = 'saanpaw-leaflet-css';
const LEAFLET_CSS_HREF = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';

/**
 * Leaflet measures its own layout off this stylesheet. Constructing the map before it applies is
 * a race: if the map wins, it renders against no styling at all and nothing shows up correctly.
 * This resolves once the stylesheet is actually applied - immediately if it already is, otherwise
 * on its `load` event - with a short timeout so a slow or blocked request can't hang the map
 * forever (it just renders a little rough instead of never rendering).
 */
function loadLeafletCss(): Promise<void> {
  const existing = document.getElementById(LEAFLET_CSS_ID) as HTMLLinkElement | null;
  if (existing) {
    return existing.dataset.loaded === '1'
      ? Promise.resolve()
      : new Promise((resolve) => existing.addEventListener('load', () => resolve(), { once: true }));
  }
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.id = LEAFLET_CSS_ID;
    link.rel = 'stylesheet';
    link.href = LEAFLET_CSS_HREF;
    const done = () => {
      link.dataset.loaded = '1';
      resolve();
    };
    link.addEventListener('load', done, { once: true });
    link.addEventListener('error', done, { once: true });
    setTimeout(done, 2000);
    document.head.appendChild(link);
  });
}

// Leaflet's bindPopup treats a string argument as HTML, not text - a report's name or colour
// (free text from a citizen, never sanitised for markup) would otherwise execute as script the
// moment someone taps that pin. Round-tripping through textContent/innerHTML is the most
// reliable escape: the browser's own serialiser handles every character correctly, not just
// the handful an ad-hoc replace() would think to cover.
function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function pinIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: 'pin-marker',
    html:
      `<svg width="30" height="30" viewBox="0 0 24 24">` +
      `<path d="M12 0C7 0 3 4 3 9c0 6.5 9 15 9 15s9-8.5 9-15c0-5-4-9-9-9z" fill="${color}" stroke="#fff" stroke-width="1.5"/>` +
      `<circle cx="12" cy="9" r="3.2" fill="#fff"/>` +
      `</svg>`,
    iconSize: [30, 30],
    iconAnchor: [15, 28],
    popupAnchor: [0, -26],
  });
}

export function MapCanvas({
  markers = [],
  initialCenter = SJDM_CENTER,
  initialZoom = 13,
  height = 300,
  radiusMeters,
  radiusCenter,
  onMarkerPress,
  onPickLocation,
  selectedMarkerId,
}: {
  markers?: MapMarker[];
  initialCenter?: LatLng;
  initialZoom?: number;
  height?: number;
  radiusMeters?: number;
  radiusCenter?: LatLng;
  onMarkerPress?: (id: string) => void;
  onPickLocation?: (c: LatLng) => void;
  selectedMarkerId?: string | null;
}) {
  // react-native-web renders `View` as a <div> on the web build and forwards
  // `ref` to that real DOM node, which is what L.map needs to mount into.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const markerInstances = useRef<Record<string, L.Marker>>({});
  const radiusCircleRef = useRef<L.Circle | null>(null);
  const pickable = useRef(Boolean(onPickLocation)).current;
  const [loadError, setLoadError] = useState<string | null>(null);
  // Bumped once the map object exists, so the marker/radius effects below - which read
  // `mapRef.current` - re-run and catch up once map creation finishes (it's deferred behind
  // the CSS load above, so it's not there yet on these effects' very first run).
  const [mapReady, setMapReady] = useState(0);

  const onMarkerPressRef = useRef(onMarkerPress);
  onMarkerPressRef.current = onMarkerPress;
  const onPickLocationRef = useRef(onPickLocation);
  onPickLocationRef.current = onPickLocation;

  // Mount once. Every prop after that is applied by the effects below, so the
  // map itself (its pan/zoom) never resets while the parent re-renders.
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    loadLeafletCss()
      .then(() => {
        if (cancelled || !containerRef.current) return;

        const map = L.map(containerRef.current, {
          center: [initialCenter.latitude, initialCenter.longitude],
          zoom: initialZoom,
          minZoom: 10,
          maxZoom: 19,
        });
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map);

        map.on('click', (e: L.LeafletMouseEvent) => {
          if (pickable) onPickLocationRef.current?.({ latitude: e.latlng.lat, longitude: e.latlng.lng });
        });

        // Leaflet measures the container once at construction and never re-measures on its own.
        // If the surrounding layout (a banner above the map, a scrollable form, a card that hasn't
        // settled its final height yet) is still shifting when that happens, Leaflet can lock in a
        // zero or stale size and only load tiles for that size - the map looks blank or clipped
        // even though the library loaded fine. A resize observer catches every later size change;
        // the explicit calls below catch the very first one, before it fires.
        const resizeObserver = new ResizeObserver(() => map.invalidateSize());
        resizeObserver.observe(containerRef.current);
        map.invalidateSize();
        requestAnimationFrame(() => map.invalidateSize());

        mapRef.current = map;
        resizeObserverRef.current = resizeObserver;
        setMapReady((v) => v + 1);
      })
      .catch(() => setLoadError('The map failed to load.'));

    return () => {
      cancelled = true;
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      Object.values(markerInstances.current).forEach((m) => m.remove());
      markerInstances.current = {};
      radiusCircleRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // The initial centre/zoom only apply once, matching the native build.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Markers: add, move, or remove to match the latest `markers` prop.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const seen = new Set<string>();
    markers.forEach((m) => {
      seen.add(m.id);
      let marker = markerInstances.current[m.id];
      if (!marker) {
        marker = L.marker([m.coordinate.latitude, m.coordinate.longitude], {
          icon: pinIcon(MARKER_COLOR[m.kind]),
          draggable: pickable,
        }).addTo(map);
        marker.on('click', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          onMarkerPressRef.current?.(m.id);
        });
        marker.on('dragend', () => {
          const pos = marker!.getLatLng();
          onPickLocationRef.current?.({ latitude: pos.lat, longitude: pos.lng });
        });
        markerInstances.current[m.id] = marker;
      } else {
        marker.setLatLng([m.coordinate.latitude, m.coordinate.longitude]);
      }

      if (m.label && selectedMarkerId === m.id) {
        if (!marker.getPopup()) {
          marker.bindPopup(escapeHtml(m.label), { closeButton: false, closeOnClick: false, autoClose: false, autoPan: false });
        }
        marker.openPopup();
      } else if (marker.getPopup()) {
        marker.closePopup();
        marker.unbindPopup();
      }
    });
    Object.keys(markerInstances.current).forEach((id) => {
      if (!seen.has(id)) {
        markerInstances.current[id].remove();
        delete markerInstances.current[id];
      }
    });
  }, [markers, selectedMarkerId, pickable, mapReady]);

  // Radius circle.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!radiusMeters || !radiusCenter) {
      if (radiusCircleRef.current) {
        radiusCircleRef.current.remove();
        radiusCircleRef.current = null;
      }
      return;
    }
    const latlng: L.LatLngTuple = [radiusCenter.latitude, radiusCenter.longitude];
    if (radiusCircleRef.current) {
      radiusCircleRef.current.setLatLng(latlng);
      radiusCircleRef.current.setRadius(radiusMeters);
    } else {
      radiusCircleRef.current = L.circle(latlng, {
        radius: radiusMeters,
        color: '#2E7D5B',
        weight: 2,
        opacity: 0.55,
        fillColor: '#2E7D5B',
        fillOpacity: 0.14,
      }).addTo(map);
    }
  }, [radiusMeters, radiusCenter?.latitude, radiusCenter?.longitude, mapReady]);

  // `initialCenter` only sets where the camera starts on a map the user can pin on. Screens that
  // bind it to the same state as the pin - e.g. the report form - would otherwise fight the user:
  // every tap or drag would immediately re-centre the camera on the spot they just placed the
  // pin. The "recenter" button below (back to this same starting view) is the deliberate way to
  // jump the camera there instead.
  //
  // A map the user can't pin on (registration, shelter profile, the map tab) is the opposite: it
  // has to follow its center and zoom props, because choosing a different barangay or radius moves
  // the circle, and a camera left where it was would show the circle off-screen or beside the wrong
  // labels. Only an actual change moves it, so an unrelated re-render never snaps the map back
  // under someone who has panned it.
  const lastViewRef = useRef({ lat: initialCenter.latitude, lng: initialCenter.longitude, zoom: initialZoom });
  useEffect(() => {
    const map = mapRef.current;
    if (!map || pickable) return;
    const last = lastViewRef.current;
    if (last.lat === initialCenter.latitude && last.lng === initialCenter.longitude && last.zoom === initialZoom) return;
    lastViewRef.current = { lat: initialCenter.latitude, lng: initialCenter.longitude, zoom: initialZoom };
    map.setView([initialCenter.latitude, initialCenter.longitude], initialZoom);
  }, [initialCenter.latitude, initialCenter.longitude, initialZoom, pickable, mapReady]);

  return (
    <View style={[styles.wrap, { height }]}>
      <View style={styles.mapFill}>
        <View ref={containerRef as unknown as Ref<View>} style={styles.mapInner} />
      </View>
      {loadError ? (
        <View style={styles.errorOverlay} pointerEvents="none">
          <Text style={styles.missingTokenText}>Map failed to load: {loadError}</Text>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Recenter"
        style={styles.recenter}
        onPress={() => mapRef.current?.flyTo([initialCenter.latitude, initialCenter.longitude], initialZoom)}
      >
        <View style={styles.recenterDot} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    backgroundColor: '#DCE6DF',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  // Two levels, not one: L.map sets `position: relative` as an inline style on whatever container
  // element it's given - it needs that to correctly place its own panes, controls and attribution
  // inside it. That directly conflicts with using the *same* element as this box's own
  // absolutely-positioned fill (inline styles win over any class), which silently collapsed it to
  // zero height. So the fill lives on a separate outer `View`, and the element handed to Leaflet
  // (`mapInner`) just stretches to match it - its own `position` is entirely Leaflet's to set.
  mapFill: { ...StyleSheet.absoluteFillObject },
  mapInner: { flex: 1 },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(220,38,38,0.06)',
  },
  missingTokenText: { fontSize: 12.5, lineHeight: 18, color: theme.colors.textSoft, textAlign: 'center' },
  recenter: {
    position: 'absolute',
    right: 10,
    bottom: 28,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadow.card,
  },
  recenterDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
});

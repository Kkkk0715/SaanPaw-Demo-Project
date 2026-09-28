import type { LatLng } from '@saanpaw/shared';

/**
 * The page that runs inside the map's WebView (see `MapCanvas.tsx`).
 *
 * Leaflet has no React Native build, so on Android/iOS it runs as an ordinary web page loaded
 * from a CDN, and talks to React Native through `postMessage`. `MapCanvas.web.tsx` runs the same
 * library directly in the DOM instead, since the web build has no WebView to put it in.
 *
 * Uses OpenStreetMap raster tiles rather than Mapbox: Leaflet draws them as plain `<img>` elements
 * with no WebGL involved, which is what Mapbox GL JS needed and what several low-end Android
 * phones in testing could not reliably do (their GPU driver failed to allocate the texture memory
 * Mapbox's renderer asked for, leaving the map blank). Plain images have no such requirement, and
 * it also needs no API token.
 *
 * Pinned to the same version as the `leaflet` npm package used on web (see `mobile/package.json`),
 * so both platforms render identically.
 */
const LEAFLET_VERSION = '1.9.4';

export interface MapMarkerConfig {
  id: string;
  lat: number;
  lng: number;
  color: string;
  label?: string;
}

export interface MapInitialState {
  center: LatLng;
  zoom: number;
  minZoom: number;
  maxZoom: number;
  /** Whether tapping the map or dragging a marker should report a picked point. */
  pickable: boolean;
  markers: MapMarkerConfig[];
  selectedMarkerId?: string | null;
  radiusMeters?: number;
  radiusCenter?: LatLng;
}

export function buildMapHtml(initial: MapInitialState): string {
  // Passed as JSON into the page's own script, so nothing here is a template
  // literal that could clash with the vanilla JS below (which uses plain quotes).
  const configJson = JSON.stringify(initial).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="initial-scale=1,maximum-scale=1,user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css" />
  <style>
    html, body, #map { position: absolute; inset: 0; margin: 0; padding: 0; overflow: hidden; }
    .pin-marker { display: block; }
    .recenter-btn {
      position: absolute; right: 10px; bottom: 28px; width: 34px; height: 34px; border-radius: 17px;
      background: #fff; border: none; box-shadow: 0 1px 4px rgba(0,0,0,0.3);
      display: flex; align-items: center; justify-content: center; z-index: 401;
    }
    .leaflet-popup-content { font: 600 11px system-ui, sans-serif; padding: 1px 3px; margin: 7px 10px; }
    .leaflet-popup-content p { margin: 0; }
  </style>
</head>
<body>
  <div id="map"></div>
  <button class="recenter-btn" onclick="window.__recenter()" aria-label="Recenter">
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#2E7D5B" stroke-width="2">
      <circle cx="12" cy="12" r="3"></circle>
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3"></path>
    </svg>
  </button>
  <script>
    function post(message) {
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(message));
    }
  </script>
  <script
    src="https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js"
    onerror="post({ type: 'error', message: 'Could not load the map library. Check your internet connection.' })"
  ></script>
  <script>
    if (!window.L) {
      post({ type: 'error', message: 'Could not load the map library. Check your internet connection.' });
    } else (function () {
      var CONFIG = ${configJson};

      var map = L.map('map', {
        center: [CONFIG.center.latitude, CONFIG.center.longitude],
        zoom: CONFIG.zoom,
        minZoom: CONFIG.minZoom,
        maxZoom: CONFIG.maxZoom,
        zoomControl: true,
        attributionControl: true,
      });

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: CONFIG.maxZoom,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      // Leaflet measures its container once at construction and never re-measures on its own. The
      // WebView's own frame isn't always at its final React Native-assigned size by then (Android
      // especially), so without this the map can lock in a zero/stale size and only load the tiles
      // for that size - it looks blank or shows only a corner of the map even though the library
      // itself loaded fine. A resize observer catches every later size change; the explicit calls
      // below catch the very first one, before it fires.
      var mapEl = document.getElementById('map');
      function resize() { map.invalidateSize(); }
      if (window.ResizeObserver) new ResizeObserver(resize).observe(mapEl);
      resize();
      requestAnimationFrame(resize);
      // A screen-transition animation still running when the WebView first mounts can leave its
      // frame settling later than one animation frame - these catch that without a retry loop.
      setTimeout(resize, 300);
      setTimeout(resize, 1000);

      // ---------------------------------------------------------- markers

      function pinIcon(color) {
        return L.divIcon({
          className: 'pin-marker',
          html:
            '<svg width="30" height="30" viewBox="0 0 24 24">' +
            '<path d="M12 0C7 0 3 4 3 9c0 6.5 9 15 9 15s9-8.5 9-15c0-5-4-9-9-9z" fill="' +
            color +
            '" stroke="#fff" stroke-width="1.5"/>' +
            '<circle cx="12" cy="9" r="3.2" fill="#fff"/>' +
            '</svg>',
          iconSize: [30, 30],
          iconAnchor: [15, 28],
          popupAnchor: [0, -26],
        });
      }

      var markerInstances = {};

      function applyMarkers(markers, selectedId, pickable) {
        var seen = {};
        markers.forEach(function (m) {
          seen[m.id] = true;
          var existing = markerInstances[m.id];
          if (existing) {
            existing.setLatLng([m.lat, m.lng]);
          } else {
            var marker = L.marker([m.lat, m.lng], { icon: pinIcon(m.color), draggable: pickable }).addTo(map);
            marker.on('click', function (e) {
              L.DomEvent.stopPropagation(e);
              post({ type: 'marker', id: m.id });
            });
            marker.on('dragend', function () {
              var pos = marker.getLatLng();
              post({ type: 'pick', lat: pos.lat, lng: pos.lng });
            });
            markerInstances[m.id] = marker;
            existing = marker;
          }
          if (m.label && selectedId === m.id) {
            if (!existing.getPopup()) {
              existing.bindPopup(m.label, { closeButton: false, closeOnClick: false, autoClose: false, autoPan: false });
            }
            existing.openPopup();
          } else if (existing.getPopup()) {
            existing.closePopup();
            existing.unbindPopup();
          }
        });
        Object.keys(markerInstances).forEach(function (id) {
          if (!seen[id]) {
            map.removeLayer(markerInstances[id]);
            delete markerInstances[id];
          }
        });
      }

      // ------------------------------------------------------------ radius

      var radiusCircle = null;

      function applyRadius(radiusMeters, radiusCenter) {
        if (!radiusMeters || !radiusCenter) {
          if (radiusCircle) {
            map.removeLayer(radiusCircle);
            radiusCircle = null;
          }
          return;
        }
        var latlng = [radiusCenter.latitude, radiusCenter.longitude];
        if (radiusCircle) {
          radiusCircle.setLatLng(latlng);
          radiusCircle.setRadius(radiusMeters);
        } else {
          radiusCircle = L.circle(latlng, {
            radius: radiusMeters,
            color: '#2E7D5B',
            weight: 2,
            opacity: 0.55,
            fillColor: '#2E7D5B',
            fillOpacity: 0.14,
          }).addTo(map);
        }
      }

      // -------------------------------------------------------- RN bridge

      // Where "recenter" goes back to. Starts at the page's own opening view, but tracks the
      // React side's initialCenter after that, so a screen like the report form - where that
      // prop follows the pin - snaps back to wherever the pin currently is, not the first view.
      var recenterTarget = CONFIG.center;

      window.updateData = function (data) {
        applyMarkers(data.markers || [], data.selectedMarkerId, CONFIG.pickable);
        applyRadius(data.radiusMeters, data.radiusCenter);
        if (data.center) recenterTarget = data.center;
      };

      window.__recenter = function () {
        map.flyTo([recenterTarget.latitude, recenterTarget.longitude], CONFIG.zoom);
      };

      applyMarkers(CONFIG.markers || [], CONFIG.selectedMarkerId, CONFIG.pickable);
      applyRadius(CONFIG.radiusMeters, CONFIG.radiusCenter);

      map.on('click', function (e) {
        if (!CONFIG.pickable) return;
        post({ type: 'pick', lat: e.latlng.lat, lng: e.latlng.lng });
      });

      post({ type: 'ready' });
    })();
  </script>
</body>
</html>`;
}

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api, ApiError } from '../api/client';
import { EventType, GeoEvent } from '../api/types';
import { NotificationsBell } from '../components/NotificationsBell';
import { useAuth } from '../auth/AuthContext';

// Geolocation map (Phase 4). Every marker comes from
// investigation_events.location_lat/location_lng, which the event form has
// collected since Phase 1 — nothing new to enter, this is just the first
// view that plots it. Same cross-case model as Graph/Search: every event
// shown here is one the viewer already has access to (see
// backend/src/modules/geo/geo.service.ts).
//
// Plain Leaflet + OpenStreetMap tiles rather than a wrapper library
// (react-leaflet) or a paid provider (Mapbox/Google) — same "simple first"
// logic as the relationship graph's use of raw D3: no API key, no billing,
// and one less peer-dependency surface to keep in sync with React 19.
// Markers are drawn as circleMarkers rather than the default L.marker icon
// to sidestep Leaflet's well-known bundler asset-path issue with its
// default marker images.

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  interview: 'Interview',
  meeting: 'Meeting',
  call: 'Call',
  field_visit: 'Field visit',
  document_analysis: 'Document analysis',
  key_discovery: 'Key discovery',
  dead_end: 'Dead end',
  pivot: 'Pivot',
  publication: 'Publication',
};

// Same palette family as the graph's node colors, extended with a couple
// more hues since there are 9 event types rather than 5 node types.
const EVENT_TYPE_COLORS: Record<EventType, string> = {
  interview: '#2563eb',
  meeting: '#0891b2',
  call: '#059669',
  field_visit: '#65a30d',
  document_analysis: '#7c3aed',
  key_discovery: '#dc2626',
  dead_end: '#6b7280',
  pivot: '#d97706',
  publication: '#db2777',
};

const ALL_EVENT_TYPES = Object.keys(EVENT_TYPE_LABELS) as EventType[];

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-US');
}

export function MapPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const caseId = searchParams.get('caseId');

  const [events, setEvents] = useState<GeoEvent[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleTypes, setVisibleTypes] = useState<Set<EventType>>(new Set(ALL_EVENT_TYPES));

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = caseId ? `?caseId=${encodeURIComponent(caseId)}` : '';
    api
      .get<GeoEvent[]>(`/geo${qs}`)
      .then((d) => {
        if (!cancelled) setEvents(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Unable to load the map');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  function toggleType(type: EventType) {
    setVisibleTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  // Creates the map once, then just keeps re-drawing markers as the data
  // or the type filter changes (same split GraphPage uses between the
  // simulation and the focus-highlight effects).
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    // Default view: Ghana (MFWA's home base), rather than a generic world
    // view. Still overridden by fitBounds below once there are geolocated
    // events to show.
    const map = L.map(containerRef.current, { worldCopyJump: true }).setView([7.9465, -1.0232], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = markersRef.current;
    if (!map || !layer || !events) return;

    layer.clearLayers();
    const shown = events.filter((e) => visibleTypes.has(e.type));

    for (const ev of shown) {
      const marker = L.circleMarker([ev.lat, ev.lng], {
        radius: 8,
        color: '#fff',
        weight: 1.5,
        fillColor: EVENT_TYPE_COLORS[ev.type],
        fillOpacity: 0.9,
      });
      // Built with DOM methods (textContent) rather than innerHTML — event
      // reason/location are free text the user typed, not something to
      // trust as markup.
      const popupEl = document.createElement('div');
      popupEl.className = 'map-popup';

      const title = document.createElement('h3');
      title.textContent = EVENT_TYPE_LABELS[ev.type];
      popupEl.appendChild(title);

      const dateLine = document.createElement('p');
      dateLine.textContent = ev.location ? `${formatDate(ev.eventDate)} — ${ev.location}` : formatDate(ev.eventDate);
      popupEl.appendChild(dateLine);

      if (ev.reason) {
        const reasonLine = document.createElement('p');
        reasonLine.textContent = ev.reason;
        popupEl.appendChild(reasonLine);
      }

      const link = document.createElement('a');
      link.href = `/cases/${ev.caseId}`;
      link.textContent = `Open case: ${ev.caseTitle}`;
      link.onclick = (evt) => {
        evt.preventDefault();
        navigate(`/cases/${ev.caseId}`);
      };
      popupEl.appendChild(link);
      marker.bindPopup(popupEl);
      layer.addLayer(marker);
    }

    if (shown.length > 0) {
      const bounds = L.latLngBounds(shown.map((e) => [e.lat, e.lng] as [number, number]));
      map.fitBounds(bounds.pad(0.2), { maxZoom: 12 });
    }
  }, [events, visibleTypes, navigate]);

  const shownCount = events?.filter((e) => visibleTypes.has(e.type)).length ?? 0;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Map</h1>
          {caseId ? (
            <Link to={`/cases/${caseId}`} className="back-link">
              &larr; Back to case
            </Link>
          ) : (
            <Link to="/cases" className="back-link">
              &larr; My cases
            </Link>
          )}
        </div>
        <div className="page-header-actions">
          <Link to="/search" className="btn-secondary">Search</Link>
          <Link to="/graph" className="btn-secondary">Graph</Link>
          <Link to="/calendar" className="btn-secondary">Calendar</Link>
          <Link to="/portfolio" className="btn-secondary">Portfolio</Link>
          <Link to="/security" className="btn-secondary">Security</Link>
          <NotificationsBell />
          <span className="current-user">{user?.fullName}</span>
          <button onClick={logout} className="btn-secondary">Sign out</button>
        </div>
      </header>

      <p className="map-hint">
        {caseId
          ? 'Geolocated events for this case only.'
          : 'Every geolocated event across every case you contribute to.'}{' '}
        Only events with a location set on the map (not just a text location) show up here — click a marker for
        details, click "Open case" in the popup to go there.
      </p>

      <div className="map-filters">
        {ALL_EVENT_TYPES.map((type) => (
          <label key={type} className="map-filter-chip">
            <input type="checkbox" checked={visibleTypes.has(type)} onChange={() => toggleType(type)} />
            <span
              className="graph-legend-dot"
              style={{ background: EVENT_TYPE_COLORS[type], display: 'inline-block', marginRight: '0.2rem' }}
            />
            {EVENT_TYPE_LABELS[type]}
          </label>
        ))}
      </div>

      {error && <p className="form-error">{error}</p>}

      {loading ? (
        <p>Loading map...</p>
      ) : !events || events.length === 0 ? (
        <p className="empty-state">
          No geolocated events yet — add a location (with coordinates) to an event to see it here.
        </p>
      ) : (
        <p className="map-stats">{shownCount} event{shownCount === 1 ? '' : 's'} shown</p>
      )}

      <div className="map-canvas" ref={containerRef} />
    </div>
  );
}

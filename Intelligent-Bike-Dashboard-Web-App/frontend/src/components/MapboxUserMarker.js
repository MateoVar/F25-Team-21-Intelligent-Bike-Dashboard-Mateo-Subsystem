import { useEffect, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';

// GPS coordinate precision constant
const GPS_COORDINATE_PRECISION = 100000;

// Helper function to round GPS coordinates to reduce precision noise
const roundGPSCoords = (coords) => {
  if (!coords || coords.length !== 2) return coords;
  return [
    Math.round(coords[0] * GPS_COORDINATE_PRECISION) / GPS_COORDINATE_PRECISION,
    Math.round(coords[1] * GPS_COORDINATE_PRECISION) / GPS_COORDINATE_PRECISION
  ];
};

// Helper function to create a custom circle marker element with pulsing animation
const createCustomMarker = (color) => {
  const container = document.createElement('div');
  container.style.position = 'relative';
  container.style.width = '20px';
  container.style.height = '20px';
  container.style.cursor = 'pointer';

  const pulseRing = document.createElement('div');
  pulseRing.className = 'pulse-ring';
  pulseRing.style.position = 'absolute';
  pulseRing.style.top = '50%';
  pulseRing.style.left = '50%';
  pulseRing.style.transform = 'translate(-50%, -50%)';
  pulseRing.style.width = '20px';
  pulseRing.style.height = '20px';
  pulseRing.style.borderRadius = '50%';
  pulseRing.style.border = `2px solid ${color}`;
  pulseRing.style.opacity = '0.6';
  pulseRing.style.animation = 'pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite';
  pulseRing.style.pointerEvents = 'none';
  container.appendChild(pulseRing);

  const el = document.createElement('div');
  el.className = 'custom-location-marker';
  el.style.width = '20px';
  el.style.height = '20px';
  el.style.borderRadius = '50%';
  el.style.backgroundColor = color;
  el.style.border = '3px solid white';
  el.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.3), 0 0 0 4px rgba(255, 255, 255, 0.5)';
  el.style.position = 'absolute';
  el.style.top = '50%';
  el.style.left = '50%';
  el.style.transform = 'translate(-50%, -50%)';
  el.style.zIndex = '1';
  container.appendChild(el);

  return container;
};

// Manages the user location marker
export const useMapboxUserMarker = (mapRef, locationState, validateCoordinates) => {
  const userMarkerRef = useRef(null);
  const lastMapUpdateRef = useRef(null);

  const updateMarker = useCallback((coords, source, forceUpdate = false) => {
    if (!mapRef.current || !coords || coords.length !== 2) return;

    const now = Date.now();
    const mapThrottleTime = source === 'tester' || source === 'nmea_gps' ? 1500 : 1000;

    if (!forceUpdate && lastMapUpdateRef.current && (now - lastMapUpdateRef.current) < mapThrottleTime) {
      return;
    }
    lastMapUpdateRef.current = now;

    const roundedCoords = roundGPSCoords(coords);
    const markerColor = source === 'tester' || source === 'nmea_gps' ? '#ff6b35' : '#1da1f2';

    if (!userMarkerRef.current) {
      const markerElement = createCustomMarker(markerColor);
      userMarkerRef.current = new mapboxgl.Marker({ element: markerElement })
        .setLngLat(roundedCoords)
        .addTo(mapRef.current);
    } else {
      userMarkerRef.current.setLngLat(roundedCoords);
      const markerEl = userMarkerRef.current.getElement();
      if (markerEl) {
        const circle = markerEl.querySelector('.custom-location-marker');
        const pulseRing = markerEl.querySelector('.pulse-ring');
        if (circle) {
          circle.style.backgroundColor = markerColor;
          circle.style.boxShadow = `0 2px 8px rgba(0, 0, 0, 0.3), 0 0 0 4px ${markerColor}40`;
        }
        if (pulseRing) {
          pulseRing.style.borderColor = markerColor;
        }
      }
    }
  }, [mapRef]);

  // Effect to update marker when location changes
  useEffect(() => {
    if (!locationState?.coords || !mapRef.current) return;

    const coords = locationState.coords;
    if (coords && coords.length === 2 && coords[0] !== 0 && coords[1] !== 0 && validateCoordinates(coords)) {
      updateMarker(coords, locationState.source);
    }
  }, [locationState?.coords, locationState?.source, validateCoordinates, updateMarker, mapRef]);

  const cleanup = useCallback(() => {
    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }
  }, []);

  return {
    userMarkerRef,
    updateMarker,
    createCustomMarker,
    cleanup
  };
};


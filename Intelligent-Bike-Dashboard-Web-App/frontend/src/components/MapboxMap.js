import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Creates the Mapbox map and syncs it with mapState
export const useMapboxMap = (
  mapContainerRef,
  mapState,
  setMapState,
  setFollowUser,
  locationState,
  setLocationError,
  isRiding = false
) => {
  const mapRef = useRef(null);

  useEffect(() => {
    const mapboxToken = process.env.REACT_APP_MAPBOX_TOKEN;
    if (!mapboxToken) {
      console.error('[MapboxMap] REACT_APP_MAPBOX_TOKEN is not set in environment variables');
      setLocationError('Mapbox token not configured');
      return;
    }
    if (mapboxToken.includes('your_mapbox_public_token_here')) {
      console.warn('[MapboxMap] REACT_APP_MAPBOX_TOKEN is still the placeholder from .env.example');
      setLocationError('Map disabled: add your own Mapbox public token to frontend/.env');
      return;
    }
    if (mapboxToken.startsWith('sk.')) {
      // Secret tokens must never ship in a public browser bundle
      console.error('[MapboxMap] Refusing to use a secret (sk.) Mapbox token in the browser');
      setLocationError('Map disabled: use a public (pk.) Mapbox token');
      return;
    }

    mapboxgl.accessToken = mapboxToken;

    if (!mapRef.current && mapContainerRef.current) {
      const { center, zoom, bearing, pitch } = mapState;
      const initialCenter = locationState?.coords || center;

      mapRef.current = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: 'mapbox://styles/mapbox/streets-v11',
        center: initialCenter,
        zoom,
        bearing,
        pitch,
      });

      // Add controls
      mapRef.current.addControl(new mapboxgl.NavigationControl());

      // Map event handlers
      mapRef.current.on('moveend', () => {
        const newCenter = mapRef.current.getCenter();
        const newMapState = {
          center: [newCenter.lng, newCenter.lat],
          zoom: mapRef.current.getZoom(),
          bearing: mapRef.current.getBearing(),
          pitch: mapRef.current.getPitch(),
        };

        setMapState(prev => ({
          ...prev,
          ...newMapState,
        }));
      });

      // Stop auto-follow on manual interaction
      const stopFollow = () => setFollowUser(false);
      mapRef.current.on('dragstart', stopFollow);
      mapRef.current.on('zoomstart', stopFollow);
      mapRef.current.on('rotatestart', stopFollow);
      mapRef.current.on('pitchstart', stopFollow);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once - intentionally empty array for map initialization

  // Effect to handle ride state changes - re-enable follow when ride starts
  useEffect(() => {
    if (isRiding && mapRef.current) {
      // Re-enable follow mode when ride starts
      setFollowUser(true);
    }
  }, [isRiding, setFollowUser]);

  return mapRef;
};


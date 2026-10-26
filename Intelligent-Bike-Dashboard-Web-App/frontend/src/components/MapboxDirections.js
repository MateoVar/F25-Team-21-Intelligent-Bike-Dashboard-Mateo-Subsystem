import { useEffect, useRef } from 'react';
import MapboxDirections from '@mapbox/mapbox-gl-directions/dist/mapbox-gl-directions';
import '@mapbox/mapbox-gl-directions/dist/mapbox-gl-directions.css';
import mapboxgl from 'mapbox-gl';

// Sets up the Mapbox Directions control and keeps it in sync with the origin/route
export const useMapboxDirections = (
  mapRef,
  origin,
  setOrigin,
  locationState,
  customRouteMode,
  hasImportedRoute
) => {
  const directionsRef = useRef(null);

  // Initialize directions
  useEffect(() => {
    if (!mapRef.current || directionsRef.current) return;

    directionsRef.current = new MapboxDirections({
      accessToken: mapboxgl.accessToken,
      unit: 'imperial',
      profile: 'mapbox/cycling',
      flyTo: false,
    });
    mapRef.current.addControl(directionsRef.current, 'top-left');

    // Disable MapboxDirections click-to-set-destination functionality
    if (directionsRef.current) {
      const directionsInstance = directionsRef.current;
      const originalOnAdd = directionsInstance.onAdd.bind(directionsInstance);
      directionsInstance.onAdd = function(map) {
        const result = originalOnAdd(map);
        return result;
      };
    }
  }, [mapRef]);

  // Dynamic origin effect
  useEffect(() => {
    if (!origin || !directionsRef.current) return;

    const currentOrigin = directionsRef.current.getOrigin();
    const currentCoords = currentOrigin?.geometry?.coordinates;

    if (
      !currentCoords ||
      Math.abs(currentCoords[0] - origin[0]) > 0.00001 ||
      Math.abs(currentCoords[1] - origin[1]) > 0.00001
    ) {
      directionsRef.current.setOrigin(origin);
    }
  }, [origin]);

  // Live location origin effect - only set if no origin/destination exists AND not in custom route mode
  // In custom route mode, let user manually set origin
  useEffect(() => {
    if (!locationState?.coords || !directionsRef.current) return;
    
    // Don't auto-set origin if user is in custom route mode - let them type it in
    if (customRouteMode) return;

    const currentOrigin = directionsRef.current.getOrigin();
    const currentDestination = directionsRef.current.getDestination();

    if (!currentOrigin && !currentDestination) {
      const live = locationState.coords;
      directionsRef.current.setOrigin(live);
      setOrigin(live);
    }
  }, [locationState?.coords, setOrigin, customRouteMode]);

  // Effect to control directions control visibility
  useEffect(() => {
    if (!directionsRef.current || !mapRef.current) return;

    const directionsContainer = mapRef.current.getContainer().querySelector('.mapbox-directions-component');
    if (!directionsContainer) return;

    const shouldShow = customRouteMode || hasImportedRoute || locationState?.source === 'tester';

    if (shouldShow) {
      directionsContainer.style.display = 'block';
    } else {
      directionsContainer.style.display = 'none';
    }
  }, [customRouteMode, hasImportedRoute, locationState?.source, mapRef]);

  // Effect to ensure origin input field is visible and editable in custom route mode
  // Also handles keyboard dismissal (Enter key and clicking outside)
  useEffect(() => {
    if (!directionsRef.current || !mapRef.current || !customRouteMode) return;

    const setupInputs = () => {
      const mapContainer = mapRef.current.getContainer();
      if (!mapContainer) return;

      const directionsContainer = mapContainer.querySelector('.mapbox-directions-component');
      if (!directionsContainer || directionsContainer.style.display === 'none') return;

      // Find all input fields in the directions component
      const allInputs = directionsContainer.querySelectorAll('input[type="text"]');
      
      allInputs.forEach((input) => {
        // Ensure all inputs are visible and editable
        const inputContainer = input.closest('div') || input.parentElement;
        if (inputContainer) {
          inputContainer.style.display = 'block';
          inputContainer.style.visibility = 'visible';
          inputContainer.style.opacity = '1';
        }
        input.style.display = 'block';
        input.style.visibility = 'visible';
        input.style.opacity = '1';
        input.disabled = false;
        input.readOnly = false;
        
        // Ensure proper touch handling for keyboard
        input.style.touchAction = 'manipulation';
        input.style.webkitTouchCallout = 'default';
        input.style.webkitUserSelect = 'text';
        input.style.userSelect = 'text';
        input.style.fontSize = '16px';
        input.style.minHeight = '44px';

        // Add Enter key handler to dismiss keyboard
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            setTimeout(() => input.blur(), 100);
          }
        });
      });

      // Ensure origin marker is visible
      const originMarkers = mapContainer.querySelectorAll('.mapbox-directions-origin');
      originMarkers.forEach(marker => {
        marker.style.setProperty('display', 'block', 'important');
      });
    };

    // Click outside to dismiss keyboard
    const handleMapClick = (e) => {
      const directionsContainer = mapRef.current.getContainer()?.querySelector('.mapbox-directions-component');
      const activeElement = document.activeElement;
      
      if (activeElement && activeElement.tagName === 'INPUT' && 
          directionsContainer && !directionsContainer.contains(e.target)) {
        activeElement.blur();
      }
    };

    mapRef.current.on('click', handleMapClick);
    
    // Run setup
    setTimeout(setupInputs, 100);

    // Watch for changes
    const directionsContainer = mapRef.current.getContainer()?.querySelector('.mapbox-directions-component');
    if (directionsContainer) {
      const observer = new MutationObserver(() => {
        setTimeout(setupInputs, 50);
      });

      observer.observe(directionsContainer, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
      });

      return () => {
        observer.disconnect();
        if (mapRef.current) {
          mapRef.current.off('click', handleMapClick);
        }
      };
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.off('click', handleMapClick);
      }
    };
  }, [directionsRef, mapRef, customRouteMode]);

  return directionsRef;
};


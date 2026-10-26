import React, { useRef, useEffect, useContext, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import mapboxgl from 'mapbox-gl';
import styles from './MapboxNavigation.module.scss';
import { MapContext } from '../context/MapContext';
import { DataContext } from '../context/DataContext';
import { useMapboxMap } from './MapboxMap';
import { useMapboxDirections } from './MapboxDirections';
import { useMapboxUserMarker } from './MapboxUserMarker';
import { useMapboxTouchHandlers } from './MapboxTouchHandlers';

// GPS coordinate precision constant
const GPS_COORDINATE_PRECISION = 100000; // Round to 5 decimal places (~1.1 meter precision)

// GPS configuration - disable browser GPS fallback if flag is set
const DISABLE_BROWSER_GPS_FALLBACK = process.env.REACT_APP_DISABLE_BROWSER_GPS_FALLBACK === 'true';

const MapboxNavigation = forwardRef((props, ref) => {
  // Remove hardcoded origin - will be set dynamically based on current location
  const [origin, setOrigin] = useState(null);
  
  const mapContainerRef = useRef(null);
  const watchIdRef = useRef(null);
  const lastUpdateRef = useRef(null);
  const geolocationTimeoutRef = useRef(null);

  const [followUser, setFollowUser] = useState(true);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState(null);
  const [customRouteMode, setCustomRouteMode] = useState(false);
  const [hasImportedRoute, setHasImportedRoute] = useState(false);
  const [hasInitialCentered, setHasInitialCentered] = useState(false);
  const reCenterTimeoutRef = useRef(null);

  const { mapState, setMapState, locationState, setLocationState, externalGPSActive, gpsDeviceStatus } = useContext(MapContext);
  const { isRiding } = useContext(DataContext);

  // Initialize map
  const mapRef = useMapboxMap(mapContainerRef, mapState, setMapState, setFollowUser, locationState, setLocationError, isRiding);

  // Initialize directions
  const directionsRef = useMapboxDirections(
    mapRef,
    origin,
    setOrigin,
    locationState,
    customRouteMode,
    hasImportedRoute
  );

  // Initialize user marker
  const validateCoordinates = useCallback((coords) => {
    // Always return true to disable validation for testing
    return true;
  }, []);

  const { userMarkerRef, updateMarker, createCustomMarker, cleanup: cleanupMarker } = useMapboxUserMarker(
    mapRef,
    locationState,
    validateCoordinates
  );

  // Initialize touch handlers
  const { setupTouchHandlers, cleanupTouchHandlers } = useMapboxTouchHandlers(mapRef);

  // Setup touch handlers after map is created
  useEffect(() => {
    if (mapRef.current) {
      setupTouchHandlers();
    }
    return () => {
      cleanupTouchHandlers();
      cleanupMarker();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupTouchHandlers, cleanupTouchHandlers, cleanupMarker]);

  // Helper function to round GPS coordinates to reduce precision noise
  const roundGPSCoords = useCallback((coords) => {
    if (!coords || coords.length !== 2) return coords;
    
    // Round to 5 decimal places (~1.1 meter precision)
    // This reduces GPS noise while maintaining reasonable accuracy
    return [
      Math.round(coords[0] * GPS_COORDINATE_PRECISION) / GPS_COORDINATE_PRECISION, // longitude
      Math.round(coords[1] * GPS_COORDINATE_PRECISION) / GPS_COORDINATE_PRECISION  // latitude
    ];
  }, []);

  // Throttled location update to prevent excessive map updates and twitching
  const updateLocationThrottled = useCallback((coords, accuracy, speed, heading, timestamp, source = 'gps') => {
    // Validate coordinates before processing
    if (!validateCoordinates(coords)) {
      return;
    }

    const now = Date.now();
    
    // Increase throttle time to 2 seconds for external GPS to reduce twitching
    const throttleTime = source === 'tester' || source === 'nmea_gps' ? 2000 : 1000;
    
    if (lastUpdateRef.current && (now - lastUpdateRef.current) < throttleTime) {
      return; // Skip if less than throttle time since last update
    }
    lastUpdateRef.current = now;

    // Round coordinates to reduce precision noise
    const roundedCoords = roundGPSCoords(coords);

    setLocationState(prev => ({
      ...prev,
      coords: roundedCoords,
      accuracy: accuracy ?? null,
      speed: typeof speed === 'number' ? speed : null,
      heading: typeof heading === 'number' ? heading : null,
      timestamp,
      permission: 'granted',
      source,
    }));
  }, [validateCoordinates, roundGPSCoords, setLocationState]);

  // Handle resetting map state
  const handleResetMap = useCallback(() => {
    if (!directionsRef.current || !mapRef.current) return;
    
    // Clear any existing routes
    directionsRef.current.removeRoutes();
    
    // Reset custom route mode
    setCustomRouteMode(false);
    
    // Reset imported route flag
    setHasImportedRoute(false);
    
    // Re-enable follow mode when resetting
    setFollowUser(true);
    
    // Helper function to snap camera to coordinates
    const snapCameraToLocation = (coords) => {
      // Set origin to location
      directionsRef.current.setOrigin(coords);
      setOrigin(coords);
      
      // Center camera on location with smooth animation and appropriate zoom
      mapRef.current.easeTo({
        center: coords,
        zoom: 17,
        duration: 1000,
        essential: true // This animation is considered essential and will not be skipped
      });
    };
    
    // Check if we have recent external GPS data (within last 30 seconds)
    const isExternalGPSRecent = externalGPSActive && 
      locationState?.coords && 
      locationState?.timestamp && 
      (Date.now() - new Date(locationState.timestamp).getTime()) < 30000;
    
    if (isExternalGPSRecent) {
      snapCameraToLocation(locationState.coords);
      return;
    }
    
    // If external GPS is not recent or available, try browser GPS (if not disabled)
    if ('geolocation' in navigator && !DISABLE_BROWSER_GPS_FALLBACK) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const freshCoords = [longitude, latitude];
          
          // Update location state with fresh data
          updateLocationThrottled(freshCoords, position.coords.accuracy, position.coords.speed, position.coords.heading, position.timestamp);
          
          // Snap camera to fresh location
          snapCameraToLocation(freshCoords);
          
        },
        (error) => {
          // Fallback to existing location if fresh GPS fails
          if (locationState?.coords) {
            snapCameraToLocation(locationState.coords);
          }
        },
        {
          enableHighAccuracy: true,
          maximumAge: 0, // Force fresh location
          timeout: 10000
        }
      );
    } else if (locationState?.coords) {
      // Fallback if geolocation not available or browser GPS disabled
      snapCameraToLocation(locationState.coords);
    }
  }, [locationState?.coords, locationState?.timestamp, updateLocationThrottled, externalGPSActive, directionsRef, mapRef, setOrigin]);

  // Expose getCoordinates function to parent components
  useImperativeHandle(ref, () => ({
    getCoordinates: () => {
      // Use raw GPS coordinates for maximum precision instead of Mapbox Directions API processed coordinates
      const currentLocation = locationState?.coords;
      
      if (!directionsRef.current || !currentLocation || !Array.isArray(currentLocation) || currentLocation.length < 2) {
        return {
          startLat: 0,
          startLng: 0,
          endLat: 0,
          endLng: 0
        };
      }

      const destination = directionsRef.current.getDestination();
      const endCoords = destination?.geometry?.coordinates || [0, 0];

      // Use raw GPS coordinates for start point to maintain precision
      const coordinates = {
        startLat: currentLocation[1] || 0,  // latitude from raw GPS
        startLng: currentLocation[0] || 0, // longitude from raw GPS
        endLat: endCoords[1] || 0,
        endLng: endCoords[0] || 0
      };
      
      return coordinates;
    },
    setRouteCoordinates: (startCoords, endCoords) => {
      if (!directionsRef.current) {
        console.warn('[MapboxNavigation] Directions not initialized');
        return;
      }
      
      // Set origin and destination in Mapbox Directions
      directionsRef.current.setOrigin(startCoords);
      directionsRef.current.setDestination(endCoords);
      
      // Update origin state
      setOrigin(startCoords);
      
      // Mark that we have an imported route
      setHasImportedRoute(true);
    },
    toggleCustomRouteMode: () => {
      setCustomRouteMode(prev => !prev);
    },
    resetMapState: () => {
      // Use the same logic as handleResetMap for consistency
      handleResetMap();
    }
  }));

  // Geolocation setup - only use browser GPS when external GPS is not active
  useEffect(() => {
    // Skip browser GPS if disabled via config
    if (DISABLE_BROWSER_GPS_FALLBACK) {
      return;
    }
    
    if ('geolocation' in navigator && !watchIdRef.current && !externalGPSActive) {
      // Add a small delay to give external GPS time to connect
      geolocationTimeoutRef.current = setTimeout(() => {
        // Only proceed if external GPS hasn't become active during the delay
        if (!externalGPSActive) {
          setIsLocating(true);
          setLocationError(null);

          // Check permissions
          navigator.permissions?.query?.({ name: 'geolocation' }).then((result) => {
            setLocationState(prev => ({ ...prev, permission: result.state }));
            result.onchange = () => setLocationState(prev => ({ ...prev, permission: result.state }));
          }).catch(() => {});

          // Request immediate location for initial positioning
          navigator.geolocation.getCurrentPosition(
            (position) => {
              const { latitude, longitude, heading, speed, accuracy } = position.coords;
              const coords = [longitude, latitude];
              
              // Validate coordinates before using them
              if (validateCoordinates(coords)) {
                // Set initial origin for directions
                setOrigin(coords);
                
                // Update location state
                updateLocationThrottled(coords, accuracy, speed, heading, position.timestamp, 'gps');
                
                // Center map on current location if it exists
                if (mapRef.current) {
                  mapRef.current.easeTo({
                    center: coords,
                    zoom: Math.max(mapRef.current.getZoom(), 15),
                    duration: 1000
                  });
                }
              } else {
                setLocationError('Invalid location data received');
              }
            },
            (error) => {
              // Only show error if external GPS is not available AND we don't have any GPS data yet
              if (!externalGPSActive && !locationState?.coords) {
                // Provide more helpful error messages for common scenarios
                let errorMessage = 'Location services unavailable';
                if (error.code === error.TIMEOUT) {
                  errorMessage = 'Location timeout - external GPS device preferred';
                } else if (error.code === error.PERMISSION_DENIED) {
                  errorMessage = 'Location permission denied - external GPS device preferred';
                } else if (error.code === error.POSITION_UNAVAILABLE) {
                  errorMessage = 'Location unavailable - external GPS device preferred';
                }
                setLocationError(errorMessage);
              }
              
              // Set fallback origin if geolocation fails
              setOrigin([-96.352449, 30.614839]); // Fallback to College Station
            },
            {
              enableHighAccuracy: true,
              maximumAge: 30000,
              timeout: 10000
            }
          );

          watchIdRef.current = navigator.geolocation.watchPosition(
            (position) => {
              // Don't update if external GPS is now active
              if (externalGPSActive) {
                return;
              }

              const { latitude, longitude, heading, speed, accuracy } = position.coords;
              const coords = [longitude, latitude];
              
              setIsLocating(false);
              setLocationError(null);

              // Only update if accuracy is reasonable (< 50 meters)
              if (!accuracy || accuracy < 50) {
                updateLocationThrottled(coords, accuracy, speed, heading, position.timestamp, 'gps');

                // Update marker
                const roundedCoords = roundGPSCoords(coords);
                const markerSource = locationState?.source === 'tester' ? 'tester' : 'gps';
                updateMarker(roundedCoords, markerSource, true);

                // Auto-follow logic with smoother easing
                // During a ride, always follow the user (even if they dragged away)
                const shouldFollow = followUser || isRiding;
                if (shouldFollow && mapRef.current) {
                  const easeOpts = { 
                    center: roundedCoords,
                    zoom: 17, // Maintain zoom level 17 when following
                    duration: 1000,
                    easing: (t) => t * (2 - t) // Ease-out function for smoother movement
                  };
                  if (typeof heading === 'number' && !Number.isNaN(heading)) {
                    easeOpts.bearing = heading;
                  }
                  mapRef.current.easeTo(easeOpts);
                }
              }
            },
            (error) => {
              // Silently handle geolocation errors
              setIsLocating(false);
              
              // Only show error if external GPS is not available AND we don't have any GPS data yet
              if (!externalGPSActive && !locationState?.coords) {
                // Provide more helpful error messages for common scenarios
                let errorMessage = 'Location services unavailable';
                if (error.code === error.TIMEOUT) {
                  errorMessage = 'Location timeout - external GPS device preferred';
                } else if (error.code === error.PERMISSION_DENIED) {
                  errorMessage = 'Location permission denied - external GPS device preferred';
                } else if (error.code === error.POSITION_UNAVAILABLE) {
                  errorMessage = 'Location unavailable - external GPS device preferred';
                }
                setLocationError(errorMessage);
              }
              
              setLocationState(prev => ({ ...prev, permission: 'denied' }));
            },
            {
              enableHighAccuracy: true,
              maximumAge: 2000,
              timeout: 15000
            }
          );
        }
      }, 2000); // 2 second delay to give external GPS time to connect
    }

    return () => {
      // Clear geolocation timeout
      if (geolocationTimeoutRef.current !== null) {
        clearTimeout(geolocationTimeoutRef.current);
        geolocationTimeoutRef.current = null;
      }
      
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once - intentionally empty array for map initialization

  // External GPS status effect - handle switching between external and browser GPS
  useEffect(() => {
    if (externalGPSActive && watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      setIsLocating(false);
    } else if (!externalGPSActive && !watchIdRef.current && 'geolocation' in navigator && !DISABLE_BROWSER_GPS_FALLBACK) {
      // Restart browser geolocation when external GPS becomes inactive
      setIsLocating(true);
      setLocationError(null);

      // Request immediate location for positioning
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude, heading, speed, accuracy } = position.coords;
          const coords = [longitude, latitude];
          
          // Update location state
          updateLocationThrottled(coords, accuracy, speed, heading, position.timestamp, 'gps');
          
          // Center map on current location
          if (mapRef.current) {
            mapRef.current.easeTo({
              center: coords,
              zoom: Math.max(mapRef.current.getZoom(), 15),
              duration: 1000
            });
          }
        },
        (error) => {
          // Provide more helpful error messages for common scenarios
          let errorMessage = 'Location services unavailable';
          if (error.code === error.TIMEOUT) {
            errorMessage = 'Location timeout - external GPS device preferred';
          } else if (error.code === error.PERMISSION_DENIED) {
            errorMessage = 'Location permission denied - external GPS device preferred';
          } else if (error.code === error.POSITION_UNAVAILABLE) {
            errorMessage = 'Location unavailable - external GPS device preferred';
          }
          setLocationError(errorMessage);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 30000,
          timeout: 10000
        }
      );

      // Start watching position
      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude, heading, speed, accuracy } = position.coords;
          const coords = [longitude, latitude];
          
          setIsLocating(false);
          setLocationError(null);

          // Only update if accuracy is reasonable (< 50 meters)
          if (!accuracy || accuracy < 50) {
            updateLocationThrottled(coords, accuracy, speed, heading, position.timestamp, 'gps');
            updateMarker(coords, 'gps', true);

            // Auto-follow logic
            // During a ride, always follow the user (even if they dragged away)
            const shouldFollow = followUser || isRiding;
            if (shouldFollow && mapRef.current) {
              const easeOpts = { 
                center: coords, 
                zoom: 17, // Maintain zoom level 17 when following
                duration: 800 
              };
              if (typeof heading === 'number' && !Number.isNaN(heading)) {
                easeOpts.bearing = heading;
              }
              mapRef.current.easeTo(easeOpts);
            }
          }
        },
        (error) => {
          setIsLocating(false);
          
          // Provide more helpful error messages for common scenarios
          let errorMessage = 'Location services unavailable';
          if (error.code === error.TIMEOUT) {
            errorMessage = 'Location timeout - external GPS device preferred';
          } else if (error.code === error.PERMISSION_DENIED) {
            errorMessage = 'Location permission denied - external GPS device preferred';
          } else if (error.code === error.POSITION_UNAVAILABLE) {
            errorMessage = 'Location unavailable - external GPS device preferred';
          }
          setLocationError(errorMessage);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 2000,
          timeout: 15000
        }
      );
    } else if (!externalGPSActive && DISABLE_BROWSER_GPS_FALLBACK) {
      // Browser GPS disabled - show clear error message
      setLocationError('External GPS hardware required - browser GPS fallback disabled');
      setIsLocating(false);
    }
  }, [externalGPSActive, updateLocationThrottled, followUser, isRiding, updateMarker, mapRef]);

  // GPS device status effect - handle initial browser GPS when device not available
  useEffect(() => {
    // Skip browser GPS if disabled via config
    if (DISABLE_BROWSER_GPS_FALLBACK) {
      if (!gpsDeviceStatus.deviceInitialized && !externalGPSActive && !locationState?.coords) {
        setLocationError('External GPS hardware required - browser GPS fallback disabled');
        setIsLocating(false);
      }
      return;
    }
    
    // If GPS device is not available/initialized and we don't have location yet, start browser GPS
    if (!gpsDeviceStatus.deviceInitialized && 
        !externalGPSActive && 
        !locationState?.coords && 
        !watchIdRef.current && 
        'geolocation' in navigator) {
      
      setIsLocating(true);
      setLocationError(null);

      // Request immediate location
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude, heading, speed, accuracy } = position.coords;
          const coords = [longitude, latitude];
          
          // Update location state
          updateLocationThrottled(coords, accuracy, speed, heading, position.timestamp, 'gps');
          
          // Center map on current location
          if (mapRef.current) {
            mapRef.current.easeTo({
              center: coords,
              zoom: Math.max(mapRef.current.getZoom(), 15),
              duration: 1000
            });
          }
        },
        (error) => {
          setLocationError(error.message);
          setIsLocating(false);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 30000
        }
      );
    }
  }, [gpsDeviceStatus.deviceInitialized, externalGPSActive, locationState?.coords, updateLocationThrottled, mapRef]);

  // Effect to clear location errors when external GPS becomes active or when we have GPS data
  useEffect(() => {
    if ((externalGPSActive || locationState?.coords) && locationError) {
      setLocationError(null);
    }
  }, [externalGPSActive, locationState?.coords, locationError]);

  // Additional effect to clear errors when GPS device status indicates fallback is working
  useEffect(() => {
    if (!gpsDeviceStatus.deviceInitialized && !externalGPSActive && locationError) {
      setLocationError(null);
    }
  }, [gpsDeviceStatus.deviceInitialized, externalGPSActive, locationError]);

  // Clear errors when GPS device status changes to indicate browser GPS should be used
  useEffect(() => {
    if (gpsDeviceStatus.status === 'device_not_available' || 
        gpsDeviceStatus.status === 'initialization_failed') {
      setLocationError(null);
    }
  }, [gpsDeviceStatus.status]);

  // Effect to automatically center map on initial GPS data arrival
  useEffect(() => {
    // Only run if we haven't done initial centering yet, we have valid coordinates, and the map is ready
    if (hasInitialCentered || !locationState?.coords || !mapRef.current || !directionsRef.current) {
      return;
    }

    const coords = locationState.coords;
    
    // Validate coordinates
    if (!coords || coords.length !== 2 || coords[0] === 0 || coords[1] === 0 || !validateCoordinates(coords)) {
      return;
    }

    // Set the initial origin
    directionsRef.current.setOrigin(coords);
    setOrigin(coords);

    // Center and zoom the map on the initial location
    mapRef.current.easeTo({
      center: coords,
      zoom: 17,
      duration: 1500,
      essential: true
    });

    // Create the user marker
    if (!userMarkerRef.current) {
      const markerColor = locationState.source === 'tester' || locationState.source === 'nmea_gps' ? '#ff6b35' : '#1da1f2';
      const markerElement = createCustomMarker(markerColor);
      userMarkerRef.current = new mapboxgl.Marker({ element: markerElement })
        .setLngLat(coords)
        .addTo(mapRef.current);
    }

    // Mark that we've done the initial centering
    setHasInitialCentered(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationState?.coords, hasInitialCentered, validateCoordinates, locationState?.source, createCustomMarker, directionsRef, mapRef, setOrigin]);

  // Effect to handle external GPS data updates (from GPS device)
  useEffect(() => {
    if (!locationState?.coords || !mapRef.current) return;

    // Only update marker and map position if we have valid coordinates
    const coords = locationState.coords;
    if (coords && coords.length === 2 && coords[0] !== 0 && coords[1] !== 0 && validateCoordinates(coords)) {
      updateMarker(coords, locationState.source);

      // Auto-follow logic for external GPS - use smoother easing
      // During a ride, always follow the user (even if they dragged away)
      const shouldFollow = followUser || isRiding;
      if (shouldFollow) {
        const easeOpts = { 
          center: coords,
          zoom: 17, // Maintain zoom level 17 when following
          duration: 1200, // Slower easing to reduce twitching
          easing: (t) => t * (2 - t) // Ease-out function for smoother movement
        };
        if (typeof locationState.heading === 'number' && !Number.isNaN(locationState.heading)) {
          easeOpts.bearing = locationState.heading;
        }
        mapRef.current.easeTo(easeOpts);
      }
    } else if (coords && !validateCoordinates(coords)) {
      // Silently skip invalid coordinates
    }
  }, [locationState?.coords, locationState?.source, locationState?.heading, followUser, isRiding, validateCoordinates, updateMarker, mapRef]);

  // Effect to re-enable follow when ride starts and after dragging during a ride
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // When ride starts, re-enable follow mode
    if (isRiding && !followUser) {
      setFollowUser(true);
    }

    // When user drags during a ride, re-enable follow after a delay
    const handleDragEnd = () => {
      if (isRiding && !followUser) {
        // Clear any existing timeout
        if (reCenterTimeoutRef.current) {
          clearTimeout(reCenterTimeoutRef.current);
        }
        reCenterTimeoutRef.current = setTimeout(() => {
          if (isRiding) {
            setFollowUser(true);
          }
        }, 2000); // 2 second delay before re-centering
      }
    };

    map.on('dragend', handleDragEnd);
    map.on('zoomend', handleDragEnd);
    map.on('rotateend', handleDragEnd);
    map.on('pitchend', handleDragEnd);

    return () => {
      if (reCenterTimeoutRef.current) {
        clearTimeout(reCenterTimeoutRef.current);
      }
      map.off('dragend', handleDragEnd);
      map.off('zoomend', handleDragEnd);
      map.off('rotateend', handleDragEnd);
      map.off('pitchend', handleDragEnd);
    };
  }, [isRiding, followUser, mapRef, setFollowUser]);

  // Consolidated location button handler - only centers camera on user without affecting routes
  const handleSmartLocation = useCallback(() => {
    if (isLocating) return;
    
    // If we have current location, just center the camera (don't touch directions/routes)
    if (locationState?.coords && mapRef.current) {
      // Check if we're already centered on the user AND at the correct zoom level
      const currentCenter = mapRef.current.getCenter();
      const currentZoom = mapRef.current.getZoom();
      const distance = Math.sqrt(
        Math.pow(currentCenter.lng - locationState.coords[0], 2) +
        Math.pow(currentCenter.lat - locationState.coords[1], 2)
      );
      
      // If already centered AND at zoom 17 or higher, do nothing
      if (distance < 0.0001 && currentZoom >= 16.9) {
        return;
      }
      
      // Center map on current location with smooth animation AND zoom to 17
      // This ensures both centering and zooming happen
      mapRef.current.easeTo({
        center: locationState.coords,
        zoom: 17,
        duration: 1000,
        essential: true // This animation is considered essential and will not be skipped
      });
      
      // Re-enable follow mode when using location button
      setFollowUser(true);
    } else if (!locationState?.coords && 'geolocation' in navigator && !DISABLE_BROWSER_GPS_FALLBACK) {
      // Request location if not available
      setIsLocating(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const coords = [longitude, latitude];
          
          // Update location state
          updateLocationThrottled(coords, position.coords.accuracy, position.coords.speed, position.coords.heading, position.timestamp);
          
          // Center map on location (don't set origin to avoid auto-fitting route)
          if (mapRef.current) {
            mapRef.current.easeTo({
              center: coords,
              zoom: 17,
              duration: 1000,
              essential: true
            });
          }
          
          // Re-enable follow mode
          setFollowUser(true);
          
          setIsLocating(false);
        },
        (error) => {
          setLocationError(error.message);
          setIsLocating(false);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 30000,
          timeout: 10000
        }
      );
    } else if (!locationState?.coords && DISABLE_BROWSER_GPS_FALLBACK) {
      setLocationError('External GPS hardware required - browser GPS fallback disabled');
      setIsLocating(false);
    }
  }, [locationState?.coords, updateLocationThrottled, isLocating, mapRef]);

  return (
    <div ref={mapContainerRef} className={styles.mapWrapper}>
      <button
        type="button"
        onClick={handleSmartLocation}
        className={styles.smartLocationBtn}
        disabled={isLocating}
        title={isLocating ? "Locating..." : (locationState?.coords ? "Center camera on my location" : "Get my location")}
        aria-label={isLocating ? "Locating..." : (locationState?.coords ? "Center camera on my location" : "Get my location")}
      />
      
      <button
        type="button"
        onClick={() => {
          if (customRouteMode) {
            // When exiting custom route mode, clear the route completely
            if (directionsRef.current) {
              directionsRef.current.removeRoutes();
              setHasImportedRoute(false);
            }
            
            // Snap camera back to current location using the same logic as reset
            if (locationState?.coords && mapRef.current) {
              mapRef.current.setCenter(locationState.coords);
              mapRef.current.setZoom(Math.max(mapRef.current.getZoom(), 15));
            }
          }
          setCustomRouteMode(prev => !prev);
        }}
        className={`${styles.customRouteBtn} ${customRouteMode ? styles.active : ''}`}
        title={customRouteMode ? "Exit custom route mode and clear route" : "Enable custom route mode"}
        aria-label={customRouteMode ? "Exit custom route mode and clear route" : "Enable custom route mode"}
      >
        {customRouteMode ? "Exit Route" : "Custom Route"}
      </button>
      
      <button
        type="button"
        onClick={handleResetMap}
        className={styles.refreshBtn}
        title="Reset map to default state"
        aria-label="Reset map to default state"
      >
        Refresh
      </button>
      
      {locationError && !externalGPSActive && !locationState?.coords && !isLocating && (
        <div className={styles.errorMessage}>
          {locationError}
        </div>
      )}
      
      {isLocating && (
        <div className={styles.loadingMessage}>
          Getting your location...
        </div>
      )}
      
      {!locationState?.coords && !isLocating && !locationError && (
        <div className={styles.promptMessage}>
          Click the location button to get your current position
        </div>
      )}
      
      {locationState?.coords && (
        <div className={styles.gpsStatus}>
          <div className={styles.coordinatesInfo}>
            <div className={styles.coordItem}>
              <div className={styles.coordLabel}>Latitude:</div>
              <div className={styles.coordValue}>{locationState.coords[1]?.toFixed(2) || 'N/A'}</div>
            </div>
            <div className={styles.coordItem}>
              <div className={styles.coordLabel}>Longitude:</div>
              <div className={styles.coordValue}>{locationState.coords[0]?.toFixed(2) || 'N/A'}</div>
            </div>
            {locationState.accuracy && (
              <div className={styles.coordItem}>
                <div className={styles.coordLabel}>Accuracy:</div>
                <div className={styles.coordValue}>{Math.round(locationState.accuracy)}m</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

export default MapboxNavigation;

//import React, { createContext, useState } from 'react';
import React, { createContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

export const DataContext = createContext();

export const DataProvider = ({ children, socket }) => {
  // frontend ride state
  const [isRiding, setIsRiding] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [resetRequested, setResetRequested] = useState(false);
  
  // User authentication
  const { user, session } = useAuth();
  
  // helpers
  const requestReset = () => setResetRequested(true);
  const clearReset = () => setResetRequested(false);
  
  // listen once the socket arrives
  useEffect(() => {
    if (!socket) return;
    const handleRideEnded = (msg) => {
      // msg is a JSON string the server sent ({reason, finalTime, finalDistance})
      setIsRiding(false);// allow Start‑Ride to be clicked just once
      setIsPaused(false);
      requestReset();// tell widgets to zero‑out
    };
    socket.on('rideEnded', handleRideEnded);
    return () => socket.off('rideEnded', handleRideEnded);
  }, [socket]);
  
  
  // ride control actions
  const startRide = (socket, coordinates = { startLat: 0, startLng: 0, endLat: 0, endLng: 0 }) => {
    if (isRiding) return;// for ignoring double‑clicks
    setIsRiding(true);
    setIsPaused(false);
    clearReset();
    
    // Send user ID and access token so the server can verify who is saving the ride
    const rideData = {
      ...coordinates,
      userId: user?.id || null,
      accessToken: session?.access_token || null
    };
    
    socket.emit('startRide', rideData);
  };

  const stopRide = (socket, stats /* { elapsed, distance } */) => {
    if (!isRiding) return;
    setIsRiding(false);
    setIsPaused(false);
    requestReset();// tell the widgets to zero‑out
    socket.emit('stopRide', stats);
  };

  const togglePause = (socket) => {
    if (!isRiding) return;// can't pause if not riding
    setIsPaused(prev => {
      const next = !prev;
      socket.emit(next ? 'pauseRide' : 'resumeRide');
      return next;
    });
  };

  const importRide = (socket, mapboxRef) => {
    // Listen for the route import response
    const handleRouteImport = (routeData) => {
      if (routeData && routeData.route_geojson && routeData.route_geojson.coordinates) {
        const coordinates = routeData.route_geojson.coordinates;
        
        // Add proper validation for coordinates array
        if (Array.isArray(coordinates) && coordinates.length >= 2) {
          const startCoords = coordinates[0];
          const endCoords = coordinates[coordinates.length - 1];
          
          // Additional validation for coordinate values
          if (startCoords && endCoords && 
              Array.isArray(startCoords) && Array.isArray(endCoords) &&
              startCoords.length >= 2 && endCoords.length >= 2) {
            
            // Set coordinates in MapboxNavigation
            if (mapboxRef?.current?.setRouteCoordinates) {
              mapboxRef.current.setRouteCoordinates(startCoords, endCoords);
            } else {
              console.warn('[DataContext] MapboxNavigation setRouteCoordinates method not available');
            }
          } else {
            console.warn('[DataContext] Invalid coordinate format in route data');
          }
        } else {
          console.warn('[DataContext] Route data does not have enough coordinates or is not an array');
        }
      } else {
        console.warn('[DataContext] Invalid route data received');
      }
      
      // Remove the listener after handling the response
      socket.off('routeImported', handleRouteImport);
    };
    
    // Set up the listener
    socket.on('routeImported', handleRouteImport);
    
    // Request route import from server
    socket.emit('importRoute', { accessToken: session?.access_token || null });
  };
  
  return (
    <DataContext.Provider
      value={{
        /* state */
        isRiding,
        isPaused,
        resetRequested,

        /* actions */
        startRide,
        stopRide,
        togglePause,
        importRide,
        clearReset,
      }}
    >
      {children}
    </DataContext.Provider>
  );
};
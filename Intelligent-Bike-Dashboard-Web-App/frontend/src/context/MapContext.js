import React, { createContext, useState, useEffect } from 'react';

export const MapContext = createContext();

export function MapProvider({ children, socket }) {
  // Initial defaults (use whatever values make sense, or read from .env, etc.)
  const [mapState, setMapState] = useState({
    center: [-122.4194, 37.7749], // [lng, lat]
    zoom: 12,
    bearing: 0,
    pitch: 0,
  });

  // NEW: global live location state for the whole app
  const [locationState, setLocationState] = useState({ // NEW
    coords: null,             // [lng, lat] | null
    accuracy: null,           // meters
    speed: null,              // m/s
    heading: null,            // degrees
    timestamp: null,          // ms epoch
    permission: 'prompt',     // 'granted' | 'denied' | 'prompt'
    source: 'gps',            // 'gps' | 'sim' | 'mock' | 'tester'
  }); // NEW

  // External GPS status tracking
  const [externalGPSActive, setExternalGPSActive] = useState(false);
  const [gpsDeviceStatus, setGpsDeviceStatus] = useState({
    status: 'unknown',
    deviceAvailable: false,
    deviceInitialized: false,
    hasFix: false, // Track whether GPS module has a valid fix
    message: 'Checking GPS status...'
  });

  // Listen for GPS data from server (from comprehensive tester)
  useEffect(() => {
    if (!socket) return;

    const handleGPSData = (gpsData) => {
      // Check if GPS module has a valid fix before accepting the data
      // If fix_status is 'invalid', don't update location - let browser GPS take over
      if (gpsData.fix_status && gpsData.fix_status === 'invalid') {
        // Mark external GPS as not active so browser GPS can take over
        setExternalGPSActive(false);
        setGpsDeviceStatus(prev => ({
          ...prev,
          hasFix: false,
          message: 'GPS device connected but waiting for fix...'
        }));
        return;
      }
      
      // GPS has valid fix - use this data and mark external GPS as active
      setExternalGPSActive(true);
      setGpsDeviceStatus(prev => ({
        ...prev,
        hasFix: true,
        message: 'GPS device active with valid fix'
      }));
      
      // Update location state with GPS data from comprehensive tester
      setLocationState(prev => ({
        ...prev,
        coords: gpsData.coords,
        accuracy: gpsData.accuracy,
        speed: gpsData.speed,
        heading: gpsData.heading,
        timestamp: gpsData.timestamp,
        permission: 'granted',
        source: gpsData.source || 'tester',
      }));
    };

    const handleExternalGPSStatus = (status) => {
      setExternalGPSActive(status.active);
      
      // If external GPS becomes inactive, we can fall back to browser GPS
      if (!status.active && (locationState.source === 'tester' || locationState.source === 'nmea_gps')) {
        // Reset location source to allow browser GPS to take over
        setLocationState(prev => ({
          ...prev,
          source: 'gps'
        }));
      }
    };

    const handleGPSStatus = (status) => {
      setGpsDeviceStatus({
        status: status.status,
        deviceAvailable: status.deviceAvailable || false,
        deviceInitialized: status.deviceInitialized || false,
        message: status.message || 'GPS status unknown'
      });
      
      // If GPS device is not available or not initialized, ensure we're using browser GPS
      if (!status.deviceInitialized && !status.deviceAvailable) {
        setLocationState(prev => ({
          ...prev,
          source: 'gps'
        }));
      }
    };

    socket.on('gpsData', handleGPSData);
    socket.on('externalGPSStatus', handleExternalGPSStatus);
    socket.on('gpsStatus', handleGPSStatus);
    
    return () => {
      socket.off('gpsData', handleGPSData);
      socket.off('externalGPSStatus', handleExternalGPSStatus);
      socket.off('gpsStatus', handleGPSStatus);
    };
  }, [socket, locationState.source]);

  return (
    <MapContext.Provider value={{ 
        mapState, 
        setMapState,
        locationState,     // NEW
        setLocationState,  // NEW
        externalGPSActive, // NEW
        setExternalGPSActive, // NEW
        gpsDeviceStatus,   // NEW
        setGpsDeviceStatus, // NEW
      }}>
      
      {children}
    </MapContext.Provider>
  );
}

// Express + Socket.io server for the dashboard

const path = require('path');

// Load environment variables from .env file in parent directory
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const { Server } = require('socket.io');
const fs = require('fs');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const GPSHandler = require('./gps-handler');
const ultrasonicSensor = require('./ultrasonic-sensor');
const {
  GPS_CONFIG,
  RIDE_CONFIG,
  EXTERNAL_GPS_CONFIG,
  SUPABASE_CONFIG,
  DISTANCE_CONFIG,
  TIME_CONFIG,
  SERVER_CONFIG,
  UNIT_CONVERSIONS,
  ULTRASONIC_CONFIG
} = require('./constants');

// Express app setup
const app = express();
const PORT = process.env.PORT || SERVER_CONFIG.DEFAULT_PORT;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || SERVER_CONFIG.DEFAULT_FRONTEND_URL,
  credentials: true
}));
app.use(express.json());

// Serve static files from frontend build
app.use(express.static(path.join(__dirname, '../frontend/build')));

// Supabase configuration with robust error handling
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

let supabase = null;
let supabaseConnectionStatus = 'disconnected';

// Per-user Supabase access tokens (memory only) so writes go through RLS
const userAccessTokens = new Map();

// Read the "role" claim from a Supabase key/JWT without verifying it
function getJwtRole(jwt) {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
    return payload.role || null;
  } catch {
    return null;
  }
}

const isPlaceholder = (value) => !value || /your[_-]|placeholder/i.test(value);

// Create a Supabase client that acts as the signed-in user instead of the anonymous key
function getUserScopedClient(accessToken) {
  return createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

// Confirm an access token is valid and belongs to the expected user
async function verifyAccessToken(accessToken, expectedUserId = null) {
  if (!supabase || !accessToken) return null;
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data?.user) return null;
  if (expectedUserId && data.user.id !== expectedUserId) return null;
  return data.user;
}

if (getJwtRole(supabaseKey) === 'service_role') {
  // The service_role key bypasses Row Level Security and must never be used by this app
  console.error('REFUSING to start Supabase: REACT_APP_SUPABASE_ANON_KEY is a service_role key. Use the anon (public) key.');
  supabaseConnectionStatus = 'error';
} else if (!isPlaceholder(supabaseUrl) && !isPlaceholder(supabaseKey)) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('Supabase client initialized successfully');
    supabaseConnectionStatus = 'connected';
  } catch (error) {
    console.error('Failed to initialize Supabase client:', error.message);
    supabaseConnectionStatus = 'error';
  }
} else {
  supabaseConnectionStatus = 'not_configured';
}

// REACT_APP_ vars ship in the frontend bundle, so never use an sk. token
if ((process.env.REACT_APP_MAPBOX_TOKEN || '').startsWith('sk.')) {
  console.warn('WARNING: REACT_APP_MAPBOX_TOKEN is a secret (sk.) token. Use a public (pk.) token restricted to your URLs.');
}




// Socket.io setup with Express server
const server = require('http').createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || SERVER_CONFIG.DEFAULT_FRONTEND_URL,
    methods: ['GET', 'POST']
  }
});

const STORAGE_FILE_PATH = path.join(__dirname, 'data/local_data_storage.json');
const RIDE_DATA_FILE_PATH = path.join(__dirname, 'data/ride_data.json');

// ----- broadcast‑lifecycle state ------------------------------------------------
let isBroadcasting = false;
let isPaused = false;
let broadcastInterval = null;
const STALE_THRESHOLD = RIDE_CONFIG.STALE_THRESHOLD_SECONDS;
let staleTicks = 0; //counts consecutive seconds with no new data

// ride statistics that persist while broadcasting
let elapsedSeconds = 0; //HH:MM:SS timer
let totalDistance = 0; //miles (calculated from GPS coordinates)
let lastGPSPosition = null; //last GPS position for distance calculation
let lastGPSTimestamp = null; //last GPS timestamp for speed calculation

// "fresh‑data" tracking
let lastDataTimestamp = null; //timestamp field of most‑recent JSON row
let currentSpeed = 0; //last non‑paused speed (mph)
let currentProximity = 0; //last proximity alert code

const AUTO_STOP_THRESHOLD = RIDE_CONFIG.AUTO_STOP_THRESHOLD_SECONDS;
let noSpeedSeconds = 0; //counts consecutive seconds of NO speed change
let lastSpeedForAuto = null; //tracks previous speed to detect changes

// ----- ride data tracking ------------------------------------------------
let currentRideData = null;
let rideCoordinates = [];
let rideStartTime = null;
let currentUserId = null;

// ----- external GPS tracking ------------------------------------------------
let externalGPSActive = false;
let lastExternalGPSTimestamp = null;
const EXTERNAL_GPS_TIMEOUT = EXTERNAL_GPS_CONFIG.TIMEOUT_MS;
let gpsDeviceAvailable = false; // Track if GPS device is physically available
let gpsDeviceInitialized = false; // Track if GPS handler was successfully initialized

// ----- UBX GPS handler ------------------------------------------------
let gpsHandler = null;

// ----- Ultrasonic Sensor tracking ------------------------------------------------
let ultrasonicSensorActive = false; // Track if sensor is actively sending data
let lastUltrasonicTimestamp = null; // Timestamp of last sensor reading

// ---------- Helpers ----------------------------------------------------
// Check if external GPS is still active (within timeout)
function isExternalGPSActive() {
  if (!lastExternalGPSTimestamp) return false;
  const now = Date.now();
  return (now - lastExternalGPSTimestamp) < EXTERNAL_GPS_CONFIG.TIMEOUT_MS;
}

// Initialize GPS handler with proper fallback
async function initializeGPSHandler() {
  const gpsdHost = process.env.GPSD_HOST || GPS_CONFIG.DEFAULT_HOST;
  const gpsdPort = parseInt(process.env.GPSD_PORT) || GPS_CONFIG.DEFAULT_PORT;
  
  if (process.env.ENABLE_GPS !== 'true') {
    gpsDeviceAvailable = false;
    gpsDeviceInitialized = false;
    return;
  }

  try {
    gpsHandler = new GPSHandler({ io, handleGPSUpdate }, {
      host: gpsdHost,
      port: gpsdPort,
      maxReconnectAttempts: GPS_CONFIG.MAX_RECONNECT_ATTEMPTS,
      reconnectDelay: GPS_CONFIG.RECONNECT_DELAY_MS
    });
    
    // Start GPS handler
    await gpsHandler.start();
    gpsDeviceInitialized = true;
    gpsDeviceAvailable = true;
    console.log('GPS handler initialized successfully');
    
  } catch (error) {
    console.error('Failed to initialize GPS handler:', error.message);
    gpsDeviceInitialized = false;
    gpsDeviceAvailable = false;
    
    // Broadcast GPS status to all clients
    io.emit('gpsStatus', {
      status: 'initialization_failed',
      source: 'gpsd',
      error: error.message,
      message: 'GPSD connection failed - using browser GPS',
      timestamp: new Date().toISOString()
    });
  }
}

// Initialize HC-SR04 ultrasonic sensor for proximity detection
async function initializeUltrasonicSensor() {
  // Check if ultrasonic sensor should be enabled
  if (process.env.ENABLE_ULTRASONIC !== 'true') {
    return;
  }

  try {
    // Configure sensor with custom thresholds from environment or defaults
    const sensorConfig = {
      thresholds: {
        critical: parseInt(process.env.ULTRASONIC_CRITICAL_DISTANCE) || 50,  // 50cm
        warning: parseInt(process.env.ULTRASONIC_WARNING_DISTANCE) || 100,   // 100cm
        safe: parseInt(process.env.ULTRASONIC_SAFE_DISTANCE) || 200          // 200cm
      }
    };
    
    // Initialize sensor
    await ultrasonicSensor.initialize(sensorConfig);
    ultrasonicSensorActive = true;
    
    // Set up event listener for distance updates
    ultrasonicSensor.on('distance', (data) => {
      // Update timestamp to track sensor health
      lastUltrasonicTimestamp = Date.now();
      
      // Mark sensor as active when we receive data
      if (!ultrasonicSensorActive) {
        ultrasonicSensorActive = true;
        console.log('[UltrasonicSensor] Sensor back online');
      }
      
      // Update currentProximity based on alert level
      const previousProximity = currentProximity;
      
      if (data.alertLevel > 0) {
        currentProximity = 1; // Front proximity alert
      } else {
        currentProximity = 0; // Clear alert
      }
      
      // Broadcast immediate proximity update to all clients
      io.emit('proximityUpdate', {
        alertLevel: data.alertLevel,
        distance: data.distance,
        timestamp: data.timestamp,
        sensorActive: true
      });
    });
    
  } catch (error) {
    console.error('[UltrasonicSensor] Failed to initialize:', error.message);
  }
}

//Return only the most‑recent row of the JSON storage file
function getLatestData() {
  try {
    // Check if file exists and has content
    if (!fs.existsSync(STORAGE_FILE_PATH)) {
      return null;
    }
    
    const raw = fs.readFileSync(STORAGE_FILE_PATH, 'utf8');
    
    // Check if file is empty
    if (!raw.trim()) {
      return null;
    }
    
    const dataList = JSON.parse(raw);
    if (!Array.isArray(dataList) || dataList.length === 0) {
      return null;
    }
    return dataList[dataList.length - 1];
  } catch (err) {
    console.error('Error reading or parsing local_data_storage.json:', err);
    // Try to fix the file by creating a new empty array
    try {
      fs.writeFileSync(STORAGE_FILE_PATH, '[]');
    } catch (writeErr) {
      console.error('Failed to fix data file:', writeErr);
    }
    return null;
  }
}

// Save ride data to local JSON file
async function saveRideDataToFile(rideData) {
  try {
    // Ensure data directory exists
    const dataDir = path.dirname(RIDE_DATA_FILE_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Read existing rides or create new array
    let rides = [];
    try {
      const existingData = fs.readFileSync(RIDE_DATA_FILE_PATH, 'utf8');
      rides = JSON.parse(existingData);
    } catch (err) {
      // File doesn't exist yet, start fresh
    }

    // Add new ride data
    rides.push(rideData);

    // Write back to file
    fs.writeFileSync(RIDE_DATA_FILE_PATH, JSON.stringify(rides, null, 2));

    // Attempt to sync to Supabase immediately
    console.log(`Attempting to sync ride ${rideData.id} to Supabase...`);
    console.log(`Ride data: userId=${rideData.userId}, distance=${rideData.distance}, duration=${rideData.duration}`);
    const synced = await syncRideToSupabase(rideData);
    if (synced) {
      console.log(`Ride ${rideData.id} successfully synced to Supabase`);
      // Update the file to mark as synced
      const updatedRides = rides.map(ride => 
        ride.id === rideData.id 
          ? { ...ride, syncedToSupabase: true, syncedAt: new Date().toISOString() }
          : ride
      );
      fs.writeFileSync(RIDE_DATA_FILE_PATH, JSON.stringify(updatedRides, null, 2));
    } else {
      console.error(`Failed to sync ride ${rideData.id} to Supabase. Check logs above for details.`);
    }
  } catch (error) {
    console.error('Error saving ride data to file:', error);
  }
}

// Create GeoJSON LineString from coordinates
function createGeoJSONLineString(coordinates) {
  return {
    type: "LineString",
    coordinates: coordinates
  };
}

// Convert seconds to minutes
function secondsToMinutes(seconds) {
  return parseFloat((seconds / TIME_CONFIG.SECONDS_PER_MINUTE).toFixed(TIME_CONFIG.SECONDS_TO_MINUTES_PRECISION));
}

// Generate unique ride ID
function generateRideId() {
  return 'ride_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Calculate distance between two GPS coordinates using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = DISTANCE_CONFIG.EARTH_RADIUS_MILES;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Helper function to validate route coordinates
// Returns false if coordinates are invalid (all zeros or start equals end)
function isValidRouteCoordinates(startLng, startLat, endLng, endLat) {
  // Check if all coordinates are (0,0,0,0)
  if (startLng === 0 && startLat === 0 && endLng === 0 && endLat === 0) {
    return false;
  }
  
  // Check if start and end are the same
  if (startLng === endLng && startLat === endLat) {
    return false;
  }
  
  return true;
}

// Fetch a route from Mapbox Directions, returns { route, rawData } or null
async function fetchMapboxRouteData(startLng, startLat, endLng, endLat) {
  try {
    const mapboxToken = process.env.REACT_APP_MAPBOX_TOKEN;
    if (!mapboxToken) {
      return null; // Let calling function handle logging and fallback
    }

    // Skip if coordinates are invalid
    if (!isValidRouteCoordinates(startLng, startLat, endLng, endLat)) {
      return null;
    }

    const url = `https://api.mapbox.com/directions/v5/mapbox/cycling/${startLng},${startLat};${endLng},${endLat}?geometries=geojson&access_token=${mapboxToken}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Mapbox API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.routes || data.routes.length === 0) {
      return null;
    }
    
    return {
      route: data.routes[0],
      rawData: data
    };
    
  } catch (error) {
    // Error will be logged by calling function if needed
    return null;
  }
}

// Calculate route distance using Mapbox Directions API
async function calculateRouteDistance(startLng, startLat, endLng, endLat) {
  try {
    const mapboxToken = process.env.REACT_APP_MAPBOX_TOKEN;
    if (!mapboxToken) {
      return calculateDistance(startLat, startLng, endLat, endLng);
    }

    // Skip if coordinates are invalid
    if (!isValidRouteCoordinates(startLng, startLat, endLng, endLat)) {
      return 0;
    }
    
    const routeData = await fetchMapboxRouteData(startLng, startLat, endLng, endLat);
    
    if (!routeData) {
      return calculateDistance(startLat, startLng, endLat, endLng);
    }
    
    // Get distance from first route (most optimal)
    const distanceMeters = routeData.route.distance;
    const distanceMiles = distanceMeters * DISTANCE_CONFIG.METERS_TO_MILES;
    
    return distanceMiles;
    
  } catch (error) {
    console.error('Error calculating route distance with Mapbox:', error.message);
    return calculateDistance(startLat, startLng, endLat, endLng);
  }
}

// Get route data from Mapbox Directions API including full geometry
async function getMapboxRoute(startLng, startLat, endLng, endLat) {
  try {
    const mapboxToken = process.env.REACT_APP_MAPBOX_TOKEN;
    if (!mapboxToken) {
      return null;
    }

    // Skip if coordinates are invalid
    if (!isValidRouteCoordinates(startLng, startLat, endLng, endLat)) {
      return null;
    }
    
    const routeData = await fetchMapboxRouteData(startLng, startLat, endLng, endLat);
    
    if (!routeData) {
      return null;
    }
    
    const route = routeData.route;
    const distanceMeters = route.distance;
    const distanceMiles = distanceMeters * DISTANCE_CONFIG.METERS_TO_MILES;
    const geometry = route.geometry; // This contains the full route with all waypoints
    
    return {
      distance: distanceMiles,
      geometry: geometry // GeoJSON LineString with all route coordinates
    };
    
  } catch (error) {
    console.error('Error fetching route from Mapbox:', error.message);
    return null;
  }
}

// Calculate speed from GPS coordinates and timestamps
function calculateSpeed(lat1, lon1, lat2, lon2, timeDiffSeconds) {
  if (timeDiffSeconds <= 0) return 0;
  
  const distance = calculateDistance(lat1, lon1, lat2, lon2);
  const speedMph = (distance / timeDiffSeconds) * TIME_CONFIG.SECONDS_PER_HOUR; // Convert to mph
  return Math.max(0, speedMph); // Ensure non-negative speed
}

// Process GPS data and update ride statistics
function processGPSData(gpsData) {
  if (!gpsData.coords || !Array.isArray(gpsData.coords) || gpsData.coords.length < 2) {
    return null;
  }

  // Extract coordinates from GPS data
  let [lng, lat] = gpsData.coords;
  const timestamp = gpsData.timestamp ? new Date(gpsData.timestamp).getTime() : Date.now();
  
  // Skip invalid coordinates
  if (lng === 0 && lat === 0) return null;
  
  let distanceIncrement = 0;
  let calculatedSpeed = 0;
  
  if (lastGPSPosition && lastGPSTimestamp) {
    const timeDiffSeconds = (timestamp - lastGPSTimestamp) / UNIT_CONVERSIONS.MS_TO_SECONDS;
    
    // Calculate distance increment
    distanceIncrement = calculateDistance(
      lastGPSPosition.lat, 
      lastGPSPosition.lng, 
      lat, 
      lng
    );
    
    // Calculate speed
    calculatedSpeed = calculateSpeed(
      lastGPSPosition.lat, 
      lastGPSPosition.lng, 
      lat, 
      lng, 
      timeDiffSeconds
    );
    
    // Skip tiny jumps from GPS noise
    if (distanceIncrement < RIDE_CONFIG.GPS_NOISE_FILTER_THRESHOLD_MILES) {
      totalDistance += distanceIncrement;
    }
  }
  
  // Update tracking variables
  lastGPSPosition = { lat, lng };
  lastGPSTimestamp = timestamp;
  
  return {
    distanceIncrement,
    calculatedSpeed,
    position: { lat, lng }
  };
}

// Process a GPS fix, update ride stats, and broadcast it to clients
function processAndBroadcastGPSData(gpsData, options = {}) {
  const {
    source = 'gps',
    requireBroadcasting = false,
    updateRideData = true,
    checkBroadcastingForRideData = false,
    includeSourceInStatus = false,
    useISOTimestamp = false
  } = options;

  // Early return if broadcasting is required but not active
  if (requireBroadcasting && (!isBroadcasting || !currentRideData)) {
    return;
  }

  try {
    // Process GPS data and calculate metrics
    const gpsResult = processGPSData(gpsData);
    
    if (!gpsResult) return;
    
    const { calculatedSpeed, position } = gpsResult;
    
    // Determine if we should update ride data
    let shouldUpdateRideData = updateRideData;
    if (checkBroadcastingForRideData) {
      shouldUpdateRideData = updateRideData && isBroadcasting;
    }
    
    if (shouldUpdateRideData) {
      currentSpeed = calculatedSpeed;
      rideCoordinates.push([position.lng, position.lat]);
    }
    
    // Update external GPS tracking
    externalGPSActive = true;
    lastExternalGPSTimestamp = Date.now();
    
    // Broadcast GPS data to all connected clients for real-time navigation updates
    io.emit('gpsData', {
      coords: [position.lng, position.lat],
      timestamp: gpsData.timestamp || new Date().toISOString(),
      accuracy: gpsData.accuracy || null,
      vertical_accuracy: gpsData.vertical_accuracy || null,
      speed: calculatedSpeed,
      heading: gpsData.heading || null,
      heading_accuracy: gpsData.heading_accuracy || null,
      fix_type: gpsData.fix_type || null,
      fix_status: gpsData.fix_status || null,
      satellites: gpsData.satellites || null,
      hdop: gpsData.hdop || null,
      vdop: gpsData.vdop || null,
      pdop: gpsData.pdop || null,
      altitude: gpsData.altitude || null,
      ground_speed: gpsData.ground_speed || null,
      source: gpsData.source || source,
      message_type: gpsData.message_type || null,
      externalGPSActive: true
    });
    
    // Build external GPS status payload
    const statusPayload = {
      active: true
    };
    
    // Set timestamp based on option (preserve existing behavior)
    if (useISOTimestamp) {
      statusPayload.timestamp = new Date().toISOString();
    } else {
      statusPayload.timestamp = lastExternalGPSTimestamp;
    }
    
    if (includeSourceInStatus) {
      statusPayload.source = gpsData.source || source;
    }
    
    // Broadcast external GPS status to all clients
    io.emit('externalGPSStatus', statusPayload);
    
  } catch (error) {
    const errorContext = source === 'hardware_gps' 
      ? 'hardware GPS data' 
      : 'GPS update';
    console.error(`Error processing ${errorContext}:`, error.message || error);
  }
}

// Handle GPS data from UBX parser (called by GPS handler)
function handleGPSUpdate(gpsData) {
  // Always process GPS data, not just during rides
  processAndBroadcastGPSData(gpsData, {
    source: 'hardware_gps',
    requireBroadcasting: false,  // Always process
    updateRideData: true,         // Update ride data
    checkBroadcastingForRideData: true,  // But only if broadcasting
    includeSourceInStatus: true,  // Include source for hardware GPS
    useISOTimestamp: true         // Use ISO string (preserve existing behavior)
  });
}

// Sync ride data to Supabase database with robust error handling
async function syncRideToSupabase(rideData) {
  try {
    // Check if Supabase is available
    if (!supabase) {
      console.error('Cannot sync ride to Supabase: Supabase client not initialized');
      return false;
    }

    // Check connection status
    if (supabaseConnectionStatus !== 'connected') {
      console.error(`Cannot sync ride to Supabase: Connection status is '${supabaseConnectionStatus}' (expected 'connected')`);
      return false;
    }

    // Only sync if user ID is available
    if (!rideData.userId) {
      console.error('Cannot sync ride to Supabase: No user ID in ride data. User may not be logged in.');
      return false;
    }

    // Ensure we always have a valid GeoJSON for the database
    let routeGeojson = rideData.routeGeojson;
    
    // If no GeoJSON exists, create a minimal one with start/end coordinates
    if (!routeGeojson) {
      const minimalCoordinates = [];
      
      // Add start coordinates if available
      if (rideData.startCoordinates && rideData.startCoordinates.length === 2) {
        minimalCoordinates.push(rideData.startCoordinates);
      }
      
      // Add end coordinates if available and different from start
      if (rideData.endCoordinates && rideData.endCoordinates.length === 2) {
        const [startLng, startLat] = rideData.startCoordinates || [0, 0];
        const [endLng, endLat] = rideData.endCoordinates;
        
        // Only add end coordinates if they're different from start coordinates
        if (startLng !== endLng || startLat !== endLat) {
          minimalCoordinates.push(rideData.endCoordinates);
        }
      }
      
      // Create minimal GeoJSON if we have coordinates
      if (minimalCoordinates.length > 0) {
        routeGeojson = createGeoJSONLineString(minimalCoordinates);
      } else {
        // If no coordinates at all, create a default GeoJSON with [0,0]
        routeGeojson = createGeoJSONLineString([[0, 0]]);
      }
    }

    // Validate and format data before sending to Supabase
    // Distance is already in miles (from GPS calculations), ensure decimal format
    // Ensure distance is a valid number (default to 0 if undefined/null)
    const distanceValue = rideData.distance ?? 0;
    const formattedDistance = parseFloat(distanceValue.toFixed(6));
    // Stored in minutes
    const durationValue = rideData.duration ?? 0;
    const durationMinutes = secondsToMinutes(durationValue);
    
    // Validate data types
    if (isNaN(formattedDistance) || formattedDistance < 0) {
      console.error('Invalid distance value:', rideData.distance);
      return false;
    }
    
    if (isNaN(durationMinutes) || durationMinutes < 0) {
      console.error('Invalid duration value:', rideData.duration);
      return false;
    }

    // Validate GeoJSON format
    if (routeGeojson) {
      if (!routeGeojson.type || routeGeojson.type !== 'LineString') {
        console.error('Invalid GeoJSON format - must be LineString');
        return false;
      }
    }

    // Insert as the verified user so RLS applies
    const accessToken = userAccessTokens.get(rideData.userId);
    const verifiedUser = await verifyAccessToken(accessToken, rideData.userId);
    if (!verifiedUser) {
      console.error('Cannot sync ride to Supabase: No valid login session for this ride\'s user. Ride kept locally until they log in again.');
      return false;
    }
    const userClient = getUserScopedClient(accessToken);

    // Use Promise.race to implement timeout for Supabase operations
    const { data, error } = await Promise.race([
      userClient
        .from('web_routes')
        .insert([
          {
            user_id: rideData.userId,
            route_geojson: routeGeojson,
            distance: formattedDistance,
            duration: durationMinutes
          }
        ])
        .select()
        .single(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Supabase operation timeout')), SUPABASE_CONFIG.OPERATION_TIMEOUT_MS)
      )
    ]);

    if (error) {
      console.error('Error syncing ride to Supabase:', error);
      
      // Check if it's a network/connectivity error
      if (error.message.includes('fetch') || error.message.includes('network') || 
          error.message.includes('timeout') || error.message.includes('ECONNREFUSED')) {
        supabaseConnectionStatus = 'disconnected';
      }
      
      return false;
    }

    console.log('Ride synced to Supabase successfully');
    return true;
  } catch (error) {
    console.error('Failed to sync ride to Supabase:', error.message);
    
    // Check if it's a timeout or network error
    if (error.message.includes('timeout') || error.message.includes('fetch') || 
        error.message.includes('network') || error.message.includes('ECONNREFUSED')) {
      supabaseConnectionStatus = 'disconnected';
    }
    
    return false;
  }
}

// Sync all pending rides from local file to Supabase with robust error handling
async function syncPendingRidesToSupabase() {
  try {
    // Check if Supabase is available
    if (!supabase) {
      return;
    }

    // Check connection status
    if (supabaseConnectionStatus !== 'connected') {
      return;
    }

    // Check if file exists
    if (!fs.existsSync(RIDE_DATA_FILE_PATH)) {
      return;
    }

    let rides = JSON.parse(fs.readFileSync(RIDE_DATA_FILE_PATH, 'utf8'));
    
    // Identify rides that are pending but have no userId (unsyncable)
    const unsyncableRides = rides.filter(ride => 
      !ride.syncedToSupabase && 
      !ride.userId &&
      (ride.status === 'completed' || ride.status === 'auto-stopped')
    );
    
    // Remove unsyncable rides and log them
    if (unsyncableRides.length > 0) {
      console.log(`Removing ${unsyncableRides.length} unsyncable ride(s) with no user ID:`);
      unsyncableRides.forEach(ride => {
        console.log(`  - Ride ${ride.id} (${ride.status}, started at ${ride.startTime})`);
      });
      
      // Filter out the unsyncable rides
      rides = rides.filter(ride => 
        ride.syncedToSupabase || 
        ride.userId || 
        (ride.status !== 'completed' && ride.status !== 'auto-stopped')
      );
      
      // Update the file immediately to remove unsyncable rides
      fs.writeFileSync(RIDE_DATA_FILE_PATH, JSON.stringify(rides, null, 2));
    }
    
    // Now proceed with syncing the remaining pending rides
    const pendingRides = rides.filter(ride => 
      !ride.syncedToSupabase && 
      ride.status === 'completed'
    );
    
    if (pendingRides.length > 0) {
      console.log(`Syncing ${pendingRides.length} pending ride(s) to Supabase`);
    }
    
    for (const ride of pendingRides) {
      try {
        const synced = await syncRideToSupabase(ride);
        if (synced) {
          // Mark as synced
          ride.syncedToSupabase = true;
          ride.syncedAt = new Date().toISOString();
        }
      } catch (error) {
        console.error(`Error syncing pending ride ${ride.id}:`, error.message);
      }
    }
    
    // Update the file with sync status
    if (pendingRides.length > 0) {
      fs.writeFileSync(RIDE_DATA_FILE_PATH, JSON.stringify(rides, null, 2));
    }
    
  } catch (error) {
    console.error('Error syncing pending rides:', error.message);
  }
}

//Format seconds -> "HH:MM:SS"
function formatTimestamp(seconds) {
  const hrs = String(Math.floor(seconds / TIME_CONFIG.SECONDS_PER_HOUR)).padStart(2, '0');
  const mins = String(Math.floor((seconds % TIME_CONFIG.SECONDS_PER_HOUR) / TIME_CONFIG.SECONDS_PER_MINUTE)).padStart(2, '0');
  const secs = String(seconds % TIME_CONFIG.SECONDS_PER_MINUTE).padStart(2, '0');
  return `${hrs}:${mins}:${secs}`;
}

// Reset all ride state variables to initial values
function resetRideState() {
  elapsedSeconds = 0;
  totalDistance = 0;
  lastGPSPosition = null;
  lastGPSTimestamp = null;
  lastDataTimestamp = null;
  currentSpeed = 0;
  currentProximity = 0;
  staleTicks = 0;
  noSpeedSeconds = 0;
  lastSpeedForAuto = null;
  currentRideData = null;
  rideCoordinates = [];
  rideStartTime = null;
  currentUserId = null;
}

// Set route GeoJSON with priority: GPS breadcrumbs > Mapbox route > minimal fallback (optional)
function setRouteGeoJSON(rideData, mapboxRoute, includeMinimalFallback = false) {
  if (rideCoordinates.length > 0) {
    // Use GPS breadcrumb trail - actual path taken
    rideData.routeGeojson = createGeoJSONLineString(rideCoordinates);
  } else if (mapboxRoute && mapboxRoute.geometry) {
    // Use full Mapbox Directions route geometry with ALL waypoints
    rideData.routeGeojson = mapboxRoute.geometry;
  } else if (includeMinimalFallback) {
    // Fallback: Create a minimal GeoJSON for stationary rides using start and end coordinates
    const minimalCoordinates = [];
    
    // Add start coordinates if available
    if (rideData.startCoordinates && rideData.startCoordinates.length === 2) {
      minimalCoordinates.push(rideData.startCoordinates);
    }
    
    // Add end coordinates if available and different from start
    if (rideData.endCoordinates && rideData.endCoordinates.length === 2) {
      const [startLng, startLat] = rideData.startCoordinates || [0, 0];
      const [endLng, endLat] = rideData.endCoordinates;
      
      // Only add end coordinates if they're different from start coordinates
      if (startLng !== endLng || startLat !== endLat) {
        minimalCoordinates.push(rideData.endCoordinates);
      }
    }
    
    // If we have at least one coordinate, create the GeoJSON
    if (minimalCoordinates.length > 0) {
      rideData.routeGeojson = createGeoJSONLineString(minimalCoordinates);
    }
  }
}

// Complete ride data processing: fetch Mapbox route, calculate distance, set GeoJSON, and save
async function completeRideData(status, stopReason = null, includeMinimalFallback = false) {
  if (!currentRideData) return;
  
  currentRideData.endTime = new Date().toISOString();
  
  // Update end coordinates with the last GPS position if available
  if (lastGPSPosition) {
    currentRideData.endCoordinates = [lastGPSPosition.lng, lastGPSPosition.lat];
  }
  
  // For planned routes, get distance from Mapbox Directions API
  // For free-rides, always use GPS-calculated distance (saves API quota)
  let mapboxRoute = null;
  
  if (currentRideData.rideType === 'planned-route') {
    mapboxRoute = await getMapboxRoute(
      currentRideData.startCoordinates[0], // startLng
      currentRideData.startCoordinates[1], // startLat
      currentRideData.endCoordinates[0],   // endLng
      currentRideData.endCoordinates[1]     // endLat
    );
  }
  
  // Determine final distance: Mapbox for planned routes, GPS for free-rides
  if (currentRideData.rideType === 'free-ride') {
    currentRideData.distance = totalDistance || 0;  // Always use GPS distance for free-rides
  } else {
    // Use Mapbox route distance if available, otherwise fall back to GPS distance
    currentRideData.distance = mapboxRoute?.distance > 0 ? mapboxRoute.distance : (totalDistance || 0);
  }
  
  // Use backend-calculated duration (in seconds, will be converted to minutes in syncRideToSupabase)
  currentRideData.duration = elapsedSeconds || 0;
  currentRideData.status = status;
  if (stopReason) {
    currentRideData.stopReason = stopReason;
  }
  
  // Create GeoJSON LineString for route coordinates
  setRouteGeoJSON(currentRideData, mapboxRoute, includeMinimalFallback);
  
  // Save to local JSON file and attempt Supabase sync
  await saveRideDataToFile(currentRideData);
  
  return currentRideData;
}

// Emit ride end events to clients
function emitRideEndEvents(emitRideEnded = false, reason = null) {
  // Send final ride stats to the client before the zero-reset (only for autoStop)
  if (emitRideEnded && reason) {
    io.emit('rideEnded', JSON.stringify({
      reason,
      finalTime: formatTimestamp(elapsedSeconds),
      finalDistance: totalDistance 
    }));
  }
  
  // Immediate "zero" packet so UI resets
  io.emit('data', JSON.stringify({
    speed_mph: 0,
    proximity_alert: 0,
    timestamp: '00:00:00',
    distance_miles: 0
  }));
}

//an auto-helper that ends the ride from the server side
async function autoStop(reason) {
  if (!isBroadcasting) return;
  console.log(`Ride auto-stopped: ${reason} - ${formatTimestamp(elapsedSeconds)} elapsed, ${totalDistance.toFixed(2)} miles`);

  isBroadcasting = false;
  isPaused = false;
  clearInterval(broadcastInterval);

  // Complete the ride data and save to local file
  await completeRideData('auto-stopped', reason, false);

  // Emit ride end events (including rideEnded event for auto-stop)
  emitRideEndEvents(true, reason);

  // Clean slate for next ride
  resetRideState();
}

// ------------------ Socket.io wiring -------------------------------------------------
io.on('connection', socket => {
  console.log('Client connected:', socket.id);
  
  // Send current GPS status to newly connected client
  socket.emit('gpsStatus', {
    status: gpsDeviceInitialized ? 'connected' : (gpsDeviceAvailable ? 'initialization_failed' : 'device_not_available'),
    source: 'gpsd',
    deviceAvailable: gpsDeviceAvailable,
    deviceInitialized: gpsDeviceInitialized,
    message: gpsDeviceInitialized ? 'GPS device active' : 'Using browser GPS fallback',
    timestamp: new Date().toISOString()
  });
  
  // Send current external GPS status
  socket.emit('externalGPSStatus', {
    active: externalGPSActive,
    timestamp: lastExternalGPSTimestamp || Date.now()
  });
  
  // Send current proximity state to newly connected client
  socket.emit('proximityUpdate', {
    alertLevel: currentProximity > 0 ? 1 : 0,
    distance: null,
    timestamp: lastUltrasonicTimestamp || Date.now(),
    sensorActive: ultrasonicSensorActive
  });

  // --------------------------- start ride --------------------------------------
  socket.on('startRide', (rideData) => {
    if (isBroadcasting) return; //guard against double‑clicks

    // Handle coordinates data - default to 0 if not provided
    const coords = rideData || { startLat: 0, startLng: 0, endLat: 0, endLng: 0 };
    
    console.log('Ride started');
    
    isBroadcasting = true;
    isPaused = false;

    // Initialize ride data tracking
    currentUserId = rideData.userId || null;
    if (currentUserId && rideData.accessToken) {
      // Verified again before any database write in syncRideToSupabase
      userAccessTokens.set(currentUserId, rideData.accessToken);
    }
    rideStartTime = new Date();
    rideCoordinates = [];
    
    // Detect if this is a free-ride (no destination) or planned-route
    const isFreeRide = !coords.endLat || !coords.endLng || 
                       (coords.endLat === 0 && coords.endLng === 0) ||
                       (coords.startLat === coords.endLat && coords.startLng === coords.endLng);
    
    // Create initial ride data structure
    currentRideData = {
      id: generateRideId(),
      userId: currentUserId,
      rideType: isFreeRide ? 'free-ride' : 'planned-route',  // Track internally only
      startTime: rideStartTime.toISOString(),
      startCoordinates: [coords.startLng || 0, coords.startLat || 0],
      endCoordinates: [coords.endLng || 0, coords.endLat || 0],
      routeCoordinates: [],
      distance: 0,
      duration: 0,
      status: 'active'
    };

    //reset ride‑wide counters
    elapsedSeconds = 0;
    totalDistance = 0;
    lastGPSPosition = null;
    lastGPSTimestamp = null;

    //reset "fresh‑row" tracking
    lastDataTimestamp = null;
    currentSpeed = 0;
    currentProximity = 0;

    //reset auto‑stop trackers
    noSpeedSeconds = 0;
    lastSpeedForAuto = null;
    staleTicks = 0;

    // Emit signal to tester that ride has started
    io.emit('rideStarted', JSON.stringify({
      rideId: currentRideData.id,
      startTime: rideStartTime.toISOString(),
      coordinates: coords
    }));

    broadcastInterval = setInterval(() => {
      //bail out instantly if the ride was stopped from elsewhere
      if (!isBroadcasting) {
        clearInterval(broadcastInterval);
        return;
      }
      elapsedSeconds += 1;

      // Update current ride data
      if (currentRideData) {
        currentRideData.distance = totalDistance;
        currentRideData.duration = elapsedSeconds;
        currentRideData.routeCoordinates = [...rideCoordinates];
      }

      // Auto-stop logic based on GPS activity
      if (lastGPSTimestamp) {
        const timeSinceLastGPS = (Date.now() - lastGPSTimestamp) / UNIT_CONVERSIONS.MS_TO_SECONDS;
        if (timeSinceLastGPS > AUTO_STOP_THRESHOLD) {
          autoStop('inactivity');
          return;
        }
      }

      const payload = {
        speed_mph: isPaused ? 0 : currentSpeed,
        proximity_alert: currentProximity,
        timestamp: formatTimestamp(elapsedSeconds),
        distance_miles: totalDistance
      };
      
      io.emit('data', JSON.stringify(payload));
    }, RIDE_CONFIG.BROADCAST_INTERVAL_MS); 
  });

  // --------------------------- GPS stop handler --------------------------------------
  socket.on('gpsStop', (data) => {
    // Immediately reset external GPS status
    externalGPSActive = false;
    lastExternalGPSTimestamp = null;
    
    // Broadcast external GPS status change to all clients
    io.emit('externalGPSStatus', {
      active: false,
      timestamp: Date.now(),
      reason: data.reason || 'gps_stopped',
      source: data.source || 'unknown'
    });
  });

  // --------------------------- GPS update handler --------------------------------------
  socket.on('gpsUpdate', (gpsData) => {
    processAndBroadcastGPSData(gpsData, {
      source: 'gps',
      requireBroadcasting: true,    // Early return if not broadcasting
      updateRideData: true,         // Always update if we get here
      checkBroadcastingForRideData: false,  // No need to check again
      includeSourceInStatus: false, // Don't include source (preserve existing behavior)
      useISOTimestamp: false        // Use number timestamp (preserve existing behavior)
    });
  });

  // --------------------------- pause/resume ride ---------------------------------
  socket.on('pauseRide', () => {
    if (!isBroadcasting || isPaused) return;
    console.log('Ride paused');
    isPaused = true;
  });

  socket.on('resumeRide', () => {
    if (!isBroadcasting || !isPaused) return;
    console.log('Ride resumed');
    isPaused = false;
    noSpeedSeconds = 0; //reset auto‑stop tracker because movement may resume
  });

  // --------------------------- stop ride ---------------------------------------
  socket.on('stopRide', async (statsFromClient) => {
    if (!isBroadcasting) return;
    console.log(`Ride stopped - ${formatTimestamp(elapsedSeconds)} elapsed, ${totalDistance.toFixed(2)} miles`);
    console.log(`Current user ID: ${currentUserId}`);
    console.log(`Current ride data exists: ${currentRideData !== null}`);
    if (currentRideData) {
      console.log(`Current ride data userId: ${currentRideData.userId}`);
    }

    isBroadcasting = false;
    isPaused = false;
    clearInterval(broadcastInterval);

    try {
      // Complete the ride data and save to local file
      const completedRide = await completeRideData('completed', null, true);
      if (completedRide) {
        console.log(`Ride completed. ID: ${completedRide.id}, User ID: ${completedRide.userId}, Distance: ${completedRide.distance}, Duration: ${completedRide.duration}`);
      } else {
        console.error('Failed to complete ride data - currentRideData was null');
      }
    } catch (error) {
      console.error('Error completing ride data:', error);
    }

    // Emit ride end events (no rideEnded event for manual stop)
    emitRideEndEvents(false);

    // Clean slate for next ride
    resetRideState();
  });
  // --------------------------- import route --------------------------------------
  socket.on('importRoute', async (request = {}) => {
    try {
      // Check if Supabase is available
      if (!supabase) {
        socket.emit('routeImported', { error: 'Supabase not configured' });
        return;
      }

      // Check connection status
      if (supabaseConnectionStatus !== 'connected') {
        socket.emit('routeImported', { error: 'Database connection unavailable' });
        return;
      }

      // Only signed-in users can read routes; the query runs as them so RLS applies
      const verifiedUser = await verifyAccessToken(request.accessToken);
      if (!verifiedUser) {
        socket.emit('routeImported', { error: 'Please log in to import a route' });
        return;
      }
      const userClient = getUserScopedClient(request.accessToken);

      // Get the most recent route from the routes table with timeout
      const { data, error } = await Promise.race([
        userClient
          .from('routes')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1)
          .single(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Route import timeout')), SUPABASE_CONFIG.ROUTE_IMPORT_TIMEOUT_MS)
        )
      ]);

      if (error) {
        console.error('Error fetching route from Supabase:', error);
        
        // Check if it's a network/connectivity error
        if (error.message.includes('fetch') || error.message.includes('network') || 
            error.message.includes('timeout') || error.message.includes('ECONNREFUSED')) {
          supabaseConnectionStatus = 'disconnected';
          socket.emit('routeImported', { error: 'Network connection lost' });
        } else {
          socket.emit('routeImported', { error: 'Failed to fetch route from database' });
        }
        return;
      }

      if (!data) {
        socket.emit('routeImported', { error: 'No routes found in database' });
        return;
      }

      console.log('Route imported successfully');
      socket.emit('routeImported', data);
      
    } catch (error) {
      console.error('Error importing route:', error.message);
      
      // Check if it's a timeout or network error
      if (error.message.includes('timeout') || error.message.includes('fetch') || 
          error.message.includes('network') || error.message.includes('ECONNREFUSED')) {
        supabaseConnectionStatus = 'disconnected';
        socket.emit('routeImported', { error: 'Network connection lost' });
      } else {
        socket.emit('routeImported', { error: 'Internal server error' });
      }
    }
  });

  // --------------------------- disconnect -------------------------------------
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Catch-all handler: send back React's index.html file for any non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
});

// --------------------------- start server -------------------------------------
server.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Socket.io listening on http://localhost:${PORT}`);
  
  // Initialize GPS handler with proper fallback
  await initializeGPSHandler();
  
  // Initialize ultrasonic sensor for proximity detection
  await initializeUltrasonicSensor();
});

// Set up periodic sync to Supabase (every 5 minutes)
setInterval(async () => {
  await syncPendingRidesToSupabase();
}, SUPABASE_CONFIG.SYNC_INTERVAL_MS);

// Set up periodic external GPS status check
setInterval(async () => {
  const wasActive = externalGPSActive;
  externalGPSActive = isExternalGPSActive();
  
  // If external GPS just became inactive, broadcast to all clients
  if (wasActive && !externalGPSActive) {
    io.emit('externalGPSStatus', {
      active: false,
      timestamp: Date.now(),
      reason: 'timeout'
    });
  }
  
  // Periodically check if GPS device is still physically available
  if (gpsDeviceInitialized && gpsDeviceAvailable && gpsHandler) {
    const deviceStillAvailable = gpsHandler.gpsClient.isDeviceConnected();
    if (!deviceStillAvailable && gpsDeviceAvailable) {
      console.log('GPS device disconnected - switching to browser GPS fallback');
      gpsDeviceAvailable = false;
      gpsDeviceInitialized = false;
      
      // Stop GPS handler if it exists
      if (gpsHandler) {
        try {
          await gpsHandler.stop();
        } catch (error) {
          console.error('Error stopping GPS handler:', error.message);
        }
      }
      
      // Broadcast device disconnection to all clients
      io.emit('gpsStatus', {
        status: 'device_disconnected',
        source: 'gpsd',
        message: 'GPS device disconnected - using browser GPS',
        timestamp: new Date().toISOString()
      });
      
      io.emit('externalGPSStatus', {
        active: false,
        timestamp: Date.now(),
        reason: 'device_disconnected'
      });
    }
  }
}, GPS_CONFIG.STATUS_CHECK_INTERVAL_MS);

// Set up periodic ultrasonic sensor health check
setInterval(() => {
  // Only check if sensor is supposed to be enabled
  if (process.env.ENABLE_ULTRASONIC !== 'true') {
    return;
  }
  
  // Check if sensor has gone stale (no data within timeout period)
  if (lastUltrasonicTimestamp && ultrasonicSensorActive) {
    const timeSinceLastReading = Date.now() - lastUltrasonicTimestamp;
    
    // If sensor has timed out
    if (timeSinceLastReading > ULTRASONIC_CONFIG.TIMEOUT_MS) {
      ultrasonicSensorActive = false;
      
      // Clear any stale proximity alerts
      if (currentProximity > 0) {
        currentProximity = 0;
        
        // Send clear signal to frontend
        io.emit('proximityUpdate', {
          alertLevel: 0,
          distance: null,
          timestamp: Date.now(),
          sensorActive: false
        });
      }
    }
  }
}, ULTRASONIC_CONFIG.STATUS_CHECK_INTERVAL_MS);

// Initial Supabase sync on startup
setTimeout(async () => {
  await syncPendingRidesToSupabase();
}, EXTERNAL_GPS_CONFIG.INITIAL_SYNC_DELAY_MS);

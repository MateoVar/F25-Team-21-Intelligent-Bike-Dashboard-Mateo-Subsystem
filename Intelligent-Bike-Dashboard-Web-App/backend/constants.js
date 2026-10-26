// Shared config values

// GPS Configuration
const GPS_CONFIG = {
  DEFAULT_PORT: 2947,
  DEFAULT_HOST: 'localhost',
  MAX_RECONNECT_ATTEMPTS: 3,
  RECONNECT_DELAY_MS: 3000,
  STATUS_CHECK_INTERVAL_MS: 2000
};

// Ride Management
const RIDE_CONFIG = {
  AUTO_STOP_THRESHOLD_SECONDS: 60, // seconds of no GPS data before auto-stop
  STALE_THRESHOLD_SECONDS: 3, // seconds with no fresh data before considered "stalled"
  BROADCAST_INTERVAL_MS: 1000, // interval for broadcasting ride data
  GPS_NOISE_FILTER_THRESHOLD_MILES: 0.5 // maximum distance increment to filter GPS noise (~2600 feet)
};

// External GPS Tracking
const EXTERNAL_GPS_CONFIG = {
  TIMEOUT_MS: 10000, // timeout for external GPS (10 seconds)
  INITIAL_SYNC_DELAY_MS: 10000 // delay before initial Supabase sync on startup
};

// Database/Supabase Configuration
const SUPABASE_CONFIG = {
  OPERATION_TIMEOUT_MS: 15000, // timeout for Supabase operations (15 seconds)
  ROUTE_IMPORT_TIMEOUT_MS: 10000, // timeout for route import (10 seconds)
  SYNC_INTERVAL_MS: 5 * 60 * 1000 // periodic sync interval (5 minutes)
};

// Distance Calculations
const DISTANCE_CONFIG = {
  METERS_TO_MILES: 0.000621371, // conversion factor: 1 meter = 0.000621371 miles
  EARTH_RADIUS_MILES: 3959 // Earth's radius in miles (for Haversine formula)
};

// Time Formatting
const TIME_CONFIG = {
  SECONDS_PER_HOUR: 3600,
  SECONDS_PER_MINUTE: 60,
  SECONDS_TO_MINUTES_PRECISION: 3 // decimal places for seconds to minutes conversion
};

// Server Configuration
const SERVER_CONFIG = {
  DEFAULT_PORT: 5000,
  DEFAULT_FRONTEND_URL: 'http://localhost:3000'
};

// Unit Conversions
const UNIT_CONVERSIONS = {
  MS_TO_SECONDS: 1000, // milliseconds to seconds
  MPS_TO_MPH: 2.23694 // meters per second to miles per hour
};

// Ultrasonic Sensor Configuration
const ULTRASONIC_CONFIG = {
  TIMEOUT_MS: 2000, // timeout for ultrasonic sensor (2 seconds of no data)
  STATUS_CHECK_INTERVAL_MS: 1000 // check sensor health every 1 second
};

module.exports = {
  GPS_CONFIG,
  RIDE_CONFIG,
  EXTERNAL_GPS_CONFIG,
  SUPABASE_CONFIG,
  DISTANCE_CONFIG,
  TIME_CONFIG,
  SERVER_CONFIG,
  UNIT_CONVERSIONS,
  ULTRASONIC_CONFIG
};


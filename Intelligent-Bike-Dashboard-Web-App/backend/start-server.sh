#!/bin/bash
# Set environment variables for GPS functionality
# Note: GPS will fall back to browser GPS if GPSD is not available
export ENABLE_GPS=true
export GPSD_HOST=localhost
export GPSD_PORT=2947

# Start the server
node server.js

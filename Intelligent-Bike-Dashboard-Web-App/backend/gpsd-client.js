// Reads GPS data from gpsd (localhost:2947) so other apps can share the device

const net = require('net');
const { GPS_CONFIG, RIDE_CONFIG, EXTERNAL_GPS_CONFIG } = require('./constants');

class GPSDClient {
    constructor(options = {}) {
        this.host = options.host || GPS_CONFIG.DEFAULT_HOST;
        this.port = options.port || GPS_CONFIG.DEFAULT_PORT;
        this.socket = null;
        this.isConnected = false;
        this.onDataCallback = null;
        this.onErrorCallback = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = options.maxReconnectAttempts || GPS_CONFIG.MAX_RECONNECT_ATTEMPTS;
        this.reconnectDelay = options.reconnectDelay || GPS_CONFIG.RECONNECT_DELAY_MS;
        
        // Store latest data from different message types
        this.latestTPV = null;  // Time-Position-Velocity
        this.latestSKY = null;  // Satellite data
        
        // Buffer for incomplete JSON messages
        this.buffer = '';
        
        // Track last data emission
        this.lastEmitTime = 0;
        this.emitInterval = RIDE_CONFIG.BROADCAST_INTERVAL_MS; // Emit data every 1 second (1Hz)
    }

    // Connect to GPSD daemon
    async connect() {
        return new Promise((resolve, reject) => {
            try {
                this.socket = new net.Socket();
                
                // Set up connection timeout
                this.socket.setTimeout(EXTERNAL_GPS_CONFIG.TIMEOUT_MS);
                
                this.socket.on('connect', () => {
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    
                    // Enable watching for GPS data in JSON format
                    const watchCommand = '?WATCH={"enable":true,"json":true}\n';
                    this.socket.write(watchCommand);
                    
                    resolve();
                });
                
                this.socket.on('data', (data) => {
                    this.handleData(data);
                });
                
                this.socket.on('error', (err) => {
                    console.error('GPSD connection error:', err.message);
                    this.isConnected = false;
                    
                    if (this.onErrorCallback) {
                        this.onErrorCallback(err);
                    }
                    
                    // Don't reject here if we're already connected, just try to reconnect
                    if (this.reconnectAttempts === 0) {
                        reject(err);
                    }
                });
                
                this.socket.on('timeout', () => {
                    console.error('GPSD connection timeout');
                    this.socket.destroy();
                    reject(new Error('Connection timeout'));
                });
                
                this.socket.on('close', () => {
                    this.isConnected = false;
                    
                    // Attempt to reconnect if we haven't exceeded max attempts
                    if (this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.reconnectAttempts++;
                        setTimeout(() => {
                            this.connect().catch(err => {
                                console.error('Failed to reconnect to GPSD:', err.message);
                            });
                        }, this.reconnectDelay);
                    }
                });
                
                // Connect to GPSD
                this.socket.connect(this.port, this.host);
                
            } catch (error) {
                console.error('Failed to connect to GPSD:', error.message);
                reject(error);
            }
        });
    }

    // Handle incoming data from GPSD
    handleData(data) {
        // Add new data to buffer
        this.buffer += data.toString();
        
        // Process complete JSON messages (separated by newlines)
        const lines = this.buffer.split('\n');
        
        // Keep the last incomplete line in the buffer
        this.buffer = lines.pop() || '';
        
        // Process each complete line
        for (const line of lines) {
            if (line.trim()) {
                try {
                    const message = JSON.parse(line);
                    this.processGPSDMessage(message);
                } catch (err) {
                    console.warn('Failed to parse GPSD message:', err.message);
                }
            }
        }
    }

    // Process GPSD JSON message
    processGPSDMessage(message) {
        if (!message || !message.class) {
            return;
        }

        switch (message.class) {
            case 'VERSION':
                break;
                
            case 'DEVICES':
                break;
                
            case 'TPV': // Time-Position-Velocity
                this.latestTPV = message;
                this.emitCombinedData();
                break;
                
            case 'SKY': // Satellite data
                this.latestSKY = message;
                break;
                
            case 'WATCH':
                // Watch mode confirmation
                break;
                
            default:
                // Ignore other message types
                break;
        }
    }

    // Emit combined GPS data from TPV and SKY messages
    emitCombinedData() {
        const now = Date.now();
        
        // Throttle emissions to specified interval
        if (now - this.lastEmitTime < this.emitInterval) {
            return;
        }

        // Need TPV data to emit
        if (!this.latestTPV) {
            return;
        }

        const tpv = this.latestTPV;
        const sky = this.latestSKY || {};

        // Check if we have a valid fix (mode 2 = 2D fix, mode 3 = 3D fix)
        if (!tpv.mode || tpv.mode < 2) {
            return; // No valid fix
        }

        // Skip if we don't have valid coordinates
        if (tpv.lat === undefined || tpv.lon === undefined) {
            return;
        }

        this.lastEmitTime = now;

        // Convert speed from m/s to mph (1 m/s = 2.23694 mph)
        const speedMph = (tpv.speed || 0) * 2.23694;

        // Determine fix type and status
        const fixType = this.getFixTypeString(tpv.mode);
        const fixStatus = (tpv.mode >= 2) ? 'valid' : 'invalid';

        // Count satellites used (from SKY data)
        const satellitesUsed = sky.uSat || tpv.nSat || 0;

        // Build GPS data object matching server's expected format
        const gpsData = {
            timestamp: tpv.time || new Date().toISOString(),
            coords: [tpv.lon, tpv.lat], // [longitude, latitude]
            speed: Math.round(speedMph * 100) / 100, // mph, rounded to 2 decimals
            heading: Math.round((tpv.track || 0) * 100) / 100, // degrees, rounded to 2 decimals
            accuracy: tpv.epx || tpv.epy || null, // Estimated position error
            vertical_accuracy: tpv.epv || null, // Estimated vertical error
            proximity_alert: 0, // Not available in GPSD, set to 0
            distance_travelled: 0, // Will be calculated by server
            fix_type: fixType,
            fix_status: fixStatus,
            satellites: satellitesUsed,
            hdop: tpv.xdop || null,
            vdop: tpv.ydop || null,
            pdop: tpv.pdop || null,
            altitude: Math.round((tpv.alt || 0) * 100) / 100, // meters above sea level
            ground_speed: Math.round(speedMph * 100) / 100, // mph
            heading_accuracy: tpv.epd || null, // Track error estimate
            source: "gpsd",
            message_type: "GPSD-TPV",
            // Additional GPSD-specific fields
            mode: tpv.mode,
            climb: tpv.climb || null, // Climb rate in m/s
            epc: tpv.epc || null, // Climb error estimate
            eps: tpv.eps || null // Speed error estimate
        };

        // Call the data callback if set
        if (this.onDataCallback) {
            this.onDataCallback(gpsData);
        }
    }

    // Convert GPSD mode to fix type string
    getFixTypeString(mode) {
        switch (mode) {
            case 3:
                return '3D';
            case 2:
                return '2D';
            case 1:
            default:
                return 'no fix';
        }
    }

    // Set callback for GPS data
    onData(callback) {
        this.onDataCallback = callback;
    }

    // Set callback for errors
    onError(callback) {
        this.onErrorCallback = callback;
    }

    // Disconnect from GPSD
    async disconnect() {
        if (this.socket) {
            return new Promise((resolve) => {
                // Disable watch mode before disconnecting
                if (this.isConnected) {
                    try {
                        this.socket.write('?WATCH={"enable":false}\n');
                    } catch (err) {
                        // Ignore errors when disabling watch
                    }
                }
                
                this.socket.destroy();
                this.isConnected = false;
                resolve();
            });
        }
    }

    // Check if connected to GPSD
    isDeviceConnected() {
        return this.isConnected;
    }

    // Get connection status
    getStatus() {
        return {
            connected: this.isConnected,
            host: this.host,
            port: this.port,
            lastTPV: this.latestTPV ? 'available' : 'none',
            lastSKY: this.latestSKY ? 'available' : 'none',
            reconnectAttempts: this.reconnectAttempts
        };
    }
}

module.exports = GPSDClient;


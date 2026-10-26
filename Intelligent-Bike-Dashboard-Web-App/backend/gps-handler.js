// Wraps the gpsd client and forwards fixes to the server

const GPSDClient = require('./gpsd-client');
const { GPS_CONFIG, RIDE_CONFIG } = require('./constants');

class GPSHandler {
    constructor(server, options = {}) {
        this.server = server;
        this.gpsClient = new GPSDClient(options);
        this.isActive = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = options.maxReconnectAttempts || GPS_CONFIG.MAX_RECONNECT_ATTEMPTS;
        this.reconnectDelay = options.reconnectDelay || GPS_CONFIG.RECONNECT_DELAY_MS;
        this.reconnectTimer = null;
        
        // Set up GPSD client callbacks
        this.gpsClient.onData((gpsData) => {
            this.handleGPSData(gpsData);
        });
        
        this.gpsClient.onError((error) => {
            this.handleGPSError(error);
        });
    }

    // Start GPS data collection
    async start() {
        try {
            await this.gpsClient.connect();
            this.isActive = true;
            this.reconnectAttempts = 0;
            
            // Emit GPS status to all connected clients
            this.server.io.emit('gpsStatus', {
                status: 'connected',
                source: 'gpsd',
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('Failed to start GPS handler:', error.message);
            this.handleGPSError(error);
        }
    }

    // Stop GPS data collection
    async stop() {
        try {
            this.isActive = false;
            
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }
            
            await this.gpsClient.disconnect();
            
            // Emit GPS status to all connected clients
            this.server.io.emit('gpsStatus', {
                status: 'disconnected',
                source: 'gpsd',
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('Error stopping GPS handler:', error.message);
        }
    }

    // Handle incoming GPS data from GPSD client
    handleGPSData(gpsData) {
        if (!this.isActive) return;
        
        try {
            // Log GPS data (similar to Python version)
            // console.log('GPS Data:', JSON.stringify(gpsData, null, 2));
            
            // Forward GPS data to server's existing gpsUpdate handler
            // This maintains compatibility with existing server architecture
            this.server.handleGPSUpdate(gpsData);
            
        } catch (error) {
            console.error('Error handling GPS data:', error.message);
        }
    }

    // Handle GPS connection errors
    handleGPSError(error) {
        console.error('GPS Error:', error.message);
        
        if (this.isActive && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            
            this.reconnectTimer = setTimeout(async () => {
                try {
                    await this.start();
                } catch (reconnectError) {
                    console.error('GPS reconnection failed:', reconnectError.message);
                }
            }, this.reconnectDelay);
            
        } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Maximum GPS reconnection attempts reached');
            this.isActive = false;
            
            // Emit GPS status to all connected clients
            this.server.io.emit('gpsStatus', {
                status: 'error',
                source: 'gpsd',
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    // Get GPS handler status
    getStatus() {
        return {
            active: this.isActive,
            connected: this.gpsClient.isDeviceConnected(),
            reconnectAttempts: this.reconnectAttempts,
            maxReconnectAttempts: this.maxReconnectAttempts,
            clientStatus: this.gpsClient.getStatus()
        };
    }

    // Restart GPS handler
    async restart() {
        await this.stop();
        await new Promise(resolve => setTimeout(resolve, RIDE_CONFIG.BROADCAST_INTERVAL_MS)); // Wait 1 second
        await this.start();
    }
}

module.exports = GPSHandler;

// HC-SR04 proximity sensor (TRIG GPIO 23, ECHO GPIO 24), read through a Python child process

const EventEmitter = require('events');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class UltrasonicSensor extends EventEmitter {
  constructor() {
    super();
    
    // Sensor state
    this.sensorAvailable = false;
    this.sensorInitialized = false;
    this.pythonProcess = null;
    this.lastDistance = null;
    this.lastReading = null;
    
    // Distance thresholds (in centimeters)
    this.thresholds = {
      critical: 50,   // Very close - immediate warning (< 50cm / ~20 inches)
      warning: 100,   // Close - show warning (< 100cm / ~39 inches)
      safe: 200       // Safe distance (> 200cm / ~79 inches)
    };
    
    // console.log('[UltrasonicSensor] Module initialized');
  }

  // Initialize the sensor by spawning the Python reader process
  async initialize(options = {}) {
    // Apply custom thresholds if provided
    if (options.thresholds) {
      this.thresholds = { ...this.thresholds, ...options.thresholds };
    }
    
    try {
      // Check if Python script exists
      const pythonScriptPath = path.join(__dirname, 'ultrasonic-sensor-reader.py');
      if (!fs.existsSync(pythonScriptPath)) {
        throw new Error(`Python script not found at ${pythonScriptPath}`);
      }
      
      // Make Python script executable
      try {
        fs.chmodSync(pythonScriptPath, 0o755);
      } catch (chmodError) {
        // Ignore permission errors
      }
      
      // Check if .venv exists
      const venvPythonPath = path.join(__dirname, '..', '.venv', 'bin', 'python3');
      const pythonCommand = fs.existsSync(venvPythonPath) ? venvPythonPath : 'python3';
      
      // Spawn Python process
      this.pythonProcess = spawn(pythonCommand, [pythonScriptPath], {
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      // Set up process event handlers
      this.setupProcessHandlers();
      
      // Wait for initialization confirmation
      const initialized = await this.waitForInitialization();
      
      if (initialized) {
        this.sensorAvailable = true;
        this.sensorInitialized = true;
        this.emit('initialized');
        return true;
      } else {
        throw new Error('Sensor initialization timeout');
      }
      
    } catch (error) {
      // console.error('[UltrasonicSensor] Initialization failed:', error.message);
      // console.error('[UltrasonicSensor] Troubleshooting: Ensure Python 3 and rpi-lgpio are installed');
      
      this.sensorAvailable = false;
      this.sensorInitialized = false;
      this.emit('error', error);
      return false;
    }
  }

  // Set up event handlers for the Python process
  setupProcessHandlers() {
    let stdoutBuffer = '';
    
    // Handle stdout data (JSON readings)
    this.pythonProcess.stdout.on('data', (data) => {
      stdoutBuffer += data.toString();
      
      // Process complete JSON lines
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop(); // Keep incomplete line in buffer
      
      lines.forEach(line => {
        if (line.trim()) {
          try {
            const reading = JSON.parse(line);
            this.handleSensorReading(reading);
          } catch (parseError) {
            // console.error('[UltrasonicSensor] Failed to parse JSON:', line);
          }
        }
      });
    });
    
    // Handle stderr
    this.pythonProcess.stderr.on('data', (data) => {
      // console.error('[UltrasonicSensor] Python error:', data.toString());
    });
    
    // Handle process exit
    this.pythonProcess.on('close', (code) => {
      // console.log(`[UltrasonicSensor] Python process exited with code ${code}`);
      this.sensorInitialized = false;
      this.sensorAvailable = false;
      this.emit('disconnected');
    });
    
    // Handle process error
    this.pythonProcess.on('error', (error) => {
      // console.error('[UltrasonicSensor] Python process error:', error.message);
      this.sensorInitialized = false;
      this.sensorAvailable = false;
      this.emit('error', error);
    });
  }

  // Wait for sensor initialization confirmation
  waitForInitialization() {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(false);
      }, 5000); // 5 second timeout
      
      const checkInit = (reading) => {
        if (reading.status === 'initialized') {
          clearTimeout(timeout);
          this.removeListener('reading', checkInit);
          resolve(true);
        }
      };
      
      this.on('reading', checkInit);
    });
  }

  // Handle a sensor reading from Python
  handleSensorReading(reading) {
    // Emit raw reading for monitoring
    this.emit('reading', reading);
    
    // Handle initialization status
    if (reading.status) {
      return; // Status messages don't need further processing
    }
    
    // Handle successful distance reading
    if (reading.success && reading.distance !== undefined) {
      const distance = reading.distance;
      const timestamp = reading.timestamp || Date.now();
      
      // Validate reading is within sensor range (2cm - 400cm)
      if (distance >= 2 && distance <= 400) {
        this.lastDistance = distance;
        this.lastReading = reading;
        
        // Determine alert level
        const alertLevel = this.getAlertLevel(distance);
        
        // Emit distance event with alert level
        this.emit('distance', {
          distance,
          alertLevel,
          timestamp
        });
        
        // Log only critical alerts
        if (alertLevel === 2) {
          // console.log(`[UltrasonicSensor] CRITICAL: Object at ${distance.toFixed(2)}cm`);
        }
      }
    } else if (!reading.success && reading.error) {
      // Only log persistent errors
      if (!this.lastDistance) {
        // console.error(`[UltrasonicSensor] Read error: ${reading.error}`);
      }
    }
  }

  // Alert level for a distance in cm: 0 safe, 1 warning, 2 critical
  getAlertLevel(distance) {
    if (distance < this.thresholds.critical) {
      return 2; // Critical - very close object
    } else if (distance < this.thresholds.warning) {
      return 1; // Warning - object approaching
    } else {
      return 0; // Safe - no immediate threat
    }
  }

  // Get current sensor status
  getStatus() {
    return {
      available: this.sensorAvailable,
      initialized: this.sensorInitialized,
      lastDistance: this.lastDistance,
      isRunning: this.pythonProcess !== null && !this.pythonProcess.killed,
      thresholds: this.thresholds
    };
  }

  // Stop the sensor and clean up
  async stop() {
    // console.log('[UltrasonicSensor] Stopping sensor...');
    
    if (this.pythonProcess && !this.pythonProcess.killed) {
      this.pythonProcess.kill('SIGTERM');
      
      // Wait for process to exit
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 2000);
        this.pythonProcess.on('close', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }
    
    this.sensorInitialized = false;
    this.sensorAvailable = false;
    this.pythonProcess = null;
    
    // console.log('[UltrasonicSensor] Sensor stopped');
  }
}

// Export singleton instance
module.exports = new UltrasonicSensor();


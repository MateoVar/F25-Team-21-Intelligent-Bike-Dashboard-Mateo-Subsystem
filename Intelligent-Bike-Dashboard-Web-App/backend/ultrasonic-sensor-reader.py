#!/usr/bin/env python3
"""HC-SR04 reader for the Pi 5, prints distance readings as JSON for the Node backend."""

import RPi.GPIO as GPIO
import time
import sys
import json

# GPIO Mode (BCM numbering)
GPIO.setmode(GPIO.BCM)

# GPIO pin configuration
TRIG = 23  # GPIO 23 (physical pin 16)
ECHO = 24  # GPIO 24 (physical pin 18)

# Set up GPIO pins
GPIO.setup(TRIG, GPIO.OUT)
GPIO.setup(ECHO, GPIO.IN)

def get_distance():
    """
    Measure distance using HC-SR04 ultrasonic sensor
    Returns distance in centimeters
    """
    # Make sure trigger is low
    GPIO.output(TRIG, False)
    time.sleep(0.05)  # Let the sensor settle (50 ms)
    
    # Send 10us pulse to TRIG
    GPIO.output(TRIG, True)
    time.sleep(0.00001)  # 10 microseconds
    GPIO.output(TRIG, False)
    
    # Wait for ECHO to go high
    timeout_start = time.time()
    pulse_start = None
    while GPIO.input(ECHO) == 0:
        pulse_start = time.time()
        if time.time() - timeout_start > 0.02:  # 20 ms timeout
            raise TimeoutError("Echo pulse never started")
    
    # Wait for ECHO to go low
    timeout_start = time.time()
    pulse_end = None
    while GPIO.input(ECHO) == 1:
        pulse_end = time.time()
        if time.time() - timeout_start > 0.02:  # 20 ms timeout
            raise TimeoutError("Echo pulse never ended")
    
    # Calculate distance
    pulse_duration = pulse_end - pulse_start
    
    # Speed of sound ~34300 cm/s; distance is (time * speed) / 2
    distance = pulse_duration * 17150
    return round(distance, 2)

def main():
    """
    Main loop - continuously read sensor and output JSON
    """
    print(json.dumps({"status": "initialized", "trig_pin": TRIG, "echo_pin": ECHO}), flush=True)
    
    try:
        while True:
            try:
                distance = get_distance()
                
                # Output JSON result for Node.js to parse
                result = {
                    "success": True,
                    "distance": distance,
                    "timestamp": int(time.time() * 1000),  # milliseconds
                    "unit": "cm"
                }
                print(json.dumps(result), flush=True)
                
            except TimeoutError as e:
                # If no valid echo, output error but keep running
                error_result = {
                    "success": False,
                    "error": str(e),
                    "timestamp": int(time.time() * 1000)
                }
                print(json.dumps(error_result), flush=True)
            
            time.sleep(0.1)  # Measurement rate (0.1s = 10 Hz)
            
    except KeyboardInterrupt:
        print(json.dumps({"status": "stopped", "reason": "keyboard_interrupt"}), flush=True)
    except Exception as e:
        print(json.dumps({"status": "error", "error": str(e)}), file=sys.stderr, flush=True)
    finally:
        GPIO.cleanup()
        print(json.dumps({"status": "cleanup_complete"}), flush=True)

if __name__ == "__main__":
    main()


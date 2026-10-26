import React, { useContext } from 'react';
import { DataContext } from '../context/DataContext';
import styles from './StopRideButton.module.scss';

// elapsedTime – string "HH:MM:SS"
// distance – number in miles
const StopRideButton = ({ socket, elapsedTime, distance, mapboxRef }) => {
  const { isRiding, stopRide } = useContext(DataContext);

  const handleClick = () => {
    stopRide(socket, { elapsed: elapsedTime, distance });
    
    // Reset map to center on user's current location after stopping the ride
    if (mapboxRef?.current?.resetMapState) {
      mapboxRef.current.resetMapState();
    }
  };

  return (
    <button
      className={styles.StopRideButton}
      disabled={!isRiding}
      onClick={handleClick}
    >
      Stop Ride
    </button>
  );
};

export default StopRideButton;

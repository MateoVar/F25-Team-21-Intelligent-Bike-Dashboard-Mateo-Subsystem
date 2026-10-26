import React, { useContext } from 'react';
import { DataContext } from '../context/DataContext';
import styles from './StartRideButton.module.scss';

const StartRideButton = ({ socket, mapboxRef }) => {
  const { isRiding, startRide } = useContext(DataContext);

  const handleStartRide = () => {
    // Get coordinates from MapboxNavigation
    const coordinates = mapboxRef?.current?.getCoordinates?.() || {
      startLat: 0,
      startLng: 0,
      endLat: 0,
      endLng: 0
    };
    
    startRide(socket, coordinates);
  };

  return (
    <button
      className={styles.StartRideButton}
      disabled={isRiding}
      onClick={handleStartRide}
    >
      Start Ride
    </button>
  );
};

export default StartRideButton;
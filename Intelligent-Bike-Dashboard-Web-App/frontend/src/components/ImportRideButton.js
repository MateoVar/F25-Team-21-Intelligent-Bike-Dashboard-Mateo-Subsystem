import React, { useContext } from 'react';
import { DataContext } from '../context/DataContext';
import styles from './ImportRideButton.module.scss';

const ImportRideButton = ({ socket, mapboxRef }) => {
  const { importRide } = useContext(DataContext);

  const handleImportRide = () => {
    if (!socket || !socket.connected) {
      console.error('[ImportRideButton] Not connected to server');
      return;
    }
    
    importRide(socket, mapboxRef);
  };

  return (
    <button
      className={styles.ImportRideButton}
      onClick={handleImportRide}
    >
      Import Ride
    </button>
  );
};

export default ImportRideButton;

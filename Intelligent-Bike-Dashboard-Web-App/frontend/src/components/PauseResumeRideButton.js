import React, { useContext } from 'react';
import { DataContext } from '../context/DataContext';
import styles from './PauseResumeRideButton.module.scss';

const PauseResumeRideButton = ({ socket }) => {
  const { isRiding, isPaused, togglePause } = useContext(DataContext);

  return (
    <button
      className={styles.PauseResumeRideButton}
      disabled={!isRiding}
      onClick={() => togglePause(socket)}
    >
      {isPaused ? 'Resume Ride' : 'Pause Ride'}
    </button>
  );
};

export default PauseResumeRideButton;
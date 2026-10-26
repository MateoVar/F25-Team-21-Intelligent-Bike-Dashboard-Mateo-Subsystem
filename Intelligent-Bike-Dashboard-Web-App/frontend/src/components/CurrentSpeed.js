import React from 'react';
import styles from './CurrentSpeed.module.scss';

const CurrentSpeed = ({ speed }) => {
  // Truncate speed to whole number (no rounding) like a car speedometer
  const displaySpeed = Math.floor(speed || 0);
  
  return (
    <div className={styles.currentSpeed}>
      <div className={styles.text}>Speed: {displaySpeed} mph</div>
    </div>
  );
};

export default CurrentSpeed;

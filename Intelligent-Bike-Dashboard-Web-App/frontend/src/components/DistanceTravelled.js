import React from 'react';
import styles from './DistanceTravelled.module.scss';

const DistanceTravelled = ({ distance }) => {
  // Format distance to 1 decimal place
  const displayDistance = (distance || 0).toFixed(1);
  
  return (
    <div className={styles.distanceTravelled}>
      <div className={styles.text}>Distance Travelled: {displayDistance} miles</div>
    </div>
  );
};

export default DistanceTravelled;

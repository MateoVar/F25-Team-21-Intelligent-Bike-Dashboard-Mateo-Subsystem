import React from 'react';
import styles from './ProximityWarning.module.scss';

// Red screen border shown when the ultrasonic sensor detects something close
const ProximityWarning = ({ isActive }) => {
  if (!isActive) return null;

  return (
    <>
      {/* Red gradient border overlay */}
      <div className={styles.warningBorder}>
        <div className={styles.borderTop}></div>
        <div className={styles.borderRight}></div>
        <div className={styles.borderBottom}></div>
        <div className={styles.borderLeft}></div>
      </div>
    </>
  );
};

// Exclamation icon for the bottom-left of the map
export const ProximityExclamation = ({ isActive }) => {
  if (!isActive) return null;

  return (
    <div className={styles.exclamationContainer}>
      <div className={styles.exclamationMark}>
        <div className={styles.exclamationLine}></div>
        <div className={styles.exclamationDot}></div>
      </div>
    </div>
  );
};

export default ProximityWarning;


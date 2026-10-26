import React from 'react';
import styles from './TimeElapsed.module.scss';

const TimeElapsed = ({ time }) => {
  return (
    <div className={styles.timeElapsed}>
      <div className={styles.text}>Time Passed: {time}</div>
    </div>
  );
};

export default TimeElapsed;

import React from 'react';
import styles from './SongSlideBar.module.scss';

const SongSlideBar = ({ progress, duration, onSeek }) => {
  // If there's no loaded duration yet, default to 0
  const maxRange = duration || 0;
  const value = progress || 0;

  const handleChange = (event) => {
    const newTime = parseFloat(event.target.value);
    if (onSeek && typeof onSeek === 'function') {
      onSeek(newTime);
    }
  };

  // Calculate the percentage of progress for the visual fill
  const progressPercentage = maxRange > 0 ? (value / maxRange) * 100 : 0;

  return (
    <div className={styles.songSlideBar}>
      <div 
        className={styles.progressFill}
        style={{ width: `${progressPercentage}%` }}
      />
      <input
        type="range"
        min="0"
        max={maxRange}
        value={value}
        onChange={handleChange}
        step="0.1"
      />
    </div>
  );
};

export default SongSlideBar;
import React from 'react';
import styles from './PlayPauseButton.module.scss';
import playIcon from '../assets/playCircle.svg';
import pauseIcon from '../assets/pause.svg';

const PlayPauseButton = ({ onPlay, onPause, isPlaying }) => {
  const handleClick = () => {
    if (isPlaying) {
      onPause();
    } else {
      onPlay();
    }
  };

  return (
    <button className={styles.playPauseButton} onClick={handleClick}>
      <img
        src={isPlaying ? pauseIcon : playIcon}
        alt={isPlaying ? 'Pause' : 'Play'}
        className={styles.icon}
      />
    </button>
  );
};

export default PlayPauseButton;
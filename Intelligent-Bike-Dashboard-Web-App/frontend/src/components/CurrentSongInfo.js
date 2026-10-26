import React from 'react';
import styles from './CurrentSongInfo.module.scss';

const CurrentSongInfo = ({ song }) => {
  if (!song) {
    return null; // Return null if no song is provided
  }

  return (
    <div className={styles.InfoContainer}>
      <div className={styles.songInfo}>
        <h1>{song.title} by {song.artist}</h1>
      </div>
    </div>
  );
};

export default CurrentSongInfo;

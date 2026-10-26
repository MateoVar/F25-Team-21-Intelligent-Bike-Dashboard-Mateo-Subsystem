import React from 'react';
import { useMusicPlayer } from '../context/MusicPlayerContext';
import styles from './VolumeControl.module.scss';
import plusIcon from '../assets/plus.svg';
import minusIcon from '../assets/minus.svg';

const VolumeControl = () => {
  const { increaseVolume, decreaseVolume } = useMusicPlayer();

  return (
    <div className={styles.volumeControl}>
      <button className={styles.button} onClick={increaseVolume}>
        <img src={plusIcon} alt="Volume Up" className={styles.icon} />
      </button>
      <button className={styles.button} onClick={decreaseVolume}>
        <img src={minusIcon} alt="Volume Down" className={styles.icon} />
      </button>
    </div>
  );
};

export default VolumeControl;

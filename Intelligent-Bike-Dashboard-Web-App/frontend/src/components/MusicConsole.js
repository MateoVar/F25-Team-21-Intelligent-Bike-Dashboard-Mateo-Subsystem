import React from 'react';
import styles from './MusicConsole.module.scss';
import PlayPauseButton from './PlayPauseButton';
import NextSongButton from './NextSongButton';
import PrevSongButton from './PrevSongButton';
import SongSlideBar from './SongSlideBar';
import VolumeControl from './VolumeControl';

const MusicConsole = ({ 
    onPlay, 
    onPause, 
    onNext, 
    onPrevious,
    isPlaying,
    progress, 
    duration,
    onSeek,
}) => {
    
    return (
      <div className={styles.root}>
        <div className={styles.buttons}>
            <PrevSongButton onPrevious={onPrevious} />
            <PlayPauseButton
                onPlay={onPlay}
                onPause={onPause}
                isPlaying={isPlaying}
            />
            <NextSongButton onNext={onNext} />
        </div>
        <div className={styles.songInfo}>
            <SongSlideBar progress={progress} duration={duration} onSeek={onSeek} />
        </div>
        <div className={styles.volume}>
            <VolumeControl />
        </div>
      </div>
      );
};

export default MusicConsole;

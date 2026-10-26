import React from 'react';
import MetricLayout from '../layouts/MetricLayout';
import { useMusicPlayer } from '../context/MusicPlayerContext';

function DashboardMetrics({ latestData, socket, proximityAlert }) {
  // live ride data coming from the server 
  const speed = latestData?.speed_mph?? 0;
  const distance = latestData?.distance_miles?? 0;
  const time = latestData?.timestamp?? '00:00:00';
  const proximity = latestData?.proximity_alert?? 0;

  const {
    songs,
    currentSongIndex,
    setCurrentSongIndex,
    isPlaying,
    setIsPlaying,
    progress,
    duration,
    seekTo,
  } = useMusicPlayer();

  // simple helpers to pass to child components */
  const play = () => setIsPlaying(true);
  const pause = () => setIsPlaying(false);
  const next = () => {
    setCurrentSongIndex(i => (i + 1) % songs.length);
    setIsPlaying(true); // Automatically start playing the new song
  };
  const previous = () => {
    setCurrentSongIndex(i => (i - 1 + songs.length) % songs.length);
    setIsPlaying(true); // Automatically start playing the new song
  };

  return (
    <MetricLayout
      speed={speed}
      time={time}
      distance={distance}
      socketConnection={socket}
      onPlay={play}
      onPause={pause}
      onNext={next}
      onPrevious={previous}
      isPlaying={isPlaying}
      currentSong={songs[currentSongIndex]}
      progress={progress}
      duration={duration}
      onSeek={seekTo}
      proximity={proximity}
      proximityAlert={proximityAlert}
    />
  );
}

export default DashboardMetrics;

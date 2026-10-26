import React, { useRef } from 'react';
import ProximityDetection from '../components/ProximityDetection';
import ProximityWarning, { ProximityExclamation } from '../components/ProximityWarning';
import CurrentSpeed from '../components/CurrentSpeed';
import TimeElapsed from '../components/TimeElapsed';
import DistanceTravelled from '../components/DistanceTravelled';
import MapboxNavigation from '../components/MapboxNavigation';
import StartRideButton from '../components/StartRideButton';
import PauseResumeRideButton from '../components/PauseResumeRideButton';
import StopRideButton from '../components/StopRideButton';
import ImportRideButton from '../components/ImportRideButton';
import MusicConsole from '../components/MusicConsole';
import StatusBar from '../components/StatusBar';
import style from './MetricLayout.module.scss';

export function MetricLayout({ speed, 
  time, 
  distance, 
  latestData, 
  socketConnection, 
  onPlay, 
  onPause, 
  onNext, 
  onPrevious, 
  isPlaying, 
  currentSong, 
  progress, 
  duration,
  onVolumeUp,
  onVolumeDown,
  onSeek,
  proximity,
  proximityAlert }) {
  
  const socket = socketConnection;
  const mapboxRef = useRef(null);
  return (
    <div className={style.container}>
      <ProximityDetection direction={proximity} />
      <ProximityWarning isActive={proximityAlert} />
      <div className={style.header}>
        <div className={style.music}>
          <MusicConsole
            onPlay={onPlay}
            onPause={onPause}
            onNext={onNext}
            onPrevious={onPrevious}
            isPlaying={isPlaying}
            progress={progress}
            duration={duration}
            onSeek={onSeek}
          />
          
        </div>
        <div className={style.statusBar}>
          <StatusBar song={currentSong} />
        </div>
      </div>
      <div className={style.content}>
        <div className={style.info}>
          <CurrentSpeed speed={speed} />
          <TimeElapsed time={time} />
          <DistanceTravelled distance={distance} />
          <div className={style.controls}>
            <StartRideButton socket={socket} mapboxRef={mapboxRef} />
            <PauseResumeRideButton socket={socket} />
            <StopRideButton socket={socket} elapsedTime={time} distance={distance} mapboxRef={mapboxRef} />
            <ImportRideButton socket={socket} mapboxRef={mapboxRef} />
          </div>  
          
        </div>
        <div className={style.map}>
          <MapboxNavigation ref={mapboxRef} />
          <ProximityExclamation isActive={proximityAlert} />
        </div>
      </div>
    </div>
  );
}

export default MetricLayout;
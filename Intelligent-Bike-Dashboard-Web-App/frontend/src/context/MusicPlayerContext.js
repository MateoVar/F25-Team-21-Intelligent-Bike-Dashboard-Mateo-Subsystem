import React, {
    createContext,
    useRef,
    useState,
    useEffect,
    useContext,
    useCallback,
  } from 'react';
  
  // the song playlist that is temporary for 403 demo, this should not be needed by the end of 404
  const songs = [
    {
      url: '/songs/no-copyright-music-happy-306601.mp3',
      title: 'Happy Song',
      artist: 'DELOSound',
    },
    {
      url: '/songs/no-copyright-music-house-309375.mp3',
      title: 'House Song',
      artist: 'DELOSound',
    },
    {
      url: '/songs/no-copyright-music-piano-306628.mp3',
      title: 'Piano Song',
      artist: 'DELOSound',
    },
  ];
  
  // setting up the context
  const MusicPlayerContext = createContext(null);
  
  export const useMusicPlayer = () => useContext(MusicPlayerContext);
  
  // provider component
  // wraps the whole app and provides the context to all components
  export function MusicPlayerProvider({ children }) {
    // refs & state created once for the whole app 
    const audioRef = useRef(new Audio(songs[0].url));
    const [currentSongIndex, setCurrentSongIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress]   = useState(0);
    const [duration, setDuration]   = useState(0);
  
  // track change: point <audio> to the new file 
  useEffect(() => {
    const audio = audioRef.current;
    audio.src = songs[currentSongIndex].url;
    setProgress(0);
    
    // If we're supposed to be playing, wait for the audio to be ready and then play
    if (isPlaying) {
      const handleCanPlay = () => {
        audio.play().catch(console.error);
        audio.removeEventListener('canplay', handleCanPlay);
      };
      audio.addEventListener('canplay', handleCanPlay);
      
      // Also try to play immediately in case the audio is already loaded
      audio.play().catch(() => {
        // If immediate play fails, wait for canplay event
      });
    }
  }, [currentSongIndex, isPlaying]);

  // play/pause whenever isPlaying flips (but not when song changes)
  useEffect(() => {
    const audio = audioRef.current;
    if (isPlaying) {
      // Only play if the audio source is ready
      if (audio.readyState >= 2) { // HAVE_CURRENT_DATA or higher
        audio.play().catch(console.error);
      }
    } else {
      audio.pause();
    }
  }, [isPlaying]);
  
    // one‑time event listeners on the <audio> element 
    useEffect(() => {
      const audio = audioRef.current;
  
      const handleLoadedMetadata = () => setDuration(audio.duration);
      const handleTimeUpdate     = () => setProgress(audio.currentTime);
      const handleEnded          = () => {
        setCurrentSongIndex(i => (i + 1) % songs.length);
        setIsPlaying(true); // autoplay next track
      };
  
      audio.addEventListener('loadedmetadata', handleLoadedMetadata);
      audio.addEventListener('timeupdate',      handleTimeUpdate);
      audio.addEventListener('ended',           handleEnded);
  
      return () => {
        audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
        audio.removeEventListener('timeupdate',      handleTimeUpdate);
        audio.removeEventListener('ended',           handleEnded);
      };
    }, []);
  
    // volume helpers
    const increaseVolume = useCallback(() => {
      if (!audioRef.current) return;
      audioRef.current.volume = Math.min(audioRef.current.volume + 0.1, 1);
    }, []);

    const decreaseVolume = useCallback(() => {
      if (!audioRef.current) return;
      audioRef.current.volume = Math.max(audioRef.current.volume - 0.1, 0);
    }, []);

    // seek helper
    const seekTo = useCallback((time) => {
      if (!audioRef.current || !duration) return;
      const seekTime = Math.max(0, Math.min(time, duration));
      audioRef.current.currentTime = seekTime;
      setProgress(seekTime);
    }, [duration]);
  
    // this is all the data and controls exposed to the rest of the app
    const value = {
      // data
      songs,
      currentSongIndex,
      isPlaying,
      progress,
      duration,
      audioRef,               

      // controls
      setCurrentSongIndex,
      setIsPlaying,
      increaseVolume,
      decreaseVolume,
      seekTo,
    };
  
    return (
      <MusicPlayerContext.Provider value={value}>
        {children}
      </MusicPlayerContext.Provider>
    );
  }
  

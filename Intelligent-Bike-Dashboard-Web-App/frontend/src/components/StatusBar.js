import React, { useState, useEffect, useContext } from 'react';
import styles from './StatusBar.module.scss';
import CurrentSongInfo from './CurrentSongInfo';
import { useAuth } from '../context/AuthContext';
import { DataContext } from '../context/DataContext';

const StatusBar = ({ song }) => {
  const { user, signOut, setShowLoginModal, loading } = useAuth();
  const { isRiding } = useContext(DataContext);
  const [time, setTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      // Hardcoded to Central Time (America/Chicago) with 12-hour format
      setTime(now.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/Chicago'
      }));
    };

    updateTime();
    const interval = setInterval(updateTime, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  return (
    <div className={styles.statusBar}>
      <div className={styles.topRow}>
        {isRiding && (
          <div className={styles.rideActiveIndicator}>
            <div className={styles.rideActiveDot}></div>
            <span className={styles.rideActiveText}>Ride Active</span>
          </div>
        )}
        <div className={styles.songInfoContainer}>
          <CurrentSongInfo song={song} />
        </div>
        <div className={styles.time}>{time}</div>
        <div className={styles.buttonContainer}>
          {user ? (
            <button 
              className={styles.logoutButton}
              onClick={signOut}
              disabled={loading}
            >
              {loading ? 'Logging out...' : 'Logout'}
            </button>
          ) : (
            <button 
              className={styles.loginButton}
              onClick={() => setShowLoginModal(true)}
            >
              Login
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default StatusBar;
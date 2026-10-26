import React, { useState, useContext } from 'react';
import { RideService } from '../services/RideService';
import { useAuth } from '../context/AuthContext';
import styles from './RideDataViewer.module.scss';

// Dev tool for testing ride data and the Supabase integration
const RideDataViewer = () => {
  const { user } = useAuth();
  const [userRides, setUserRides] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchUserRides = async () => {
    if (!user) {
      setError('User not logged in');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const rides = await RideService.getUserRides(user.id);
      setUserRides(rides);
    } catch (err) {
      setError('Failed to fetch rides: ' + err.message);
      console.error('Error fetching rides:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    const secs = Math.floor((minutes % 1) * 60);
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className={styles.RideDataViewer}>
      <h3>Ride Data Viewer (Testing Component)</h3>
      
      {!user && (
        <div className={styles.error}>
          Please log in to view ride data
        </div>
      )}

      {user && (
        <>
          <button 
            onClick={fetchUserRides} 
            disabled={loading}
            className={styles.fetchButton}
          >
            {loading ? 'Loading...' : 'Fetch My Rides'}
          </button>

          {error && (
            <div className={styles.error}>
              {error}
            </div>
          )}

          {userRides.length > 0 && (
            <div className={styles.ridesList}>
              <h4>Your Rides ({userRides.length})</h4>
              {userRides.map((ride) => (
                <div key={ride.id} className={styles.rideCard}>
                  <div className={styles.rideHeader}>
                    <strong>Ride ID:</strong> {ride.id.slice(0, 8)}...
                  </div>
                  <div className={styles.rideDetails}>
                    <div><strong>Date:</strong> {formatDate(ride.created_at)}</div>
                    <div><strong>Distance:</strong> {ride.distance} miles</div>
                    <div><strong>Duration:</strong> {formatDuration(ride.duration)}</div>
                    <div><strong>Coordinates:</strong> {ride.route_geojson?.coordinates?.length || 0} points</div>
                  </div>
                  {ride.route_geojson?.coordinates && (
                    <details className={styles.coordinatesDetails}>
                      <summary>View Route Coordinates</summary>
                      <pre className={styles.coordinatesPreview}>
                        {JSON.stringify(ride.route_geojson, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}

          {userRides.length === 0 && !loading && !error && (
            <div className={styles.noRides}>
              No rides found. Start a ride to see data here!
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default RideDataViewer;

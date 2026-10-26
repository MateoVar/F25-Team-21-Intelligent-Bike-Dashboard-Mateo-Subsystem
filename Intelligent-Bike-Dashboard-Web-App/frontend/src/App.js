import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import io from 'socket.io-client';
import DashboardMetrics from './pages/DashboardMetrics';
import LoginModal from './components/LoginModal';
import { DataProvider } from './context/DataContext';
import { MusicPlayerProvider } from './context/MusicPlayerContext';
import { MapProvider } from './context/MapContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import './App.css';

const socket = io('http://localhost:5000'); // Connect to the WebSocket server

// Component to render the login modal at the top level
function AppContent({ latestData, proximityAlert }) {
  const { showLoginModal, setShowLoginModal } = useAuth();

  return (
    <>
      <DataProvider socket={socket}>
        <MusicPlayerProvider>
          <MapProvider socket={socket}> 
            <Router>
              <Routes>
                <Route path="/" element={<DashboardMetrics latestData={latestData} socket={socket} proximityAlert={proximityAlert} />} />
              </Routes>
            </Router>
          </MapProvider>
        </MusicPlayerProvider>
      </DataProvider>
      {showLoginModal && (
        <LoginModal onClose={() => setShowLoginModal(false)} />
      )}
    </>
  );
}

function App() {
  const [latestData, setLatestData] = useState(null);
  const [proximityAlert, setProximityAlert] = useState(false);

  useEffect(() => {
    // Listen for data updates from the server
    socket.on('data', (data) => {
      const parsed = JSON.parse(data);
      setLatestData(parsed);
      
      // Update proximity alert based on proximity_alert field
      setProximityAlert(parsed.proximity_alert > 0);
    });

    // Listen for real-time proximity updates from ultrasonic sensor
    socket.on('proximityUpdate', (data) => {
      // alertLevel: 0 = safe, 1 = warning, 2 = critical
      setProximityAlert(data.alertLevel > 0);
    });

    // Clean up the socket connection when the component unmounts
    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <AuthProvider>
      <AppContent latestData={latestData} proximityAlert={proximityAlert} />
    </AuthProvider>
  );
}

export default App;

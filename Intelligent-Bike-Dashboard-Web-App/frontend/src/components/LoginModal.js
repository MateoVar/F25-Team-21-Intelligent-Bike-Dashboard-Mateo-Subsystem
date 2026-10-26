import React, { useState } from 'react';
import styles from './LoginModal.module.scss';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const LoginModal = ({ onClose }) => {
  const { session } = useAuth();
  
  // Close modal if user is already logged in
  React.useEffect(() => {
    if (session?.user) {
      onClose();
    }
  }, [session, onClose]);
  const [credentials, setCredentials] = useState({
    username: '',
    password: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setCredentials(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Dismiss keyboard when Enter is pressed (except in password field where Enter submits)
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && e.target.name === 'username') {
      // Move focus to password field instead of dismissing
      const passwordInput = document.getElementById('password');
      if (passwordInput) {
        passwordInput.focus();
      }
    }
  };

  // Dismiss keyboard when clicking outside inputs
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      // Blur any active input
      const activeElement = document.activeElement;
      if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
        activeElement.blur();
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // Dismiss keyboard by blurring active input
    const activeElement = document.activeElement;
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
      activeElement.blur();
    }

    try {
      // Sign in with Supabase
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: credentials.username, // Supabase uses email for authentication
        password: credentials.password,
      });

      if (authError) {
        throw authError;
      }

      if (data.user) {
        // Clear the form
        setCredentials({ username: '', password: '' });
        setError('');
        // The AuthProvider will automatically update with the new session
        onClose();
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <div className={styles.modalOverlay} onClick={handleOverlayClick}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>User Login</h2>
          <button 
            className={styles.closeButton}
            onClick={handleClose}
            aria-label="Close modal"
          >
            ×
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className={styles.loginForm}>
          {error && (
            <div className={styles.errorMessage}>
              {error}
            </div>
          )}
          
          <div className={styles.formGroup}>
            <label htmlFor="username" className={styles.label}>
              Email
            </label>
            <input
              type="email"
              id="username"
              name="username"
              value={credentials.username}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              className={styles.input}
              placeholder="Enter your email"
              required
              disabled={isLoading}
            />
          </div>
          
          <div className={styles.formGroup}>
            <label htmlFor="password" className={styles.label}>
              Password
            </label>
            <input
              type="password"
              id="password"
              name="password"
              value={credentials.password}
              onChange={handleInputChange}
              className={styles.input}
              placeholder="Enter your password"
              required
              disabled={isLoading}
            />
          </div>
          
          <div className={styles.buttonGroup}>
            <button 
              type="button" 
              onClick={handleClose}
              className={styles.cancelButton}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button 
              type="submit"
              className={styles.loginButton}
              disabled={isLoading}
            >
              {isLoading ? 'Logging in...' : 'Login'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginModal;

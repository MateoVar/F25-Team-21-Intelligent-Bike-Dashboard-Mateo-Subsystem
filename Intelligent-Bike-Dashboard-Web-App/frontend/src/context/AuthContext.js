import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    try {
      setLoading(true);
      
      // Always clear the local session first to ensure UI updates immediately
      setSession(null);
      
      // Try to sign out from Supabase if there's a session
      try {
        const { error } = await supabase.auth.signOut();
        if (error) {
          console.error('Supabase logout error:', error);
        }
      } catch (supabaseError) {
        console.error('Supabase logout failed:', supabaseError);
        // Continue anyway since we've already cleared the local session
      }
      
    } catch (error) {
      console.error('Logout process error:', error);
      // Ensure session is cleared even if there's an error
      setSession(null);
    } finally {
      setLoading(false);
    }
  };

  const value = {
    session,
    user: session?.user || null,
    loading,
    signOut,
    showLoginModal,
    setShowLoginModal,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

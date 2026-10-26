import { createClient } from '@supabase/supabase-js'

// Use environment variables (same pattern as your Mapbox token)
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file.')
}

// Everything in the frontend bundle is public, so refuse a service_role key,
// which bypasses Row Level Security and would give anyone full database access
const getJwtRole = (jwt) => {
  try {
    const base64 = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(base64)).role || null
  } catch {
    return null
  }
}

if (getJwtRole(supabaseAnonKey) === 'service_role') {
  throw new Error('REACT_APP_SUPABASE_ANON_KEY is a service_role key. Use the anon (public) key instead.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

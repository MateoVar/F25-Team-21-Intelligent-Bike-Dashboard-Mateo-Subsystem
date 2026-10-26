import { supabase } from '../lib/supabase';

// Service for handling ride data operations with Supabase
export class RideService {
  // Save a completed ride (distance in miles, duration in minutes)
  static async saveRide(rideData) {
    try {
      // Basic validation - backend handles all unit conversions
      if (isNaN(rideData.distance) || rideData.distance < 0) {
        throw new Error(`Invalid distance value: ${rideData.distance}`);
      }
      
      if (isNaN(rideData.duration) || rideData.duration < 0) {
        throw new Error(`Invalid duration value: ${rideData.duration}`);
      }

      // Validate GeoJSON format
      if (!rideData.routeGeojson || !rideData.routeGeojson.type || rideData.routeGeojson.type !== 'LineString') {
        throw new Error('Invalid GeoJSON format - must be LineString');
      }

      if (!rideData.routeGeojson.coordinates || !Array.isArray(rideData.routeGeojson.coordinates)) {
        throw new Error('Invalid GeoJSON coordinates - must be an array');
      }

      const { data, error } = await supabase
        .from('web_routes')
        .insert([
          {
            user_id: rideData.userId,
            route_geojson: rideData.routeGeojson,
            distance: rideData.distance,
            duration: rideData.duration
          }
        ])
        .select()
        .single();

      if (error) {
        console.error('Error saving ride to database:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Failed to save ride:', error);
      throw error;
    }
  }

  // Get all rides for a specific user
  static async getUserRides(userId) {
    try {
      const { data, error } = await supabase
        .from('web_routes')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching user rides:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Failed to fetch user rides:', error);
      throw error;
    }
  }

  // Get a specific ride by ID
  static async getRideById(rideId) {
    try {
      const { data, error } = await supabase
        .from('web_routes')
        .select('*')
        .eq('id', rideId)
        .single();

      if (error) {
        console.error('Error fetching ride:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Failed to fetch ride:', error);
      throw error;
    }
  }

  // Convert coordinates array to GeoJSON LineString format
  static createGeoJSONLineString(coordinates) {
    return {
      type: "LineString",
      coordinates: coordinates
    };
  }

  // Convert duration from seconds to minutes
  static secondsToMinutes(seconds) {
    return parseFloat((seconds / 60).toFixed(3)); // Convert to decimal with 3 decimal places precision
  }
}

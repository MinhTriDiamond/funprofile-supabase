/**
 * Performance Optimization Utilities
 * Streamlined utilities for performance detection
 */

// Detect slow connection
export const isSlowConnection = (): boolean => {
  const connection = (navigator as Navigator & { 
    connection?: { effectiveType?: string; saveData?: boolean } 
  }).connection;
  if (connection) {
    return connection.saveData || 
           connection.effectiveType === 'slow-2g' || 
           connection.effectiveType === '2g';
  }
  return false;
};

// Reduce motion preference
export const prefersReducedMotion = (): boolean => {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

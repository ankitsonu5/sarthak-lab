export const environment = {
  production: true,
  // PRODUCTION: Keep current online API to avoid breaking live deployment
  apiUrl: 'http://103.181.200.73:3000/api',
  // PERFORMANCE SETTINGS - OPTIMIZED FOR PRODUCTION
  performance: {
    enableConsoleLogging: false, // Disabled in production
    enableCaching: true,
    debounceTime: 200, // Faster response in production
    autoRefreshInterval: 300000, // 5 minutes in production
    enableChangeDetectionLogging: false,
    enablePerformanceMonitoring: false
  }
};

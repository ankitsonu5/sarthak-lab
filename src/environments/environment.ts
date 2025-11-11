
export const environment = {
  production: false,

  // In dev use Angular proxy to local backend
  apiUrl: '/api',
  // PERFORMANCE SETTINGS
  performance: {
    enableConsoleLogging: false,
    enableCaching: true,
    debounceTime: 300,
    autoRefreshInterval: 30000, // 30 seconds
    enableChangeDetectionLogging: false,
    enablePerformanceMonitoring: true
  }
};

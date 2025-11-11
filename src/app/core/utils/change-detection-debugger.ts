import { Injectable, NgZone } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ChangeDetectionDebugger {
  private detectionCount = 0;
  private detectionHistory: string[] = [];
  private maxDetections = 50;

  constructor(private ngZone: NgZone) {}

  trackDetection(componentName: string, method: string): void {
    this.detectionCount++;
    const timestamp = new Date().toISOString();
    const entry = `${timestamp} - ${componentName}.${method} (Count: ${this.detectionCount})`;
    
    this.detectionHistory.push(entry);
    
    // Keep only recent entries
    if (this.detectionHistory.length > this.maxDetections) {
      this.detectionHistory.shift();
    }

    // Log warning if too many detections
    if (this.detectionCount > 20) {
      console.warn('🚨 POTENTIAL INFINITE LOOP DETECTED:', {
        count: this.detectionCount,
        component: componentName,
        method: method,
        recentHistory: this.detectionHistory.slice(-10)
      });
    }

    // Reset counter after a delay
    this.ngZone.runOutsideAngular(() => {
      setTimeout(() => {
        this.detectionCount = 0;
      }, 1000);
    });
  }

  getDetectionHistory(): string[] {
    return [...this.detectionHistory];
  }

  reset(): void {
    this.detectionCount = 0;
    this.detectionHistory = [];
  }
}

import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-performance-monitor',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="performance-monitor" *ngIf="showMonitor">
      <div class="monitor-header">
        <h4>⚡ Performance Monitor</h4>
        <button (click)="toggleMonitor()" class="close-btn">×</button>
      </div>
      
      <div class="monitor-stats">
        <div class="stat-item">
          <span class="stat-label">Memory:</span>
          <span class="stat-value">{{ memoryUsage }}MB</span>
        </div>
        
        <div class="stat-item">
          <span class="stat-label">Load Time:</span>
          <span class="stat-value">{{ loadTime }}ms</span>
        </div>
        
        <div class="stat-item">
          <span class="stat-label">API Calls:</span>
          <span class="stat-value">{{ apiCallCount }}</span>
        </div>
        
        <div class="stat-item">
          <span class="stat-label">Cache Hits:</span>
          <span class="stat-value">{{ cacheHits }}</span>
        </div>
      </div>
      
      <div class="monitor-tips">
        <h5>💡 Performance Tips:</h5>
        <ul>
          <li>Clear browser cache: Ctrl+Shift+Delete</li>
          <li>Close unused tabs</li>
          <li>Update browser to latest version</li>
          <li>Check available RAM (>4GB recommended)</li>
        </ul>
      </div>
    </div>
    
    <button 
      *ngIf="!showMonitor && enableMonitoring" 
      (click)="toggleMonitor()" 
      class="monitor-toggle"
      title="Show Performance Monitor">
      ⚡
    </button>
  `,
  styles: [`
    .performance-monitor {
      position: fixed;
      top: 20px;
      right: 20px;
      width: 300px;
      background: white;
      border: 1px solid #ddd;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 9999;
      font-size: 12px;
    }
    
    .monitor-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 15px;
      background: #f8f9fa;
      border-bottom: 1px solid #ddd;
      border-radius: 8px 8px 0 0;
    }
    
    .monitor-header h4 {
      margin: 0;
      font-size: 14px;
      color: #333;
    }
    
    .close-btn {
      background: none;
      border: none;
      font-size: 18px;
      cursor: pointer;
      color: #666;
    }
    
    .monitor-stats {
      padding: 15px;
    }
    
    .stat-item {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    
    .stat-label {
      color: #666;
    }
    
    .stat-value {
      font-weight: bold;
      color: #333;
    }
    
    .monitor-tips {
      padding: 15px;
      background: #f8f9fa;
      border-top: 1px solid #ddd;
    }
    
    .monitor-tips h5 {
      margin: 0 0 10px 0;
      font-size: 12px;
      color: #333;
    }
    
    .monitor-tips ul {
      margin: 0;
      padding-left: 15px;
    }
    
    .monitor-tips li {
      margin-bottom: 4px;
      color: #666;
    }
    
    .monitor-toggle {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 50px;
      height: 50px;
      border-radius: 50%;
      background: #007bff;
      color: white;
      border: none;
      font-size: 20px;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      z-index: 9998;
    }
    
    .monitor-toggle:hover {
      background: #0056b3;
    }
  `]
})
export class PerformanceMonitorComponent implements OnInit, OnDestroy {
  showMonitor = false;
  enableMonitoring = environment.performance.enablePerformanceMonitoring;
  
  memoryUsage = 0;
  loadTime = 0;
  apiCallCount = 0;
  cacheHits = 0;
  
  private interval: any;
  
  ngOnInit(): void {
    if (this.enableMonitoring) {
      this.startMonitoring();
    }
  }
  
  ngOnDestroy(): void {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }
  
  toggleMonitor(): void {
    this.showMonitor = !this.showMonitor;
  }
  
  private startMonitoring(): void {
    // Initial load time
    this.loadTime = Math.round(performance.now());

    // 🚫 DISABLED: Performance monitoring interval to prevent infinite loops
    console.log('🚫 PERFORMANCE MONITOR: Interval disabled to prevent infinite loops');
    // Interval removed - manual monitoring only
  }
  
  private updateStats(): void {
    // Memory usage (if available)
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      this.memoryUsage = Math.round(memory.usedJSHeapSize / 1024 / 1024);
    }
    
    // API call count (mock - would need actual implementation)
    this.apiCallCount = Math.floor(Math.random() * 50) + 10;
    
    // Cache hits (mock - would need actual implementation)
    this.cacheHits = Math.floor(Math.random() * 20) + 5;
  }
}

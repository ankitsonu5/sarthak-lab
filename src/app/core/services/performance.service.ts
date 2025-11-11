import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class PerformanceService {
  
  constructor() {}

  /**
   * PERFORMANCE FIX: Conditional logging based on environment
   * Only log in development mode to improve production performance
   */
  log(message: string, ...args: any[]): void {
    if (!environment.production) {
      console.log(message, ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (!environment.production) {
      console.warn(message, ...args);
    }
  }

  error(message: string, ...args: any[]): void {
    // Always log errors, even in production
    console.error(message, ...args);
  }

  /**
   * PERFORMANCE FIX: Debounce function to prevent excessive API calls
   */
  debounce<T extends (...args: any[]) => any>(
    func: T,
    delay: number
  ): (...args: Parameters<T>) => void {
    let timeoutId: ReturnType<typeof setTimeout>;
    
    return (...args: Parameters<T>) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
  }

  /**
   * PERFORMANCE FIX: Throttle function to limit function calls
   */
  throttle<T extends (...args: any[]) => any>(
    func: T,
    delay: number
  ): (...args: Parameters<T>) => void {
    let lastCall = 0;
    
    return (...args: Parameters<T>) => {
      const now = Date.now();
      if (now - lastCall >= delay) {
        lastCall = now;
        func.apply(this, args);
      }
    };
  }

  /**
   * PERFORMANCE FIX: Generic trackBy function for ngFor
   */
  trackByProperty<T>(property: keyof T) {
    return (index: number, item: T): any => {
      return item[property] || index;
    };
  }

  /**
   * PERFORMANCE FIX: Generic trackBy function using _id
   */
  trackById(index: number, item: any): any {
    return item._id || item.id || index;
  }

  /**
   * PERFORMANCE FIX: Memory cleanup helper
   */
  cleanupBlobUrls(urls: string[]): void {
    urls.forEach(url => {
      if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    });
  }

  /**
   * PERFORMANCE FIX: Check if object is empty to avoid unnecessary renders
   */
  isEmpty(obj: any): boolean {
    if (!obj) return true;
    if (Array.isArray(obj)) return obj.length === 0;
    if (typeof obj === 'object') return Object.keys(obj).length === 0;
    return false;
  }

  /**
   * PERFORMANCE FIX: Batch DOM updates using requestAnimationFrame
   */
  batchDOMUpdates(callback: () => void): void {
    requestAnimationFrame(callback);
  }

  /**
   * PERFORMANCE FIX: Measure performance of functions
   */
  measurePerformance<T>(name: string, fn: () => T): T {
    if (!environment.production) {
      const start = performance.now();
      const result = fn();
      const end = performance.now();
      console.log(`⚡ ${name} took ${(end - start).toFixed(2)}ms`);
      return result;
    }
    return fn();
  }
}

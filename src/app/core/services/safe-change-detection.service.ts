import { Injectable, ChangeDetectorRef, NgZone } from '@angular/core';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

interface ChangeDetectionRequest {
  componentName: string;
  cdr: ChangeDetectorRef;
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class SafeChangeDetectionService {
  private changeRequests = new Subject<ChangeDetectionRequest>();
  private pendingComponents = new Set<string>();
  private isProcessing = false;

  constructor(private ngZone: NgZone) {
    this.setupSafeChangeDetection();
  }

  private setupSafeChangeDetection(): void {
    // Debounce and batch change detection requests
    this.changeRequests.pipe(
      debounceTime(50), // Wait 50ms for batching
      distinctUntilChanged((prev, curr) => prev.componentName === curr.componentName)
    ).subscribe((request) => {
      this.processSafeChangeDetection(request);
    });
  }

  /**
   * Safely trigger change detection with infinite loop prevention
   */
  safeDetectChanges(cdr: ChangeDetectorRef, componentName: string, operation?: string): void {
    const fullName = operation ? `${componentName}-${operation}` : componentName;

    // Prevent multiple requests from same component operation
    if (this.pendingComponents.has(fullName)) {
      console.log(`🚫 SafeCD: Skipping duplicate request for ${fullName}`);
      return;
    }

    this.pendingComponents.add(fullName);

    const request: ChangeDetectionRequest = {
      componentName: fullName,
      cdr,
      timestamp: Date.now()
    };

    this.changeRequests.next(request);
  }

  /**
   * Batch multiple change detection requests
   */
  batchDetectChanges(requests: Array<{cdr: ChangeDetectorRef, componentName: string, operation?: string}>): void {
    requests.forEach(req => {
      this.safeDetectChanges(req.cdr, req.componentName, req.operation);
    });
  }

  private processSafeChangeDetection(request: ChangeDetectionRequest): void {
    if (this.isProcessing) {
      console.log(`🚫 SafeCD: Already processing, skipping ${request.componentName}`);
      return;
    }

    this.isProcessing = true;

    // Run outside Angular zone to prevent triggering more change detection
    this.ngZone.runOutsideAngular(() => {
      setTimeout(() => {
        this.ngZone.run(() => {
          try {
            // Check if ChangeDetectorRef is still valid
            if (request.cdr && typeof request.cdr.detectChanges === 'function') {
              request.cdr.detectChanges();
              console.log(`✅ SafeCD: Change detection completed for ${request.componentName}`);
            }
          } catch (error) {
            console.error(`❌ SafeCD: Error in change detection for ${request.componentName}:`, error);
          } finally {
            this.pendingComponents.delete(request.componentName);
            this.isProcessing = false;
          }
        });
      }, 0);
    });
  }

  /**
   * Mark component for check safely
   */
  safeMarkForCheck(cdr: ChangeDetectorRef, componentName: string): void {
    this.ngZone.runOutsideAngular(() => {
      setTimeout(() => {
        this.ngZone.run(() => {
          try {
            // Check if ChangeDetectorRef is still valid
            if (cdr && typeof cdr.markForCheck === 'function') {
              cdr.markForCheck();
              console.log(`✅ SafeCD: MarkForCheck completed for ${componentName}`);
            }
          } catch (error) {
            console.error(`❌ SafeCD: Error in markForCheck for ${componentName}:`, error);
          }
        });
      }, 0);
    });
  }

  /**
   * Reset all pending requests (use in ngOnDestroy)
   */
  cleanup(componentName: string): void {
    this.pendingComponents.delete(componentName);
  }
}

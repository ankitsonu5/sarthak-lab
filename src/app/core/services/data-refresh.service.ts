import { Injectable } from '@angular/core';
import { Subject, Observable, BehaviorSubject, ReplaySubject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

export interface RefreshEvent {
  entity: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'REFRESH' | 'BOOKED';
  data?: any;
  timestamp: Date;
}

@Injectable({
  providedIn: 'root'
})
export class DataRefreshService {
  // Use ReplaySubject(1) so late subscribers (after navigation) still get the latest event
  private refreshSubject = new ReplaySubject<RefreshEvent>(1);
  public refresh$ = this.refreshSubject.asObservable().pipe(
    debounceTime(50),
    distinctUntilChanged((prev, curr) =>
      prev.entity === curr.entity &&
      prev.action === curr.action &&
      prev.timestamp.getTime() === curr.timestamp.getTime()
    )
  );

  // Entity-specific refresh triggers
  private patientRefreshSubject = new BehaviorSubject<boolean>(false);
  private appointmentRefreshSubject = new BehaviorSubject<boolean>(false);
  private cashReceiptRefreshSubject = new BehaviorSubject<boolean>(false);

  public patientRefresh$ = this.patientRefreshSubject.asObservable();
  public appointmentRefresh$ = this.appointmentRefreshSubject.asObservable();
  public cashReceiptRefresh$ = this.cashReceiptRefreshSubject.asObservable();

  constructor() {
    console.log('🔄 DataRefreshService: Initialized');
  }

  // Trigger refresh (OPD: enable appointments events; keep pathology booking)
  triggerRefresh(entity: string, action: RefreshEvent['action'] = 'REFRESH', data?: any): void {
    console.log('🔄 DataRefresh: triggerRefresh called with:', { entity, action, data });

    // Allowlist to prevent loops but permit critical real-time updates
    const allow = (
      (entity === 'pathology' && (action === 'BOOKED' || action === 'CREATE' || action === 'UPDATE' || action === 'DELETE' || action === 'REFRESH')) ||
      (entity === 'appointments' && (action === 'CREATE' || action === 'UPDATE' || action === 'REFRESH'))
    );

    if (allow) {
      const event: RefreshEvent = { entity, action, data, timestamp: new Date() };
      console.log('📤 DataRefresh: Sending event:', event);
      this.refreshSubject.next(event);
      return;
    }

    console.log('🚫 DataRefresh: triggerRefresh ignored (entity/action not allowlisted)', { entity, action });
  }

  // Convenience methods for common operations
  refreshPatients(): void {
    this.triggerRefresh('patients', 'REFRESH');
  }

  refreshAppointments(): void {
    this.triggerRefresh('appointments', 'REFRESH');
  }

  refreshCashReceipts(): void {
    this.triggerRefresh('cashReceipts', 'REFRESH');
  }

  // Notify about CRUD operations
  notifyPatientCreated(patient: any): void {
    this.triggerRefresh('patients', 'CREATE', patient);
  }

  notifyPatientUpdated(patient: any): void {
    this.triggerRefresh('patients', 'UPDATE', patient);
  }

  notifyPatientDeleted(patientId: string): void {
    this.triggerRefresh('patients', 'DELETE', { id: patientId });
  }

  notifyAppointmentCreated(appointment: any): void {
    this.triggerRefresh('appointments', 'CREATE', appointment);
  }

  notifyAppointmentUpdated(appointment: any): void {
    this.triggerRefresh('appointments', 'UPDATE', appointment);
  }

  notifyAppointmentDeleted(appointmentId: string): void {
    this.triggerRefresh('appointments', 'DELETE', { id: appointmentId });
  }

  notifyCashReceiptCreated(receipt: any): void {
    this.triggerRefresh('cashReceipts', 'CREATE', receipt);
  }

  // Notify about pathology booking
  notifyPathologyBooked(data: any): void {
    console.log('🔔 DataRefreshService: notifyPathologyBooked called with data:', data);
    this.triggerRefresh('pathology', 'BOOKED', data);
    console.log('🔔 DataRefreshService: triggerRefresh called for pathology booking');
  }

  // Listen for specific entity refreshes
  onEntityRefresh(entity: string): Observable<RefreshEvent> {
    return new Observable(observer => {
      const subscription = this.refresh$.subscribe(event => {
        if (event.entity.toLowerCase() === entity.toLowerCase()) {
          observer.next(event);
        }
      });
      return () => subscription.unsubscribe();
    });
  }

  // Global refresh (refresh everything)
  refreshAll(): void {
    console.log('🔄 DataRefresh: Triggering global refresh');
    this.triggerRefresh('patients', 'REFRESH');
    this.triggerRefresh('appointments', 'REFRESH');
    this.triggerRefresh('cashReceipts', 'REFRESH');
  }

  // Reset all refresh states
  resetRefreshStates(): void {
    this.patientRefreshSubject.next(false);
    this.appointmentRefreshSubject.next(false);
    this.cashReceiptRefreshSubject.next(false);
  }
}

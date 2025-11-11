import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { filter } from 'rxjs/operators';

export interface ModalEvent {
  type: 'CREATED' | 'UPDATED' | 'DELETED' | 'CLOSED' | 'SAVED';
  entity: string; // 'patient', 'appointment', 'cashReceipt', etc.
  data?: any;
  modalId?: string;
  success?: boolean;
  message?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ModalCommunicationService {
  private eventSubject = new Subject<ModalEvent>();
  public events$ = this.eventSubject.asObservable();

  constructor() {
    console.log('📡 ModalCommunicationService: Initialized');
  }

  // DISABLED: Emit modal events to prevent infinite loops
  emitEvent(event: ModalEvent): void {
    console.log('🚫 Modal Event: emitEvent DISABLED to prevent infinite loops');
    // this.eventSubject.next(event);
  }

  // Listen for specific entity events
  onEntityEvents(entity: string): Observable<ModalEvent> {
    return this.events$.pipe(
      filter(event => event.entity === entity)
    );
  }

  // Listen for specific event types
  onEventType(type: ModalEvent['type']): Observable<ModalEvent> {
    return this.events$.pipe(
      filter(event => event.type === type)
    );
  }

  // Listen for specific entity and event type
  onEntityEventType(entity: string, type: ModalEvent['type']): Observable<ModalEvent> {
    return this.events$.pipe(
      filter(event => event.entity === entity && event.type === type)
    );
  }

  // Convenience methods for common events
  emitPatientCreated(patient: any): void {
    this.emitEvent({
      type: 'CREATED',
      entity: 'patient',
      data: patient,
      success: true
    });
  }

  emitPatientUpdated(patient: any): void {
    this.emitEvent({
      type: 'UPDATED',
      entity: 'patient',
      data: patient,
      success: true
    });
  }

  emitPatientDeleted(patientId: string): void {
    this.emitEvent({
      type: 'DELETED',
      entity: 'patient',
      data: { id: patientId },
      success: true
    });
  }

  emitAppointmentCreated(appointment: any): void {
    this.emitEvent({
      type: 'CREATED',
      entity: 'appointment',
      data: appointment,
      success: true
    });
  }

  emitAppointmentUpdated(appointment: any): void {
    this.emitEvent({
      type: 'UPDATED',
      entity: 'appointment',
      data: appointment,
      success: true
    });
  }

  emitCashReceiptCreated(receipt: any): void {
    this.emitEvent({
      type: 'CREATED',
      entity: 'cashReceipt',
      data: receipt,
      success: true
    });
  }

  emitModalClosed(entity: string, modalId?: string, data?: any): void {
    this.emitEvent({
      type: 'CLOSED',
      entity: entity,
      modalId: modalId,
      data: data
    });
  }

  emitModalSaved(entity: string, data: any, success: boolean = true): void {
    this.emitEvent({
      type: 'SAVED',
      entity: entity,
      data: data,
      success: success
    });
  }

  // Listen for patient events specifically
  onPatientEvents(): Observable<ModalEvent> {
    return this.onEntityEvents('patient');
  }

  // Listen for appointment events specifically
  onAppointmentEvents(): Observable<ModalEvent> {
    return this.onEntityEvents('appointment');
  }

  // Listen for cash receipt events specifically
  onCashReceiptEvents(): Observable<ModalEvent> {
    return this.onEntityEvents('cashReceipt');
  }
}

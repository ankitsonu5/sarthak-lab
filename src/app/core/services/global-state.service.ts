import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject, Observable } from 'rxjs';
import { map, distinctUntilChanged } from 'rxjs/operators';

export interface GlobalState {
  patients: any[];
  appointments: any[];
  departments: any[];
  rooms: any[];
  cashReceipts: any[];
  loading: {
    patients: boolean;
    appointments: boolean;
    departments: boolean;
    rooms: boolean;
    cashReceipts: boolean;
  };
  lastUpdated: {
    patients: Date | null;
    appointments: Date | null;
    departments: Date | null;
    rooms: Date | null;
    cashReceipts: Date | null;
  };
}

export interface StateUpdate {
  type: 'CREATE' | 'UPDATE' | 'DELETE' | 'REFRESH';
  entity: 'patients' | 'appointments' | 'departments' | 'rooms' | 'cashReceipts';
  data?: any;
  id?: string;
}

@Injectable({
  providedIn: 'root'
})
export class GlobalStateService {
  private initialState: GlobalState = {
    patients: [],
    appointments: [],
    departments: [],
    rooms: [],
    cashReceipts: [],
    loading: {
      patients: false,
      appointments: false,
      departments: false,
      rooms: false,
      cashReceipts: false
    },
    lastUpdated: {
      patients: null,
      appointments: null,
      departments: null,
      rooms: null,
      cashReceipts: null
    }
  };

  // Main state BehaviorSubject
  private stateSubject = new BehaviorSubject<GlobalState>(this.initialState);
  public state$ = this.stateSubject.asObservable();

  // Entity-specific observables
  public patients$ = this.state$.pipe(
    map(state => state.patients),
    distinctUntilChanged()
  );

  public appointments$ = this.state$.pipe(
    map(state => state.appointments),
    distinctUntilChanged()
  );

  public departments$ = this.state$.pipe(
    map(state => state.departments),
    distinctUntilChanged()
  );

  public rooms$ = this.state$.pipe(
    map(state => state.rooms),
    distinctUntilChanged()
  );

  public cashReceipts$ = this.state$.pipe(
    map(state => state.cashReceipts),
    distinctUntilChanged()
  );

  // Loading state observables
  public patientsLoading$ = this.state$.pipe(
    map(state => state.loading.patients),
    distinctUntilChanged()
  );

  public appointmentsLoading$ = this.state$.pipe(
    map(state => state.loading.appointments),
    distinctUntilChanged()
  );

  // Update notifications
  private updateSubject = new Subject<StateUpdate>();
  public updates$ = this.updateSubject.asObservable();

  constructor() {
    console.log('🌐 GlobalStateService: Initialized');
  }

  // Get current state
  getCurrentState(): GlobalState {
    return this.stateSubject.value;
  }

  // Get specific entity data
  getPatients(): any[] {
    return this.getCurrentState().patients;
  }

  getAppointments(): any[] {
    return this.getCurrentState().appointments;
  }

  // DISABLED: Update entire entity list to prevent infinite loops
  updatePatients(patients: any[]): void {
    console.log('🚫 GlobalState: updatePatients DISABLED to prevent infinite loops');
    // const currentState = this.getCurrentState();
    // const newState = {
    //   ...currentState,
    //   patients,
    //   lastUpdated: {
    //     ...currentState.lastUpdated,
    //     patients: new Date()
    //   }
    // };
    // this.stateSubject.next(newState);
    // this.updateSubject.next({ type: 'REFRESH', entity: 'patients', data: patients });
    // console.log('🔄 GlobalState: Patients updated', patients.length, 'items');
  }

  // DISABLED: Update appointments to prevent infinite loops
  updateAppointments(appointments: any[]): void {
    console.log('🚫 GlobalState: updateAppointments DISABLED to prevent infinite loops');
    // const currentState = this.getCurrentState();
    // const newState = {
    //   ...currentState,
    //   appointments,
    //   lastUpdated: {
    //     ...currentState.lastUpdated,
    //     appointments: new Date()
    //   }
    // };
    // this.stateSubject.next(newState);
    // this.updateSubject.next({ type: 'REFRESH', entity: 'appointments', data: appointments });
    // console.log('🔄 GlobalState: Appointments updated', appointments.length, 'items');
  }

  // Add new item (optimistic update with duplicate prevention)
  // DISABLED: Add patient to prevent infinite loops
  addPatient(patient: any): void {
    console.log('🚫 GlobalState: addPatient DISABLED to prevent infinite loops');
    // const currentState = this.getCurrentState();

    // // Check for duplicates by phone number and name
    // const isDuplicate = currentState.patients.some(existingPatient =>
    //   existingPatient.phone === patient.phone &&
    //   existingPatient.firstName === patient.firstName &&
    //   existingPatient.lastName === patient.lastName
    // );

    // if (isDuplicate) {
    //   console.log('🚫 GlobalState: Duplicate patient prevented', patient.firstName, patient.lastName);
    //   return;
    // }

    // const newPatients = [patient, ...currentState.patients];
    // this.updatePatients(newPatients);
    // this.updateSubject.next({ type: 'CREATE', entity: 'patients', data: patient });
    // console.log('➕ GlobalState: Patient added', patient.firstName, patient.lastName);
  }

  // DISABLED: Add appointment to prevent infinite loops
  addAppointment(appointment: any): void {
    console.log('🚫 GlobalState: addAppointment DISABLED to prevent infinite loops');
    // const currentState = this.getCurrentState();
    // const newAppointments = [appointment, ...currentState.appointments];
    // this.updateAppointments(newAppointments);
    // this.updateSubject.next({ type: 'CREATE', entity: 'appointments', data: appointment });
    // console.log('➕ GlobalState: Appointment added');
  }

  // Update existing item
  updatePatient(patientId: string, updatedData: any): void {
    const currentState = this.getCurrentState();
    const newPatients = currentState.patients.map(patient => 
      patient._id === patientId ? { ...patient, ...updatedData } : patient
    );
    this.updatePatients(newPatients);
    this.updateSubject.next({ type: 'UPDATE', entity: 'patients', data: updatedData, id: patientId });
    console.log('📝 GlobalState: Patient updated', patientId);
  }

  // Remove item
  removePatient(patientId: string): void {
    const currentState = this.getCurrentState();
    const newPatients = currentState.patients.filter(patient => patient._id !== patientId);
    this.updatePatients(newPatients);
    this.updateSubject.next({ type: 'DELETE', entity: 'patients', id: patientId });
    console.log('🗑️ GlobalState: Patient removed', patientId);
  }

  // DISABLED: Remove appointment to prevent infinite loops
  removeAppointment(appointmentId: string): void {
    console.log('🚫 GlobalState: removeAppointment DISABLED to prevent infinite loops');
    // const currentState = this.getCurrentState();
    // const newAppointments = currentState.appointments.filter(appointment => appointment._id !== appointmentId);
    // this.updateAppointments(newAppointments);
    // this.updateSubject.next({ type: 'DELETE', entity: 'appointments', id: appointmentId });
    // console.log('🗑️ GlobalState: Appointment removed', appointmentId);
  }

  // DISABLED: Set loading state to prevent infinite loops
  setLoading(entity: keyof GlobalState['loading'], loading: boolean): void {
    console.log('🚫 GlobalState: setLoading DISABLED to prevent infinite loops');
    // const currentState = this.getCurrentState();
    // const newState = {
    //   ...currentState,
    //   loading: {
    //     ...currentState.loading,
    //     [entity]: loading
    //   }
    // };
    // this.stateSubject.next(newState);
  }

  // DISABLED: Clear state to prevent infinite loops
  clearState(): void {
    console.log('🚫 GlobalState: clearState DISABLED to prevent infinite loops');
    // this.stateSubject.next(this.initialState);
    // console.log('🧹 GlobalState: State cleared');
  }

  // Get entity-specific observables with filters
  getPatientsWithFilter(filterFn: (patients: any[]) => any[]): Observable<any[]> {
    return this.patients$.pipe(
      map(patients => filterFn(patients))
    );
  }

  getAppointmentsWithFilter(filterFn: (appointments: any[]) => any[]): Observable<any[]> {
    return this.appointments$.pipe(
      map(appointments => filterFn(appointments))
    );
  }
}

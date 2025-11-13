import { Component, OnInit, Inject, ChangeDetectorRef, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { SharedModule } from '../../shared/shared-module';
import { PatientService } from '../patient.service';
import { AppointmentService } from '../../core/services/appointment';
import { SuccessAlertComponent } from "../../shared/components/success-alert/success-alert.component";
import { ModalCommunicationService } from '../../core/services/modal-communication.service';
import { GlobalStateService } from '../../core/services/global-state.service';
import { DataRefreshService } from '../../core/services/data-refresh.service';
import { Router } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AlertService } from '../../shared/services/alert.service';



export interface PatientModalData {
  patient: any;
  mode: 'view' | 'edit' | 'book-appointment';
  appointment?: any;
}

@Component({
  selector: 'app-patient-modal-new',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    SharedModule,
    SuccessAlertComponent,
    MatSnackBarModule
],
  templateUrl: './patient-modal-new.component.html',
  styleUrls: ['./patient-modal-new.component.css']
})
export class PatientModalNewComponent implements OnInit {
  @Output() patientRegistered = new EventEmitter<any>();
  @Output() appointmentBooked = new EventEmitter<any>();
  @Output() appointmentPrinted = new EventEmitter<any>();

  patientForm!: FormGroup;
  isEditMode = false;
  isViewMode = false;
  isBookAppointmentMode = false;
  isLoading = false;
  isAppointmentBooked = false;
  appointmentData: any = null;
  // When editing from Alter OPD, personal info should be read-only
  disablePersonalInfo: boolean = false;

  // Local printed flag for showing Printed status inside modal
  hasPrinted: boolean = false;

  // Success alert properties
  showSuccessAlert = false;
  successMessage = '';
  departments: any[] = [];
  rooms: any[] = [];
  filteredRooms: any[] = [];
  selectedDepartmentId: string = '';
  selectedRoom: any = null;
  selectedDepartment: any = null;

  // Lightweight in-memory cache to make Doctor/Room dropdown feel instant
  private roomsCache = new Map<string, any[]>();
  private roomsRequestInFlight = new Set<string>();


	  // Global room map to resolve labels quickly for print
	  private roomMap = new Map<string, string>();
	  private roomsLoadComplete = false;

  // Logo for print
  logoBase64: string = '';
  secondaryLogoBase64: string = '';

  genderOptions = ['Male', 'Female', 'Other'];
  ageInOptions = ['Years', 'Months', 'Days'];
  paymentOptions = ['Cash', 'UPI'];

  // TrackBy functions for ngFor performance
  trackByDepartmentId(index: number, dept: any): any {
    return dept?._id || index;
  }
  trackByRoomId(index: number, room: any): any {
    return room?._id || index;
  }

  constructor(
    private fb: FormBuilder,
    private patientService: PatientService,
    private appointmentService: AppointmentService,
    public dialogRef: MatDialogRef<PatientModalNewComponent>,
    @Inject(MAT_DIALOG_DATA) public data: PatientModalData,
    private cdr: ChangeDetectorRef,
    private modalComm: ModalCommunicationService,
    private globalState: GlobalStateService,
    private dataRefresh: DataRefreshService,
    private router: Router,
    private snackBar: MatSnackBar,
    private alerts: AlertService
  ) {
    this.isEditMode = data.mode === 'edit';
    this.isViewMode = data.mode === 'view';
    this.isBookAppointmentMode = data.mode === 'book-appointment';

    // USER PREFERENCE: Personal info should ALWAYS be editable in all modes
    // Including Alter OPD edit flow and Book Appointment
    this.disablePersonalInfo = false; // Never disable personal info

    // CRITICAL: Initialize arrays IMMEDIATELY to prevent ngFor errors
    this.departments = [];
    this.rooms = [];
    this.filteredRooms = [];

    console.log('🔍 CONSTRUCTOR: Modal opened with data:', {
      mode: data.mode,
      patient: data.patient,
      appointment: data.appointment,
      isViewMode: this.isViewMode,
      isEditMode: this.isEditMode
    });

    console.log('🔍 CONSTRUCTOR: Arrays initialized:', {
      departments: this.departments.length,
      rooms: this.rooms.length,
      filteredRooms: this.filteredRooms.length
    });
  }

  ngOnInit(): void {
    console.log('🚀 NgOnInit called - Modal data:', this.data);
    console.log('🚀 NgOnInit - Patient:', this.data?.patient);
    console.log('🚀 NgOnInit - Appointment:', this.data?.appointment);
    console.log('🚀 NgOnInit - Mode:', this.data?.mode);

    this.initializeForm();
    this.loadDoctorsAndDepartments();
    this.loadRooms();
    this.loadLogos(); // Load logos for print
  }

  initializeForm(): void {
    const patient = this.data.patient;
    const appointment = this.data.appointment; // Get appointment data

    console.log('🔍 DEBUGGING: Patient data:', patient);
    console.log('🔍 DEBUGGING: Patient keys:', patient ? Object.keys(patient) : 'No patient');
    console.log('🔍 DEBUGGING: Patient contact field:', patient?.contact);
    console.log('🔍 DEBUGGING: Patient phone field:', patient?.phone);
    console.log('🔍 DEBUGGING: Patient address field:', patient?.address);
    console.log('🔍 DEBUGGING: Patient address type:', typeof patient?.address);
    console.log('🔍 DEBUGGING: Appointment data:', appointment);
    console.log('🔍 DEBUGGING: Appointment weightKg:', appointment?.weightKg);

    this.patientForm = this.fb.group({
      // Personal Information
      patientId: [patient?.patientId || ''],
      registrationNumber: [this.getDisplayRegistrationNumber()],
      date: [patient?.createdAt ? (() => { const d=new Date(patient.createdAt); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; })() : ''],
      aadharNo: [patient?.aadharNo || '', [Validators.pattern('^[0-9]{12}$')]],
      firstName: [patient?.firstName || '', Validators.required],
      lastName: [patient?.lastName || ''],
      age: [patient?.age || '', [Validators.required, Validators.min(0)]],
      ageIn: [patient?.ageIn || 'Years', Validators.required],
      gender: [patient?.gender || '', Validators.required],
      // Relax contact validation in Alter/Edit mode as requested
      contact: [patient?.phone || patient?.contact || '', this.isEditMode ? [] : [Validators.required, Validators.pattern('^[0-9]{10}$')]],
      address: [this.getPatientAddressString(patient) || ''], // ✅ COMPLETE FIX: Use dedicated method
      city: [this.getPatientCityString(patient) || ''],
      post: [patient?.address?.post || patient?.post || ''],
      remark: [patient?.remark || ''],

      // OPD Details - populate from appointment data if available
      registrationDate: [{ value: (() => { const d=new Date(); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; })(), disabled: !this.isEditMode }],
      weightKg: [appointment?.weightKg || patient?.weightKg || ''],
      doctor: [appointment?.room?._id || '', (this.isEditMode || this.isBookAppointmentMode) ? Validators.required : null], // Room ID from appointment
      department: [appointment?.department?._id || '', (this.isEditMode || this.isBookAppointmentMode) ? Validators.required : null], // Department ID from appointment

      // Appointment specific fields
      appointmentDate: [appointment?.appointmentDate ? (() => { const d=new Date(appointment.appointmentDate); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; })() : (() => { const d=new Date(); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; })()],
      appointmentTime: [appointment?.appointmentTime || ''],
      reason: [appointment?.reason || ''],

      // Additional fields for edit/booking mode
      fee: ['1'],
      mode: ['1'] ,// Fixed amount value
      paymentMethod: [appointment?.paymentMethod || patient?.paymentMethod || 'Cash', Validators.required],
    });

    // If we have appointment data, set the selected values for dropdowns
    if (appointment) {
      this.selectedDepartmentId = appointment.department?._id || '';
      this.selectedDepartment = appointment.department;
      this.selectedRoom = appointment.room;

      console.log('🔍 Initializing form with appointment data:', {
        department: appointment.department,
        room: appointment.room,
        selectedDepartmentId: this.selectedDepartmentId
      });
    }

    // Additionally disable specific personal fields ONLY when editing from Alter OPD in pure edit mode
    // NEVER disable in Book Appointment or Follow-Up modes (user preference)
    // The disablePersonalInfo flag is ONLY for the pure Alter OPD edit flow (not booking/follow-up)
    if (this.disablePersonalInfo) {
      // disablePersonalInfo is true only when: isEditMode=true AND fromAlterOpd=true
      // But we should NOT disable if it's actually a booking flow
      // Since there's no separate flag, we rely on the template conditions
      // So we DON'T programmatically disable here - let template handle it
      console.log('⚠️ Alter OPD edit mode detected - personal fields controlled by template');
    }

    // Book/Follow-Up Appointment modes: personal info always editable (no programmatic disable)

    // Don't disable the entire form in view mode - let HTML handle readonly
    // Individual fields are made readonly via [readonly]="isViewMode" in template
    console.log('📋 Form initialized with data:', this.patientForm.value);
    console.log('📋 Raw form data:', this.patientForm.getRawValue());
    console.log('📋 Patient data received:', patient);
    console.log('📋 Appointment data received:', appointment);

    if (this.isViewMode) {
      console.log('👁 View mode: Form fields will be readonly via template');
      console.log('👁 Form controls:', Object.keys(this.patientForm.controls));

      // Log each form control value
      Object.keys(this.patientForm.controls).forEach(key => {
        const control = this.patientForm.get(key);
        console.log(`👁 ${key}:`, control?.value);
      });
    }
  }

  loadDoctorsAndDepartments(): void {
    console.log('🏥 Loading departments from API...');

    // Load departments from API
    console.log('🔄 Loading departments from API...');
    this.patientService.getDepartments().subscribe({
      next: (departments: any[]) => {
        console.log('🏥 ✅ Received departments:', departments);
        console.log('🏥 ✅ Is array?', Array.isArray(departments));
        console.log('🏥 ✅ Count:', departments.length);

        // Service already returns array, just assign it
        this.departments = departments || [];

        console.log('🏥 ✅ Final departments assigned:', this.departments.length);
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('❌ Error loading departments:', error);
        this.departments = [];
        this.cdr.detectChanges();
      }
    });
  }

  loadRooms(): void {
    // If we have a selected department from appointment data, load rooms for that department
    if (this.selectedDepartmentId) {
      // Use regular method for initialization (don't auto-select when editing existing appointment)
      this.getRoomsForDepartment(this.selectedDepartmentId);
    } else {
      // No department selected, clear rooms
      this.filteredRooms = [];
      this.cdr.detectChanges();
    }
  }

  // Cached fetch so the Doctor/Room dropdown opens instantly after first load
  private getRoomsForDepartment(departmentId: string): void {
    // If cached, serve instantly
    const cached = this.roomsCache.get(departmentId);
    if (cached) {
      this.filteredRooms = cached;
      this.cdr.detectChanges();
      return;
    }

    // Prevent duplicate concurrent requests
    if (this.roomsRequestInFlight.has(departmentId)) {
      return;
    }
    this.roomsRequestInFlight.add(departmentId);

    this.patientService.getRoomsByDepartment(departmentId).subscribe({
      next: (rooms) => {
        const list = rooms || [];
        this.roomsCache.set(departmentId, list);
        this.filteredRooms = list;
        this.roomsRequestInFlight.delete(departmentId);
        this.cdr.detectChanges();
      },
      error: () => {
        this.filteredRooms = [];
        this.roomsRequestInFlight.delete(departmentId);
        this.cdr.detectChanges();
      }
    });
  }

  // Enhanced method with auto-selection when only one room exists
  private getRoomsForDepartmentWithAutoSelect(departmentId: string): void {
    // If cached, serve instantly and check for auto-selection
    const cached = this.roomsCache.get(departmentId);
    if (cached) {
      this.filteredRooms = cached;
      this.autoSelectRoomIfOnlyOne();
      this.cdr.detectChanges();
      return;
    }

    // Prevent duplicate concurrent requests
    if (this.roomsRequestInFlight.has(departmentId)) {
      return;
    }
    this.roomsRequestInFlight.add(departmentId);

    this.patientService.getRoomsByDepartment(departmentId).subscribe({
      next: (rooms) => {
        const list = rooms || [];
        this.roomsCache.set(departmentId, list);
        this.filteredRooms = list;
        this.roomsRequestInFlight.delete(departmentId);

        // Auto-select room if only one exists
        this.autoSelectRoomIfOnlyOne();
        this.cdr.detectChanges();
      },
      error: () => {
        this.filteredRooms = [];
        this.roomsRequestInFlight.delete(departmentId);
        this.cdr.detectChanges();
      }
    });
  }

  // Auto-select room if department has only one room
  private autoSelectRoomIfOnlyOne(): void {
    if (this.filteredRooms && this.filteredRooms.length === 1) {
      const singleRoom = this.filteredRooms[0];
      console.log('🏥 Auto-selecting single room:', singleRoom);

      // Set the room in the form
      this.patientForm.patchValue({
        doctor: singleRoom._id
      });

      // Update selected room reference
      this.selectedRoom = singleRoom;

      console.log('✅ Auto-selected room:', singleRoom.roomNumber || singleRoom.name);
    }
  }
  // Ensure backend saved the selected payment method; retry if needed
  private ensurePaymentMethodCorrect(appointmentId: string, selectedPayment: 'Cash' | 'UPI', attempts = 3): void {
    if (!appointmentId || !selectedPayment) { return; }

    const tryFix = (left: number) => {
      this.appointmentService.getAppointmentById(appointmentId).subscribe({
        next: (apt) => {
          const current = (apt as any)?.paymentMethod;
          if (current === selectedPayment) {
            // Sync local state
            if (this.appointmentData) { this.appointmentData.paymentMethod = selectedPayment; }
            this.cdr.detectChanges();
            return;
          }

          // Attempt to update
          this.appointmentService.updateAppointment(appointmentId, { paymentMethod: selectedPayment }).subscribe({
            next: () => {
              // Re-read to confirm
              setTimeout(() => {
                if (left > 1) {
                  tryFix(left - 1);
                } else {
                  // Final check
                  this.appointmentService.getAppointmentById(appointmentId).subscribe({
                    next: (finalApt) => {
                      const finalPM = (finalApt as any)?.paymentMethod;
                      if (finalPM !== selectedPayment) {
                        console.warn('⚠️ Payment method still incorrect after retries', { finalPM, selectedPayment });
                      }
                      this.appointmentData = finalApt as any;
                      this.cdr.detectChanges();
                    },
                    error: (e) => console.warn('⚠️ Failed to refetch appointment after update', e)
                  });
                }
              }, 250);
            },
            error: (e) => {
              console.warn('⚠️ Failed to update payment method; will retry if attempts left', e);
              if (left > 1) {
                setTimeout(() => tryFix(left - 1), 300);
              }
            }
          });
        },
        error: (e) => console.warn('⚠️ ensurePaymentMethodCorrect: fetch failed', e)
      });

    };

    tryFix(attempts);
  }




  onDepartmentChange(event: any): void {
    const departmentId = event.target.value;
    this.selectedDepartmentId = departmentId;

    if (departmentId) {
      // Reset doctor (room) selection when department changes
      this.patientForm.patchValue({
        doctor: ''
      });

      // Load rooms for the selected department
      this.getRoomsForDepartmentWithAutoSelect(departmentId);
    } else {
      this.filteredRooms = [];
      // Reset doctor (room) selection when department is cleared
      this.patientForm.patchValue({
        doctor: ''
      });
    }
  }

  canBookAppointment(): boolean {
    if (!this.patientForm) return false;
    const dep = this.patientForm.get('department')?.value;
    const doc = this.patientForm.get('doctor')?.value;
    // As per requirement: enable button as soon as Department and Room are selected
    return !!dep && !!doc;
  }

  onSave(): void {
    // Relax validation: allow booking if Department + Doctor/Room selected
    const formData = this.patientForm.getRawValue();

    console.log('🔍 Save clicked - Form data:', formData);
    console.log('🔍 Doctor selected:', formData.doctor);
    console.log('🔍 Department selected:', formData.department);
    console.log('🔍 Is edit mode:', this.isEditMode);
    console.log('🔍 Has existing appointment:', !!this.data.appointment);

    if (formData.doctor && formData.department) {
      if (this.data.appointment && this.data.appointment._id) {
        console.log('📝 Updating existing appointment:', this.data.appointment._id);
        this.updateAppointment(formData);
      } else {
        console.log('✅ Booking new appointment');

        if (this.isAppointmentBooked) {
          console.log('⚠ Appointment already booked, skipping duplicate booking');
          alert('✅ Appointment already booked! Print button is enabled.');
          return;
        }

        // First update patient details (so changed info persists), then book
        this.updatePatientDetailsBeforeBooking(formData, () => {
          this.bookAppointment(formData);
        });
      }
    } else {
      console.log('⚠ Missing required fields for appointment booking');
      console.log('⚠ Doctor (Room) value:', formData.doctor);
      console.log('⚠ Department value:', formData.department);
      alert('⚠ Please select Department and Doctor (Room) to book appointment and enable print functionality!');
      return;
    }
  }







  private bookAppointment(formData: any): void {
    // Book appointment directly - faster process
    this.proceedWithAppointmentBooking(formData);
  }

  private updateAppointment(formData: any): void {
    // Update patient first, then update existing appointment
    console.log('📝 Updating appointment with form data:', formData);

    const run = () => {
      const appointmentId = this.data.appointment._id;
      const currentDate = new Date();
      const dateString = formData.registrationDate || (() => { const d=currentDate; const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; })();
      const appointmentDate = new Date(dateString);

      // Find selected room and department details
      this.selectedRoom = this.filteredRooms.find(room => room._id === formData.doctor);
      this.selectedDepartment = this.departments.find(dept => dept._id === formData.department);

      // Get current time in HH:MM format
      const currentTime = new Date().toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });

      // Prepare update data
      const updateData = {
        room: formData.doctor, // Room ID
        department: formData.department, // Department ID
        appointmentDate: appointmentDate, // Send as Date object
        appointmentTime: currentTime,
        weightKg: formData.weightKg ? parseFloat(formData.weightKg) : undefined,
        reason: 'OPD Consultation',
        type: 'Consultation' as 'Consultation',
        paymentMethod: formData.paymentMethod || 'Cash'
      };

      console.log('📝 Updating appointment with data:', updateData);
      console.log('📝 Appointment ID:', appointmentId);

      // Call appointment service to update
      this.appointmentService.updateAppointment(appointmentId, updateData).subscribe({
        next: (response) => {
          console.log('✅ Appointment updated successfully:', response);

          // Enable print button
          this.isAppointmentBooked = true;
          this.appointmentData = response.appointment || response;

          // ✅ UPDATE: Registration number with APT ID
          if (this.appointmentData?.appointmentId) {
            const aptNumber = this.getAppointmentNumber(this.appointmentData.appointmentId);
            this.patientForm.patchValue({
              registrationNumber: aptNumber
            });
            console.log('✅ Updated registration number with APT ID (update):', aptNumber);
          }

          // Force change detection
          this.cdr.detectChanges();

          // Show success alert
          this.showSuccessMessage('🎉 Appointment Updated Successfully! Print button enabled!');

          // Notify parent component about appointment update
          localStorage.setItem('appointmentUpdated', JSON.stringify({
            patientId: this.data.patient._id,
            appointmentId: appointmentId,
            appointmentData: response.appointment || response,
            timestamp: new Date().toISOString()
          }));

          console.log('📋 Modal staying open for printing. Print button should be enabled now.');
        },
        error: (error) => {
          console.error('❌ Error updating appointment:', error);
          console.error('❌ Error details:', error.error);

          let errorMessage = 'Unknown error occurred';
          if (error.error && error.error.message) {
            errorMessage = error.error.message;
          } else if (error.message) {
            errorMessage = error.message;
          }

          alert('❌ Error updating appointment: ' + errorMessage);
        }
      });
    };

    // Ensure patient details persist
    this.updatePatientDetailsBeforeBooking(formData, run);
  }

  private proceedWithAppointmentBooking(formData: any): void {
    // Get current date in proper format
    const currentDate = new Date();
    const dateString = formData.registrationDate || (() => { const d=currentDate; const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; })();
    const appointmentDate = new Date(dateString); // Convert to Date object

    console.log('📅 Original date string:', dateString);
    console.log('📅 Converted to Date object:', appointmentDate);
    console.log('📅 Date is valid:', !isNaN(appointmentDate.getTime()));

    // Find selected room details
    this.selectedRoom = this.filteredRooms.find(room => room._id === formData.doctor);
    console.log('🏥 Selected room details:', this.selectedRoom);

    // Find selected department details
    this.selectedDepartment = this.departments.find(dept => dept._id === formData.department);
    console.log('🏥 Selected department details:', this.selectedDepartment);

    // Get current time in HH:MM format
    const currentTime = new Date().toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    // Prepare appointment data
    const appointmentData = {
      patient: this.data.patient._id,
      room: formData.doctor, // formData.doctor actually contains room ID
      department: formData.department,
      appointmentDate: appointmentDate.toISOString(), // Send as ISO string
      appointmentTime: currentTime, // Real-time instead of fixed time
      reason: 'OPD Consultation',
      type: 'Consultation',
      weightKg: formData.weightKg ? parseFloat(formData.weightKg) : undefined,
      consultationFee: 1, // Fixed ₹1 as requested
      paymentMethod: formData.paymentMethod || 'Cash'
    };

    console.log('📅 Booking appointment with data:', appointmentData);
    console.log('📅 Patient ID:', this.data.patient._id);
    console.log('📅 Doctor ID:', formData.doctor);
    console.log('📅 Appointment Date:', appointmentDate);

    console.log('📞 Making API call to book appointment...');

    this.patientService.bookOpdAppointment(appointmentData).subscribe({
      next: (response) => {
        console.log('✅ Appointment booked successfully:', response);
        console.log('✅ Response structure:', JSON.stringify(response, null, 2));

        // Enable print button instantly
        this.isAppointmentBooked = true;
        this.appointmentData = response.appointment || response;

        console.log('✅ Print button enabled. isAppointmentBooked:', this.isAppointmentBooked);
        console.log('✅ Appointment data stored:', this.appointmentData);

        // ✅ UPDATE: Registration number with APT ID
        if (this.appointmentData?.appointmentId) {
          const aptNumber = this.getAppointmentNumber(this.appointmentData.appointmentId);
          this.patientForm.patchValue({
            registrationNumber: aptNumber
          });
          console.log('✅ Updated registration number with APT ID:', aptNumber);
        }


        // Ensure payment method is exactly what user selected (works even if backend defaulted to Cash)
        try {
          const selectedPayment = formData.paymentMethod as 'Cash' | 'UPI';
          if (this.appointmentData?._id && selectedPayment) {
            this.ensurePaymentMethodCorrect(this.appointmentData._id, selectedPayment, 2);
          }
        } catch (e) {
          console.warn('⚠️ Post-booking payment update check failed:', e);
        }

        // Force change detection immediately
        this.cdr.detectChanges();
        console.log('🔄 Change detection triggered. isAppointmentBooked:', this.isAppointmentBooked);

        // Right-side toast (same style as cash receipt) for 2s
        try { this.alerts.showSuccess('Appointment Booked', 'Print enabled.', { autoHideDelay: 2000 }); } catch {}
        // Fallback Material snack (in case AlertService container not present)
        try {
          this.snackBar.open('✅ Appointment booked! Print enabled.', 'Close', {
            duration: 2000,
            horizontalPosition: 'right',
            verticalPosition: 'top',
            panelClass: ['snackbar-success']
          });
        } catch {}


        // Notify parent component about appointment booking WITHOUT closing modal
        // Use multiple communication channels for maximum compatibility

        // 1. Emit appointment booked event for reactive updates
        this.appointmentBooked.emit({
          patient: this.data.patient,
          appointment: this.appointmentData,
          success: true
        });

        // 2. Use modal communication service for global notifications
        this.modalComm.emitAppointmentCreated({
          patient: this.data.patient,
          appointment: this.appointmentData,
          success: true
        });

        // 3. Update global state directly
        this.globalState.addAppointment(this.appointmentData);

        // 4. Also use localStorage for cross-component communication
        localStorage.setItem('appointmentBooked', JSON.stringify({
          patientId: this.data.patient._id,
          appointmentData: response.appointment || response,
          timestamp: new Date().toISOString()
        }));

        // 5. Notify DataRefresh service so OPD list updates instantly without manual refresh
        this.dataRefresh.notifyAppointmentCreated(this.appointmentData);

        // Don't close modal - keep it open for printing
        console.log('📋 Modal staying open for printing. Print button should be enabled now.');
      },
      error: (error) => {
        console.error('❌ Error booking appointment:', error);
        console.error('❌ Error details:', error.error);

        // If backend says duplicate for today (HTTP 409), treat as already booked and enable print
        if (error?.status === 409) {
          try {
            this.isAppointmentBooked = true;
            this.appointmentData = error?.error?.existingAppointment || null;

            // Inform user clearly
            alert('✅ Aaj ke liye appointment pehle se book hai. Print button enabled.');

            // Notify parent and global state so UI updates
            this.appointmentBooked.emit({ patient: this.data.patient, appointment: this.appointmentData, success: true });
            if (this.appointmentData) {
              this.globalState.addAppointment(this.appointmentData);
              this.dataRefresh.notifyAppointmentCreated(this.appointmentData);
            }

            this.cdr.detectChanges();
            return;
          } catch {}
        }

        let errorMessage = 'Unknown error occurred';
        if (error.error && error.error.message) {
          errorMessage = error.error.message;
        } else if (error.message) {
          errorMessage = error.message;
        }

        alert('Error booking appointment: ' + errorMessage);
      }
    });
  }

  // Restrict numeric input to digits and max length
  onNumericInput(event: any, maxLen: number, controlName: string): void {
    const input = event?.target as HTMLInputElement;
    if (!input) return;
    let value = input.value || '';
    value = value.replace(/[^0-9]/g, '').slice(0, maxLen);
    input.value = value;
    this.patientForm?.get(controlName)?.setValue(value, { emitEvent: false });
  }

  // Before booking, update patient details so changes persist
  private updatePatientDetailsBeforeBooking(formData: any, done: () => void): void {
    try {
      const patientId = this.data?.patient?._id;
      if (!patientId) { done(); return; }

      const updateData = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        age: formData.age,
        ageIn: formData.ageIn,
        gender: formData.gender,
        contact: formData.contact,
        address: { street: formData.address },
        city: formData.city,
        post: formData.post,
        remark: formData.remark,
        aadharNo: formData.aadharNo
      };

      this.patientService.updatePatient(patientId, updateData).subscribe({
        next: (_response) => {
          // Merge updates locally for immediate UI/print reflection
          this.data.patient = {
            ...this.data.patient,
            firstName: updateData.firstName,
            lastName: updateData.lastName,
            age: updateData.age,
            ageIn: updateData.ageIn,
            gender: updateData.gender,
            phone: updateData.contact,
            contact: updateData.contact,
            address: { ...(this.data.patient?.address || {}), street: formData.address, city: formData.city, post: formData.post },
            city: formData.city,
            post: formData.post,
            remark: updateData.remark,
            aadharNo: updateData.aadharNo
          };
          this.cdr.detectChanges();
          done();
        },
        error: (err) => {
          console.warn('⚠️ Failed to update patient before booking; proceeding to book appointment', err);
          done();
        }
      });
    } catch (e) {
      console.warn('⚠️ Exception during updatePatientDetailsBeforeBooking; proceeding', e);
      done();
    }
  }




  onDelete(): void {
    if (confirm('Are you sure you want to delete this patient?')) {
      this.patientService.deletePatient(this.data.patient._id).subscribe({
        next: (response) => {
          console.log('Patient deleted successfully:', response);
          this.dialogRef.close({ deleted: true });
        },
        error: (error) => {
          console.error('Error deleting patient:', error);
          alert('Error deleting patient: ' + (error.error?.message || error.message));
        }
      });
    }
  }

  onCancel(): void {
    // Return appointment booking/update status when closing modal
    console.log('📋 Modal closing. Appointment booked status:', this.isAppointmentBooked);
    console.log('📋 Modal closing. Has existing appointment:', !!this.data.appointment);

    this.dialogRef.close({
      updated: this.isAppointmentBooked, // Mark as updated if appointment was booked/updated
      appointmentBooked: this.isAppointmentBooked,
      appointmentUpdated: !!this.data.appointment && this.isAppointmentBooked, // True if existing appointment was updated
      patient: this.data.patient,
      appointmentData: {
        selectedDepartment: this.selectedDepartment,
        selectedRoom: this.selectedRoom,
        appointmentData: this.appointmentData
      }
    });
  }



  // Method removed as we're now using rooms instead of doctors

  onPrint(): void {
    console.log('🖨 Print button clicked. isAppointmentBooked:', this.isAppointmentBooked);

    if (!this.isAppointmentBooked) {
      console.log('❌ Print blocked - appointment not booked');
      alert('Please book appointment first to enable printing.');
      return;
    }

    // Ensure rooms map is ready so R.No./Doc. resolves on the first try
    this.ensureRoomsLoaded().then(() => {
      console.log('✅ Print allowed - generating content...');

      // Create print content using the print form layout
      const printContent = this.generatePrintContent();

      // Open new window for printing
      const printWindow = window.open('', '_blank', 'width=800,height=600');
      if (printWindow) {
        printWindow.document.write(printContent);
        printWindow.document.close();

        // Wait for images (logos) to load before printing – same approach as OPD list print
        printWindow.onload = () => {
          try {
            const imgs = Array.from(printWindow.document.images || []);
            const waitImgs = Promise.all(
              imgs.map(img => (img as any).complete ? Promise.resolve(true) : new Promise(res => { (img as any).onload = (img as any).onerror = () => res(true); }))
            );
            waitImgs.then(() => {
              printWindow.focus();
              setTimeout(() => { printWindow.print(); }, 50);
            });
          } catch {
            printWindow.focus();
            setTimeout(() => { printWindow.print(); }, 50);
          }
        };

        // After print completes, mark status and close
        printWindow.onafterprint = () => {
          // Mark this patient as printed in localStorage
          this.markPatientAsPrinted(this.data.patient._id);

          // Emit event for parent to update UI instantly
          this.appointmentPrinted.emit({
            patientId: this.data.patient._id,
            appointment: this.appointmentData || this.data.appointment || null,
            success: true
          });

          // Show Printed status inside modal and keep it open
          this.hasPrinted = true;
          this.cdr.detectChanges();
          printWindow.close();

          // ✅ REDIRECT: Close modal and navigate to patient registration after print
          console.log('🔄 REDIRECT: Closing modal and navigating to patient registration after print');
          this.dialogRef.close();
          this.router.navigate(['/reception/patient-registration']);
        };
      } else {
        console.error('❌ PRINT: Failed to open print window');
      }
    });
  }

  onDone(): void {
    console.log('✅ Done button clicked - fetching today\'s appointments');

    // Close modal and notify parent to refresh today's appointments
    this.dialogRef.close({
      success: true,
      appointmentBooked: true,
      appointmentPrinted: true,
      refreshAppointments: true, // Signal to refresh appointments
      patient: this.data.patient,
      appointmentData: this.appointmentData
    });
  }

  // Mark patient as printed and save to localStorage
  private markPatientAsPrinted(patientId: string): void {
    try {
      // Get existing print status from localStorage
      const storedPrintStatus = localStorage.getItem('patientsWithPrint');
      let printedPatients: string[] = [];

      if (storedPrintStatus) {
        printedPatients = JSON.parse(storedPrintStatus);
      }

      // Add current patient if not already printed
      if (!printedPatients.includes(patientId)) {
        printedPatients.push(patientId);
        localStorage.setItem('patientsWithPrint', JSON.stringify(printedPatients));
        console.log('✅ Patient marked as printed in localStorage from modal:', patientId);
        console.log('💾 Updated print status:', printedPatients);

        // 🔄 SYNC: Notify OPD component about print status change
        localStorage.setItem('printStatusChanged', JSON.stringify({
          patientId: patientId,
          timestamp: Date.now(),
          action: 'printed'
        }));
        console.log('🔔 SYNC: Notified OPD about print status change');
      }
    } catch (error) {
      console.error('Error saving print status to localStorage:', error);
    }
  }

  private generatePrintContent(): string {
    const patient = this.data.patient;
    const formData = this.patientForm.getRawValue();
    const currentDate = new Date().toLocaleDateString('en-GB');

    return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Patient Prescription Form</title>
      <style>
        /* Print Form CSS - Single Page A4 Layout */
        .print-container {
          width: 100%;
          max-width: 210mm;
          margin: 0 auto;
          padding: 8mm;
          font-family: Arial, sans-serif;
          background: white;
          border: 2px solid #000;
          height: 280mm;
          max-height: 280mm;
          box-sizing: border-box;
          overflow: hidden;
        }

        .form-container {
          width: 100%;
          height: calc(100% - 12mm); /* leave space for footer bar */
          border: 1px solid #000;
          background: white;
          display: flex;
          flex-direction: column;
        }

        /* Footer bar centered text */
        .footer-bar {
            width: 100%;
  text-align: center;
  font-weight: bold;
  font-size: 12px;
  padding: 4px 0;
  border-top: 2px solid #000;   /* sirf ek upar line */
        }

        .footer-bar h5 {
          margin: 0;
          font-size: 12px;
          font-weight: 600;
          border: 0 !important;
          padding: 0;
          line-height: 1.1;
        }



        /* Header Section */
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 15px;
          border-bottom: 2px solid #000;
          background: #f8f9fa;
        }

        .logo-circle {
          width: 100px;
          height: 100px;
          border: 1px solid #000;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: white;
        }

        .logo-content {
          font-size: 26px;
          font-weight: bold;
        }

        .logo-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 50%;
        }

        .hospital-info {
          text-align: center;
          flex: 1;
          margin: 0 20px;
        }

        .hospital-name {
          font-size: 18px;
          font-weight: bold;
          color: #000;
          margin-bottom: 5px;
        }

        .hospital-address {
          font-size: 18px;
          color: #000;
        }

        /* Patient Information Section */
        .patient-info-section {
          padding-top: 10px;
          padding-left: 15px;
          padding-right: 15px;
          padding-bottom: 6px;
          border-bottom: 2px solid #000000ff;

        }

        .patient-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 4px;
          align-items: center;
        }

        .patient-row.full-width {
          justify-content: flex-start;
        }

        .field-group {
          display: flex;
          align-items: center;
          min-width: 200px;
        }

        .label {
          font-weight: bold;
          margin-right: 8px;
          color: #000;
          font-size: 16px;
        }

        .value {
          color: #000;
          font-size: 16px;
          text-transform: uppercase;
          font-weight: 500;
        }

        /* Bottom Section - Prescription Area */
        .bottom-section {
          display: flex;
          flex: 1;
          height: 270mm;
          max-height: 270mm;
          // overflow: hidden;

        }

        /* Left Section - Vitals */
        .left-section {
          width: 80px;
          border-right: 2px solid #000;
          padding: 10px;
        }

        .vitals-row {
          display: flex;
          flex-direction: column;
          margin-bottom: 20px;
          border-bottom: 1px solid #ccc;
          padding-bottom: 15px;
        }

        .vitals-label {
          font-weight: bold;
          font-size: 16px;
          color: #000;
          margin-bottom: 5px;
        }

        .vitals-value {
          font-size: 14px;
          color: #000;
          min-height: 20px;
        }

        /* Right Section - Prescription */
        .right-section {
          flex: 1;
          padding: 10px;
          position: relative;
        }

        .description-header {
          text-align: center;
          font-weight: bold;
          font-size: 16px;
          color: #000;
          margin-bottom: 20px;
          border-bottom: 1px solid #000;
          padding-bottom: 5px;
        }

        .prescription-symbol {
          font-size: 48px;
          font-weight: bold;
           color: #333;
          margin: 20px 0;
          text-align: left;
          font-family: serif;
        }

        .prescription-area {
          flex: 1;
          height: 20mm;
          max-height: 30mm;
          border: none;
          background: transparent;
          padding: 5px 0;
          overflow: hidden;
        }

        /* A4 Landscape page with A5 layout on LEFT half - Single Page (tight fit, no spill) */
        @media print {
          @page {
            size: A4 landscape;
            margin: 0;
          }

          html, body {
            width: 297mm;
            height: 210mm;
            margin: 0 !important;
            padding: 0 !important;
            font-size: 9.5pt;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          /* A5 PORTRAIT area on RIGHT side of the A4 sheet (taller) */
          .print-container {
            width: 148mm;            /* actual A5 width */
            height: 208mm;           /* safe height for single landscape page */
            max-height: 208mm;
            max-width: 148mm;
            margin-left: auto;       /* right aligned on landscape */
            margin-right: 6mm !important;
            padding: 4mm;            /* tighter padding */
            border: none;
            box-shadow: none;
            page-break-inside: avoid;
            overflow: hidden;
            box-sizing: border-box;
          }

          .form-container {
            border: 2px solid #000000ff;

            background: white;
            height: 100%; /* fill available height */
            max-height: 100%;
            overflow: hidden;
            box-sizing: border-box;  /* ensure bottom border closes neatly */
          }

          /* Single page prescription area sized to tall A5 */
          .bottom-section {
            height: calc(270mm - 100mm);
            max-height: calc(270mm - 100mm);
            overflow: hidden;
          }

          .prescription-area {
            height: calc(60mm - 50mm);
            max-height: calc(60mm - 50mm);
            overflow: hidden;
          }

          /* Reduce header/fonts to fit */
          .header { padding: 6px 10px; border-bottom: 1px solid #000000ff; }
          .logo-circle { width: 16mm; height: 16mm; border-width: 1px; }
          .hospital-name { font-size: 14px; }
          .hospital-address { font-size: 12px; }
          .label, .value { font-size: 12px; }
          .prescription-symbol { font-size: 36px; }

          /* Hide any unnecessary elements during print */
          button, .no-print { display: none !important; }
        }

      </style>
    </head>
    <body>
      <div class="print-container">
        <div class="form-container">
          <!-- Header with logos and hospital name -->
          <div class="header">
            <div class="logo-circle">
              ${this.logoBase64 ? `<img src="${this.logoBase64}" alt="UP Government Logo" class="logo-image">` : `<img src="${this.getAssetUrl('assets/images/myupgov.png')}" alt="UP Government Logo" class="logo-image">`}
            </div>
            <div class="hospital-info">
              <div class="hospital-name">सार्थक डायग्नोस्टिक नेटवर्क</div>
              <div class="hospital-address">Advanced Diagnostic & Pathology Services</div>
            </div>
            <div class="logo-circle">
              ${this.secondaryLogoBase64 ? `<img src="${this.secondaryLogoBase64}" alt="One Rupee Logo" class="logo-image">` : `<img src="${this.getAssetUrl('assets/images/onerupeermbg.png')}" alt="One Rupee Logo" class="logo-image">`}
            </div>
          </div>

          <!-- Patient Information Section -->
          <div class="patient-info-section">
            <div class="patient-row">
              <div class="field-group">
                <span class="label">Reg No :</span>
                <span class="value">${this.getAppointmentNumber(this.appointmentData?.appointmentId) || this.getAppointmentNumber(formData.registrationNumber) || '-'}</span>
              </div>
              <div class="field-group">
                <span class="label">Date :</span>
                <span class="value">${currentDate}</span>
              </div>
            </div>

            <div class="patient-row">
              <div class="field-group">
                <span class="label">Pt. Name :</span>
                <span class="value">${this.formatName(patient.firstName)} ${this.formatName(patient.lastName)}</span>
              </div>
              <div class="field-group">
                <span class="label">Department :</span>
                <span class="value">${this.selectedDepartment?.name || ''}</span>
              </div>
            </div>


            <div class="patient-row">
              <div class="field-group">
                <span class="label">Age/Gender :</span>
                <span class="value">${patient.age || ''}${(patient.ageIn && patient.ageIn.charAt(0)) || 'Y'}/${(patient.gender && patient.gender.charAt(0)) || ''}</span>
              </div>
               <div class="field-group">
                <span class="label">R.No./Doc.:</span>
                <span class="value">${this.getModalRoomLabel()}</span>
              </div>
            </div>

            <div class="patient-row">
              <div class="field-group">
                <span class="label">Aadhar No:</span>
                <span class="value">${patient.aadharNo || ''}</span>
              </div>

              <div class="field-group">
                <span class="label">Contact :</span>
                <span class="value">${patient.phone || patient.contact || formData.contact || ''}</span>
              </div>
            </div>
             <div class="patient-row full-width">
              <div class="field-group">
                <span class="label">Address:</span>
                <span class="value">${this.formatPatientFullAddress(patient)}</span>
              </div>
            </div>
          </div>

          <!-- Bottom Section with Vitals and Prescription -->
          <div class="bottom-section">
            <!-- Left side - Disease and Vitals -->
            <div class="left-section">
              <div class="vitals-row">
                <span class="vitals-label">Disease</span>
                <span class="vitals-value"></span>
              </div>
              <div class="vitals-row">
                <span class="vitals-label">Pulse</span>
                <span class="vitals-value"></span>
              </div>
              <div class="vitals-row">
                <span class="vitals-label">B.P.</span>
                <span class="vitals-value"></span>
              </div>
            </div>

            <!-- Right side - Description and Prescription -->
            <div class="right-section">
              <div class="description-header">Description</div>
              <div class="prescription-symbol">℞</div>
              <div class="prescription-area">
                <!-- Prescription writing area -->
              </div>
            </div>
          </div>
          <div class="footer-bar"><h5>Valid For 15 Days Only </h5></div>
        </div>
      </div>
    </body>
    </html>
    `;
  }

  private formatName(name: string): string {
    if (!name) return '';
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  }

  // Get display registration number (APT ID if appointment booked, otherwise empty)
  getDisplayRegistrationNumber(): string {
    // If appointment is already booked, show APT number
    if (this.appointmentData?.appointmentId) {
      return this.getAppointmentNumber(this.appointmentData.appointmentId);
    }

    // If existing appointment in data, show APT number
    if (this.data.appointment?.appointmentId) {
      return this.getAppointmentNumber(this.data.appointment.appointmentId);
    }

    // No appointment yet, show empty
    return '';
  }

  // Extract number from APT format (APT000039 → 39)
  // Extract number for display:
  // - APT000039 → 39
  // - '39' → 39
  // - Anything else (UUID/ObjectId) → ''
  getAppointmentNumber(appointmentId: any): string {
    if (appointmentId == null) return '';
    const s = String(appointmentId);

    if (/^APT\d+$/i.test(s)) {
      const number = parseInt(s.substring(3), 10);
      return Number.isFinite(number) ? number.toString() : '';
    }

    if (/^\d+$/.test(s)) {
      return String(parseInt(s, 10));
    }

    // Prevent leaking internal IDs like UUID/ObjectId
    return '';
  }

  // Format patient address for display
  // ✅ COMPLETE FIX: Get patient address as string (handles all cases)
  getPatientAddressString(patient: any): string {
    console.log('🏠 GET ADDRESS: Patient data:', patient);
    console.log('🏠 GET ADDRESS: Patient address field:', patient?.address);
    console.log('🏠 GET ADDRESS: Address type:', typeof patient?.address);

    if (!patient) return '';

    const address = patient.address;

    // Case 1: Address is already a string
    if (typeof address === 'string') {
      console.log('🏠 GET ADDRESS: String address found:', address);
      return address.trim();
    }

    // Case 2: Address is an object
    if (typeof address === 'object' && address !== null) {
      console.log('🏠 GET ADDRESS: Object address found, extracting...');

      const parts = [];

      // Try common address object properties
      if (address.street && typeof address.street === 'string') parts.push(address.street.trim());
      if (address.area && typeof address.area === 'string') parts.push(address.area.trim());
      if (address.locality && typeof address.locality === 'string') parts.push(address.locality.trim());

      // If no standard fields, try to get any string values
      if (parts.length === 0) {
        Object.values(address).forEach(value => {
          if (typeof value === 'string' && value.trim()) {
            parts.push(value.trim());
          }
        });
      }

      const result = parts.join(', ');
      console.log('🏠 GET ADDRESS: Extracted address:', result);
      return result;
    }

    // Case 3: Fallback - check if patient has direct address fields
    const fallbackParts = [];
    if (patient.street && typeof patient.street === 'string') fallbackParts.push(patient.street.trim());
    if (patient.area && typeof patient.area === 'string') fallbackParts.push(patient.area.trim());

    const fallbackResult = fallbackParts.join(', ');
    console.log('🏠 GET ADDRESS: Fallback address:', fallbackResult);
    return fallbackResult;
  }

  // ✅ COMPLETE FIX: Get patient city as string
  getPatientCityString(patient: any): string {
    if (!patient) return '';

    // Try address object first
    if (patient.address && typeof patient.address === 'object' && patient.address.city) {
      return patient.address.city.toString().trim();
    }

    // Try direct city field
    if (patient.city) {
      return patient.city.toString().trim();
    }

    return '';
  }

  // Resolve room label for modal print without manual refresh
  private getModalRoomLabel(): string {
    const pick = (r: any) => (r?.roomNumber || r?.name || r?.roomNo || r?.label || '').toString();

    // 1) Prefer selectedRoom if present (object or string)
    if (this.selectedRoom) {
      if (typeof this.selectedRoom === 'object') {
        const lbl = pick(this.selectedRoom);
        if (lbl) return lbl;
      } else if (typeof this.selectedRoom === 'string') {
        const key = this.selectedRoom.trim();
        const mapped = (this.filteredRooms || []).find((x: any) => x?._id === key || x?.id === key) as any;
        let lbl = pick(mapped);
        if (!lbl && this.roomMap.size) {
          const mapLbl = this.roomMap.get(key);
          if (mapLbl) lbl = mapLbl;
        }
        if (lbl) return lbl;
        if (/^(RN|R\.?\s*No\.?|RM|Room)[-\s]*\d+/i.test(key)) return key;
      }
    }

    // 2) Fall back to appointment data passed into modal
    const apt = this.appointmentData || this.data?.appointment || {};
    if (apt) {
      if (apt.selectedRoom && typeof apt.selectedRoom === 'object') {
        const lbl = pick(apt.selectedRoom);
        if (lbl) return lbl;
      }
      if (typeof apt.selectedRoom === 'string') {
        const key = String(apt.selectedRoom).trim();
        const mapped = (this.filteredRooms || []).find((x: any) => x?._id === key || x?.id === key);
        let lbl = pick(mapped);
        if (!lbl && this.roomMap.size) {
          const mapLbl = this.roomMap.get(key);
          if (mapLbl) lbl = mapLbl;
        }
        if (lbl) return lbl;
        if (/^(RN|R\.?\s*No\.?|RM|Room)[-\s]*\d+/i.test(key)) return key;
      }
      if (apt.room && typeof apt.room === 'object') {
        const lbl = pick(apt.room);
        if (lbl) return lbl;
      }
      if (typeof apt.room === 'string') {
        const key = String(apt.room).trim();
        const mapped = (this.filteredRooms || []).find((x: any) => x?._id === key || x?.id === key);
        const lbl = pick(mapped);
        if (lbl) return lbl;
        if (/^(RN|R\.?\s*No\.?|RM|Room)[-\s]*\d+/i.test(key)) return key;
      }
      const direct = apt?.roomNumber || apt?.roomNo || apt?.roomName || apt?.room_label;
      if (direct) return String(direct);
    }

    // 3) Nothing resolved
    return '';
  }

  // Ensure rooms are loaded or map is prepared so first print can resolve R.No./Doc.
  private ensureRoomsLoaded(): Promise<void> {
    if (this.roomsLoadComplete && (this.filteredRooms?.length || this.roomMap.size)) {
      return Promise.resolve();
    }
    return new Promise(resolve => {
      // Build map from already loaded filteredRooms if present
      if (this.filteredRooms?.length) {
        try {
          this.roomMap.clear();
          this.filteredRooms.forEach((r: any) => {
            const id = (r && (r._id || r.id)) ? String(r._id || r.id) : '';
            const label = String(r?.roomNumber || r?.name || r?.roomNo || r?.label || '');
            if (id && label) this.roomMap.set(id, label);
          });
          this.roomsLoadComplete = true;
          resolve();
          return;
        } catch { /* ignore and fetch */ }
      }
      // Otherwise fetch all rooms once and build the map
      this.patientService.getRooms().subscribe({
        next: (rooms) => {
          try {
            this.roomMap.clear();
            (rooms || []).forEach((r: any) => {
              const id = (r && (r._id || r.id)) ? String(r._id || r.id) : '';
              const label = String(r?.roomNumber || r?.name || r?.roomNo || r?.label || '');
              if (id && label) this.roomMap.set(id, label);
            });
            this.roomsLoadComplete = true;
          } finally {
            resolve();
          }
        },
        error: () => resolve()
      });
    });
  }



  // ✅ FIX: Enhanced address formatting to handle all cases (for print)
  formatPatientAddress(address: any): string {
    console.log('🏠 ADDRESS FORMAT: Input address:', address, 'Type:', typeof address);

    if (!address) return '';

    // If it's already a string, return as is
    if (typeof address === 'string') {
      console.log('🏠 ADDRESS FORMAT: String address:', address);
      return address;
    }

    // If address is object, try to extract meaningful text
    if (typeof address === 'object') {
      console.log('🏠 ADDRESS FORMAT: Object address, extracting fields...');

      const parts = [];

      // Try common address object properties
      if (address.street) parts.push(address.street);
      if (address.area) parts.push(address.area);
      if (address.city) parts.push(address.city);
      if (address.state) parts.push(address.state);
      if (address.pincode) parts.push(address.pincode);
      if (address.pin) parts.push(address.pin);

      // If no standard fields, try to get any string values
      if (parts.length === 0) {
        Object.values(address).forEach(value => {
          if (typeof value === 'string' && value.trim()) {
            parts.push(value.trim());
          }
        });
      }

      const result = parts.join(', ') || '';
      console.log('🏠 ADDRESS FORMAT: Formatted result:', result);
      return result;
    }

    // Fallback: convert to string
    const fallback = address.toString();
    console.log('🏠 ADDRESS FORMAT: Fallback string:', fallback);
    return fallback === '[object Object]' ? '' : fallback;
  }

  // Load logos as base64 for print
  loadLogos(): void {
    console.log('🎯 MODAL LOGO LOADING: Starting logo load process...');

    // Load primary logo
    const img1 = new Image();
    img1.crossOrigin = 'anonymous';
    img1.onload = () => {
      console.log('✅ MODAL PRIMARY LOGO: Image loaded successfully', {
        width: img1.width,
        height: img1.height,
        src: img1.src
      });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = img1.width;
      canvas.height = img1.height;
      ctx?.drawImage(img1, 0, 0);
      this.logoBase64 = canvas.toDataURL('image/png');
      console.log('✅ MODAL PRIMARY LOGO: Base64 conversion complete', { width: img1.width, height: img1.height, src: img1.src, base64Length: this.logoBase64.length, preview: this.logoBase64.substring(0, 50) + '...' });

    };
    img1.onerror = (error) => {
      console.error('❌ MODAL PRIMARY LOGO: Failed to load', {
        src: img1.src,
        error: error
      });
      this.logoBase64 = '';
    };
    console.log('🔄 MODAL PRIMARY LOGO: Setting src to assets/images/myupgov.png');
    img1.src = 'assets/images/myupgov.png';

    // Load secondary logo
    const img2 = new Image();
    img2.crossOrigin = 'anonymous';
    img2.onload = () => {
      console.log('✅ MODAL SECONDARY LOGO: Image loaded successfully', {
        width: img2.width,
        height: img2.height,
        src: img2.src
      });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = img2.width;
      canvas.height = img2.height;
      ctx?.drawImage(img2, 0, 0);
      this.secondaryLogoBase64 = canvas.toDataURL('image/png');
      console.log('✅ MODAL SECONDARY LOGO: Base64 conversion complete', {
        base64Length: this.secondaryLogoBase64.length,
        preview: this.secondaryLogoBase64.substring(0, 50) + '...'
      });
    };
    img2.onerror = (error) => {
      console.error('❌ MODAL SECONDARY LOGO: Failed to load', {
        src: img2.src,
        error: error
      });
      this.secondaryLogoBase64 = '';
    };
    console.log('🔄 MODAL SECONDARY LOGO: Setting src to assets/images/onerupeermbg.png');
    img2.src = 'assets/images/onerupeermbg.png';
  }

  // Calculate registration number for patient (cumulative from Jan 1st)

  // Build full address including post/city/state from both nested and top-level fields
  formatPatientFullAddress(patient: any): string {
    if (!patient) return '';
    try {
      const addr = patient.address;
      const fromObj = [addr?.street, addr?.area, addr?.locality, addr?.post, addr?.city, addr?.state, addr?.zipCode, addr?.pincode, addr?.pin];
      const fromTop = [patient.street, patient.area, patient.locality, patient.post, patient.city, patient.state, (patient as any).zipCode, (patient as any).pincode, (patient as any).pin];
      const parts = (typeof addr === 'string' && addr.trim())
        ? [addr, ...fromTop]
        : [...fromObj, ...fromTop];
      const cleaned = parts
        .filter(Boolean)
        .map(v => String(v).trim())
        .filter((val, idx, arr) => val && arr.findIndex(x => x.toLowerCase() === val.toLowerCase()) === idx);
      return cleaned.join(', ');
    } catch {
      return '';
    }
  }

  // Ensure assets resolve inside about:blank print window as well
  private getAssetUrl(path: string): string {
    try {
      const base = window.location.origin;
      const normalized = path.startsWith('/') ? path : `/${path}`;
      return new URL(normalized, base).toString();
    } catch {
      return path;
    }
  }

  calculateRegistrationNumber(patient: any): string {
    if (!patient) return '1';

    // Extract number from patient ID (PAT000007 -> 7)
    const patientIdNumber = patient.patientId ? parseInt(patient.patientId.replace('PAT', '').replace(/^0+/, '')) : 1;
    return patientIdNumber.toString();
  }

  // Load and calculate actual registration number from backend
  loadRegistrationNumber(): void {
    const patient = this.data.patient;
    if (!patient) return;

    console.log('🔢 Loading registration number for patient:', patient.patientId);

    // Get patient creation date
    const patientCreatedDate = new Date(patient.createdAt);
    const yearStart = new Date(patientCreatedDate.getFullYear(), 0, 1);

    // Use appointment service to get all patients registered from Jan 1st to patient's registration date
    this.appointmentService.getAppointments().subscribe({
      next: (response: any) => {
        const appointments = response.appointments || [];

        // Count patients registered from Jan 1st to this patient's registration date
        const registrationCount = appointments.filter((apt: any) => {
          const createdDate = new Date(apt.createdAt);
          return createdDate >= yearStart && createdDate <= patientCreatedDate;
        }).length;

        console.log('🔢 Calculated registration number:', registrationCount);

        // Update form with calculated registration number
        this.patientForm.patchValue({
          registrationNumber: registrationCount.toString()
        });

        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('❌ Error loading registration number:', error);
        // Fallback to patient ID number
        const fallbackNumber = this.calculateRegistrationNumber(patient);
        this.patientForm.patchValue({
          registrationNumber: fallbackNumber
        });
      }
    });
  }

  closeSuccessAlert(): void {
    this.showSuccessAlert = false;
    this.successMessage = '';
  }

  private showSuccessMessage(message: string): void {
    this.successMessage = message;
    this.showSuccessAlert = true;
    this.cdr.detectChanges(); // Force change detection
  }


}

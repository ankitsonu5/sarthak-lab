import { Component, OnInit, OnDestroy, ChangeDetectorRef, ViewChild, ElementRef, AfterViewInit, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { PatientService, PatientRegistrationData } from '../patient.service';
import { PatientService as CorePatientService } from '../../core/services/patient';
import { PrefixService, Prefix } from '../../setup/prefixes/services/prefix.service';

@Component({
  selector: 'app-patient-registration',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatSnackBarModule,
    MatProgressSpinnerModule
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './patient-registration.component.html',
  styleUrls: ['./patient-registration.component.css']
})
export class PatientRegistrationComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('firstNameInput') firstNameInput!: ElementRef;
  @ViewChild('regInput') regInput!: ElementRef<HTMLInputElement>;
  registrationForm!: FormGroup;
  // Use LOCAL date (avoid UTC ISO drift)
  today: string = (() => { const d = new Date(); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; })();
  ageInOptions = ['Years', 'Months', 'Days'];
  genderOptions = ['Male', 'Female', 'Other'];
  designationOptions = ['Mr', 'Mrs', 'Miss'];
  prefixOptions: Prefix[] = [];
  bloodGroups = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-',];
  isSubmitting = false;
  currentRoute: string = '';

  // Gender lock state: lock non-selected radios when designation selected
  isGenderLocked: boolean = false;
  lockedGender: 'Male' | 'Female' | 'Other' | '' = '';

  // Success Alert Properties
  showSuccessAlert = false;
  successMessage = '';

  // Counter properties
  dailyCount: number = 0;
  yearlyCount: number = 0;
  private loadPrefixes(): void {
    this.prefixService.getPrefixList().subscribe({
      next: (list) => {
        this.prefixOptions = list || [];
        // Fill designationOptions for dropdown display
        this.designationOptions = this.prefixOptions.map(p => p.name);
        // Ensure some sensible defaults if API returns empty
        if (this.designationOptions.length === 0) {
          this.designationOptions = ['Mr', 'Mrs', 'Miss'];
        }
        this.cdr.detectChanges();
      },
      error: () => {
        // Fallback to defaults on error
        this.prefixOptions = [];
        this.designationOptions = ['Mr', 'Mrs', 'Miss'];
      }
    });
  }


  constructor(
    private fb: FormBuilder,
    private patientService: PatientService,
    private corePatientService: CorePatientService,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private route: ActivatedRoute,
    private prefixService: PrefixService
  ) {}

  ngOnInit(): void {
    console.log('🔄 PATIENT REG: Component initialized - Resetting all flags');

    // CRITICAL: Reset submission flag on component init
    this.isSubmitting = false;
    this.showSuccessAlert = false;

    this.currentRoute = this.router.url;
    this.registrationForm = this.fb.group({
      date: [{ value: this.today, disabled: true }],
      designation: [''],
      aadharNo: [''], // No validation - any format allowed, multiple UHIDs per Aadhaar allowed
      firstName: ['', Validators.required],
      lastName: [''], // Optional field
      age: ['', [Validators.required, Validators.min(0)]],
      ageIn: ['Years', Validators.required],
      gender: ['Female', Validators.required],
      bloodGroup: [''], // Remove required validation
      address: [''], // Remove required validation
      post: [''],
      city: [''], // Remove required validation
      contact: ['', [ Validators.pattern('^[0-9]{10}$')]],
      remark: ['']
    });

    console.log('✅ PATIENT REG: Form initialized, isSubmitting:', this.isSubmitting);

    // Load counter data
    this.loadCounterData();

    // Load and watch designation for auto-gender from Prefix Master
    this.loadPrefixes();
    const desCtrl = this.registrationForm.get('designation');
    desCtrl?.valueChanges.subscribe((val: string) => {
      const raw = (val ?? '').toString().trim();
      const lower = raw.toLowerCase();
      const genderCtrl = this.registrationForm.get('gender');
      const matched = this.prefixOptions.find(p => p.name.toLowerCase() === lower);
      if (matched) {
        // Lock: set gender and disable only non-selected radios via flags
        const g = this.normalizeGender(matched.gender);
        genderCtrl?.setValue(g, { emitEvent: false });
        this.isGenderLocked = true;
        this.lockedGender = g;
      } else if (raw) {
        // Fallback lock to Female
        const g: 'Male'|'Female'|'Other' = 'Female';
        genderCtrl?.setValue(g, { emitEvent: false });
        this.isGenderLocked = true;
        this.lockedGender = g;
      } else {
        // Unlock when no designation selected
        this.isGenderLocked = false;
        this.lockedGender = '';
        genderCtrl?.setValue('Female', { emitEvent: false });
      }
    });

    // Enforce lock: prevent changing gender away from lockedGender when locked
    const genderCtrlGuard = this.registrationForm.get('gender');
    genderCtrlGuard?.valueChanges.subscribe((val: string) => {
      if (this.isGenderLocked && this.lockedGender && val !== this.lockedGender) {
        genderCtrlGuard.setValue(this.lockedGender, { emitEvent: false });
      }
    });




    // Listen for browser navigation events to reset state
    window.addEventListener('beforeunload', () => {
      console.log('🔄 PATIENT REG: Browser navigation detected - Resetting flags');
      this.isSubmitting = false;
    });

    // Check for query parameters to prefill patient data
    this.route.queryParams.subscribe(params => {
      console.log('🔍 PATIENT REG: Received query params:', params);

      if (params['existingPatientId'] && params['prefillData'] === 'true') {
        console.log('🔄 PATIENT REG: Loading existing patient data for prefill');
        console.log('🔄 PATIENT REG: Patient ID:', params['existingPatientId']);
        this.loadExistingPatientData(params['existingPatientId']);
      } else if (params['existingPatientId']) {
        console.log('⚠️ PATIENT REG: existingPatientId found but prefillData not true');
        console.log('⚠️ PATIENT REG: prefillData value:', params['prefillData']);
      } else {
        console.log('ℹ️ PATIENT REG: No prefill parameters found');
      }
    });
  }

  ngAfterViewInit(): void {
    // Focus on First Name field when component loads
    setTimeout(() => {
      if (this.firstNameInput) {
        this.firstNameInput.nativeElement.focus();
      }
    }, 100);
  }


  //  BEGIN QUICK_PREFILL (disabled)
  // Quick prefill by Appointment Registration No. (APTxxxxxx or just number)
  prefillFromAppointment(rawValue?: string): void {
    const input = String(rawValue || '').trim().toUpperCase();
    if (!input) {
      this.snackBar.open('Enter Registration No. (appointment)', 'Close', { duration: 2000 });
      return;
    }
    const match = input.match(/(\d{1,})/);
    const regNo = match ? match[1] : '';
    if (!regNo) {
      this.snackBar.open('Invalid Registration No.', 'Close', { duration: 2500, panelClass: ['snackbar-error'] });
      return;
    }

    this.patientService.getAppointmentByRegistrationNumber(regNo).subscribe({
      next: (resp: any) => {
        const apt = resp?.appointment || resp;
        if (!apt) {
          this.snackBar.open('Appointment not found', 'Close', { duration: 3000, panelClass: ['snackbar-error'] });
          return;
        }
        const p: any = apt.patient || {};

        // Basic patch from appointment's patient snapshot
        this.registrationForm.patchValue({
          aadharNo: this.sanitizeAadharNumber(p.aadharNo || ''),
          firstName: p.firstName || '',
          lastName: p.lastName || '',
          age: p.age ? parseInt(p.age.toString()) : '',
          ageIn: p.ageIn || 'Years',
          gender: p.gender || 'Male',
          bloodGroup: p.bloodGroup || '',
          address: this.sanitizeAddress(p.address || ''),
          post: p.post || '',
          city: p.city || '',
          contact: this.sanitizeContactNumber(p.contact || p.phone || ''),
          remark: p.remark || ''
        });

        this.cdr.detectChanges();

        // Enrich with full patient record if available
        const pid = p?._id || p?.id;
        if (pid) {
          this.patientService.getPatientById(pid).subscribe({
            next: (full: any) => {
              this.registrationForm.patchValue({
                aadharNo: this.sanitizeAadharNumber(full?.aadharNo || this.registrationForm.get('aadharNo')?.value || ''),
                ageIn: full?.ageIn || this.registrationForm.get('ageIn')?.value || 'Years',
                bloodGroup: full?.bloodGroup || '',
                city: full?.city || this.registrationForm.get('city')?.value || '',
                post: full?.post || this.registrationForm.get('post')?.value || '',
                remark: full?.remark || this.registrationForm.get('remark')?.value || ''
              });
              this.cdr.detectChanges();
            },
            error: () => {}
          });
        }

        setTimeout(() => { try { this.firstNameInput?.nativeElement?.focus(); } catch {} }, 100);
        this.snackBar.open('Patient data loaded from Registration No.', 'Close', { duration: 2000, panelClass: ['snackbar-success'] });
      },
      error: (error) => {
        console.error('Error getting appointment by reg no:', error);
        this.snackBar.open('Appointment not found. Check Registration No.', 'Close', { duration: 3000, panelClass: ['snackbar-error'] });
      }
    });
  }
  //  END QUICK_PREFILL (disabled)
  // When QUICK_PREFILL input is cleared, clear the form and keep focus in the same input
  onQuickPrefillInputChange(rawValue: string): void {
    const val = String(rawValue || '').trim();
    if (val === '') {
      // Reset the form to clean state when registration number is removed
      this.onReset();
      // Keep cursor focus on the Registration No. input (do not jump to First Name)
      setTimeout(() => { try { this.regInput?.nativeElement?.focus(); } catch {} }, 0);
    }
  }


  // Handle name input with first letter capitalization
  onNameInput(event: any, fieldName: string): void {
    const input = event.target;
    const value = input.value;

    // Capitalize first letter of each word
    const capitalizedValue = value.replace(/\b\w/g, (char: string) => char.toUpperCase());

    // Update form control value
    this.registrationForm.get(fieldName)?.setValue(capitalizedValue, { emitEvent: false });

    // Update input value to show capitalized text
    input.value = capitalizedValue;
  }

  onSubmit() {
    console.log('🚨🚨🚨 PATIENT REGISTRATION BUTTON CLICKED! 🚨🚨🚨');
    console.log('🆕 PATIENT REG: NEW PATIENT REGISTRATION STARTED (NOT UPDATE)');
    console.log('🆕 PATIENT REG: This will ALWAYS create a NEW patient with NEW UHID');
    console.log('🆕 PATIENT REG: Even if all fields are same, NEW UHID will be generated');
    console.log('🔍 PATIENT REG: Form valid?', this.registrationForm.valid);
    console.log('🔍 PATIENT REG: Form value:', this.registrationForm.value);
    console.log('🔍 PATIENT REG: isSubmitting?', this.isSubmitting);
    console.log('🔍 PATIENT REG: Form errors:', this.registrationForm.errors);

    // CRITICAL: Check if already submitting to prevent double submission
    if (this.isSubmitting) {
      console.log('⚠️ PATIENT REG: Already submitting, ignoring duplicate click');
      return;
    }

    // Debug each field individually
    Object.keys(this.registrationForm.controls).forEach(key => {
      const control = this.registrationForm.get(key);
      if (control && control.invalid) {
        console.log(`❌ PATIENT REG: Field '${key}' is invalid:`, control.errors, 'Value:', control.value);
      } else if (control) {
        console.log(`✅ PATIENT REG: Field '${key}' is valid. Value:`, control.value);
      }
    });

    if (this.registrationForm.invalid) {
      console.log('❌ PATIENT REG: Form is invalid, showing validation errors');
      this.registrationForm.markAllAsTouched();
      this.showValidationErrors();
      return;
    }

    // Set submitting state
    this.isSubmitting = true;
    const formData = this.registrationForm.getRawValue();

    // Prepare payload according to backend schema - ALWAYS NEW PATIENT
    const payload: PatientRegistrationData = {
      aadharNo: formData.aadharNo?.trim() || undefined,
      designation: formData.designation || undefined,
      firstName: formData.firstName?.trim(),
      lastName: formData.lastName?.trim() || '',
      age: parseInt(formData.age),
      ageIn: formData.ageIn || 'Years',
      gender: formData.gender,
      bloodGroup: formData.bloodGroup === 'NA' ? undefined : formData.bloodGroup,
      address: formData.address?.trim(),
      contact: formData.contact?.trim(),
      date: this.today,
      // Add unique timestamp to ensure each registration is unique
      registrationTimestamp: new Date().toISOString()
    };

    // Remove undefined/empty fields
    Object.keys(payload).forEach(key => {
      if (payload[key as keyof PatientRegistrationData] === undefined ||
          payload[key as keyof PatientRegistrationData] === '') {
        delete payload[key as keyof PatientRegistrationData];
      }
    });

    console.log('🆕 PATIENT REG: Submitting NEW patient registration (not update):', payload);
    console.log('🆕 PATIENT REG: This will create a completely NEW patient with NEW UHID');
    console.log('🆕 PATIENT REG: API endpoint will be: /api/patients/register (POST)');
    console.log('🆕 PATIENT REG: Expected response: {success: true, patient: {patientId: "PAT000XXX"}}');

    this.patientService.registerPatient(payload).subscribe({
      next: (response) => {
        console.log('✅ Patient registration success:', response);
        this.isSubmitting = false;
        this.cdr.detectChanges();

        if (response.success) {
          const savedPatient: any = response.patient;
          console.log('🎯 Patient saved with UHID:', savedPatient?.patientId);

          // Prefer simple numeric Registration No.; fallback to UHID-derived number
          const regNum = (savedPatient?.registrationNumber != null)
            ? savedPatient.registrationNumber
            : (savedPatient?.patientId ? parseInt(savedPatient.patientId.replace('PAT', '').replace(/^0+/, '')) : '');
          const formattedRegNo = String(regNum);

          // Show success message and overlay first
          this.showSuccessMessage(`Patient registered successfully! Registration No: ${formattedRegNo}`);
          this.cdr.detectChanges();

          // Reload counter data after successful registration
          this.loadCounterData();

          // ✅ Trigger both mechanisms (state + localStorage) to ensure smooth navigation and pickup
          console.log('🔄 DATABASE + LOCALSTORAGE: Patient saved, notifying OPD');

          // 1) LocalStorage flag for cross-page prefill if needed
          localStorage.setItem('newPatientRegistered', JSON.stringify(savedPatient));

          // 2) Navigate immediately to Cash Receipt for payment-first workflow
          setTimeout(() => {
            console.log('🎯 Navigating to Cash Receipt after success alert');
            this.closeSuccessAlert();
            this.router.navigate(['/cash-receipt/register-opt-ipd'], {
              queryParams: {
                source: 'patient-registration',
                patientId: savedPatient?._id || '',
                uhid: savedPatient?.patientId || '',
                regNo: formattedRegNo,
                patientName: `${savedPatient?.firstName || ''} ${savedPatient?.lastName || ''}`.trim()
              }
            });
            // Reset form after navigation trigger
            this.onReset();
          }, 100);

          // Optional toast for quick feedback
          this.snackBar.open(
            `✅ Patient registered! Redirecting to Cash Receipt...`,
            'Close',
            {
              duration: 2000,
              panelClass: ['snackbar-success']
            }
          );

        } else {
          this.snackBar.open(
            response.message || 'Registration failed',
            'Close',
            {
              duration: 3000,
              panelClass: ['snackbar-error']
            }
          );
        }
      },
      error: (error) => {
        console.error('Patient registration error:', error);
        this.isSubmitting = false;
        this.cdr.detectChanges();

        const errorMessage = error.message || 'Failed to register patient. Please try again.';
        this.snackBar.open(
          errorMessage,
          'Close',
          {
            duration: 5000,
            panelClass: ['snackbar-error']
          }
        );
      }
    });
  }



  private showValidationErrors() {
    const controls = this.registrationForm.controls;
    let errorMessages: string[] = [];

    console.log('🔍 PATIENT REG: Checking validation errors...');

    Object.keys(controls).forEach(key => {
      const control = controls[key];
      if (control.invalid && control.errors) {
        console.log(`❌ PATIENT REG: Field '${key}' is invalid:`, control.errors, 'Value:', control.value);

        if (control.errors['required']) {
          errorMessages.push(`${this.getFieldDisplayName(key)} is required`);
        }
        if (control.errors['pattern']) {
          errorMessages.push(`${this.getFieldDisplayName(key)} format is invalid`);
        }
        if (control.errors['min']) {
          errorMessages.push(`${this.getFieldDisplayName(key)} must be greater than 0`);
        }
      }
    });

    if (errorMessages.length > 0) {
      this.snackBar.open(
        'Please fix: ' + errorMessages.join(', '),
        'Close',
        {
          duration: 5000,
          panelClass: ['snackbar-error']
        }
      );
    }
  }

  private getFieldDisplayName(fieldName: string): string {
    const fieldNames: { [key: string]: string } = {
      'aadharNo': 'Aadhar Number',
      'firstName': 'First Name',
      'lastName': 'Last Name',
      'age': 'Age',
      'ageIn': 'Age Unit',
      'gender': 'Gender',
      'bloodGroup': 'Blood Group',
      'address': 'Address',
      'city': 'City',
      'contact': 'Contact Number'
    };
    return fieldNames[fieldName] || fieldName;
  }

  onReset() {
    console.log('🔄 PATIENT REG: Form reset - Ready for NEW patient registration');
    this.registrationForm.reset({
      date: this.today,
      designation: '',
      ageIn: 'Years',
      gender: 'Female'
    });
    // Unlock gender when designation cleared on reset
    this.isGenderLocked = false;
    this.lockedGender = '';
    this.registrationForm.get('gender')?.setValue('Female', { emitEvent: false });
    this.isSubmitting = false;

    // Clear any browser cache or session data that might interfere
    localStorage.removeItem('currentPatientId');
    sessionStorage.removeItem('editingPatient');

    this.cdr.detectChanges();
    console.log('✅ PATIENT REG: Form cleared - Next save will create NEW UHID');
  }

  // Keyboard navigation rules:
  // - For SELECT dropdowns: ArrowDown changes value; ArrowUp moves focus to previous field
  // - For other inputs: ArrowDown disabled; ArrowUp moves to previous; Enter moves to next (except in textarea)
  onFormKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const tag = target.tagName;
    if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA' && tag !== 'BUTTON') return;

    const isTextarea = tag === 'TEXTAREA';
    const isButton = tag === 'BUTTON';
    // Be robust: detect SELECT even if event target is inner element
    const activeEl = document.activeElement as HTMLElement | null;
    const isSelect = tag === 'SELECT' || (activeEl?.tagName === 'SELECT') || !!(target as HTMLElement).closest?.('select');

    // Only when Save button is focused and Enter pressed, trigger Save
    if (isButton && event.key === 'Enter') {
      const btn = (target as HTMLElement).closest('button');
      const isSaveBtn = !!btn && (btn.id === 'savePatientBtn');
      if (isSaveBtn) {
        event.preventDefault();
        this.onSubmit();
      }
      return; // Do nothing for other buttons (e.g., Load)
    }

    // On SELECT: Down = change option (default). Up = move focus to previous field.
    if (isSelect && event.key === 'ArrowDown') {
      return; // allow default option change
    }
    if (isSelect && event.key === 'ArrowUp') {
      event.preventDefault();
      this.focusSibling(target, 'prev');
      return;
    }

    // Disable ArrowDown for non-SELECT controls
    if (event.key === 'ArrowDown' && !isSelect) {
      event.preventDefault();
      return;
    }

    // Enter should move to next field (except textarea). Use Ctrl+Enter anywhere to Save quickly.
    if (event.key === 'Enter' && !isTextarea) {
      // Ctrl/Cmd+Enter => Save directly from anywhere
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        this.onSubmit();
        return;
      }
      event.preventDefault();
      this.focusSibling(target, 'next');
      return;
    }

    // Only ArrowUp navigates to previous for non-SELECT controls
    if (event.key === 'ArrowUp' && !isSelect) {
      event.preventDefault();
      this.focusSibling(target, 'prev');
    }
  }

  private focusSibling(current: HTMLElement, direction: 'next' | 'prev'): void {
    const container = document.querySelector('form');
    if (!container) return;

    const focusable = Array.from(container.querySelectorAll<HTMLElement>('input, select, textarea, button'))
      .filter(el => !el.hasAttribute('disabled') && this.isVisible(el));

    const index = focusable.indexOf(current);
    if (index === -1) return;

    const nextIndex = direction === 'next' ? Math.min(index + 1, focusable.length - 1) : Math.max(index - 1, 0);
    const nextEl = focusable[nextIndex];
    if (nextEl) {
      nextEl.focus();
      if (nextEl instanceof HTMLInputElement) {
        nextEl.select();
      }
    }
  }

  private isVisible(el: HTMLElement): boolean {
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
  }
  /** Normalize gender string to strict values used by radios */


  private normalizeGender(val: any): 'Male' | 'Female' | 'Other' {
    const s = String(val ?? '').trim().toLowerCase();
    if (s === 'male' || s === 'm') return 'Male';
    if (s === 'female' || s === 'f') return 'Female';
    return 'Other';
  }

  /** Prevent changing gender when locked; keep selected as-is */
  onGenderClick(option: 'Male' | 'Female' | 'Other', ev: Event): void {
    if (this.isGenderLocked && this.lockedGender && option !== this.lockedGender) {
      ev.preventDefault();
      ev.stopPropagation();
      const ctrl = this.registrationForm.get('gender');
      ctrl?.setValue(this.lockedGender, { emitEvent: false });
    }
  }


  // Sanitize contact number to ensure it meets validation requirements
  private sanitizeContactNumber(contact: string): string {
    if (!contact) return '';

    // Remove all non-digit characters
    const digitsOnly = contact.replace(/\D/g, '');

    // Return only if it's exactly 10 digits, otherwise return empty to avoid validation error
    return digitsOnly.length === 10 ? digitsOnly : '';
  }

  private sanitizeAddress(address: any): string {
    if (!address) return '';

    // If address is an object, try to extract meaningful text
    if (typeof address === 'object') {
      // Try common address object properties
      if (address.street || address.city || address.state) {
        return [address.street, address.city, address.state].filter(Boolean).join(', ');
      }
      // If it's just an object without meaningful properties, return empty
      return '';
    }

    // If it's already a string, return as is
    return address.toString();
  }

  // Sanitize Aadhar number to ensure it meets validation requirements
  private sanitizeAadharNumber(aadhar: string): string {
    if (!aadhar) return '';

    // Remove all non-digit characters
    const digitsOnly = aadhar.replace(/\D/g, '');

    // Return only if it's exactly 12 digits, otherwise return empty to avoid validation error
    return digitsOnly.length === 12 ? digitsOnly : '';
  }

  // Load existing patient data for prefilling form
  private loadExistingPatientData(patientId: string): void {
    this.patientService.getPatientById(patientId).subscribe({
      next: (patient) => {
        console.log('✅ PATIENT REG: Loaded existing patient data:', patient);

        // Prefill the form with existing patient data
        this.registrationForm.patchValue({
          aadharNo: this.sanitizeAadharNumber(patient.aadharNo || ''),
          firstName: patient.firstName || '',
          lastName: patient.lastName || '',
          age: patient.age ? parseInt(patient.age.toString()) : '',
          ageIn: patient.ageIn || 'Years',
          gender: patient.gender || '',
          bloodGroup: patient.bloodGroup || '',
          address: this.sanitizeAddress(patient.address || ''),
          post: (patient.address && (patient.address as any).post) ? (patient.address as any).post : (patient.post || ''),
          city: (patient.address && (patient.address as any).city) ? (patient.address as any).city : (patient.city || ''),
          contact: this.sanitizeContactNumber(patient.contact || patient.phone || ''),
          remark: patient.remark || ''
        });

        console.log('🔍 PATIENT REG: Form after prefill:', this.registrationForm.value);
        console.log('🔍 PATIENT REG: Form valid after prefill?', this.registrationForm.valid);

        // Check if form is valid after prefill
        if (this.registrationForm.valid) {
          // Show success message
          this.snackBar.open(
            '✅ Patient data loaded successfully! You can modify and register as new patient.',
            'Close',
            {
              duration: 5000,
              panelClass: ['snackbar-success']
            }
          );
        } else {
          // Show warning about missing required fields
          this.snackBar.open(
            '⚠️ Patient data loaded but some required fields need to be filled. Please complete the form.',
            'Close',
            {
              duration: 7000,
              panelClass: ['snackbar-warning']
            }
          );
        }

        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('❌ PATIENT REG: Error loading patient data:', error);
        this.snackBar.open(
          'Error loading patient data. Please enter manually.',
          'Close',
          {
            duration: 3000,
            panelClass: ['snackbar-error']
          }
        );
      }
    });
  }

  // Navigation methods for tabs

  navigateToSearchPatient() {
    this.router.navigate(['/reception/search-patient']);
  }

  navigateToOpdRegistration() {
    this.router.navigate(['/reception/opd-registration']);
  }

  navigateToPatientRegistration() {
    this.router.navigate(['/reception/patient-registration']);
  }

  // Test method to verify new registration is working
  testNewRegistration() {
    console.log('🧪 TESTING: Creating test patient with unique data');

    const testData = {
      aadharNo: '123456789012',
      firstName: 'Test',
      lastName: 'Patient',
      age: 25,
      ageIn: 'Years',
      gender: 'Male',
      contact: '9876543210',
      address: 'Test Address',
      date: this.today,
      registrationTimestamp: new Date().toISOString()
    };

    console.log('🧪 TESTING: Sending test registration data:', testData);

    this.patientService.registerPatient(testData).subscribe({
      next: (response) => {
        console.log('🧪 TEST SUCCESS: New patient created:', response);
        alert(`✅ TEST SUCCESS! New UHID created: ${response.patient?.patientId}`);
      },
      error: (error) => {
        console.error('🧪 TEST FAILED:', error);
        alert(`❌ TEST FAILED: ${error.message}`);
      }
    });
  }

  // Success Alert Methods
  showSuccessMessage(message: string): void {
    this.successMessage = message;
    this.showSuccessAlert = true;
    // Alert will auto-hide after 2 seconds via success-alert component
  }

  closeSuccessAlert(): void {
    this.showSuccessAlert = false;
    this.successMessage = '';
  }

  debugButtonClick(event: string): void {
    console.log(`🖱️ BUTTON ${event} - isSubmitting:`, this.isSubmitting);
    console.log(`🖱️ BUTTON ${event} - form valid:`, this.registrationForm.valid);
    console.log(`🖱️ BUTTON ${event} - timestamp:`, new Date().toLocaleTimeString());
  }

  // Load counter data (daily and yearly counts)
  loadCounterData(): void {
    const currentYear = new Date().getFullYear();

    // Get yearly patient count
    this.patientService.getYearlyPatientCount(currentYear).subscribe({
      next: (response) => {
        if (response && response.success) {
          this.yearlyCount = response.count || 0;
          console.log('📊 Yearly patient count loaded:', this.yearlyCount);
          this.cdr.detectChanges();
        }
      },
      error: (error) => {
        console.error('❌ Error loading yearly patient count:', error);
        this.yearlyCount = 0;
      }
    });

    // Get daily patient count (same as yearly for year-wise counter)
    this.patientService.getDailyPatientCount().subscribe({
      next: (response) => {
        if (response && response.success) {
          this.dailyCount = response.count || 0;
          console.log('📊 Daily patient count loaded:', this.dailyCount);
          this.cdr.detectChanges();
        }
      },
      error: (error) => {
        console.error('❌ Error loading daily patient count:', error);
        this.dailyCount = 0;
      }
    });
  }

  ngOnDestroy(): void {
    console.log('🧹 PATIENT REG: Component destroyed - Resetting all flags');
    this.isSubmitting = false;
    this.showSuccessAlert = false;
  }
}

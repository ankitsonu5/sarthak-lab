import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, CUSTOM_ELEMENTS_SCHEMA, ChangeDetectorRef, ViewEncapsulation } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { FormBuilder, FormGroup, Validators, FormArray, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Router, ActivatedRoute } from '@angular/router';
import { DoctorService } from '../services/doctor.service';
import { DepartmentService, Department } from '../../departments/services/department.service';
import { Auth } from '../../../core/services/auth';
import { SuccessAlertComponent } from '../../../shared/components/success-alert/success-alert.component';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';


@Component({
  selector: 'app-doctor-registration',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatSnackBarModule,
    SuccessAlertComponent
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './doctor-registration.component.html',
  styleUrls: ['./doctor-registration.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class DoctorRegistrationComponent implements OnInit, OnDestroy, AfterViewInit {
  doctorForm!: FormGroup;
  selectedImage: File | null = null;
  imagePreview: string | null = null;
  isSubmitting = false;
  isEditMode = false;
  editingDoctorId: string | null = null;
  // If true, do not auto-navigate after update (used when coming from delete-blocked modal edit)
  private suppressNavigateAfterUpdate = false;
  showAdditionalInfo = false; // Toggle for additional information
  isUpdatingForm = false; // Prevent form update loops
  private departmentsLoaded = false; // Ensure departments loaded before populating edit data

  specializations = [
    'Cardiology', 'Dermatology', 'Endocrinology', 'Gastroenterology',
    'General Medicine', 'Gynecology', 'Neurology', 'Oncology',
    'Orthopedics', 'Pediatrics', 'Psychiatry', 'Radiology',
    'Surgery', 'Urology', 'Ophthalmology', 'ENT'
  ];

  departments: string[] = [];
  departmentOptions: Department[] = [];

  @ViewChild('doctorNameInput') doctorNameInput!: ElementRef;

  states = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
    'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
    'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim',
    'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand',
    'West Bengal', 'Delhi'
  ];

  // Success Alert Properties
  showSuccessAlert = false;
  successMessage = '';

  constructor(
    private fb: FormBuilder,
    private snackBar: MatSnackBar,
    private doctorService: DoctorService,
    private departmentService: DepartmentService,
    private router: Router,
    private route: ActivatedRoute,
    private authService: Auth,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.createDoctorForm();

    // Auto-calc age from DOB safely (no loops)
    const dobCtrl = this.doctorForm.get('dateOfBirth');
    const ageCtrl = this.doctorForm.get('age');
    dobCtrl?.valueChanges.subscribe((dob: string) => {
      if (dob) {
        const age = this.calculateAge(dob);
        ageCtrl?.setValue(age, { emitEvent: false });
      } else {
        ageCtrl?.setValue('', { emitEvent: false });
      }
    });

    // Initialize edit mode first so loadDepartments can act accordingly
    this.checkEditMode();
    this.loadDepartments();

    // Ensure address fields are never required
    this.ensureAddressFieldsOptional();
  }

  ngAfterViewInit(): void {
    // Auto-focus on Doctor Name field when page loads
    setTimeout(() => {
      if (this.doctorNameInput && this.doctorNameInput.nativeElement) {
        this.doctorNameInput.nativeElement.focus();
        console.log('🎯 Auto-focus set on Doctor Name field');
      }
    }, 100);
  }

  ngOnDestroy(): void {
    // Clean up blob URL to prevent memory leaks
    if (this.imagePreview && this.imagePreview.startsWith('blob:')) {
      URL.revokeObjectURL(this.imagePreview);
    }
  }

  loadDepartments(): void {
    this.departmentService.getDepartmentsList().subscribe({
      next: (departments: Department[]) => {
        this.departmentOptions = departments;
        this.departments = departments.map(dept => dept.name);
        this.departmentsLoaded = true;

        // If in edit mode, load doctor data after departments are loaded
        if (this.isEditMode && this.editingDoctorId) {
          console.log('🔄 Departments loaded, now loading doctor for edit...');
          this.loadDoctorForEdit(this.editingDoctorId);
        }
      },
      error: (error) => {
        console.error('Error loading departments:', error);

        // Fallback to hardcoded departments if API fails
        console.log('Using fallback departments...');

        this.departments = this.departmentOptions.map(dept => dept.name);

        this.snackBar.open('Using offline departments', 'Close', {
          duration: 3000,
          panelClass: ['warning-snackbar']
        });
      }
    });
  }

  checkEditMode(): void {
    this.route.queryParams.subscribe(params => {
      const doctorId = params['id'];
      const mode = params['mode'];

      if (mode === 'edit' && doctorId) {
        console.log('✏️ Edit mode detected, doctor ID:', doctorId);
        this.isEditMode = true;
        this.editingDoctorId = doctorId;
        this.suppressNavigateAfterUpdate = params['suppressNavigate'] === '1' || params['suppressNavigate'] === 'true';
        // If departments already loaded, load doctor immediately; else wait for loadDepartments
        if (this.departmentsLoaded) {
          this.loadDoctorForEdit(doctorId);
        } else {
          console.log('⏳ Waiting for departments to load before populating edit form...');
        }
      }
    });
  }

  loadDoctorForEdit(doctorId: string): void {
    console.log('🔄 Loading doctor for edit with ID:', doctorId);
    console.log('🔑 Token available:', !!localStorage.getItem('token'));

    // Check current user info
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      console.log('👤 Current user role:', user.role);
      console.log('👤 Current user permissions:', user.permissions);
    }

    // Pass nocache=true to always fetch the latest data and avoid stale caches
    this.doctorService.getDoctorById(doctorId, true).subscribe({
      next: (doctor) => {
        console.log('✅ Doctor loaded for edit:', doctor);
        console.log('🏥 Doctor department:', doctor.department);
        this.populateForm(doctor);
      },
      error: (error) => {
        console.error('❌ Error loading doctor for edit:', error);
        console.log('❌ Error status:', error.status);
        console.log('❌ Error message:', error.message);

        // Show more specific error message
        let errorMessage = 'Error loading doctor data';
        if (error.status === 401) {
          errorMessage = 'Authentication required. Please login again.';
        } else if (error.status === 404) {
          errorMessage = 'Doctor not found';
        } else if (error.status === 0) {
          errorMessage = 'Server connection failed';
        }

        this.snackBar.open(errorMessage, 'Close', {
          duration: 5000,
          panelClass: ['error-snackbar']
        });
      }
    });
  }

  populateForm(doctor: any): void {
    // FIXED: Handle department - find the correct department ID for dropdown
    let departmentId = '';
    if (typeof doctor.department === 'object' && doctor.department?._id) {
      // If department is an object with _id, use the _id
      departmentId = doctor.department._id;
    } else if (typeof doctor.department === 'string') {
      // If department is a string (name or id), find matching department
      const foundDept = this.departmentOptions.find(dept =>
        dept._id === doctor.department || dept.name === doctor.department
      );
      departmentId = foundDept ? (foundDept._id || '') : '';
    }

    console.log('🏥 Department mapping:', {
      originalDepartment: doctor.department,
      foundDepartmentId: departmentId,
      availableDepartments: this.departmentOptions
    });

    // Get doctor name - prefer 'name' field, fallback to firstName + lastName
    const doctorName = doctor.name ||
      (doctor.firstName && doctor.lastName ? `${doctor.firstName} ${doctor.lastName}` :
        doctor.firstName || doctor.lastName || '');

    this.doctorForm.patchValue({
      name: doctorName,
      fee: doctor.fee || 0,
      gender: doctor.gender || '',
      department: departmentId || '',
      // Additional Information fields
      email: doctor.email || '',
      phone: (doctor.phone || '').toString(),
      dateOfBirth: doctor.dateOfBirth ? new Date(doctor.dateOfBirth).toISOString().split('T')[0] : '',
      age: doctor.age ?? '',
      specialization: doctor.specialization || '',
      qualification: doctor.qualification || '',
      experience: doctor.experience ?? 0,
      licenseNumber: doctor.licenseNumber || '',
      address: {
        street: doctor.address?.street || '',
        city: doctor.address?.city || '',
        state: doctor.address?.state || '',
        zipCode: doctor.address?.zipCode || '',
        country: doctor.address?.country || 'India'
      },
      isActive: doctor.isActive ?? true
    });

    // Force change detection so UI reflects patched values
    this.cdr.detectChanges();

    // Set the image if available
    if (doctor.imageUrl || doctor.image) {
      const imageUrl = doctor.imageUrl || doctor.image;
      // Build correct base URL from environment (strip trailing /api if present)
      const apiBase = environment.apiUrl.replace(/\/?api$/, '');
      if (typeof imageUrl === 'string') {
        if (imageUrl.startsWith('/uploads/')) {
          this.imagePreview = `${apiBase}${imageUrl}`;
        } else if (imageUrl.startsWith('http')) {
          this.imagePreview = imageUrl;
        } else {
          this.imagePreview = `${apiBase}/uploads/doctors/${imageUrl}`;
        }
      }
      console.log('🖼️ Image preview set for edit mode:', this.imagePreview);
      // Note: selectedImage is for File objects, imagePreview is for display
    }
  }

  createDoctorForm(): FormGroup {
    this.doctorForm = this.fb.group({
      // Basic Information (Always visible)
      name: ['', [Validators.required, Validators.minLength(2)]],
      department: ['', Validators.required],
      fee: [1, [Validators.required, Validators.min(0)]],
      gender: ['', Validators.required],

      // Additional Information (Conditional) - All Optional

      email: [''],
      phone: ['', [Validators.required, Validators.pattern(/^[0-9]{10}$/)]],
      dateOfBirth: [''],
      age: [{ value: '', disabled: true }],
      specialization: [''],
      qualification: [''],
      experience: [''],
      licenseNumber: [''],
      availableSlots: this.fb.array([]),
      address: this.fb.group({
        street: [''],
        city: [''],
        state: [''],
        zipCode: [''],
        country: ['India']
      }),
      isActive: [true]
    });

    // COMPLETELY DISABLED: Date of birth watcher to prevent infinite loops
    console.log('🚫 FORM WATCHERS: Completely disabled to prevent infinite change detection loops');
    // Manual age calculation can be triggered with a button if needed
    return this.doctorForm;
  }

  // Ensure address fields are always optional
  private ensureAddressFieldsOptional(): void {
    const addressGroup = this.doctorForm.get('address') as FormGroup;
    if (addressGroup) {
      Object.keys(addressGroup.controls).forEach(key => {
        const control = addressGroup.get(key);
        if (control) {
          control.clearValidators();
          control.updateValueAndValidity();
        }
      });
    }
  }

  // Check only basic required fields
  private checkBasicFieldsValid(): boolean {
    const requiredFields = ['name', 'department', 'fee', 'gender', 'phone'];
    return requiredFields.every(field => {
      const control = this.doctorForm.get(field);
      return control && control.valid;
    });
  }

  // Toggle additional information visibility
  toggleAdditionalInfo(): void {
    this.showAdditionalInfo = !this.showAdditionalInfo;

    // Ensure address fields remain optional
    const addressGroup = this.doctorForm.get('address') as FormGroup;
    if (addressGroup) {
      // Clear any validators that might have been added
      Object.keys(addressGroup.controls).forEach(key => {
        const control = addressGroup.get(key);
        if (control) {
          control.clearValidators();
          control.updateValueAndValidity();
        }
      });
    }

    // All additional fields are optional, so no validators needed
    this.doctorForm.updateValueAndValidity();
  }

  // Getter for form controls
  get f() { return this.doctorForm.controls; }
  get addressControls() { return (this.doctorForm.get('address') as FormGroup).controls; }

  // Calculate age from date of birth
  calculateAge(dateOfBirth: string): number {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    return age;
  }

  // Input formatting methods - UPDATED: Full uppercase for Doctor Name, Street Address, City
  capitalizeFirstLetter(event: any): void {
    const input = event.target;
    const value = input.value;
    if (value && value.length > 0) {
      // CHANGE: Convert entire text to uppercase for Doctor Name
      const formatted = value.toUpperCase();
      input.value = formatted;
      // Update the form control value
      const controlName = input.getAttribute('formControlName');
      if (controlName) {
        this.doctorForm.get(controlName)?.setValue(formatted, { emitEvent: false });
      }
    }
  }

  capitalizeAddress(event: any): void {
    const input = event.target;
    const value = input.value;
    if (value && value.length > 0) {
      // CHANGE: Convert entire text to uppercase for Street Address and City
      const formatted = value.toUpperCase();
      input.value = formatted;
      // Update the address form control value
      const controlName = input.getAttribute('formControlName');
      if (controlName) {
        this.doctorForm.get('address')?.get(controlName)?.setValue(formatted, { emitEvent: false });
      }
    }
  }

  formatPhoneNumber(event: any): void {
    const input = event.target;
    let value = input.value.replace(/\D/g, ''); // Remove non-digits
    if (value.length > 10) {
      value = value.substring(0, 10); // Limit to 10 digits
    }
    input.value = value;
    this.doctorForm.get('phone')?.setValue(value);
  }

  // Check phone uniqueness on blur
  onPhoneBlur(): void {
    const phoneCtrl = this.doctorForm.get('phone');
    const phone = phoneCtrl?.value;
    if (!phone || phoneCtrl?.invalid) { return; }
    this.doctorService.checkPhoneUnique(phone).subscribe({
      next: (res) => {
        if (res && res.exists) {
          // Mark as error and show message via snackbar
          phoneCtrl?.setErrors({ duplicate: true });
          this.snackBar.open('This phone number is already registered with another doctor', 'Close', {
            duration: 4000,
            panelClass: ['error-snackbar']
          });
        }
      },
      error: () => {
        // Fail silently to avoid blocking user on transient errors
      }
    });
  }

  formatQualification(event: any): void {
    const input = event.target;
    const value = input.value;
    if (value) {
      input.value = value.toUpperCase();
      this.doctorForm.get('qualification')?.setValue(input.value);
    }
  }

  // Image handling methods
  onImageSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        this.snackBar.open('Please select a valid image file', 'Close', {
          duration: 3000,
          panelClass: ['error-snackbar']
        });
        return;
      }

      // Validate file size (5MB limit)
      if (file.size > 5 * 1024 * 1024) {
        this.snackBar.open('Image size should be less than 5MB', 'Close', {
          duration: 3000,
          panelClass: ['error-snackbar']
        });
        return;
      }

      this.selectedImage = file;
      console.log('Image selected:', file.name, file.size);

      // Create instant image preview using URL.createObjectURL for faster preview
      if (this.imagePreview && this.imagePreview.startsWith('blob:')) {
        URL.revokeObjectURL(this.imagePreview); // Clean up previous blob URL
      }

      this.imagePreview = URL.createObjectURL(file);
      console.log('Image preview created instantly');
    }
  }



  onUploadClick(): void {
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  }

  openImagePreview(imageSrc: string): void {
    // Create modal to show large image
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      cursor: pointer;
    `;

    const img = document.createElement('img');
    img.src = imageSrc;
    img.style.cssText = `
      max-width: 90%;
      max-height: 90%;
      border-radius: 10px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    `;

    modal.appendChild(img);
    document.body.appendChild(modal);

    // Close modal on click
    modal.addEventListener('click', () => {
      document.body.removeChild(modal);
    });
  }

  removeImage(): void {
    // Clean up blob URL if it exists
    if (this.imagePreview && this.imagePreview.startsWith('blob:')) {
      URL.revokeObjectURL(this.imagePreview);
    }

    this.imagePreview = null;
    this.selectedImage = null;

    // Clear the file input
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
    console.log('Image removed and cleaned up');
  }

  // Form submission
  onSubmit(): void {
    console.log('Form submission started');
    console.log('Form valid:', this.doctorForm.valid);
    console.log('Form values:', this.doctorForm.getRawValue());

    // Ensure address fields are optional before validation
    this.ensureAddressFieldsOptional();

    // Check if form is valid (only basic required fields)
    const basicFieldsValid = this.checkBasicFieldsValid();
    if (!basicFieldsValid) {
      console.log('Basic required fields are invalid');
      this.markFormGroupTouched();
      this.snackBar.open('Please fill all required fields correctly', 'Close', {
        duration: 5000,
        panelClass: ['error-snackbar']
      });
      return;
    }

    // Check authentication
    if (!this.authService.isLoggedIn()) {
      this.snackBar.open('Please login to register doctors. Attempting auto-login...', 'Close', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
      this.autoLogin();
      return;
    }

    if (this.doctorForm.valid) {
      this.isSubmitting = true;

      // Get form data including disabled fields (like age)
      const formValues = this.doctorForm.getRawValue();
      console.log('Raw form values:', formValues);

      // Prepare data for submission
      let submissionData: any;

      // If image is selected OR in edit mode, use FormData
      if (this.selectedImage || this.isEditMode) {
        console.log('Using FormData for image upload');
        submissionData = new FormData();

        // Append basic form data (always required)
        submissionData.append('name', formValues.name);
        submissionData.append('fee', formValues.fee);
        submissionData.append('gender', formValues.gender);
        submissionData.append('phone', formValues.phone); // ALWAYS include phone
        submissionData.append('isActive', formValues.isActive || true);

        // Handle department
        const selectedDept = this.departmentOptions.find(dept => dept.name === formValues.department);
        const departmentId = selectedDept?._id || formValues.department;
        submissionData.append('department', departmentId);

        // Append additional fields only if additional info is shown and filled
        if (this.showAdditionalInfo) {
          if (formValues.firstName) submissionData.append('firstName', formValues.firstName);
          if (formValues.lastName) submissionData.append('lastName', formValues.lastName);
          if (formValues.email) submissionData.append('email', formValues.email);
          if (formValues.dateOfBirth) submissionData.append('dateOfBirth', formValues.dateOfBirth);
          if (formValues.age) submissionData.append('age', formValues.age);
          if (formValues.specialization) submissionData.append('specialization', formValues.specialization);
          if (formValues.qualification) submissionData.append('qualification', formValues.qualification);
          if (formValues.experience) submissionData.append('experience', formValues.experience);
          if (formValues.licenseNumber) submissionData.append('licenseNumber', formValues.licenseNumber);
          if (formValues.address) submissionData.append('address', JSON.stringify(formValues.address));
          if (formValues.availableSlots) submissionData.append('availableSlots', JSON.stringify(formValues.availableSlots));
        }

        // Append image if selected
        if (this.selectedImage) {
          submissionData.append('image', this.selectedImage);
          console.log('Image appended:', this.selectedImage.name);
        }
      } else {
        // If no image, use JSON data
        console.log('Using JSON data (no image)');

        // Create submission data with basic fields always included
        submissionData = {
          name: formValues.name,
          fee: formValues.fee,
          gender: formValues.gender,
          phone: formValues.phone, // ALWAYS include phone
          department: this.departmentOptions.find(dept => dept.name === formValues.department)?._id || formValues.department,
          isActive: formValues.isActive || true
        };

        // Add additional fields only if additional info is shown and filled
        if (this.showAdditionalInfo) {
          if (formValues.firstName) submissionData.firstName = formValues.firstName;
          if (formValues.lastName) submissionData.lastName = formValues.lastName;
          if (formValues.email) submissionData.email = formValues.email;
          if (formValues.dateOfBirth) submissionData.dateOfBirth = formValues.dateOfBirth;
          if (formValues.age) submissionData.age = formValues.age;
          if (formValues.specialization) submissionData.specialization = formValues.specialization;
          if (formValues.qualification) submissionData.qualification = formValues.qualification;
          if (formValues.experience) submissionData.experience = formValues.experience;
          if (formValues.licenseNumber) submissionData.licenseNumber = formValues.licenseNumber;
          if (formValues.address) submissionData.address = formValues.address;
          if (formValues.availableSlots) submissionData.availableSlots = formValues.availableSlots;
        }
      }

      // Log submission data
      console.log('Submission data:', submissionData);
      if (submissionData instanceof FormData) {
        console.log('FormData contents:');
        for (let pair of submissionData.entries()) {
          console.log(pair[0] + ': ' + pair[1]);
        }
      }

      // Address fields are optional - no validation needed
      const addressData = formValues.address;
      console.log('Address data (optional):', addressData);

      // Call doctor service to save or update data
      if (this.isEditMode && this.editingDoctorId) {
        // Update existing doctor
        this.doctorService.updateDoctor(this.editingDoctorId, submissionData).subscribe({
          next: (response) => {
            this.isSubmitting = false;

            // Set localStorage flags for smart refresh
            localStorage.setItem('doctorUpdated', Date.now().toString());
            localStorage.setItem('lastDoctorAction', 'UPDATE');
            localStorage.setItem('lastDoctorActionTime', Date.now().toString());
            localStorage.setItem('updatedDoctorId', response.doctorId || this.editingDoctorId || 'unknown');

            // Show success alert (include doctor name)
            const doctorName = (response as any)?.name || this.doctorForm.get('name')?.value || 'Doctor';
            const idForMsg = (response as any)?.doctorId || (response as any)?._id || this.editingDoctorId || 'N/A';
            this.successMessage = `Doctor ${doctorName} updated successfully! `;
            this.showSuccessAlert = true;
            this.cdr.detectChanges(); // Force change detection

            // Auto-hide alert after 4 seconds, optionally navigate
            setTimeout(() => {
              this.closeSuccessAlert();
              // Set flag for doctor list refresh with timestamp
              localStorage.setItem('doctorUpdated', Date.now().toString());
              // Navigate to doctor list after alert closes unless suppressed
              if (!this.suppressNavigateAfterUpdate) {
                this.router.navigate(['/setup/doctors/doctor-list']);
              }
            }, this.suppressNavigateAfterUpdate ? 2000 : 4000);

          },
          error: (error) => {
            this.isSubmitting = false;
            console.error('Error updating doctor:', error);
            const errorMessage = error.error?.message || 'Error updating doctor. Please try again.';
            this.snackBar.open(errorMessage, 'Close', {
              duration: 5000,
              panelClass: ['error-snackbar']
            });
          }
        });
      } else {
        // Create new doctor
        console.log('Calling createDoctor service...');
        this.doctorService.createDoctor(submissionData).subscribe({
          next: (response) => {
            console.log('Doctor created successfully:', response);
            this.isSubmitting = false;

            // Set localStorage flags for smart refresh
            localStorage.setItem('doctorCreated', Date.now().toString());
            localStorage.setItem('lastDoctorAction', 'CREATE');
            localStorage.setItem('lastDoctorActionTime', Date.now().toString());
            localStorage.setItem('newDoctorId', response.doctorId || 'unknown');

            // Show success alert (include doctor name)
            const createdName = (response as any)?.name || this.doctorForm.get('name')?.value || 'Doctor';
            const createdIdForMsg = (response as any)?.doctorId || (response as any)?._id || 'N/A';
            this.successMessage = `Doctor ${createdName} registered successfully!`;
            this.showSuccessAlert = true;
            this.cdr.detectChanges(); // Force change detection

            // Set flag for doctor list refresh with timestamp
            localStorage.setItem('doctorCreated', Date.now().toString());

            // Alert will auto-hide after 2 seconds via success-alert component
            this.resetForm();

            // Navigate to doctor list after successful registration
            // setTimeout(() => {
            //   this.router.navigate(['/setup/doctors/doctor-list']);
            // }, 2000);

          },
          error: (error) => {
            this.isSubmitting = false;
            console.error('Error registering doctor:', error);
            console.error('Error details:', error.error);
            console.error('Error status:', error.status);
            console.error('Error message:', error.message);

            let errorMessage = 'Error registering doctor. Please try again.';
            if (error.status === 401) {
              errorMessage = 'Authentication required. Please login again.';
            } else if (error.status === 403) {
              errorMessage = 'You do not have permission to register doctors.';
            } else if (error.error?.message) {
              errorMessage = error.error.message;
            }

            this.snackBar.open(errorMessage, 'Close', {
              duration: 5000,
              panelClass: ['error-snackbar']
            });
          }
        });
      }
    } else {
      this.markFormGroupTouched();
      this.snackBar.open('Please fill all required fields correctly!', 'Close', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
    }


  }




  // Fill sample data for testing
  fillSampleData(): void {
    const sampleData = {
      firstName: 'Dr. John',
      lastName: 'Smith',
      email: 'john.smith@hospital.com',
      phone: '9876543210',
      dateOfBirth: '1985-05-15',
      gender: 'Male',
      specialization: 'Cardiology',
      qualification: 'MBBS, MD',
      experience: 8,
      department: this.departmentOptions.length > 0 ? this.departmentOptions[0].name : '',
      licenseNumber: 'LIC123456',
      address: {
        street: '123 Medical Center Drive',
        city: 'Mumbai',
        state: 'Maharashtra',
        zipCode: '400001',
        country: 'India'
      },
      isActive: true
    };

    this.doctorForm.patchValue(sampleData);

    this.snackBar.open('Sample data filled! You can now submit the form.', 'Close', {
      duration: 3000,
      panelClass: ['success-snackbar']
    });
  }

  // Auto-login for testing purposes
  autoLogin(): void {
    console.log('Attempting auto-login...');
    this.authService.login({
      email: 'admin@hospital.com',
      password: 'admin123'
    }).subscribe({
      next: (response) => {
        console.log('Auto-login successful:', response);
        this.snackBar.open('Auto-login successful! You can now register doctors.', 'Close', {
          duration: 3000,
          panelClass: ['success-snackbar']
        });
        // Retry form submission after successful login
        setTimeout(() => {
          this.onSubmit();
        }, 1000);
      },
      error: (error) => {
        console.error('Auto-login failed:', error);
        this.snackBar.open('Auto-login failed. Please login manually.', 'Close', {
          duration: 3000,
          panelClass: ['error-snackbar']
        });
        this.router.navigate(['/auth/login']);
      }
    });
  }

  // Reset form
  resetForm(): void {
    this.doctorForm.reset();
    this.createDoctorForm();
    this.removeImage();
    this.isEditMode = false;
    this.editingDoctorId = null;
  }

  // Log form errors for debugging
  private logFormErrors(): void {
    Object.keys(this.doctorForm.controls).forEach(key => {
      const control = this.doctorForm.get(key);
      if (control && control.errors) {
        console.log(`${key} errors:`, control.errors);
      }

      if (control instanceof FormGroup) {
        Object.keys(control.controls).forEach(nestedKey => {
          const nestedControl = control.get(nestedKey);
          if (nestedControl && nestedControl.errors) {
            console.log(`${key}.${nestedKey} errors:`, nestedControl.errors);
          }
        });
      }
    });
  }

  // Mark all fields as touched to show validation errors
  private markFormGroupTouched(): void {
    Object.keys(this.doctorForm.controls).forEach(key => {
      const control = this.doctorForm.get(key);
      control?.markAsTouched();

      if (control instanceof FormGroup) {
        Object.keys(control.controls).forEach(nestedKey => {
          control.get(nestedKey)?.markAsTouched();
        });
      }
    });
  }

  // Validation helper methods
  isFieldInvalid(fieldName: string): boolean {
    const field = this.doctorForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  isAddressFieldInvalid(_fieldName: string): boolean {
    // Address fields are always optional, so never show as invalid
    return false;
  }

  getFieldError(fieldName: string): string {
    const field = this.doctorForm.get(fieldName);
    if (field?.errors) {
      if (field.errors['required']) return `${fieldName} is required`;
      if (field.errors['email']) return 'Please enter a valid email';
      if (field.errors['pattern']) return `Please enter a valid ${fieldName}`;
      if (field.errors['minlength']) return `${fieldName} must be at least ${field.errors['minlength'].requiredLength} characters`;
      if (field.errors['min']) return `${fieldName} must be greater than or equal to ${field.errors['min'].min}`;
      if (field.errors['duplicate']) return 'This phone number is already registered with another doctor';
    }
    return '';
  }

  getAddressFieldError(_fieldName: string): string {
    // Address fields are always optional, so never show errors
    return '';
  }

  navigateToDocRegistration(): void {
    this.router.navigate(['/setup/doctors/doctor-registration']);
  }
  navigateToDepartmentList(): void {
    this.router.navigate(['/setup/departments/list']);
  }
  navigateToDocSearch(): void {
    this.router.navigate(['/setup/doctors/doctor-list']);
  }

  navigateToDocRoomDirectory(): void {
    this.router.navigate(['/setup/doctor-room-directory']);
  }

  // Success Alert Methods
  closeSuccessAlert(): void {
    this.showSuccessAlert = false;
    this.successMessage = '';
    this.cdr.detectChanges(); // Force change detection
  }


}

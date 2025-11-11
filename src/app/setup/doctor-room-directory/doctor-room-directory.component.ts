import { Component, OnInit, AfterViewInit, OnDestroy, CUSTOM_ELEMENTS_SCHEMA, ChangeDetectorRef, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription, BehaviorSubject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { DoctorRoomDirectoryService, DoctorRoomDirectory, Doctor, Department, Room } from './services/doctor-room-directory.service';
import { DeleteConfirmationModalComponent } from '../../shared/components/delete-confirmation-modal/delete-confirmation-modal.component';
import { DeleteSuccessModalComponent } from '../../shared/components/delete-success-modal/delete-success-modal.component';
import { RecordExistsModalComponent } from '../../shared/components/record-exists-modal/record-exists-modal.component';
import { SuccessAlertComponent } from '../../shared/components/success-alert/success-alert.component';

@Component({
  selector: 'app-doctor-room-directory',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, DeleteConfirmationModalComponent, DeleteSuccessModalComponent, RecordExistsModalComponent, SuccessAlertComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './doctor-room-directory.component.html',
  styleUrls: ['./doctor-room-directory.component.css']
})
export class DoctorRoomDirectoryComponent implements OnInit, AfterViewInit, OnDestroy {
  directoryForm!: FormGroup;
  doctors: Doctor[] = [];
  departments: Department[] = [];
  rooms: Room[] = [];
  rooms$ = new BehaviorSubject<Room[]>([]);
  directories: DoctorRoomDirectory[] = [];
  filteredDirectories: DoctorRoomDirectory[] = [];
  // Pagination state
  currentPage = 1;
  // Show 5 rows per page as requested
  pageSize = 5;
  pageSizeOptions: number[] = [5, 10, 25, 50];
  Math = Math; // For template calculations like Math.min
  private subscription = new Subscription();
  private refreshInterval: any; // For auto-refresh timer
  errors: string[] = [];
  successMessage = '';
  alertSuccessMessage = '';
  showSuccessAlert = false;
  editingDirectory: DoctorRoomDirectory | null = null;
  isEditMode = false;
  selectedDepartmentId = '';
  // Single search term bound to input
  searchTerm: string = '';
  // Department filter for table search section
  departmentFilter: string = '';
  isUpdatingForm = false; // Prevent form update loops
  // Loading state for rooms dropdown
  isRoomsLoading = false;

  // Delete modal properties
  showDeleteConfirmation = false;
  showDeleteSuccess = false;
  deleteMessage = '';
  directoryToDelete: DoctorRoomDirectory | null = null;
  isDeleting = false; // Prevent double-click

  // Record exists modal properties
  showRecordExistsModal = false;
  recordExistsMessage = '';

  // Success alert properties
  successAlertMessage = '';

  // Store current form data for error handling
  currentFormData: any = null;

  // ULTIMATE FIX: Component destruction properties
  isRoomSelectDestroyed = false;
  roomSelectKey = Date.now();
  @ViewChild('formSection') formSectionRef!: ElementRef<HTMLDivElement>;
  @ViewChild('doctorSelect') doctorSelectRef!: ElementRef<HTMLSelectElement>;


  constructor(
    private fb: FormBuilder,
    private directoryService: DoctorRoomDirectoryService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {
    this.initializeForm();
  }

  ngOnInit(): void {
    console.log('🏥 Doctor Room Directory Component Initializing...');

    // Show empty arrays immediately so UI renders fast
    this.doctors = [];
    this.departments = [];
    this.rooms = [];
    this.directories = [];
    this.filteredDirectories = [];

    this.setupFormWatchers();

    // Then load real data immediately (like doctor-list component)
    this.loadDropdownData();
    this.loadDirectories();
  }

  ngAfterViewInit(): void {
    // No need to reload data here - already loaded in ngOnInit (like doctor-list component)
    console.log('🔄 View initialized - data already loaded');
  }

  private initializeForm(): void {
    this.directoryForm = this.fb.group({
      doctor: ['', [Validators.required]],
      department: ['', [Validators.required]],
      room: ['', [Validators.required]]
    });
  }

  private setupFormWatchers(): void {
    console.log('🔄 Setting up form watchers for cascading dropdowns...');

    // Watch doctor selection to auto-fill department
    this.subscription.add(
      this.directoryForm.get('doctor')?.valueChanges.pipe(
        debounceTime(100),
        distinctUntilChanged()
      ).subscribe(doctorId => {
        // If control is disabled (edit mode), do not react to valueChanges to avoid loops
        if (this.directoryForm.get('doctor')?.disabled) {
          return;
        }
        if (doctorId && !this.isUpdatingForm) {
          console.log('👨‍⚕️ Doctor selected:', doctorId);
          this.onDoctorChange(doctorId);
        }
      })
    );

    // Department is read-only, no need to watch changes
    // Rooms will be loaded when doctor changes and department is auto-filled
  }

  private loadDropdownData(): void {
    console.log('📊 Loading dropdown data...');

    // Load doctors
    this.subscription.add(
      this.directoryService.getDoctors().subscribe({
        next: (response) => {
          if (response.success) {
            console.log('✅ Doctors loaded:', response.data.length);
            this.doctors = response.data;

            // Log first few doctors with their department info
            console.log('👨‍⚕️ First 3 doctors:', this.doctors.slice(0, 3).map(doctor => ({
              _id: doctor._id,
              name: doctor.name,
              department: doctor.department,
              departmentType: typeof doctor.department,
              departmentName: typeof doctor.department === 'object' ? doctor.department.name : 'N/A'
            })));
          }
        },
        error: (error) => {
          console.error('❌ Error loading doctors:', error);
          this.doctors = [];
        }
      })
    );

    // Load departments
    this.subscription.add(
      this.directoryService.getDepartments().subscribe({
        next: (response) => {
          if (response.success) {
            console.log('✅ Departments loaded:', response.data.length);
            this.departments = response.data;
          }
        },
        error: (error) => {
          console.error('Error loading departments:', error);
        }
      })
    );
  }

  private loadRooms(departmentId?: string): void {
    console.log('🏠 Loading rooms for department:', departmentId);
    console.log('🏠 Department ID type:', typeof departmentId);
    console.log('🏠 API URL will be: /api/doctor-room-directory/dropdowns/rooms' + (departmentId ? `?department=${departmentId}` : ''));

    // SIMPLE CLEARING (Default Change Detection will handle updates)
    console.log('🧹 BEFORE CLEAR: Rooms count:', this.rooms.length);

    this.rooms = [];
    this.rooms$.next([]);

    console.log('🧹 AFTER CLEAR: Rooms count:', this.rooms.length);

    // Update selectedDepartmentId immediately
    this.selectedDepartmentId = departmentId || '';

    // Clear room form control value with multiple strategies
    const roomControl = this.directoryForm.get('room');
    if (roomControl) {
      roomControl.setValue('', { emitEvent: false });
      roomControl.patchValue('', { emitEvent: false });
      roomControl.markAsUntouched();
    }

    if (!departmentId) {
      console.log('🏠 No department ID provided, keeping rooms empty');
      return;
    }

    // Set loading true before request
    this.isRoomsLoading = true;

    this.subscription.add(
      this.directoryService.getRooms(departmentId).subscribe({
        next: (response) => {
          console.log('🏠 Rooms API response:', response);
          console.log('🏠 Response type:', typeof response);
          console.log('🏠 Response keys:', Object.keys(response || {}));

          if (response && response.success && response.data) {
            console.log('📥 RECEIVED ROOMS DATA:', response.data);

            // 🚀 ULTIMATE FIX: DESTROY & RECREATE SELECT ELEMENT
            console.log('🚀 ULTIMATE DESTRUCTION: Destroying select element');

            // Step 1: Destroy select element completely
            this.isRoomSelectDestroyed = true;
            this.rooms = [];
            this.rooms$.next([]);
            this.cdr.detectChanges();

            // Step 2: Wait and recreate everything with new key
            setTimeout(() => {
              // Filter strictly by current department to avoid cross-department rooms
              const filteredRooms = (response.data || []).filter((room: any) => {
                const dep = room?.department;
                const depId = typeof dep === 'string' ? dep : dep?._id;
                return !!depId && depId === this.selectedDepartmentId;
              });

              // Create new room objects
              const newRooms = filteredRooms.map((room: any) => ({
                ...room,
                _id: room._id,
                roomNumber: room.roomNumber,
                department: room.department
              }));

              console.log('🚦 FILTERED ROOMS for department', this.selectedDepartmentId, '=>', newRooms.map((r: any) => r.roomNumber));

              // Generate completely new key for recreation
              this.roomSelectKey = Date.now();

              console.log('🚀 ULTIMATE RECREATION: New rooms with key:', this.roomSelectKey);
              console.log('🚀 ULTIMATE RECREATION: Rooms data:', newRooms.map((r: any) => r.roomNumber));

              this.rooms = newRooms;
              this.rooms$.next(newRooms);

              // Recreate select element
              this.isRoomSelectDestroyed = false;
              this.cdr.detectChanges();

              // Turn off loading state
              this.isRoomsLoading = false;

              console.log('✅ ULTIMATE SUCCESS - Count:', this.rooms.length);
              console.log('✅ ULTIMATE SUCCESS - Data:', this.rooms.map((r: any) => r.roomNumber));

              // Final verification
              setTimeout(() => {
                console.log('🔄 ULTIMATE FINAL CHECK: Rooms should be:', this.rooms.map((r: any) => r.roomNumber));
                console.log('🔄 ULTIMATE KEY:', this.roomSelectKey);
                console.log('🔄 ULTIMATE DESTROYED STATE:', this.isRoomSelectDestroyed);
              }, 100);
            }, 100);

          } else {
            console.error('❌ Failed to load rooms - Invalid response structure:', response);
            this.rooms = [];
            this.rooms$.next([]);
            // Turn off loading state in fallback
            this.isRoomsLoading = false;
          }
        },
        error: (error) => {
          console.error('❌ Error loading rooms:', error);
          console.error('❌ Error details:', error.error);
          console.error('❌ Error status:', error.status);
          this.rooms = [];
          this.isRoomsLoading = false;
          this.cdr.detectChanges();
        }
      })
    );
  }

  private loadDirectories(): void {
    this.subscription.add(
      this.directoryService.getDirectories(1, 1000, '', '', '', true).subscribe({
        next: (response) => {
          if (response.success) {
            console.log('✅ Directories loaded successfully:', response.data.length);
            this.directories = response.data;
            this.filteredDirectories = response.data; // Initialize filtered list
            this.applyDoctorFilter(); // Apply any existing filter

            // Force UI to update immediately so table appears without extra click
            this.cdr.detectChanges();
            console.log('✅ DOCTOR ROOM DIRECTORY: Data loaded successfully!');
          }
        },
        error: (error) => {
          console.error('❌ Error loading directories:', error);
          this.directories = [];
          this.filteredDirectories = [];
          this.cdr.detectChanges();
        }
      })
    );
  }

  // Filter directories by doctor name
  applyDoctorFilter(): void {
    const term = (this.searchTerm || '').toString().trim().toLowerCase();
    const depId = (this.departmentFilter || '').toString();

    const base = this.directories;
    const afterText = !term ? base : base.filter(directory => {
      const doctorName = typeof directory.doctor === 'object' && directory.doctor?.name
        ? directory.doctor.name
        : '';
      const departmentName = typeof directory.department === 'object' && directory.department?.name
        ? (directory.department as any).name
        : '';
      const roomNumber = typeof directory.room === 'object' && (directory.room as any)?.roomNumber
        ? (directory.room as any).roomNumber
        : '';
      const id = directory.directoryId || '';
      const haystack = `${doctorName} ${departmentName} ${roomNumber} ${id}`.toLowerCase();
      return haystack.includes(term);
    });

    this.filteredDirectories = !depId ? afterText : afterText.filter(directory => {
      const depVal = typeof directory.department === 'object'
        ? (directory.department as any)?._id
        : (directory.department as any);
      return depVal === depId;
    });

    this.currentPage = 1;
  }

   navigateToRoomRegistration(): void {
    this.router.navigate(['/setup/rooms/room-registration']);
  }


   navigateToDocSearch(): void {
    this.router.navigate(['/setup/doctors/doctor-list']);
  }
 navigateToDocRoomDirectory(): void {
    this.router.navigate(['/setup/doctor-room-directory']);
  }
  // Handle doctor filter input
  onDoctorFilterChange(): void {
    this.applyDoctorFilter();
  }

  onDepartmentFilterChange(): void {
    this.applyDoctorFilter();
  }

  // Clear all filters
  clearFilters(): void {
    this.searchTerm = '';
    this.departmentFilter = '';
    this.applyDoctorFilter();
  }

  // Public method to refresh directories
  refreshDirectories(): void {
    this.loadDirectories();
    this.currentPage = 1; // keep user on first page after refresh
  }

  // Pagination helpers
  get pagedDirectories(): DoctorRoomDirectory[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredDirectories.slice(start, start + this.pageSize);
  }

  // Helper: resolve room number from locally loaded rooms (fallback to service)
  private resolveRoomNumber(roomId: string): string {
    if (!roomId) return 'Unknown Room';
    const found = this.rooms.find(r => r._id === roomId);
    if (found && found.roomNumber) return found.roomNumber;
    try { return this.directoryService.getRoomNumber(roomId); } catch { return 'Unknown Room'; }
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredDirectories.length / this.pageSize));
  }

  onPageSizeChange(size: number): void {
    this.pageSize = size;
    this.currentPage = 1;
  }

  goToPage(page: number | string): void {
    if (typeof page === 'string') return; // ignore ellipsis clicks
    const total = this.totalPages;
    this.currentPage = Math.min(Math.max(1, page), total);
  }

  getPageNumbers(): (number | string)[] {
    const pages: (number | string)[] = [];
    const maxVisible = 5;
    const total = this.totalPages;

    if (total <= maxVisible) {
      for (let i = 1; i <= total; i++) pages.push(i);
      return pages;
    }

    pages.push(1);
    let start = Math.max(2, this.currentPage - 1);
    let end = Math.min(total - 1, this.currentPage + 1);

    if (start > 2) pages.push('...');
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < total - 1) pages.push('...');
    if (total > 1) pages.push(total);
    return pages;
  }

  onDoctorChange(doctorId: string): void {
    console.log('👨‍⚕️ Doctor changed to:', doctorId);

    // SIMPLE CLEARING ON DOCTOR CHANGE
    console.log('🧹 DOCTOR CHANGE: Clearing rooms');
    console.log('🧹 BEFORE: Rooms count:', this.rooms.length);

    this.rooms = [];
    this.rooms$.next([]);
    this.selectedDepartmentId = '';

    console.log('🧹 AFTER: Rooms count:', this.rooms.length);

    // Clear room form control immediately with multiple strategies
    const roomControl = this.directoryForm.get('room');
    if (roomControl) {
      roomControl.setValue('', { emitEvent: false });
      roomControl.patchValue('', { emitEvent: false });
      roomControl.markAsUntouched();
    }

    if (!doctorId) {
      // Clear department and room when no doctor selected
      this.isUpdatingForm = true;
      this.directoryForm.patchValue({
        department: '',
        room: ''
      });
      this.isUpdatingForm = false;
      console.log('🧹 Cleared all fields - no doctor selected');
      return;
    }

    // Find the selected doctor
    const selectedDoctor = this.doctors.find(doctor => doctor._id === doctorId);
    console.log('👨‍⚕️ Selected doctor:', selectedDoctor);
    console.log('👨‍⚕️ Doctor department:', selectedDoctor?.department);

    if (selectedDoctor && selectedDoctor.department) {
      // Get department ID from the doctor data (already populated)
      const departmentId = typeof selectedDoctor.department === 'string'
        ? selectedDoctor.department
        : (selectedDoctor.department as any)._id;

      console.log('🏢 Department ID extracted:', departmentId);
      console.log('🏢 Department type:', typeof selectedDoctor.department);

      // Auto-fill department using isUpdatingForm flag
      this.isUpdatingForm = true;
      this.directoryForm.patchValue({
        department: departmentId,
        room: '' // Clear room selection
      });
      this.isUpdatingForm = false;

      console.log('🏢 Department form value set to:', this.directoryForm.get('department')?.value);
      console.log('🏢 Selected department ID will be:', departmentId);

      // IMPORTANT: Load rooms for this department (rooms already cleared above)
      // Ensure UI enables room dropdown immediately
      this.selectedDepartmentId = departmentId;
      this.loadRooms(departmentId);
    } else {
      console.log('⚠️ Doctor department not found, using API fallback');

      // Fallback: Get doctor details from API if department not populated
      this.subscription.add(
        this.directoryService.getDoctorDetails(doctorId).subscribe({
          next: (response: any) => {
            console.log('📡 Doctor details API response:', response);

            if (response.success && response.data.department) {
              const departmentId = typeof response.data.department === 'string'
                ? response.data.department
                : response.data.department._id;

              console.log('🏢 Department ID from API:', departmentId);

              // Auto-fill department using isUpdatingForm flag
              this.isUpdatingForm = true;
              this.directoryForm.patchValue({
                department: departmentId,
                room: '' // Clear room selection
              });
              this.isUpdatingForm = false;

              // IMPORTANT: Load rooms for this department (rooms already cleared above)
              this.loadRooms(departmentId);
            }
          },
          error: (error: any) => {
            console.error('❌ Error getting doctor details:', error);
          }

        })
      );
    }
  }



  onSubmit(): void {
    console.log('🚀 DEBUGGING - onSubmit called');
    console.log('🚀 DEBUGGING - Form valid:', this.directoryForm.valid);
    // Use getRawValue so disabled controls (doctor, department) are included in edit mode
    const raw = this.directoryForm.getRawValue();
    console.log('🚀 DEBUGGING - Form raw value:', raw);

    if (this.directoryForm.valid) {
      const formData = raw; // include disabled fields
      this.currentFormData = formData; // Store for error handling

      console.log('🚀 DEBUGGING - Form data:', formData);

      // Validate form data
      const validationErrors = this.validateFormData(formData);
      console.log('🚀 DEBUGGING - Validation errors:', validationErrors);

      if (validationErrors.length > 0) {
        this.errors = validationErrors;
        console.log('🚀 DEBUGGING - Validation failed, returning');
        return;
      }

      // Check if doctor is already assigned to a room (for both add and edit mode)
      console.log('🔍 DEBUGGING - Form doctor:', formData.doctor);
      console.log('🔍 DEBUGGING - Directories:', this.directories);
      console.log('🔍 DEBUGGING - Directories length:', this.directories.length);

      const existsInList = this.directories.some(directory => {
        console.log('🔍 DEBUGGING - Checking directory:', directory);

        // For edit mode, exclude the current directory being edited
        if (this.isEditMode && this.editingDirectory && directory._id === this.editingDirectory._id) {
          console.log('🔍 DEBUGGING - Skipping edit directory');
          return false;
        }

        const directoryDoctorId = typeof directory.doctor === 'string'
          ? directory.doctor
          : directory.doctor._id;

        console.log('🔍 DEBUGGING - Comparing:', directoryDoctorId, 'vs', formData.doctor);
        const matches = directoryDoctorId === formData.doctor;
        console.log('🔍 DEBUGGING - Match result:', matches);

        return matches;
      });

      console.log('🔍 DEBUGGING - Final result:', existsInList);

      if (existsInList) {
        const doctorName = this.getDoctorName(formData.doctor);
        console.log('🚨 DEBUGGING - Showing modal for:', doctorName);
        this.showRecordExists(doctorName);
        return;
      }

      const directoryData = {
        doctor: formData.doctor,
        department: formData.department,
        room: formData.room
      };

      if (this.isEditMode && this.editingDirectory) {
        // Update existing directory
        this.subscription.add(
          this.directoryService.updateDirectory(this.editingDirectory._id!, directoryData).subscribe({
            next: (response: any) => {
              // Build a user-friendly success message with doctor name and room number
              const updatedPayload = response?.data || directoryData;
              const doctorName = this.getDoctorName((updatedPayload as any).doctor || directoryData.doctor);
              const roomVal = (updatedPayload as any).room || directoryData.room;
              const roomNumber = typeof roomVal === 'string' ? this.resolveRoomNumber(roomVal) : (roomVal?.roomNumber || 'Unknown Room');
              this.successMessage = `Dr. ${doctorName} has been successfully assigned to Room ${roomNumber}`;
              this.showSuccessAlert = true;
              this.cdr.detectChanges();

              // Update table immediately without reloading the page
              const updated = response.data || null;
              if (updated && this.editingDirectory?._id) {
                const idx = this.directories.findIndex(d => d._id === this.editingDirectory!._id);
                if (idx !== -1) {
                  this.directories[idx] = updated;
                  this.filteredDirectories = [...this.directories];
                }
              }

              // Fetch fresh list bypassing cache
              this.loadDirectories();
              this.resetForm();
            },
            error: (error) => {
              console.error('Error updating directory:', error);
              const errorMessage = error.error?.message || 'Failed to update directory';

              // Check if it's a duplicate assignment error
              if (errorMessage.toLowerCase().includes('already assigned') ||
                  errorMessage.toLowerCase().includes('duplicate') ||
                  errorMessage.toLowerCase().includes('already exists')) {
                const doctorName = this.getDoctorName(this.currentFormData?.doctor);
                this.showRecordExists(doctorName);
              } else {
                // Show error message
                this.errors = [errorMessage];
                console.error('❌ Error creating directory:', errorMessage);
              }
            }
          })
        );
      } else {
        // Create new directory
        this.subscription.add(
          this.directoryService.createDirectory(directoryData).subscribe({
            next: (response: any) => {
              console.log('✅ Directory creation response:', response);

              // Get doctor and room names for success message
              const doctorName = this.getDoctorName(directoryData.doctor);
              const roomNumber = typeof directoryData.room === 'string'
                ? this.resolveRoomNumber(directoryData.room)
                : (directoryData.room?.roomNumber || 'Unknown Room');

              this.successMessage = `Dr. ${doctorName} has been successfully assigned to Room ${roomNumber}`;
              this.showSuccessAlert = true;
              this.cdr.detectChanges();

              // Show the new record in the table instantly
              if (response && response.data) {
                this.directories = [response.data, ...this.directories];
                this.filteredDirectories = [...this.directories];
              }

              // Fetch fresh list bypassing cache as a follow-up
              this.loadDirectories();
              this.resetForm();
            },
            error: (error) => {
              console.error('Error creating directory:', error);
              const errorMessage = error.error?.message || 'Failed to create directory';

              // Check if it's a duplicate assignment error
              if (errorMessage.toLowerCase().includes('already assigned') ||
                  errorMessage.toLowerCase().includes('duplicate') ||
                  errorMessage.toLowerCase().includes('already exists')) {
                const doctorName = this.getDoctorName(this.currentFormData?.doctor);
                this.showRecordExists(doctorName);
              } else {
                // Show error message
                this.errors = [errorMessage];
                console.error('❌ Error updating directory:', errorMessage);
              }
            }
          })
        );
      }
    } else {
      console.log('🚀 DEBUGGING - Form is invalid');
      console.log('🚀 DEBUGGING - Form errors:', this.directoryForm.errors);
      console.log('🚀 DEBUGGING - Form controls errors:');
      Object.keys(this.directoryForm.controls).forEach(key => {
        const control = this.directoryForm.get(key);
        if (control && control.errors) {
          console.log(`🚀 DEBUGGING - ${key}:`, control.errors);
        }
      });
      this.markFormGroupTouched();
      this.errors = ['Please fill all required fields'];
    }
  }

  private validateFormData(data: any): string[] {
    const errors: string[] = [];

    // In edit mode, doctor and department are disabled; skip required checks for them
    const checkDoctor = !this.isEditMode;
    const checkDepartment = !this.isEditMode;

    if (checkDoctor && !data.doctor) {
      errors.push('Doctor is required');
    }

    if (checkDepartment && !data.department) {
      errors.push('Department is required');
    }

    if (!data.room) {
      errors.push('Room is required');
    }

    return errors;
  }

  editDirectory(directory: DoctorRoomDirectory): void {
    this.editingDirectory = directory;
    this.isEditMode = true;

    // Get IDs for form
    const doctorId = typeof directory.doctor === 'string' ? directory.doctor : directory.doctor?._id;
    const departmentId = typeof directory.department === 'string' ? directory.department : directory.department?._id;
    const roomId = typeof directory.room === 'string' ? directory.room : directory.room?._id;

    this.directoryForm.patchValue({
      doctor: doctorId,
      department: departmentId,
      room: roomId
    });

    // Load rooms for the selected department
    if (departmentId) {
      this.selectedDepartmentId = departmentId;
      this.loadRooms(departmentId);

    // Smooth scroll to the form and focus the first control when entering edit mode
    try {
      this.formSectionRef?.nativeElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => this.doctorSelectRef?.nativeElement?.focus(), 300);
    } catch {}

      // Wait a bit for rooms to load, then set the room value
      setTimeout(() => {
        if (roomId) {
          this.directoryForm.get('room')?.setValue(roomId);
        }
      }, 500);

      // Disable doctor and department fields in edit mode
      this.directoryForm.get('doctor')?.disable({ emitEvent: false });
      this.directoryForm.get('department')?.disable({ emitEvent: false });
    }

    this.errors = [];
    this.successMessage = '';
  }

  deleteDirectory(directory: DoctorRoomDirectory): void {
    // Prevent multiple clicks
    if (this.showDeleteConfirmation || this.isDeleting) {
      return;
    }

    const doctorName = this.getDoctorName(directory.doctor);
    const roomNumber = this.getRoomNumber(directory.room);

    this.directoryToDelete = directory;
    this.deleteMessage = `You are about to remove the assignment of Dr. ${doctorName} to Room ${roomNumber} forever. Once deleted, this cannot be restored.`;
    this.showDeleteConfirmation = true;
    this.cdr.detectChanges();
  }

  // Delete Confirmation Methods
  cancelDelete(): void {
    this.showDeleteConfirmation = false;
    this.directoryToDelete = null;
    this.deleteMessage = '';
    this.isDeleting = false; // Reset flag when cancelling
  }

  confirmDelete(): void {
    if (this.directoryToDelete) {
      // Close the confirmation modal immediately and trigger CD
      this.isDeleting = true;
      const targetId = this.directoryToDelete._id!;
      this.showDeleteConfirmation = false;
      this.cdr.detectChanges();

      this.subscription.add(
        this.directoryService.deleteDirectory(targetId).subscribe({
          next: () => {
            console.log('✅ Delete operation successful');
            // Remove from local arrays immediately so table updates
            this.directories = this.directories.filter(d => d._id !== targetId);
            this.filteredDirectories = this.filteredDirectories.filter(d => d._id !== targetId);
            // Clamp current page if needed
            this.goToPage(this.currentPage);

            // Show success modal immediately and trigger CD
            this.isDeleting = false;
            this.showDeleteSuccess = true;
            this.cdr.detectChanges();
            // Immediately reload list from server so counts/totals are fresh
            this.loadDirectories();

            // Clear selection/context
            this.directoryToDelete = null;
            this.deleteMessage = '';
          },
          error: (error) => {
            console.error('❌ Error deleting directory:', error);
            this.isDeleting = false;
            this.errors = ['Failed to delete directory'];
          }
        })
      );
    } else {
      console.log('🚫 Delete operation blocked - no directory selected');
    }
  }

  // Delete Success Methods
  onDeleteSuccessClosed(): void {
    console.log('🗑️ Delete success modal closed, refreshing directories...');
    this.showDeleteSuccess = false;
    // Refresh table data after success modal closes
    this.loadDirectories();
    this.cdr.detectChanges();

    // Remove page reload to prevent loops
  }

  resetForm(): void {
    this.directoryForm.reset();
    this.isEditMode = false;
    this.editingDirectory = null;
    this.errors = [];
    // Do NOT clear successMessage here; it is used by the success alert
    this.selectedDepartmentId = '';
    this.rooms = [];

    // Re-enable disabled controls for fresh create mode
    this.directoryForm.get('doctor')?.enable({ emitEvent: false });
    this.directoryForm.get('department')?.enable({ emitEvent: false });

    // Clear department field explicitly
    this.directoryForm.get('department')?.setValue('');
  }



  private markFormGroupTouched(): void {
    Object.keys(this.directoryForm.controls).forEach(key => {
      const control = this.directoryForm.get(key);
      control?.markAsTouched();
    });
  }

  // Helper methods for display
  getDoctorName(doctor: string | { _id: string; name: string; doctorId?: string }): string {
    return this.directoryService.getDoctorName(doctor);
  }

  getDepartmentName(department: string | { _id: string; name: string; code?: string }): string {
    return this.directoryService.getDepartmentName(department);
  }

  getRoomNumber(room: string | { _id: string; roomNumber: string }): string {
    return this.directoryService.getRoomNumber(room);
  }

  // Get selected department name for display
  getSelectedDepartmentName(): string {
    const departmentId = this.directoryForm.get('department')?.value;
    if (departmentId) {
      const department = this.departments.find(d => d._id === departmentId);
      return department ? department.name : '';
    }
    return '';
  }

  // TrackBy functions for better performance
  trackByDirectoryId(index: number, directory: DoctorRoomDirectory): string {
    return directory._id || index.toString();
  }

  trackByRoomId(index: number, room: Room): string {
    return room._id || index.toString();
  }

  // Get current rooms - forces fresh evaluation
  getCurrentRooms(): Room[] {
    console.log('🔄 getCurrentRooms called - Department:', this.selectedDepartmentId, 'Rooms count:', this.rooms.length);
    return [...this.rooms]; // Return new array reference
  }

  // Record exists modal methods
  onRecordExistsModalClosed(): void {
    this.showRecordExistsModal = false;
    this.recordExistsMessage = '';
  }

  // Method to show record exists modal (call this when duplicate is found)
  showRecordExists(doctorName: string): void {
    this.recordExistsMessage = `Dr. ${doctorName} is already assigned to a room in the system.`;
    this.showRecordExistsModal = true;
    // 🚫 REMOVED: Manual change detection to prevent infinite loops
  }

  closeSuccessAlert(): void {
    this.showSuccessAlert = false;
    this.successMessage = '';
  }




  ngOnDestroy(): void {
    this.subscription.unsubscribe();

    // PERFORMANCE FIX: Clear refresh interval to prevent memory leaks
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      console.log('🏥 Doctor Room Directory: Refresh interval cleared');
    }
  }
}

import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, CUSTOM_ELEMENTS_SCHEMA, ChangeDetectorRef, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { RoomService, Room } from '../services/room.service';
import { DepartmentService, Department } from '../../departments/services/department.service';
import { DeleteConfirmationModalComponent } from '../../../shared/components/delete-confirmation-modal/delete-confirmation-modal.component';
import { DeleteSuccessModalComponent } from '../../../shared/components/delete-success-modal/delete-success-modal.component';
import { RecordExistsModalComponent } from '../../../shared/components/record-exists-modal/record-exists-modal.component';
import { SuccessAlertComponent } from '../../../shared/components/success-alert/success-alert.component';

@Component({
  selector: 'app-room-registration',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DeleteConfirmationModalComponent, DeleteSuccessModalComponent, RecordExistsModalComponent, SuccessAlertComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './room-registration.component.html',
  styleUrls: ['./room-registration.component.css']
})
export class RoomRegistrationComponent implements OnInit, OnDestroy, AfterViewInit {
  roomForm!: FormGroup;
  departments: Department[] = [];
  rooms: Room[] = []; // Temporary list for current session
  private subscription = new Subscription();
  errors: string[] = [];
  successMessage = '';
  showSuccessAlert = false;
  editingRoom: Room | null = null;
  isEditMode = false;
  // If true, do not auto-navigate after update (used when coming from delete-blocked modal edit or inline table edit)
  private suppressNavigateAfterUpdate = false;

  // Event emitter to refresh parent component
  @Output() roomSaved = new EventEmitter<void>();

  // Delete modal properties
  showDeleteConfirmation = false;
  showDeleteSuccess = false;
  deleteMessage = '';
  roomToDelete: Room | null = null;
  isDeleting = false;

  // Record exists modal properties
  showRecordExistsModal = false;
  recordExistsMessage = '';

  @ViewChild('roomNumberInput') roomNumberInput!: ElementRef;

  constructor(
    private fb: FormBuilder,
    private roomService: RoomService,
    private departmentService: DepartmentService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    console.log('🚀 Room Registration Component Initialized');
    this.createRoomForm();
    this.loadDepartments();
    this.checkForEditMode();
  }

  checkForEditMode(): void {
    this.route.queryParams.subscribe(params => {
      if (params['id'] && params['mode'] === 'edit') {
        this.suppressNavigateAfterUpdate = params['suppressNavigate'] === '1' || params['suppressNavigate'] === 'true';
        this.loadRoomForEdit(params['id']);
      }
    });
  }

  loadRoomForEdit(roomId: string): void {
    this.subscription.add(
      this.roomService.getRoomById(roomId).subscribe({
        next: (room) => {
          this.editRoom(room);
        },
        error: (error) => {
          console.error('Error loading room for edit:', error);
          this.showRecordExists('Failed to load room data');
        }
      })
    );
  }

  ngAfterViewInit(): void {
    // Auto-focus on Room Number field when page loads
    this.focusRoomNumberField();
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  // ADDED: Method to focus on Room Number field
  private focusRoomNumberField(): void {
    setTimeout(() => {
      if (this.roomNumberInput && this.roomNumberInput.nativeElement) {
        this.roomNumberInput.nativeElement.focus();
        console.log('🎯 Auto-focus set on Room Number field');
      }
    }, 100);
  }

  createRoomForm(): void {
    this.roomForm = this.fb.group({
      roomNumber: ['', [Validators.required]],
      department: ['', [Validators.required]]
    });
  }

  loadDepartments(): void {
    this.subscription.add(
      this.departmentService.getDepartmentsList(true).subscribe({
        next: (departments: Department[]) => {
          this.departments = departments;
          console.log('Departments loaded (fresh):', this.departments);
        },
        error: (error) => {
          console.error('Error loading departments:', error);
          this.errors = ['Error loading departments'];
        }
      })
    );
  }

  navigateToDocRoomSearch(): void {
    this.router.navigate(['/setup/rooms/room-list']);
  }
   navigateToDepartmentList(): void {
    this.router.navigate(['/setup/departments/list']);
  }
  navigateToRoomRegistration(): void {
    this.router.navigate(['/setup/rooms/room-registration']);
  }
  navigateToDocRoomDirectory(): void {
    this.router.navigate(['/setup/doctor-room-directory']);
  }
  onSubmit(): void {
    console.log('🔥 onSubmit called!');
    console.log('📝 Form value:', this.roomForm.value);
    console.log('📋 Form valid:', this.roomForm.valid);
    console.log('❌ Form errors:', this.roomForm.errors);

    if (this.roomForm.valid) {
      console.log('✅ Form is valid');
      this.errors = [];
      this.successMessage = '';

      const formData = this.roomForm.getRawValue(); // Use getRawValue to get disabled fields too

      // Find selected department (only for new rooms)
      let departmentId = formData.department;
      if (!this.isEditMode) {
        const selectedDept = this.departments.find(dept => dept.name === formData.department);
        departmentId = selectedDept?._id || formData.department;
      } else {
        // For edit mode, keep the existing department
        departmentId = typeof this.editingRoom?.department === 'string'
          ? this.editingRoom.department
          : this.editingRoom?.department?._id;
      }

      const roomData = {
        roomNumber: formData.roomNumber.startsWith('RN-') ? formData.roomNumber : 'RN-' + formData.roomNumber,
        department: departmentId,
        isActive: true
      };

      // Validate using service
      const validationErrors = this.roomService.validateRoom(roomData);
      if (validationErrors.length > 0) {
        this.errors = validationErrors;
        return;
      }

      if (this.isEditMode && this.editingRoom?._id) {
        // Update existing room
        this.subscription.add(
          this.roomService.updateRoom(this.editingRoom._id, roomData).subscribe({
            next: (updatedRoom: any) => {
              // Update local table if this room exists in the temporary list
              const idx = this.rooms.findIndex(r => r._id === this.editingRoom!._id);
              if (idx > -1) {
                this.rooms[idx] = { ...this.rooms[idx], roomNumber: updatedRoom.roomNumber || roomData.roomNumber } as Room;
              }

              // Show success alert
              this.successMessage = `Room updated successfully! Room ID: ${updatedRoom.roomNumber || this.editingRoom?.roomNumber}`;
              this.showSuccessAlert = true;
              this.cdr.detectChanges(); // Force change detection

              // After a short delay, close alert; optionally navigate back to room list
              setTimeout(() => {
                this.closeSuccessAlert();
                // Reset the form after update
                this.resetForm();
                if (!this.suppressNavigateAfterUpdate) {
                  // Set flag so list can refresh if needed
                  localStorage.setItem('roomUpdated', Date.now().toString());
                  this.router.navigate(['/setup/rooms/room-list']);
                } else {
                  // If staying on page, re-focus primary field
                  this.focusRoomNumberField();
                }
              }, this.suppressNavigateAfterUpdate ? 2000 : 1500);
            },
            error: (error) => {
              console.error('Error updating room:', error);
              const errorMessage = error.error?.message || 'Failed to update room';

              // Check if it's a duplicate room error
              if (errorMessage.toLowerCase().includes('already exists') ||
                  errorMessage.toLowerCase().includes('duplicate')) {
                const roomNumber = this.roomForm.get('roomNumber')?.value || 'this room';
                this.showRecordExists(roomNumber);
              } else {
                // Show simple error alert for other errors
                alert(errorMessage);
                this.errors = [errorMessage];
              }
            }
          })
        );
      } else {
        // Create new room
        this.subscription.add(
          this.roomService.createRoom(roomData).subscribe({
            next: (room: any) => {
              console.log('🎉 Room created successfully:', room);
              // Show success alert
              this.successMessage = `Room added successfully! Room ID: ${room.roomNumber}`;
              this.showSuccessAlert = true;
              this.cdr.detectChanges(); // Force change detection
              console.log('🚨 Alert should show now. showSuccessAlert:', this.showSuccessAlert);

              // Add to temporary list
              this.rooms.push(room);

             

              // Auto-hide alert after 2 seconds, then reset and re-focus
              setTimeout(() => {
                this.closeSuccessAlert();
                this.resetForm();
                this.focusRoomNumberField();
              }, 2000);
            },
            error: (error) => {
              console.error('Error creating room:', error);
              const errorMessage = error.error?.message || 'Failed to add room';

              // Check if it's a duplicate room error
              if (errorMessage.toLowerCase().includes('already exists') ||
                  errorMessage.toLowerCase().includes('duplicate')) {
                const roomNumber = this.roomForm.get('roomNumber')?.value || 'this room';
                this.showRecordExists(roomNumber);
              } else {
                // Show simple error alert for other errors
                alert(errorMessage);
                this.errors = [errorMessage];
              }
            }
          })
        );
      }
    } else {
      console.log('❌ Form is invalid!');
      console.log('🔍 Form errors:', this.getFormValidationErrors());
      this.markFormGroupTouched();
    }
  }

  editRoom(room: Room): void {
    this.editingRoom = room;
    this.isEditMode = true;
    
    // Inline table edit should not navigate away after update
    this.suppressNavigateAfterUpdate = true;

    const departmentName = typeof room.department === 'string'
      ? room.department
      : room.department?.name;

    this.roomForm.patchValue({
      roomNumber: room.roomNumber.replace('RN-', ''),
      department: departmentName
    });

    // ADDED: Auto-focus on Room Number field when editing
    this.focusRoomNumberField();

    // Disable department field during edit
    this.roomForm.get('department')?.disable();

    // Clear any previous messages
    this.errors = [];
    this.successMessage = '';
  }



  deleteRoom(room: Room): void {
    this.roomToDelete = room;
    this.deleteMessage = `You are about to remove room "${room.roomNumber}" forever. Once deleted, this cannot be restored.`;
    this.showDeleteConfirmation = true;
  }

  // Delete Confirmation Methods
  cancelDelete(): void {
    this.showDeleteConfirmation = false;
    this.roomToDelete = null;
    this.deleteMessage = '';
  }

  confirmDelete(): void {
    if (!this.roomToDelete || this.isDeleting) return;

    this.isDeleting = true;
    this.subscription.add(
      this.roomService.deleteRoom(this.roomToDelete._id!).subscribe({
        next: () => {
          // Remove from temporary list completely
          this.rooms = this.rooms.filter(r => r._id !== this.roomToDelete!._id);
          // Close confirmation first, then show success immediately
          this.cancelDelete();
          this.showDeleteSuccess = true;
          this.cdr.detectChanges();
          this.isDeleting = false;
        },
        error: (error) => {
          console.error('Error deleting room:', error);
          this.isDeleting = false;
          this.showRecordExists('Failed to delete room');
          this.cancelDelete();
        }
      })
    );
  }

  // Delete Success Methods
  onDeleteSuccessClosed(): void {
    this.showDeleteSuccess = false;
  }

  resetForm(): void {
    this.roomForm.reset();
    this.roomForm.get('department')?.enable(); // Re-enable department field
    this.isEditMode = false;
    this.editingRoom = null;
    this.errors = [];
  }

  cancelEdit(): void {
    this.resetForm();
    this.successMessage = '';

    // ADDED: Auto-focus on Room Number field after cancel
    this.focusRoomNumberField();

    console.log('✅ Edit mode cancelled, form reset');
  }

  getDepartmentName(department: string | { _id: string; name: string; code?: string }): string {
    if (typeof department === 'string') {
      return department;
    }
    return department?.name || 'N/A';
  }

  formatDate(date: Date | string): string {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('en-GB', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric' 
    });
  }

  exitToSearchRoom(): void {
    this.router.navigate(['/setup/rooms/room-list']);
  }

  // Form validation helpers
  isFieldInvalid(fieldName: string): boolean {
    const field = this.roomForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  getFieldError(fieldName: string): string {
    const field = this.roomForm.get(fieldName);
    if (field && field.errors) {
      if (field.errors['required']) {
        return `${fieldName} is required`;
      }
    }
    return '';
  }

  private markFormGroupTouched(): void {
    Object.keys(this.roomForm.controls).forEach(key => {
      const control = this.roomForm.get(key);
      control?.markAsTouched();
    });
  }

  // Record exists modal methods
  onRecordExistsModalClosed(): void {
    this.showRecordExistsModal = false;
    this.recordExistsMessage = '';
  }

  // Method to show record exists modal (call this when duplicate is found)
  showRecordExists(roomNumber: string): void {
    this.recordExistsMessage = `A room with the number "${roomNumber}" already exists in the system.`;
    this.showRecordExistsModal = true;
    this.cdr.detectChanges(); // Force change detection
  }



  closeSuccessAlert(): void {
    console.log('🔒 Closing alert...');
    this.showSuccessAlert = false;
    this.successMessage = '';
    console.log('✅ Alert closed. showSuccessAlert:', this.showSuccessAlert);
    // Emit event to refresh parent component
    this.roomSaved.emit();
  }

  getFormValidationErrors(): any {
    const formErrors: any = {};
    Object.keys(this.roomForm.controls).forEach(key => {
      const controlErrors = this.roomForm.get(key)?.errors;
      if (controlErrors) {
        formErrors[key] = controlErrors;
      }
    });
    return formErrors;
  }

  testAlert(): void {
    console.log('🧪 Testing alert...');
    this.successMessage = 'Test alert working! Room ID: RN-TEST001';
    this.showSuccessAlert = true;
    this.cdr.detectChanges(); // Force change detection
    console.log('🚨 Alert should show now. showSuccessAlert:', this.showSuccessAlert);
    // Alert will auto-hide after 2 seconds via success-alert component
  }
}

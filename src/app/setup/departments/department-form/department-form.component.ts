import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, CUSTOM_ELEMENTS_SCHEMA, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { DepartmentService } from '../services/department.service';
import { RecordExistsModalComponent } from '../../../shared/components/record-exists-modal/record-exists-modal.component';
import { SuccessAlertComponent } from '../../../shared/components/success-alert/success-alert.component';

@Component({
  selector: 'app-department-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RecordExistsModalComponent, SuccessAlertComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './department-form.component.html',
  styleUrls: ['./department-form.component.css']
})
export class DepartmentFormComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('departmentNameInput') departmentNameInput!: ElementRef;

  departmentForm: FormGroup;
  isEditMode = false;
  departmentId: string | null = null;
  loading = false;
  errors: string[] = [];
  successMessage = '';
  alertSuccessMessage = '';
  showSuccessAlert = false;
  private subscription: Subscription = new Subscription();
  isUpdatingForm = false; // Prevent form update loops
  // Track if user manually edited the code so we don't override it
  codeManuallyEdited = false;

  // Record exists modal properties
  showRecordExistsModal = false;
  recordExistsMessage = '';

  constructor(
    private fb: FormBuilder,
    private departmentService: DepartmentService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {
    this.departmentForm = this.createForm();
  }

  ngOnInit(): void {
    // Check if we're in edit mode
    this.departmentId = this.route.snapshot.paramMap.get('id');
    this.isEditMode = !!this.departmentId;

    if (this.isEditMode && this.departmentId) {
      this.loadDepartment(this.departmentId);
    }

    // COMPLETELY DISABLED: Auto-generate code to prevent infinite loops
    console.log('🚫 FORM WATCHERS: Completely disabled to prevent infinite change detection loops');
    // Manual code generation can be triggered with a button if needed
  }

  ngAfterViewInit(): void {
    // Auto-focus on Department Name field
    setTimeout(() => {
      if (this.departmentNameInput) {
        this.departmentNameInput.nativeElement.focus();
      }
    }, 100);
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  createForm(): FormGroup {
    return this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
      code: ['', [Validators.maxLength(10)]]
    });
  }

  loadDepartment(id: string): void {
    this.loading = true;
    this.subscription.add(
      this.departmentService.getDepartmentById(id, true).subscribe({
        next: (department) => {
          this.departmentForm.patchValue({
            name: department.name,
            code: department.code || ''
          });
          this.loading = false;

          // Focus on Department Name field after loading data
          setTimeout(() => {
            if (this.departmentNameInput) {
              this.departmentNameInput.nativeElement.focus();
            }
          }, 100);
        },
        error: (error) => {
          console.error('Error loading department:', error);
          this.errors = ['Failed to load department details'];
          this.loading = false;
        }
      })
    );
  }

  onSubmit(): void {
    if (this.departmentForm.valid) {
      this.errors = [];
      this.successMessage = '';

      const formData = this.departmentForm.value;

      // Validate using service
      const validationErrors = this.departmentService.validateDepartment(formData);
      if (validationErrors.length > 0) {
        this.errors = validationErrors;
        return;
      }

      const operation = this.isEditMode && this.departmentId
        ? this.departmentService.updateDepartment(this.departmentId, formData)
        : this.departmentService.createDepartment(formData);

      this.subscription.add(
        operation.subscribe({
          next: (response: any) => {
            // Set success message and show alert
            this.successMessage = this.isEditMode
              ? `Department updated successfully! Department ID: ${response.departmentId || this.departmentId}`
              : `Department created successfully! Department ID: ${response.departmentId || response._id}`;

            this.showSuccessAlert = true;
            this.cdr.detectChanges(); // Force change detection

            // Auto-hide alert and handle navigation
            setTimeout(() => {
              this.closeSuccessAlert();

              if (this.isEditMode) {
                // For update: set flag and navigate to department list
                localStorage.setItem('departmentUpdated', Date.now().toString());
                this.router.navigate(['/setup/departments/list']);
              } else {
                // For create: just reset the form
                this.departmentForm.reset();
                // Set flag for department list refresh with timestamp
                localStorage.setItem('departmentCreated', Date.now().toString());
                // Focus back to department name field for next entry
                setTimeout(() => {
                  if (this.departmentNameInput) {
                    this.departmentNameInput.nativeElement.focus();
                  }
                }, 100);
              }
            }, 2000);
          },
          error: (error) => {
            console.error('Error saving department:', error);
            const errorMessage = error.error?.message || 'Failed to save department';

            // Check if it's a duplicate department error
            if (errorMessage.toLowerCase().includes('already exists') ||
                errorMessage.toLowerCase().includes('duplicate')) {
              const departmentName = this.departmentForm.get('name')?.value || 'this department';
              this.showRecordExists(departmentName);
            } else {
              // Show simple error alert for other errors
              alert(errorMessage);
              this.errors = [errorMessage];
            }
          }
        })
      );
    } else {
      this.markFormGroupTouched();
    }
  }

  onCancel(): void {
    this.router.navigate(['/setup/departments']);
  }

  onReset(): void {
    if (this.isEditMode && this.departmentId) {
      this.loadDepartment(this.departmentId);
    } else {
      this.departmentForm.reset({
        name: '',
        code: '',
        isActive: true
      });
    }
    this.errors = [];
    this.successMessage = '';
  }

  // Helper method to mark all fields as touched for validation display
  private markFormGroupTouched(): void {
    Object.keys(this.departmentForm.controls).forEach(key => {
      const control = this.departmentForm.get(key);
      control?.markAsTouched();
    });
  }

  // Helper methods for template
  isFieldInvalid(fieldName: string): boolean {
    const field = this.departmentForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  getFieldError(fieldName: string): string {
    const field = this.departmentForm.get(fieldName);
    if (field && field.errors && (field.dirty || field.touched)) {
      if (field.errors['required']) {
        return `${this.getFieldLabel(fieldName)} is required`;
      }
      if (field.errors['minlength']) {
        return `${this.getFieldLabel(fieldName)} must be at least ${field.errors['minlength'].requiredLength} characters`;
      }
      if (field.errors['maxlength']) {
        return `${this.getFieldLabel(fieldName)} must be no more than ${field.errors['maxlength'].requiredLength} characters`;
      }
    }
    return '';
  }

  private getFieldLabel(fieldName: string): string {
    const labels: { [key: string]: string } = {
      name: 'Department Name',
      code: 'Department Code',
      description: 'Description'
    };
    return labels[fieldName] || fieldName;
  }
  
navigateToRoomRegistration(): void {
    this.router.navigate(['/setup/rooms/room-registration']);
  }

  DepartmentRegistration(): void {
    this.router.navigate(['/setup/departments/new']);
  }
  SearchDepartment(): void {
    this.router.navigate(['/setup/departments/list']);
  }

  // Convert department name to uppercase
  capitalizeDepartmentName(event: any): void {
    const input = event.target;
    const value = input.value;
    if (value) {
      // Convert all letters to uppercase
      const uppercaseValue = value.toUpperCase();

      // Only update if value actually changed to avoid cursor jumping
      if (input.value !== uppercaseValue) {
        const cursorPosition = input.selectionStart;
        input.value = uppercaseValue;
        this.departmentForm.get('name')?.setValue(uppercaseValue);

        // Restore cursor position for better UX
        setTimeout(() => {
          input.setSelectionRange(cursorPosition, cursorPosition);
        }, 0);
      }
    }
  }

  // Handle name input changes for real-time code generation
  onNameChange(event: any): void {
    const name = event.target.value;
    if (!name) { return; }

    // Always uppercase the name for consistency
    const uppercaseName = name.toUpperCase();

    // Only auto-generate the code if the user hasn't manually edited it
    if (!this.codeManuallyEdited) {
      const code = this.departmentService.generateDepartmentCode(uppercaseName);
      this.departmentForm.patchValue({ code }, { emitEvent: false });
    }
  }

  // Mark that the user typed in the code field so we don't override it automatically
  onCodeInput(): void {
    this.codeManuallyEdited = true;
  }

  // Record exists modal methods
  onRecordExistsModalClosed(): void {
    this.showRecordExistsModal = false;
    this.recordExistsMessage = '';
  }

  // Method to show record exists modal (call this when duplicate is found)
  showRecordExists(departmentName: string): void {
    this.recordExistsMessage = `A department with the name "${departmentName}" already exists in the system.`;
    this.showRecordExistsModal = true;
    this.cdr.detectChanges(); // Force change detection
  }

  closeSuccessAlert(): void {
    this.showSuccessAlert = false;
    this.cdr.detectChanges(); // Force change detection
  }



}

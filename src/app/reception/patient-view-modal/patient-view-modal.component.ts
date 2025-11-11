import { Component, OnInit, Inject, CUSTOM_ELEMENTS_SCHEMA, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { PatientService } from '../patient.service';
import { SharedModule } from '../../shared/shared-module';
import { SuccessAlertComponent } from '../../shared/components/success-alert/success-alert.component';

export interface PatientViewModalData {
  patient: any;
  mode: 'view' | 'edit';
}

@Component({
  selector: 'app-patient-view-modal',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    SharedModule,
    SuccessAlertComponent
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './patient-view-modal.component.html',
  styleUrls: ['./patient-view-modal.component.css']
})
export class PatientViewModalComponent implements OnInit {
  patientForm!: FormGroup;
  isEditMode = false;
  isViewMode = false;
  isLoading = false;
  showSuccessAlert = false;
  successMessage = '';

  bloodGroups = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-', 'NA'];
  genderOptions = ['Male', 'Female', 'Other'];
  ageInOptions = ['Years', 'Months', 'Days'];

  constructor(
    private fb: FormBuilder,
    private patientService: PatientService,
    public dialogRef: MatDialogRef<PatientViewModalComponent>,
    private cdr: ChangeDetectorRef,
    @Inject(MAT_DIALOG_DATA) public data: PatientViewModalData
  ) {}

  ngOnInit(): void {
    this.isEditMode = this.data.mode === 'edit';
    this.isViewMode = this.data.mode === 'view';
    this.initializeForm();
  }

  initializeForm(): void {
    const patient = this.data.patient;

    // Normalize address fields for display
    const addr: any = patient?.address;
    const addressString = typeof addr === 'string' ? addr : (addr?.street || '');
    const cityString = (addr?.city || patient?.city || '');
    const postString = (addr?.post || patient?.post || '');

    this.patientForm = this.fb.group({
      patientId: [patient?.patientId || ''],
      date: [patient?.createdAt ? (() => { const d=new Date(patient.createdAt); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; })() : ''],
      aadharNo: [patient?.aadharNo || '', [Validators.pattern('^[0-9]{12}$')]],
      firstName: [patient?.firstName || '', Validators.required],
      lastName: [patient?.lastName || ''],
      age: [patient?.age || '', [Validators.required, Validators.min(0)]],
      ageIn: [patient?.ageIn || 'Years', Validators.required],
      gender: [patient?.gender || '', Validators.required],
      contact: [patient?.phone || patient?.contact || '', [Validators.pattern('^[0-9]{10}$')]],
      address: [addressString],
      city: [cityString],
      post: [postString],
      bloodGroup: [patient?.bloodGroup || ''],
      remark: [patient?.remark || '']
    });

    console.log('📋 Patient form initialized:', this.patientForm.value);
  }

  onSave(): void {
    if (this.patientForm.valid && this.isEditMode) {
      const formData = this.patientForm.getRawValue();
      const patientId = this.data.patient._id;

      console.log('💾 Updating patient data:', formData);

      // Prepare patient update data
      const updateData = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        age: formData.age,
        ageIn: formData.ageIn,
        gender: formData.gender,
        contact: formData.contact, // Backend expects 'contact' in body; backend maps it to phone
        // Send street in nested address for backward compatibility
        address: {
          street: formData.address
        },
        // IMPORTANT: Also send city and post as top-level fields because backend update route
        // reads them from req.body.city and req.body.post (not from address.city/post)
        city: formData.city,
        post: formData.post,
        bloodGroup: formData.bloodGroup && formData.bloodGroup !== 'Select Blood Group' ? formData.bloodGroup : undefined,
        remark: formData.remark,
        aadharNo: formData.aadharNo
      };

      this.isLoading = true;

      // Update patient information
      this.patientService.updatePatient(patientId, updateData).subscribe({
        next: (response) => {
          console.log('✅ Patient updated successfully:', response);
          this.isLoading = false;

          // Show success alert (next tick) to avoid ExpressionChangedAfterItHasBeenCheckedError
          setTimeout(() => {
            this.successMessage = `Patient information updated successfully! Patient ID: ${response.patientId || this.data.patient.patientId}`;
            this.showSuccessAlert = true;
            this.cdr.detectChanges();

            // Auto-hide alert and close after 800ms
            setTimeout(() => {
              this.closeSuccessAlert();
            }, 2000);
          });
        },
        error: (error) => {
          console.error('❌ Error updating patient:', error);
          this.isLoading = false;

          // Show specific error message
          let errorMessage = 'Error updating patient information. Please try again.';
          if (error.error && error.error.message) {
            errorMessage = error.error.message;
          } else if (error.message) {
            errorMessage = error.message;
          }

          alert('❌ ' + errorMessage);
        }
      });
    } else if (!this.isEditMode) {
      // In view mode, just close the modal
      this.onCancel();
    } else {
      console.log('❌ Form is invalid');
      alert('❌ Please fill all required fields correctly.');
    }
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  closeSuccessAlert(): void {
    this.showSuccessAlert = false;
    // Close modal and return updated data
    this.dialogRef.close({ updated: true, patient: this.data.patient });
  }

  // Handle name input with first letter capitalization
  onNameInput(event: any, fieldName: string): void {
    const input = event.target;
    const value = input.value;

    // Capitalize first letter of each word
    const capitalizedValue = value.replace(/\b\w/g, (char: string) => char.toUpperCase());

    // Update form control value
    this.patientForm.get(fieldName)?.setValue(capitalizedValue, { emitEvent: false });

    // Update input value to show capitalized text
    input.value = capitalizedValue;
  }
}

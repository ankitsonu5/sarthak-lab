import { Component, OnInit, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { PatientService } from '../patient.service';
import { DoctorService } from '../../core/services/doctor';

export interface PatientDetailsModalData {
  patient: any;
  mode: 'view' | 'edit';
}

@Component({
  selector: 'app-patient-details-modal',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule
  ],
  templateUrl: './patient-details-modal.component.html',
  styleUrls: ['./patient-details-modal.component.css']
})
export class PatientDetailsModalComponent implements OnInit {
  patientForm!: FormGroup;
  isEditMode = false;
  isLoading = false;
  doctors: any[] = [];
  departments: string[] = [];

  genderOptions = ['Male', 'Female', 'Other'];
  ageInOptions = ['Years', 'Months', 'Days'];

  constructor(
    private fb: FormBuilder,
    private patientService: PatientService,
    private doctorService: DoctorService,
    public dialogRef: MatDialogRef<PatientDetailsModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: PatientDetailsModalData
  ) {
    this.isEditMode = data.mode === 'edit';
  }

  ngOnInit(): void {
    this.initializeForm();
    this.loadDoctorsAndDepartments();
  }

  initializeForm(): void {
    const patient = this.data.patient;

    this.patientForm = this.fb.group({
      // Personal Information
      patientId: [{ value: patient.patientId || '', disabled: true }],
      date: [{ value: patient.createdAt ? (() => { const d=new Date(patient.createdAt); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; })() : '', disabled: true }],
      aadharNo: [patient.aadharNo || '', [Validators.pattern('^[0-9]{12}$')]],
      firstName: [patient.firstName || '', Validators.required],
      lastName: [patient.lastName || '', Validators.required],
      age: [patient.age || '', [Validators.required, Validators.min(0)]],
      ageIn: [patient.ageIn || 'Years', Validators.required],
      gender: [patient.gender || '', Validators.required],
      contact: [patient.contact || patient.phone || '', [Validators.required, Validators.pattern('^[0-9]{10}$')]],
      address: [patient.address?.street || patient.address || ''],
      city: [patient.address?.city || patient.city || ''],
      post: [patient.address?.post || patient.post || ''],
      remark: [patient.remark || ''],

      // OPD Details
      registrationDate: [{ value: (() => { const d=new Date(); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; })(), disabled: !this.isEditMode }],
      weightKg: [''],
      doctor: [''],
      department: [''],

      // Additional fields for edit mode
      fee: [''],
      mode: ['']
    });

    // Disable all fields if in view mode
    if (!this.isEditMode) {
      this.patientForm.disable();
    }
  }

  loadDoctorsAndDepartments(): void {
    // Load departments
    console.log('🔄 Loading departments...');
    this.doctorService.getDepartments().subscribe({
      next: (departments) => {
        console.log('✅ Raw departments response:', departments);
        console.log('✅ Departments type:', typeof departments);
        console.log('✅ Is array:', Array.isArray(departments));
        this.departments = departments;
        console.log('✅ Departments loaded:', this.departments);
      },
      error: (error) => {
        console.error('❌ Error loading departments:', error);
      }
    });

    // Load all doctors
    this.doctorService.getDoctors(1, 100).subscribe({
      next: (response) => {
        this.doctors = response.doctors || [];
        console.log('Doctors loaded:', this.doctors.length);
      },
      error: (error) => {
        console.error('Error loading doctors:', error);
      }
    });
  }

  onDepartmentChange(): void {
    const selectedDepartment = this.patientForm.get('department')?.value;
    if (selectedDepartment) {
      // Filter doctors by department
      this.doctorService.getDoctorsByDepartment(selectedDepartment).subscribe({
        next: (doctors) => {
          this.doctors = doctors;
          // Reset doctor selection when department changes
          this.patientForm.get('doctor')?.setValue('');
        },
        error: (error) => {
          console.error('Error loading doctors by department:', error);
        }
      });
    }
  }



  onSave(): void {
    if (this.patientForm.valid && this.isEditMode) {
      this.isLoading = true;
      const formData = this.patientForm.getRawValue();

      // Prepare update payload
      const updateData = {
        aadharNo: formData.aadharNo?.trim() || undefined,
        firstName: formData.firstName?.trim(),
        lastName: formData.lastName?.trim(),
        age: parseInt(formData.age),
        ageIn: formData.ageIn,
        gender: formData.gender,
        phone: formData.contact?.trim(),
        address: {
          street: formData.address?.trim(),
          city: formData.city?.trim(),
          post: formData.post?.trim()
        },
        remark: formData.remark?.trim()
      };

      this.patientService.updatePatient(this.data.patient._id, updateData).subscribe({
        next: (response) => {
          console.log('Patient updated successfully:', response);
          this.isLoading = false;
          this.dialogRef.close({ updated: true, patient: response.patient });
        },
        error: (error) => {
          console.error('Error updating patient:', error);
          this.isLoading = false;
          alert('Error updating patient: ' + (error.error?.message || error.message));
        }
      });
    }
  }

  onDelete(): void {
    if (confirm('Are you sure you want to delete this patient?')) {
      this.isLoading = true;

      this.patientService.deletePatient(this.data.patient._id).subscribe({
        next: (response) => {
          console.log('Patient deleted successfully:', response);
          this.isLoading = false;
          this.dialogRef.close({ deleted: true });
        },
        error: (error) => {
          console.error('Error deleting patient:', error);
          this.isLoading = false;
          alert('Error deleting patient: ' + (error.error?.message || error.message));
        }
      });
    }
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  getDoctorDisplayName(doctor: any): string {
    return `Dr. ${doctor.firstName} ${doctor.lastName} (${doctor.specialization})`;
  }
}

import { Component, OnInit, OnDestroy, Inject, Optional } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { DoctorService, Doctor } from '../services/doctor.service';
import { environment } from '../../../../environments/environment';
import { LabSettingsService, LabSettings } from '../../lab-setup/lab-settings.service';
import { DefaultLabConfigService } from '../../../core/services/default-lab-config.service';

@Component({
  selector: 'app-doctor-profile',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './doctor-profile.component.html',
  styleUrls: ['./doctor-profile.component.css']
})
export class DoctorProfileComponent implements OnInit, OnDestroy {
  doctor: Doctor | null = null;
  loading = true;
  error = '';
  isDialog = false;
  labSettings: LabSettings | null = null;
  private subscription: Subscription = new Subscription();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private doctorService: DoctorService,
    private labService: LabSettingsService,
    public defaultLabConfig: DefaultLabConfigService,
    @Optional() private dialogRef: MatDialogRef<DoctorProfileComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    // Check if component is opened as dialog
    this.isDialog = !!this.dialogRef;

    // If opened as dialog and doctor data is provided
    if (this.isDialog && this.data?.doctor) {
      this.doctor = this.data.doctor;
      this.loading = false;
    }
  }

  ngOnInit(): void {
    this.loadLabSettings();
    this.loadDoctorProfile();
  }

  private loadLabSettings(): void {
    // Load from cache first
    try {
      const cached = localStorage.getItem('labSettings');
      if (cached) {
        this.labSettings = JSON.parse(cached);
      }
    } catch {}

    // Then fetch fresh data
    this.labService.getMyLab().subscribe({
      next: (res) => {
        this.labSettings = res.lab || this.labSettings;
      },
      error: () => {}
    });
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  loadDoctorProfile(): void {
    // If opened as dialog, doctor data is already loaded
    if (this.isDialog && this.doctor) {
      return;
    }

    const doctorId = this.route.snapshot.paramMap.get('id');

    if (!doctorId) {
      this.error = 'Doctor ID not provided';
      this.loading = false;
      return;
    }

    this.subscription.add(
      this.doctorService.getDoctorById(doctorId, true).subscribe({
        next: (doctor) => {
          this.doctor = doctor;
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading doctor profile:', error);
          this.error = error.status === 404
            ? 'Doctor not found'
            : 'Failed to load doctor profile. Please try again.';
          this.loading = false;
        }
      })
    );
  }

  goBack(): void {
    if (this.isDialog && this.dialogRef) {
      this.dialogRef.close();
    } else {
      this.router.navigate(['/setup/doctors/doctor-list']);
    }
  }

  editDoctor(): void {
    if (this.doctor) {
      console.log('Navigating to edit doctor with ID:', this.doctor._id);

      // Close the dialog first
      if (this.dialogRef) {
        this.dialogRef.close();
      }

      // Then navigate to edit page
      this.router.navigate(['/setup/doctors/doctor-registration'], {
        queryParams: { id: this.doctor._id, mode: 'edit' }
      }).then(success => {
        console.log('Navigation success:', success);
      }).catch(error => {
        console.error('Navigation error:', error);
      });
    }
  }

  getSpecialties(): string[] {
    if (!this.doctor) return ['General Consultation'];

    const specialties: string[] = [];

    // Add specialization if available
    if (this.doctor.specialization) {
      specialties.push(this.doctor.specialization);
    }

    // Add department if different from specialization
    const departmentName = this.getDepartmentName();
    if (departmentName && departmentName !== 'N/A' && departmentName !== this.doctor.specialization) {
      specialties.push(departmentName);
    }

    // Add some common medical services based on specialization
    if (this.doctor.specialization) {
      const spec = this.doctor.specialization.toLowerCase();
      if (spec.includes('cardio')) {
        specialties.push('Heart Surgery', 'ECG', 'Cardiac Consultation');
      } else if (spec.includes('pediatric') || spec.includes('child')) {
        specialties.push('Child Care', 'Vaccination', 'Growth Monitoring');
      } else if (spec.includes('ortho')) {
        specialties.push('Bone Surgery', 'Joint Replacement', 'Fracture Treatment');
      } else if (spec.includes('neuro')) {
        specialties.push('Brain Surgery', 'Neurological Consultation', 'Stroke Treatment');
      } else {
        specialties.push('General Consultation', 'Health Checkup');
      }
    } else {
      specialties.push('General Consultation', 'Health Checkup', 'Medical Examination');
    }

    return specialties.filter(s => s && s.trim()).slice(0, 4); // Filter out empty and limit to 4
  }

  getFormattedPhone(): string {
    if (!this.doctor?.phone) return 'Not available';

    const phone = this.doctor.phone.toString();
    // Format as +91-XXX-XXX-XXXX for Indian numbers
    if (phone.length === 10) {
      return `+91-${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`;
    }
    return phone;
  }

  getExperienceText(): string {
    if (!this.doctor?.experience) return '0 years';

    const years = this.doctor.experience;
    if (years === 1) return '1 year';
    return `${years} years`;
  }

  getDoctorImage(): string {
    const imageUrl = this.doctor?.imageUrl;
    console.log('Doctor imageUrl:', imageUrl);

    if (!imageUrl) {
      console.log('No imageUrl found on doctor');
      return this.getDefaultAvatar();
    }

    // If it's already a full HTTP(S) or data URL, return as-is
    if (imageUrl.startsWith('http') || imageUrl.startsWith('data:')) {
      return imageUrl;
    }

    // Build correct base URL from environment (strip trailing /api if present)
    const apiBase = environment.apiUrl.replace(/\/?api$/, '');

    // Back-end usually returns '/uploads/doctors/<filename>'
    if (imageUrl.startsWith('/uploads/')) {
      return `${apiBase}${imageUrl}`;
    }

    // In some cases only filename is stored; assume default doctors folder
    return `${apiBase}/uploads/doctors/${imageUrl}`;
  }

  private getDefaultAvatar(): string {
    // Default doctor avatar
    return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDIwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiByeD0iMTAwIiBmaWxsPSJsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCAjNjY3ZWVhIDAlLCAjNzY0YmE2IDEwMCUpIi8+Cjx0ZXh0IHg9IjEwMCIgeT0iMTIwIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iNzAiIGZvbnQtd2VpZ2h0PSJib2xkIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSJ3aGl0ZSI+8J+RqDwvdGV4dD4KPC9zdmc+';
  }

  onImageError(event: any): void {
    console.error('Image failed to load:', event);
    console.log('Attempted URL:', event.target.src);
    // Set default image on error
    event.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDIwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiByeD0iMTAwIiBmaWxsPSJsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCAjNjY3ZWVhIDAlLCAjNzY0YmE2IDEwMCUpIi8+Cjx0ZXh0IHg9IjEwMCIgeT0iMTIwIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iNzAiIGZvbnQtd2VpZ2h0PSJib2xkIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSJ3aGl0ZSI+8J+RqDwvdGV4dD4KPC9zdmc+';
  }

  onImageLoad(event: any): void {
    console.log('Image loaded successfully:', event.target.src);
  }

  getFormattedAge(): string {
    if (this.doctor?.age) {
      return `${this.doctor.age} years`;
    }

    // Calculate age from date of birth if age is not available
    if (this.doctor?.dateOfBirth) {
      const birthDate = new Date(this.doctor.dateOfBirth);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();

      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }

      return `${age} years`;
    }

    return 'N/A';
  }

  getFormattedGender(): string {
    return this.doctor?.gender || 'N/A';
  }

  getDepartmentName(): string {
    console.log('🏥 Getting department name for:', this.doctor?.department);

    if (!this.doctor?.department) {
      console.log('❌ No department found');
      return 'N/A';
    }

    if (typeof this.doctor.department === 'string') {
      console.log('✅ Department is string:', this.doctor.department);
      return this.doctor.department;
    }

    if (this.doctor.department && typeof this.doctor.department === 'object') {
      console.log('✅ Department is object:', this.doctor.department);
      return this.doctor.department.name || 'N/A';
    }

    console.log('❌ Department format unknown:', typeof this.doctor.department);
    return 'N/A';
  }

  getQualificationFormatted(): string {
    if (!this.doctor?.qualification) return 'N/A';

    // Format qualification properly
    return this.doctor.qualification
      .split(',')
      .map(q => q.trim().toUpperCase())
      .join(', ');
  }

  getLicenseNumber(): string {
    return this.doctor?.licenseNumber || 'N/A';
  }

  getConsultationFee(): string {
    // Add consultation fee if available in doctor model
    return 'Contact for details';
  }

  getDoctorName(): string {
    if (!this.doctor) return 'N/A';

    // Check if name field exists (new format)
    if (this.doctor.name) {
      return this.doctor.name;
    }

    // Fallback to firstName + lastName (old format)
    if (this.doctor.firstName || this.doctor.lastName) {
      return `${this.doctor.firstName || ''} ${this.doctor.lastName || ''}`.trim();
    }

    return 'N/A';
  }
}

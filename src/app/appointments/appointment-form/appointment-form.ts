import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AppointmentService } from '../../core/services/appointment';
import { PatientService } from '../../reception/patient.service';

@Component({
  selector: 'app-appointment-form',
  standalone: false,
  templateUrl: './appointment-form.html',
  styleUrl: './appointment-form.css'
})
export class AppointmentForm implements OnInit {
  isEdit = false;
  id: string | null = null;
  isLoading = false;

  departments: any[] = [];
  rooms: any[] = [];

  form!: FormGroup;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private apptService: AppointmentService,
    private patientService: PatientService
  ) {
    // Initialize form after fb is available
    this.form = this.fb.group({
      registrationNumber: [''],
      patientId: ['', Validators.required],
      patientName: [{ value: '', disabled: true }],
      departmentId: ['', Validators.required],
      roomId: ['', Validators.required],
      appointmentDate: [new Date().toISOString().slice(0,10), Validators.required],
      appointmentTime: [''],
      reason: ['OPD Consultation'],
      type: ['Consultation'],
      consultationFee: [1, Validators.min(0)],
      paymentMethod: ['Cash']
    });
  }

  ngOnInit(): void {
    this.loadDepartments();
    this.id = this.route.snapshot.paramMap.get('id');
    this.isEdit = !!this.id;
    if (this.isEdit && this.id) {
      this.isLoading = true;
      this.apptService.getAppointmentById(this.id).subscribe({
        next: (apt: any) => {
          this.isLoading = false;
          const p = apt?.patient;
          const dept = apt?.department;
          const room = apt?.room;
          this.form.patchValue({
            registrationNumber: apt?.appointmentId?.replace('APT','') || '',
            patientId: p?._id || '',
            patientName: p ? `${p.firstName || ''} ${p.lastName || ''}`.trim() : '',
            departmentId: dept?._id || '',
            roomId: room?._id || '',
            appointmentDate: apt?.appointmentDate ? new Date(apt.appointmentDate).toISOString().slice(0,10) : new Date().toISOString().slice(0,10),
            appointmentTime: apt?.appointmentTime || '',
            reason: apt?.reason || 'OPD Consultation',
            type: apt?.type || 'Consultation',
            consultationFee: apt?.consultationFee ?? 1,
            paymentMethod: apt?.paymentMethod || 'Cash'
          });
          if (dept?._id) { this.onDepartmentChange(dept._id); }
        },
        error: () => { this.isLoading = false; }
      });
    }
  }

  loadDepartments(): void {
    this.patientService.getDepartments().subscribe(list => this.departments = list || []);
  }
  onDepartmentChange(deptId: string): void {
    if (!deptId) { this.rooms = []; this.form.patchValue({ roomId: '' }); return; }
    this.patientService.getRoomsByDepartment(deptId).subscribe(list => this.rooms = list || []);
  }

  findPatient(): void {
    const reg = (this.form.get('registrationNumber')?.value || '').toString().trim();
    if (!reg) { alert('Enter patient Registration No.'); return; }
    this.isLoading = true;
    this.patientService.getPatientByRegistrationNumber(reg).subscribe({
      next: (res: any) => {
        this.isLoading = false;
        const p = res?.patient || res;
        if (!p?._id) { alert('Patient not found'); return; }
        this.form.patchValue({
          patientId: p._id,
          patientName: `${p.firstName || ''} ${p.lastName || ''}`.trim()
        });
      },
      error: () => { this.isLoading = false; alert('Patient not found'); }
    });
  }

  submit(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const v = this.form.getRawValue();
    this.isLoading = true;

    if (this.isEdit && this.id) {
      (this.apptService.updateAppointment(this.id, {
        patient: v.patientId as string,
        // cast to any to allow department/room fields present in backend model
        department: v.departmentId as any,
        room: v.roomId as any,
        appointmentDate: v.appointmentDate as any,
        appointmentTime: v.appointmentTime as any,
        reason: v.reason as any,
        type: v.type as any,
        consultationFee: Number(v.consultationFee) || 1,
        paymentMethod: v.paymentMethod as any
      } as any)).subscribe({
        next: () => { this.isLoading = false; this.router.navigate(['/appointments']); },
        error: () => { this.isLoading = false; }
      });
      return;
    }

    // Create via booking endpoint to keep counters consistent
    this.patientService.bookOpdAppointment({
      patient: v.patientId,
      department: v.departmentId,
      room: v.roomId,
      appointmentDate: v.appointmentDate,
      appointmentTime: v.appointmentTime,
      reason: v.reason,
      type: v.type,
      consultationFee: Number(v.consultationFee) || 1,
      paymentMethod: v.paymentMethod
    }).subscribe({
      next: () => { this.isLoading = false; this.router.navigate(['/appointments']); },
      error: () => { this.isLoading = false; }
    });
  }

  cancel(): void { this.router.navigate(['/appointments']); }
}

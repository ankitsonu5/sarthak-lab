import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AppointmentService } from '../../core/services/appointment';
import { PatientService } from '../../reception/patient.service';

interface AppointmentRow {
  _id: string;
  appointmentId?: string;
  appointmentDate?: string | Date;
  appointmentTime?: string;
  status?: string;
  reason?: string;
  patient?: any;
  doctor?: any;
  department?: any;
  room?: any;
}

@Component({
  selector: 'app-appointment-list',
  standalone: false,
  templateUrl: './appointment-list.html',
  styleUrl: './appointment-list.css'
})
export class AppointmentList implements OnInit {
  isLoading = false;
  page = 1;
  limit = 50;
  total = 0;

  // filters
  search = '';
  status: '' | 'Scheduled' | 'Confirmed' | 'In Progress' | 'Completed' | 'Cancelled' | 'No Show' = '';
  startDate = '';
  endDate = '';

  rows: AppointmentRow[] = [];

  constructor(
    private router: Router,
    private apptService: AppointmentService,
    private patientService: PatientService
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.isLoading = true;
    this.patientService
      .getAllAppointments(this.page, this.limit, this.status, '', true, this.search, {
        startDate: this.startDate || undefined,
        endDate: this.endDate || undefined
      })
      .subscribe({
        next: (res) => {
          const list = Array.isArray(res?.appointments) ? res.appointments : [];
          this.rows = list;
          this.total = res?.total || list.length;
          this.isLoading = false;
        },
        error: () => {
          this.rows = [];
          this.total = 0;
          this.isLoading = false;
        }
      });
  }

  onSearchEnter(): void { this.page = 1; this.load(); }
  onStatusChange(): void { this.page = 1; this.load(); }
  onDateChange(): void { this.page = 1; this.load(); }

  newAppointment(): void { this.router.navigate(['/appointments/new']); }
  editAppointment(id: string): void { this.router.navigate(['/appointments/edit', id]); }

  cancelAppointment(id: string): void {
    if (!id) return;
    if (!confirm('Cancel this appointment?')) return;
    this.isLoading = true;
    this.apptService.cancelAppointment(id).subscribe({
      next: () => this.load(),
      error: () => this.load()
    });
  }
}

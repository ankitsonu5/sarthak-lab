import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { Auth } from '../../core/services/auth';
import { PatientService } from '../../core/services/patient';
import { DoctorService } from '../../core/services/doctor';
import { AppointmentService } from '../../core/services/appointment';
import { PrescriptionService } from '../../core/services/prescription.service';
import { DashboardService, DashboardStats as ServiceDashboardStats, PatientTrend, WeatherData } from '../../core/services/dashboard.service';
import { PathologyInvoiceService } from '../../services/pathology-invoice.service';
import { DataRefreshService } from '../../core/services/data-refresh.service';
import { Chart, ChartConfiguration, ChartType, registerables } from 'chart.js';
import { interval, Subscription } from 'rxjs';
import { LabNameService } from '../../core/services/lab-name.service';
import { SelfRegistrationService } from '../../shared/services/self-registration.service';

interface DashboardStats {
  totalPatients: number;
  todayPatients: number;
  monthlyPatients: number;
  todayAppointments: number;
  ipdPatients: number;
  todayOPD: number;
  totalOPD: number;
  totalRegistrations: number;
  todayRegistrations: number;

  todayRevenue: number;
  labRevenue: number;

  labReports: number;
  myAppointments?: number;
  activeDoctors?: number;
  activePrescriptions?: number;
  systemStatus?: string;
  todayEarnings?: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: false,
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class Dashboard implements OnInit, OnDestroy {
  // Lab Name - Dynamic
  labName = 'Sarthak Diagnostic Network';

  stats: ServiceDashboardStats = {
    totalPatients: 0,
    todayPatients: 0,
    monthlyPatients: 0,
    todayAppointments: 0,
    ipdPatients: 0,
    todayOPD: 0,
    totalOPD: 0,
    totalRegistrations: 0,
    todayRegistrations: 0,
    todayRevenue: 0,
    totalRevenue: 0,
    labRevenue: 0,

    labReports: 0
  };
  currentUser: any;
  recentAppointments: any[] = [];

  // Loading states
  isLoading = true;
  isStatsLoading = true;
  isActivitiesLoading = true;

  // New properties for dynamic features
  currentDateTime: any = {};
  weatherData: WeatherData | null = null;
  patientTrends: PatientTrend[] = [];
  chart: Chart | null = null;
  private refreshSubscription: Subscription | null = null;
  trendPeriod: 'daily' | 'monthly' = 'daily';
  // Sliding window controls
  trendOffset: number = 0; // units: days for daily, months for monthly
  trendWindowDaily: number = 7;
  trendWindowMonthly: number = 6;
  maxDailyOffset: number = 180; // allow going back up to ~6 months
  maxMonthlyOffset: number = 36; // allow going back up to 3 years

  // Recent Activity Data
  recentPatients: any[] = [];
  recentActivities: any[] = [];
  selfRegistrations: any[] = [];
  cashReceiptPatients: any[] = [];

  // Notification dropdown state
  showNotifications = false;

  constructor(
    private authService: Auth,
    private patientService: PatientService,
    private doctorService: DoctorService,
    private appointmentService: AppointmentService,
    private prescriptionService: PrescriptionService,
    private dashboardService: DashboardService,
    private pathologyInvoiceService: PathologyInvoiceService,
    private dataRefresh: DataRefreshService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private labNameService: LabNameService,
    private selfRegService: SelfRegistrationService
  ) {
    // Register Chart.js components
    Chart.register(...registerables);
  }

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    console.log('🚀 DASHBOARD: Initializing for user:', this.currentUser?.role);

    // Subscribe to lab name changes
    this.labNameService.labName$.subscribe(name => {
      this.labName = name;
      this.cdr.detectChanges();
    });

    // Initialize stats immediately with default values - like reception components
    this.stats = {
      totalPatients: 0,
      todayPatients: 0,
      monthlyPatients: 0,
      todayAppointments: 0,
      ipdPatients: 0,
      todayOPD: 0,
      totalOPD: 0,
      totalRegistrations: 0,
      todayRegistrations: 0,
      todayRevenue: 0,
      totalRevenue: 0,
      labRevenue: 0,

      labReports: 0
    };
    console.log('🚀 DASHBOARD: Initial stats set:', this.stats);

    // Set loading false immediately so UI shows - like reception components
    this.isLoading = false;
    console.log('🚀 DASHBOARD: Loading set to false, UI should show');

    // Load real data immediately - exactly like reception components
    console.log('🚀 DASHBOARD: Starting data loading...');
    this.loadDashboardStats();
    this.loadDateTime();
    this.loadRecentActivities();
    this.loadCashReceiptPatients();
    this.loadPatientTrends();
    this.loadSelfRegistrations();

    // Setup auto refresh for real-time updates
    // Listen for real-time receipt/bookings to update Today's Receipts instantly
    try {
      this.refreshSubscription = this.dataRefresh.onEntityRefresh('pathology').subscribe((evt) => {
        // Any CREATE/UPDATE/BOOKED should refresh the receipts widget
        if (evt && (evt.action === 'CREATE' || evt.action === 'UPDATE' || evt.action === 'BOOKED' || evt.action === 'REFRESH')) {
          this.loadCashReceiptPatients();
        }
      });
    } catch {}

    this.setupAutoRefresh();
    console.log('🚀 DASHBOARD: Initialization complete');
  }

  ngOnDestroy(): void {
    if (this.refreshSubscription) {
      this.refreshSubscription.unsubscribe();
    }
    if (this.chart) {
      this.chart.destroy();
    }
  }

  private loadDynamicDashboard(): void {
    this.loadDashboardStats();
    this.loadDateTime();
    this.loadWeatherData();
    this.loadPatientTrends();
    this.loadRecentAppointments();
    this.loadRecentActivities();
  }

  private setupAutoRefresh(): void {
    // 🚫 DISABLED: All auto-refresh intervals to prevent infinite change detection loops
    console.log('🚫 DASHBOARD AUTO-REFRESH: Disabled to prevent infinite loops');
    // All intervals removed - manual refresh only
  }

  private loadDashboardStats(): void {
    this.isStatsLoading = true;
    console.log('📊 DASHBOARD: Loading dashboard stats...');
    console.log('📊 DASHBOARD: Current stats before API call:', this.stats);

    this.dashboardService.getDashboardStats().subscribe(
      (data) => {
        console.log('✅ DASHBOARD: Dashboard stats loaded from API:', data);
        console.log('✅ DASHBOARD: Updating stats from:', this.stats, 'to:', data);
        this.stats = { ...data }; // Spread to ensure reactivity
        this.isStatsLoading = false;
        console.log('✅ DASHBOARD: Stats updated successfully:', this.stats);
        // Force Angular change detection
        this.cdr.detectChanges();
        console.log('✅ DASHBOARD: Change detection triggered!');
        this.checkAllDataLoaded();
      },
      (error) => {
        console.error('❌ DASHBOARD: Error loading dashboard stats:', error);
        console.log('❌ DASHBOARD: Keeping current stats:', this.stats);
        this.isStatsLoading = false;
        this.checkAllDataLoaded();
      }
    );
  }

  private getCurrentLabCode(): string | null {
    try {
      const u: any = this.authService.getCurrentUser();
      if (u?.lab?.['labCode']) return String(u.lab['labCode']);
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const parsed = JSON.parse(userStr);
        if (parsed?.lab?.['labCode']) return String(parsed.lab['labCode']);
      }
    } catch {}
    return null;
  }

  private getCurrentLabId(): string | null {
    try {
      const u: any = this.authService.getCurrentUser();
      if (u?.lab?.['_id']) return String(u.lab['_id']);
      if (u?.labId) return String(u.labId);
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const parsed = JSON.parse(userStr);
        if (parsed?.lab?.['_id']) return String(parsed.lab['_id']);
        if (parsed?.labId) return String(parsed.labId);
      }
    } catch {}
    return null;
  }

  private loadSelfRegistrations(): void {
    try {
      const labCode = this.getCurrentLabCode();
      const labId = this.getCurrentLabId();
      if (labCode) {
        this.selfRegService.listRecentByCode(labCode).subscribe({
          next: (res) => {
            const items: any[] = (res as any)?.items || [];
            this.selfRegistrations = items.slice(0, 5);
            try { this.cdr.detectChanges(); } catch {}
          },
          error: () => { this.selfRegistrations = []; }
        });
      } else if (labId) {
        this.selfRegService.listRecent(labId).subscribe({
          next: (res) => {
            const items: any[] = (res as any)?.items || [];
            this.selfRegistrations = items.slice(0, 5);
            try { this.cdr.detectChanges(); } catch {}
          },
          error: () => { this.selfRegistrations = []; }
        });
      }
    } catch { this.selfRegistrations = []; }
  }

  private loadDateTime(): void {
    this.currentDateTime = this.dashboardService.getCurrentDateTime();
  }

  private loadWeatherData(): void {
    this.dashboardService.getWeatherData().subscribe({
      next: (data) => {
        this.weatherData = data;
      },
      error: (error) => console.error('Error loading weather data:', error)
    });
  }

  private loadPatientTrends(): void {
    const windowSize = this.getCurrentWindowSize();
    console.log('📈 Loading OPD trends', { period: this.trendPeriod, offset: this.trendOffset, windowSize });
    this.dashboardService.getOPDTrends(this.trendPeriod, this.trendOffset, windowSize).subscribe({
      next: (data) => {
        console.log('📈 OPD trends loaded:', data?.length, 'points');
        this.patientTrends = data || [];
        try { this.cdr.detectChanges(); } catch {}
        this.createChart();
      },
      error: (error) => console.error('Error loading OPD trends:', error)
    });
  }

  switchTrendPeriod(period: 'daily' | 'monthly'): void {
    this.trendPeriod = period;
    // Reset offset when switching period
    this.trendOffset = 0;
    this.loadPatientTrends();
  }

  getCalendarDays(): any[] {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    const days = [];
    const currentDate = new Date(startDate);

    for (let i = 0; i < 42; i++) { // 6 weeks * 7 days
      const isToday = currentDate.toDateString() === today.toDateString();
      const isCurrentMonth = currentDate.getMonth() === currentMonth;

      days.push({
        date: currentDate.getDate(),
        isToday,
        isCurrentMonth,
        hasEvents: Math.random() > 0.8 // Random events for demo
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return days;
  }

  private loadRecentActivities(): void {
    this.isActivitiesLoading = true;
    console.log('📋 Loading recent activities...');

    // Load real-time today's patients first
    this.loadTodaysPatients();

    // Try to load from API first, fallback to generated data
    this.dashboardService.getRecentActivities().subscribe({
      next: (data) => {
        console.log('✅ Recent activities loaded:', data.length);
        this.recentActivities = data.slice(0, 5); // Show only 5 activities
        this.isActivitiesLoading = false;
        this.checkAllDataLoaded();
      },
      error: (error) => {
        console.error('❌ Error loading recent activities:', error);
        // Fallback to generated data
        this.recentActivities = this.generateRecentPatients();
        this.isActivitiesLoading = false;
        this.checkAllDataLoaded();
      }
    });
  }

  private loadCashReceiptPatients(): void {
    console.log('💰 Loading cash receipt patients...');

    this.pathologyInvoiceService.getAllInvoices(1, 50).subscribe({
      next: (response: any) => {
        console.log('✅ Cash receipt invoices response:', response);

        if (response.success && response.invoices) {
          // Filter for today's invoices
          const today = new Date().toDateString();
          const todaysInvoices = response.invoices.filter((invoice: any) => {
            const invoiceDate = new Date(invoice.createdAt || invoice.bookingDate).toDateString();
            return invoiceDate === today;
          });

          // Sort desc by time and take top 5
          const topFive = todaysInvoices
            .sort((a: any, b: any) => new Date(b.createdAt || b.bookingDate).getTime() - new Date(a.createdAt || a.bookingDate).getTime())
            .slice(0, 5);

          // Format for display (max 5 items)
          this.cashReceiptPatients = topFive.map((invoice: any) => ({
            time: new Date(invoice.createdAt || invoice.bookingDate).toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit'
            }),
            activity: `${invoice.patient?.name || 'Unknown'} - Receipt #${invoice.receiptNumber} (₹${invoice.payment?.totalAmount || 0})`,
            patientName: invoice.patient?.name || 'Unknown',
            receiptNumber: invoice.receiptNumber,
            amount: invoice.payment?.totalAmount || 0,
            type: 'cash-receipt'
          }));

          console.log(`✅ Found ${this.cashReceiptPatients.length} cash receipt patients today`);
          // Ensure UI updates instantly without extra clicks
          try { this.cdr.detectChanges(); } catch {}
        }
      },
      error: (error: any) => {
        console.error('❌ Error loading cash receipt patients:', error);
        this.cashReceiptPatients = [];
      }
    });
  }



  private checkAllDataLoaded(): void {
    if (!this.isStatsLoading && !this.isActivitiesLoading) {
      this.isLoading = false;
      console.log('🎉 All dashboard data loaded successfully!');
    }
  }

  private loadTodaysPatients(): void {
    // Get today's patients for real-time display using dashboard service
    this.dashboardService.getTodaysPatients().subscribe({
      next: (patients: any[]) => {
        // Show only latest 5 entries in UI
        this.recentPatients = (patients || []).slice(0, 5);
        console.log('📊 Real-time patients loaded (capped to 5):', this.recentPatients.length);
      },
      error: (error: any) => {
        console.error('Error loading today\'s patients:', error);
        // Fallback to patient service
        this.patientService.getPatients(1, 5, '').subscribe({
          next: (response: any) => {
            this.recentPatients = response.patients.map((patient: any) => ({
              time: new Date(patient.createdAt).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
              }),
              activity: `${patient.firstName} ${patient.lastName} - New Registration`,
              patientName: `${patient.firstName} ${patient.lastName}`,
              type: 'registration'
            }));
          },
          error: () => {
            this.recentPatients = this.generateRecentPatients();
          }
        });
      }
    });
  }

  private generateRecentPatients(): any[] {
    const activities = [
      'New patient registered',
      'Appointment scheduled',
      'Lab report generated',
      'Prescription issued',
      'Payment received',
      'Discharge completed',
      'Emergency admission',
      'Surgery scheduled'
    ];

    const patientNames = [
      'John Doe', 'Jane Smith', 'Robert Johnson', 'Emily Davis',
      'Michael Brown', 'Sarah Wilson', 'David Miller', 'Lisa Anderson'
    ];

    const doctors = [
      'Dr. Smith', 'Dr. Johnson', 'Dr. Williams', 'Dr. Brown',
      'Dr. Davis', 'Dr. Miller', 'Dr. Wilson', 'Dr. Moore'
    ];

    const recentActivities = [];
    const now = new Date();

    for (let i = 0; i < 5; i++) {
      const activityTime = new Date(now.getTime() - (i * 30 * 60000)); // 30 minutes apart
      const activity = activities[Math.floor(Math.random() * activities.length)];
      const patientName = patientNames[Math.floor(Math.random() * patientNames.length)];
      const doctor = doctors[Math.floor(Math.random() * doctors.length)];

      let activityText = '';
      if (activity.includes('scheduled') || activity.includes('Surgery')) {
        activityText = `${activity} - ${doctor}`;
      } else if (activity.includes('registered') || activity.includes('admission')) {
        activityText = `${activity} - ${patientName}`;
      } else {
        activityText = `${activity} - ${patientName}`;
      }

      recentActivities.push({
        time: activityTime.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        }),
        activity: activityText,
        patientName: patientName,
        type: activity
      });
    }

    return recentActivities;
  }

  getTotalRevenue(): number {
    // Currently returns 0 as no actual revenue data exists
    // TODO: Implement actual revenue calculation when billing system is ready
    return this.stats.todayRevenue + this.stats.labRevenue;
  }



  private createChart(): void {
    const canvas = document.getElementById('patientTrendsChart') as HTMLCanvasElement;
    if (!canvas) return;

    if (this.chart) {
      this.chart.destroy();
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const config: ChartConfiguration = {
      type: 'line' as ChartType,
      data: {
        labels: this.patientTrends.map(trend => trend.label),
        datasets: [{
          label: `OPD (${this.trendPeriod})`,
          data: this.patientTrends.map(trend => trend.count),
          borderColor: '#667eea',
          backgroundColor: 'rgba(102, 126, 234, 0.1)',
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#667eea',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top'
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: {
              color: 'rgba(0, 0, 0, 0.1)'
            }
          },
          x: {
            grid: {


              color: 'rgba(0, 0, 0, 0.1)'
            }
          }
        }
      }
    };

    this.chart = new Chart(ctx, config);
  }


  // === Trend navigation helpers ===
  prevWindow(): void {
    const step = this.getCurrentWindowSize();
    const max = this.getMaxOffset();
    this.trendOffset = Math.min(max, this.trendOffset + step);
    this.loadPatientTrends();
  }

  nextWindow(): void {
    const step = this.getCurrentWindowSize();
    this.trendOffset = Math.max(0, this.trendOffset - step);
    this.loadPatientTrends();
  }

  onOffsetChange(): void {
    // called by slider change
    if (this.trendOffset < 0) this.trendOffset = 0;
    const max = this.getMaxOffset();
    if (this.trendOffset > max) this.trendOffset = max;
    this.loadPatientTrends();
  }

  getCurrentWindowSize(): number {
    return this.trendPeriod === 'daily' ? this.trendWindowDaily : this.trendWindowMonthly;
  }

  getMaxOffset(): number {
    return this.trendPeriod === 'daily' ? this.maxDailyOffset : this.maxMonthlyOffset;
  }

  getCurrentRangeText(): string {
    if (!this.patientTrends?.length) return '';
    const first = this.patientTrends[0]?.label;
    const last = this.patientTrends[this.patientTrends.length - 1]?.label;
    return first && last ? `${first} – ${last}` : '';
  }

  // Fallback method for old stats loading
  private loadOldDashboardStats(): void {
    if (!this.currentUser) return;

    switch (this.currentUser.role) {
      case 'Admin':
        this.loadAdminStats();
        break;
      case 'Doctor':
        this.loadDoctorStats();
        break;
      case 'Patient':
        this.loadPatientStats();
        break;
    }
  }

  private loadAdminStats(): void {
    // Load total patients
    this.patientService.getPatients(1, 1).subscribe({
      next: (response) => {
        this.stats.totalPatients = response.total;
      },
      error: (error) => console.error('Error loading patients:', error)
    });

    // Load today's appointments
    const today = new Date().toISOString().split('T')[0];
    this.appointmentService.getAppointments(1, 100, '', today).subscribe({
      next: (response) => {
        this.stats.todayAppointments = response.total;


      },
      error: (error) => console.error('Error loading appointments:', error)
    });
  }

  private loadDoctorStats(): void {
    // Load today's appointments for this doctor
    const today = new Date().toISOString().split('T')[0];
    this.appointmentService.getAppointments(1, 100, '', today).subscribe({
      next: (response) => {
        this.stats.todayAppointments = response.total;
      },
      error: (error) => console.error('Error loading appointments:', error)
    });

    // Load total patients (doctors can see all patients)
    this.patientService.getPatients(1, 1).subscribe({
      next: (response) => {
        this.stats.totalPatients = response.total;
      },
      error: (error) => console.error('Error loading patients:', error)
    });
  }

  private loadPatientStats(): void {
    // Load patient's appointments
    this.appointmentService.getAppointments(1, 100).subscribe({
      next: (response) => {
        this.stats.todayAppointments = response.total;
      },
      error: (error) => console.error('Error loading appointments:', error)
    });
  }

  private loadRecentAppointments(): void {
    if (!this.currentUser) return;

    // Load recent appointments based on role
    this.appointmentService.getAppointments(1, 5).subscribe({
      next: (response) => {
        this.recentAppointments = response.appointments || [];
      },
      error: (error) => {
        console.error('Error loading recent appointments:', error);
        this.recentAppointments = [];
      }
    });
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/auth/login']);
  }

  toggleNotifications(): void {
    this.showNotifications = !this.showNotifications;
  }
}

import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subscription, interval, firstValueFrom } from 'rxjs';
import { DataRefreshService } from '../../core/services/data-refresh.service';
import { Auth } from '../../core/services/auth';
import { PathologyInvoiceService } from '../../services/pathology-invoice.service';
import { environment } from '../../../environments/environment';
import { Chart, ChartConfiguration, ChartType, registerables } from 'chart.js';

interface LabStatistic {
  title: string;
  value: number;
  change: string;
  trend: 'up' | 'down' | 'stable';
  icon: string;
  color: string;
}

interface PendingTest {
  id: string;
  patientName: string;
  testType: string;
  sampleTime: string;
  priority: 'high' | 'medium' | 'low';
  status: string;
}

interface Equipment {
  name: string;
  status: 'active' | 'maintenance' | 'offline';
  lastChecked: string;
  utilization: number;
}

interface PathologyInvoice {
  _id: string;
  receiptNumber: number;
  patient: {
    name: string;
    registrationNumber: string;
    phone?: string;
    age?: number;
  };
  tests: any[];
  payment: {
    totalAmount: number;
    paymentStatus: string;
  };
  createdAt: string;
  status: string;
}

@Component({
  selector: 'app-pathology-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, DatePipe],
  templateUrl: './pathology-dashboard.component.html',
  styleUrls: ['./pathology-dashboard.component.css']
})
export class PathologyDashboardComponent implements OnInit, OnDestroy {
  private subscription = new Subscription();
  currentDate = new Date();

  // Dashboard Stats
  // Tests
  totalTests = 0;
  todayTests = 0;

  // Registrations (from pathology-registration collection)
  totalRegistrations = 0;
  todayRegistrations = 0;
  todayRegistrationChange = 0;

  // Reports
  totalPendingReports = 0;
  todayPendingReports = 0;
  pendingReportsChange = 0;
  totalReports = 0;
  todayReports = 0;
  totalReportsChange = 0;

  // Pathology Invoices Data
  pathologyInvoices: PathologyInvoice[] = [];
  todaysPathologyTests = 0;
  pendingPathologyReports = 0;
  completedPathologyTests = 0;

  // Today's Pathology Patients
  todaysPathologyPatients: any[] = [];

  // Recent Data
  recentRegistrations: any[] = [];
  recentReports: any[] = [];
  activeTab = 'registrations';

  // Calendar
  calendarDays: any[] = [];
  chart: Chart | null = null;

  constructor(
    private authService: Auth,
    private router: Router,
    private http: HttpClient,
    private pathologyInvoiceService: PathologyInvoiceService,
    private dataRefresh: DataRefreshService,
    private cdr: ChangeDetectorRef
  ) {
    try { Chart.register(...registerables); } catch {}
  }

  // Dashboard Statistics - Real-time data
  labStatistics: LabStatistic[] = [
    {
      title: 'Today\'s Tests',
      value: 0,
      change: '+0%',
      trend: 'stable',
      icon: '🧪',
      color: '#3b82f6'
    },
    {
      title: 'Pending Reports',
      value: 0,
      change: '+0%',
      trend: 'stable',
      icon: '📋',
      color: '#ef4444'
    },
    {
      title: 'Completed Tests',
      value: 0,
      change: '+0%',
      trend: 'stable',
      icon: '✅',
      color: '#10b981'
    },
    {
      title: 'Total Revenue',
      value: 0,
      change: '+0%',
      trend: 'stable',
      icon: '💰',
      color: '#f59e0b'
    }
  ];

  // Pending Tests - Real-time data from pathology invoices
  pendingTests: PendingTest[] = [];

  // Equipment Status - Real-time data
  equipmentList: Equipment[] = [
    {
      name: 'Pathology Lab Equipment',
      status: 'active',
      lastChecked: 'Real-time',
      utilization: 0 // Will be calculated from real data
    }
  ];

  // Chart Data for Test Trends - Real-time data
  testTrendData = {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    datasets: [
      {
        label: 'Tests Completed',
        data: [0, 0, 0, 0, 0, 0, 0], // Will be updated with real data
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.4
      }
    ]
  };

  ngOnInit(): void {
    // Security check - only pathology users can access
    const currentUser = this.authService.getCurrentUser();

    if (!currentUser) {
      console.log('❌ No user found, fast redirect to login');
      this.router.navigate(['/auth/login'], { replaceUrl: true });
      return;
    }

    if (currentUser.role !== 'Pathology') {
      console.log('❌ Access denied. User role:', currentUser.role);
      if (currentUser.role === 'Admin') {
        this.router.navigate(['/dashboard/admin'], { replaceUrl: true });
      } else {
        this.router.navigate(['/auth/login'], { replaceUrl: true });
      }
      return;
    }

    console.log('✅ Pathology Dashboard initialized for:', currentUser?.email);
    this.generateCalendarDays();
    this.loadDashboardData();

    // Auto-refresh when pathology booking/report changes happen
    this.subscription.add(
      this.dataRefresh.onEntityRefresh('pathology').subscribe(() => this.loadDashboardData())
    );
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  loadDashboardData(): void {
    console.log('🔄 Loading pathology dashboard data...');

    // Load pathology invoices (PATHOLOGY category only)
    this.loadPathologyInvoices();

    // Load pathology registrations summary
    this.loadPathologyRegistrationsSummary();

    // Load pathology reports
    this.loadPathologyReports().then(() => this.cdr.detectChanges());

    // 🚫 DISABLED: Time update interval to prevent infinite change detection loops
    console.log('🚫 PATHOLOGY DASHBOARD: Time interval disabled to prevent infinite loops');
    // Time interval removed - manual time update only
  }

  loadPathologyInvoices(): void {
    console.log('🧪 Loading PATHOLOGY category invoices...');

    this.pathologyInvoiceService.getAllInvoices(1, 100).subscribe({
      next: (response: any) => {
        console.log('✅ All invoices response:', response);

        if (response.success && response.invoices) {
          // Filter for PATHOLOGY category only
          this.pathologyInvoices = response.invoices.filter((invoice: any) => {
            // Check if any test in the invoice has PATHOLOGY category
            const hasPathologyTest = invoice.tests?.some((test: any) =>
              test.category === 'PATHOLOGY' ||
              test.categoryName === 'PATHOLOGY'
            );

            console.log(`🔍 Invoice ${invoice.receiptNumber} has pathology test:`, hasPathologyTest);
            return hasPathologyTest;
          });

          console.log(`✅ Found ${this.pathologyInvoices.length} PATHOLOGY invoices`);

          // Update statistics
          this.updatePathologyStats();

          // Manually trigger change detection (zoneless CD enabled)
          this.cdr.detectChanges();
        }
      },
      error: (error: any) => {
        console.error('❌ Error loading pathology invoices:', error);
        this.pathologyInvoices = [];
      }
    });
  }

  updatePathologyStats(): void {
    const today = new Date().toDateString();

    // Compute totals based on number of PATHOLOGY invoices only (not sum of tests)
    this.totalTests = this.pathologyInvoices.length;
    this.todayTests = this.pathologyInvoices.filter(inv => new Date(inv.createdAt).toDateString() === today).length;

    // Calculate percentage changes (mock data for now)
    this.todayRegistrationChange = Math.floor(Math.random() * 20) + 5;
    this.pendingReportsChange = Math.floor(Math.random() * 15) + 2;
    this.totalReportsChange = Math.floor(Math.random() * 25) + 8;

    // Today's tests KPI for equipment/utilization
    this.todaysPathologyTests = this.todayTests;

    // Count pending reports (status not completed)
    this.pendingPathologyReports = this.pathologyInvoices.filter(invoice =>
      invoice.status !== 'COMPLETED'
    ).length;

    // Count completed tests
    this.completedPathologyTests = this.pathologyInvoices.filter(invoice =>
      invoice.status === 'COMPLETED'
    ).length;

    // Update recent registrations (today's invoices)
    this.recentRegistrations = this.pathologyInvoices
      .filter(invoice => {
        const invoiceDate = new Date(invoice.createdAt).toDateString();
        return invoiceDate === today;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5)
      .map((invoice, index) => ({
        patientName: invoice.patient?.name || 'Unknown Patient',
        age: invoice.patient?.age || 'N/A',
        gender: (invoice.patient as any)?.gender || 'N/A',
        receiptNumber: invoice.receiptNumber || `REC${index + 1}`,
        amount: invoice.payment?.totalAmount || 0,
        time: new Date(invoice.createdAt).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit'
        })
      }));

    // Update pending tests from real data
    this.updatePendingTests();

    // Update today's pathology patients
    this.updateTodaysPathologyPatients();

    // Update equipment utilization
    this.updateEquipmentStatus();

    console.log('📊 Pathology Stats Updated:', {
      totalRegistrations: this.totalRegistrations,
      todayRegistrations: this.todayRegistrations,
      pendingReports: this.pendingPathologyReports,
      completedTests: this.completedPathologyTests
    });
  }

  updatePendingTests(): void {
    // Convert pathology invoices to pending tests format
    this.pendingTests = this.pathologyInvoices
      .filter(invoice => invoice.status !== 'COMPLETED')
      .slice(0, 5) // Show only top 5 pending tests
      .map((invoice, index) => ({
        id: String(invoice.receiptNumber || `LAB${String(index + 1).padStart(3, '0')}`),
        patientName: invoice.patient?.name || 'Unknown Patient',
        testType: invoice.tests?.[0]?.name || 'Pathology Test',
        sampleTime: new Date(invoice.createdAt).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit'
        }),
        priority: index < 2 ? 'high' : index < 4 ? 'medium' : 'low',
        status: invoice.status || 'Pending'
      }));

    console.log(`📋 Updated pending tests: ${this.pendingTests.length} tests`);
  }

  updateTodaysPathologyPatients(): void {
    const today = new Date().toDateString();

    // Filter today's pathology invoices and extract patient details
    this.todaysPathologyPatients = this.pathologyInvoices
      .filter(invoice => {
        const invoiceDate = new Date(invoice.createdAt).toDateString();
        return invoiceDate === today;
      })
      .map((invoice, index) => ({
        serialNo: index + 1,
        patientName: invoice.patient?.name || 'Unknown Patient',
        age: invoice.patient?.age || 'N/A',
        gender: (invoice.patient as any)?.gender || 'N/A',
        phone: invoice.patient?.phone || (invoice.patient as any)?.contact || 'N/A',
        receiptNumber: invoice.receiptNumber || `REC${String(index + 1).padStart(3, '0')}`,
        testCategory: 'PATHOLOGY',
        testNames: invoice.tests?.map(test => test.name).join(', ') || 'Pathology Tests',
        amount: invoice.payment?.totalAmount || 0,
        status: invoice.status || 'PENDING',
        bookingTime: new Date(invoice.createdAt).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit'
        }),
        department: (invoice as any).department || 'PATHOLOGY'
      }));

    console.log(`👥 Today's pathology patients updated: ${this.todaysPathologyPatients.length} patients`);
  }

  updateEquipmentStatus(): void {
    // Calculate equipment utilization based on test volume
    const utilizationPercentage = Math.min(
      Math.round((this.todaysPathologyTests / 50) * 100), // Assume 50 tests = 100% utilization
      100
    );

    this.equipmentList[0].utilization = utilizationPercentage;
    this.equipmentList[0].lastChecked = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });

    console.log(`⚙️ Equipment utilization updated: ${utilizationPercentage}%`);
  }

  getTodaysRevenue(): number {
    return this.todaysPathologyPatients.reduce((total, patient) => total + patient.amount, 0);
  }

  getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Morning';
    if (hour < 17) return 'Afternoon';
    return 'Evening';
  }

  getPriorityColor(priority: string): string {
    switch (priority) {
      case 'high': return '#ef4444';
      case 'medium': return '#f59e0b';
      case 'low': return '#10b981';
      default: return '#6b7280';
    }
  }

  getStatusColor(status: string): string {
    switch (status?.toUpperCase()) {
      case 'ACTIVE': return '#10b981';
      case 'COMPLETED': return '#3b82f6';
      case 'CANCELLED': return '#ef4444';
      case 'PENDING': return '#f59e0b';
      default: return '#6b7280';
    }
  }

  viewAllInvoices(): void {
    console.log('🔍 Navigating to all pathology invoices...');
    // Navigate to cash receipt edit record page
    this.router.navigate(['/cash-receipt/edit-record']);
  }

  // Quick Actions
  registerNewTest(): void {
    console.log('Navigate to Register Test');
  }

  generateReport(): void {
    console.log('Navigate to Generate Report');
    this.router.navigate(['/pathology-module/test-report']);
  }

  viewResults(): void {
    console.log('Navigate to View Results');
  }

  collectSample(): void {
    console.log('Navigate to Sample Collection');
  }

  openTestReport(): void {
    console.log('Navigate to Test Report');
    this.router.navigate(['/pathology-module/test-report']);
  }

  refreshDashboard(): void {
    this.loadDashboardData();
  }

  // ✅ NEW METHODS FOR UPDATED DASHBOARD

  async loadPathologyReports(): Promise<void> {
    try {
      console.log('📊 Loading pathology reports...');

      const response = await firstValueFrom(
        this.http.get<any>(`${environment.apiUrl}/pathology-reports`)
      );

      if (response.success && response.data) {
        const reports = response.data;
        const today = new Date().toDateString();

        // Calculate stats (use overall total from pagination if provided)
        const totalFromPagination = (response?.pagination?.totalReports ?? response?.pagination?.total ?? response?.totalReports);
        this.totalReports = typeof totalFromPagination === 'number' ? totalFromPagination : reports.length;

        this.todayReports = reports.filter((report: any) => {
          const reportDate = new Date(report.reportDate || report.createdAt).toDateString();
          return reportDate === today;
        }).length;

        // Pending stats are page-based for now (backend does not return overall pending count)
        this.totalPendingReports = reports.filter((report: any) => report.reportStatus !== 'Completed').length;

        this.todayPendingReports = reports.filter((report: any) => {
          const reportDate = new Date(report.reportDate || report.createdAt).toDateString();
          return reportDate === today && report.reportStatus !== 'Completed';
        }).length;

        // Get recent reports (latest 5)
        this.recentReports = reports
          .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 5)
          .map((report: any) => ({
            patientName: report.patientData?.fullName || 'Unknown Patient',
            receiptNo: report.receiptNo || 'N/A',
            labYearlyNo: report.labYearlyNo || 'N/A',
            status: report.reportStatus || 'Pending',
            reportDate: report.reportDate || report.createdAt
          }));

        // Render 7-day chart
        this.renderReportsChart(reports);

        console.log('✅ Pathology reports loaded:', {
          total: this.totalReports,
          today: this.todayReports,
          pending: this.totalPendingReports
        });
      }
    } catch (error) {
      console.error('❌ Error loading pathology reports:', error);
    }
  }

  private renderReportsChart(reports: any[]): void {
    try {
      const days: Date[] = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        d.setHours(0, 0, 0, 0);
        return d;
      });

      const labels = days.map(d => d.toLocaleDateString('en-US', { weekday: 'short' }));
      const counts = days.map(d => {
        const dStr = d.toDateString();
        return (reports || []).filter((r: any) => {
          const dt = new Date(r.reportDate || r.createdAt);
          return dt.toDateString() === dStr;
        }).length;
      });

      const canvas = document.getElementById('pathologyReportsChart') as HTMLCanvasElement;
      if (!canvas) return;
      if (this.chart) { try { this.chart.destroy(); } catch {} }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const config: ChartConfiguration = {
        type: 'line' as ChartType,
        data: {
          labels,
          datasets: [{
            label: 'Reports Generated',
            data: counts,
            borderColor: '#667eea',
            backgroundColor: 'rgba(102, 126, 234, 0.12)',
            borderWidth: 3,
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true }, x: {} }
        }
      };

      this.chart = new Chart(ctx, config);
    } catch (e) {
      console.warn('Chart render skipped:', e);
    }
  }


  generateCalendarDays(): void {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    this.calendarDays = [];
    for (let i = 0; i < 42; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);

      this.calendarDays.push({
        date: date.getDate(),
        isToday: date.toDateString() === today.toDateString(),
        hasEvents: Math.random() > 0.8 // Random events for demo
      });
    }
  }

  getCalendarDays(): any[] {
    return this.calendarDays;
  }

  // Load registrations total and today's count from backend
  private async loadPathologyRegistrationsSummary(): Promise<void> {
    try {
      const listRes = await firstValueFrom(
        this.http.get<any>(`${environment.apiUrl}/pathology-registration/list?page=1&limit=1`)
      );
      if (listRes?.success) {
        this.totalRegistrations = listRes?.pagination?.total ?? 0;
      }

      const dailyRes = await firstValueFrom(
        this.http.get<any>(`${environment.apiUrl}/pathology-registration/daily-count`)
      );
      if (dailyRes?.success) {
        this.todayRegistrations = dailyRes.count || 0;
      }

      this.todaysPathologyTests = this.todayRegistrations;
      this.todayTests = this.todayRegistrations;
      this.cdr.detectChanges();
    } catch (e) {
      console.error('❌ Error loading registrations summary:', e);
    }
  }

  setActiveTab(tab: string): void {
    this.activeTab = tab;
  }

  // Navigation methods
  navigateToInvoice(): void {
    this.router.navigate(['/cash-receipt']);
  }

  navigateToTestReport(): void {
    this.router.navigate(['/pathology-module/test-report']);
  }

  navigateToAllReports(): void {
    this.router.navigate(['/pathology-module/all-reports']);
  }

  navigateToReportsRecords(): void {
    this.router.navigate(['/pathology-module/reports-records']);
  }
}

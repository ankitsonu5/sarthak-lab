import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { ConnectedPosition } from '@angular/cdk/overlay';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { PathologyInvoiceService } from '../../services/pathology-invoice.service';
import { DataRefreshService } from '../../core/services/data-refresh.service';
import { Subscription } from 'rxjs';
import { environment } from '../../../environments/environment';

interface ScheduledRow {
  _id: string;
  receiptNumber: string | number;
  bookingDate?: string | Date;
  mode?: string; // OPD/IPD from invoice
  patient: {
    name: string;
    age?: number | string;
    ageIn?: string;
    gender?: string;
    phone?: string;
    registrationNumber?: string | number;
  };
  tests: Array<{ name?: string; testName?: string; category?: string; netAmount?: number; amount?: number; cost?: number }>;
  payment?: { paymentMethod?: string; paymentStatus?: string };
  department?: { name?: string };
  isRegistered?: boolean; // derived from pathology-registration collection
  // UI state
  sampleOpen: boolean;
  sampleSelected?: string[];
  sampleDone?: boolean;
  dropUp?: boolean;
}

@Component({
  selector: 'app-scheduled-tests',
  templateUrl: './scheduled-tests.component.html',
  styleUrls: ['./scheduled-tests.component.css'],
  standalone: false
})
export class ScheduledTestsComponent implements OnInit {
  isLoading = false;
  rows: ScheduledRow[] = [];
  filtered: ScheduledRow[] = [];
  paged: ScheduledRow[] = [];
  sampleOptions: string[] = ['Blood', 'Urine', 'Stool', 'Sputum', 'Swab', 'Serum', 'Plasma', 'CSF', 'Other'];
  // Always open upwards from the button (no overflow at bottom rows)
  positions: ConnectedPosition[] = [
    // Prefer below-left
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
    // Fallback above-left
    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 },
    // Fallback below-right (align end)
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 6 },
    // Fallback above-right
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -6 }
  ];

  // filters
  search = '';
  filterReceiptNo: string = '';
  onlyToday = false;
  filterDateRange = ''; // today, yesterday, week, month, custom
  filterDateFrom = '';
  filterDateTo = '';
  showCustomDateRange = false;
  filterStatus: '' | 'pending' | 'done' = ''; // '' = all, 'pending' = not registered, 'done' = registered

  private subscription = new Subscription();
  private refreshTimeout: any = null;

  // pagination and stats
  pageSize = 100;
  currentPage = 1;
  totalRecords = 0;
  totalFiltered = 0;
  totalPages = 1;
  registeredDoneCount = 0;

  constructor(
    private pathologyInvoiceService: PathologyInvoiceService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private dataRefresh: DataRefreshService,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    this.load();

    // Auto-refresh when pathology bookings or updates happen (debounced)
    this.subscription.add(
      this.dataRefresh.onEntityRefresh('pathology').subscribe(() => {
        if (this.isLoading) return;
        clearTimeout(this.refreshTimeout);
        this.refreshTimeout = setTimeout(() => this.load(), 400);
      })
    );
  }

  private isToday(d: any): boolean {
    const date = new Date(d);
    const today = new Date();
    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
  }

  async load(): Promise<void> {
    this.isLoading = true;
    try {
      // Build server-side filter params to ensure 100 rows per page after filtering
      const opts: any = {};
      if ((this.search || '').trim()) opts.search = this.search.trim();
      if ((this.filterReceiptNo || '').toString().trim()) opts.receipt = String(this.filterReceiptNo).trim();
      if (this.filterStatus) opts.status = this.filterStatus; // 'pending' | 'done'
      // Date range precedence: onlyToday > filterDateRange preset > custom
      let dr = this.onlyToday ? 'today' : (this.filterDateRange || '');
      if (dr === 'custom') {
        if ((this.filterDateFrom || '').toString().trim()) opts.startDate = this.filterDateFrom;
        if ((this.filterDateTo || '').toString().trim()) opts.endDate = this.filterDateTo;
      } else if (dr) {
        opts.dateRange = dr;
      }
      // Ensure only Pathology items are fetched to keep page filled with 100 rows
      opts.category = 'PATHOLOGY';

      const resp: any = await new Promise((resolve, reject) => {
        this.pathologyInvoiceService.getAllInvoices(this.currentPage, this.pageSize, opts).subscribe({ next: resolve, error: reject });
      });
      const batch = Array.isArray(resp?.invoices) ? resp.invoices : [];
      const pagination = resp?.pagination || {};
      this.totalRecords = pagination.total || batch.length;
      this.totalPages = Math.max(1, pagination.pages || Math.ceil(this.totalRecords / this.pageSize));

      const mapped: ScheduledRow[] = (batch
        .map((inv: any) => {
          const testsAll = Array.isArray(inv?.tests) ? inv.tests : [];
          const testsFiltered = testsAll.filter((t: any) => ((t?.category || t?.categoryName || '').toString().trim().toUpperCase() === 'PATHOLOGY'));
          if (testsFiltered.length === 0) return null; // Only keep invoices having at least one PATHOLOGY test
          return {
            _id: inv._id || inv.id || Math.random().toString(36).slice(2),
            receiptNumber: inv.receiptNumber || inv.invoiceNumber || '',
            bookingDate: inv.bookingDate || inv.createdAt,
            mode: (inv.mode || inv?.patient?.mode || '').toString().toUpperCase(),
            patient: {
              name: inv.patient?.name || inv.patientName || inv.patient?.fullName || 'Patient',
              age: inv.patient?.age || inv.patientAge,
              ageIn: this.normalizeAgeIn(inv.patient?.ageIn || inv.patient?.ageUnit || inv.patientAgeIn || inv.patient?.age_in),
              gender: inv.patient?.gender || inv.patientGender,
              phone: inv.patient?.phone || inv.patientPhone,
              registrationNumber: inv.patient?.registrationNumber || inv.registrationNumber || inv.patientDetails?.patientId
            },
            tests: testsFiltered,
            payment: inv.payment || {},
            department: inv.department || { name: 'PATHOLOGY' },
            isRegistered: false,
            sampleOpen: false,
            sampleSelected: this.loadSavedSamples(inv._id),
            sampleDone: this.loadSavedSamples(inv._id).length > 0
          } as ScheduledRow;
        })
        .filter((x: any) => !!x)) as ScheduledRow[];

      // Enforce payment-first: show only fully paid invoices
      const mappedPaid = mapped.filter(r => String(r?.payment?.paymentStatus || '').toUpperCase() === 'PAID');
      this.rows = mappedPaid.sort((a, b) => new Date(b.bookingDate as any).getTime() - new Date(a.bookingDate as any).getTime());
      this.applyFilters();
      this.isLoading = false;
      this.cdr.detectChanges();
      // After invoices load, fetch registrations and mark rows
      this.updateRegistrationStatuses();
    } catch (e) {
      this.isLoading = false;
      this.rows = [];
      this.filtered = [];
      this.cdr.detectChanges();
    }
  }

  // With server-side filters, simply reflect current rows on the page
  applyFilters(): void {
    const list = this.rows;

    // Finalize list for the current server page
    this.filtered = list;
    this.totalFiltered = list.length;

    // Registered done count across the current page (will update after marking)
    this.registeredDoneCount = list.reduce((acc, r) => acc + (r.isRegistered ? 1 : 0), 0);

    // Render current page rows
    this.paged = list;
  }

  onDateRangeChange(): void {
    this.showCustomDateRange = this.filterDateRange === 'custom';
    if (this.filterDateRange !== 'custom') {
      this.filterDateFrom = '';
      this.filterDateTo = '';
    }
    this.onFiltersChange();
  }

  onFiltersChange(): void {
    this.currentPage = 1;
    this.load();
  }

  // Enter triggers exact match by receipt number -> fetch from server
  applyReceiptExact(): void {
    const target = (this.filterReceiptNo || '').toString().trim();
    if (!target) { this.onFiltersChange(); return; }
    // Keep filter value and reload from server so page contains up to 100 matches
    this.currentPage = 1;
    this.load();
  }

  // Enter triggers search -> fetch from server
  applySearchEnter(): void {
    const q = (this.search || '').toString().trim();
    if (!q) { this.onFiltersChange(); return; }
    this.currentPage = 1;
    this.load();
  }

  clearFilters(): void {
    this.search = '';
    this.onlyToday = false;
    this.filterDateRange = '';
    this.filterDateFrom = '';
    this.filterDateTo = '';
    this.filterStatus = '';
    this.showCustomDateRange = false;
    this.currentPage = 1;
    this.onFiltersChange();
  }

  goToPage(p: number): void { this.currentPage = Math.min(this.totalPages, Math.max(1, p)); this.load(); }
  nextPage(): void { if (this.currentPage < this.totalPages) { this.currentPage++; this.load(); } }
  prevPage(): void { if (this.currentPage > 1) { this.currentPage--; this.load(); } }

  getTestCount(r: ScheduledRow): number { return (r.tests || []).length; }
  getTestNames(r: ScheduledRow): string {
    return (r.tests || []).map(t => (t.name || (t as any).testName || '')).filter(Boolean).join(', ');
  }

  getEndIndex(): number {
    // Reflect the actual number of rows rendered on this page (after filters)
    const start = (this.currentPage - 1) * this.pageSize;
    return Math.min(start + this.filtered.length, this.totalRecords);
  }

  // Registration no. split into two lines
  getRegPrefix(reg?: string | number): string {
    const s = (reg ?? '').toString();
    // Example: PAT000123 -> PAT
    const m = s.match(/^([A-Za-z]+)(\d+)/);
    return m ? m[1] : s.slice(0, 3);
  }
  getRegSuffix(reg?: string | number): string {
    const s = (reg ?? '').toString();
    const m = s.match(/^([A-Za-z]+)(\d+)/);
    return m ? m[2] : s.slice(3);
  }

  toggleSample(r: ScheduledRow): void {
    r.sampleOpen = !r.sampleOpen;
  }

  onSampleToggle(r: ScheduledRow, opt: string, ev: any): void {
    const list = new Set(r.sampleSelected || []);
    if (ev?.target?.checked) list.add(opt); else list.delete(opt);
    r.sampleSelected = Array.from(list);
  }

  submitSamples(r: ScheduledRow): void {
    r.sampleDone = (r.sampleSelected || []).length > 0;
    r.sampleOpen = false;
    this.saveSamples(r._id, r.sampleSelected || []);
    this.cdr.detectChanges();
  }

  // Persist selection locally to make UX stable (backend endpoint not defined yet)
  private saveSamples(id: string, samples: string[]): void {
    try { localStorage.setItem(`scheduled_samples_${id}`, JSON.stringify(samples)); } catch {}
  }
  private loadSavedSamples(id: string): string[] {
    try { return JSON.parse(localStorage.getItem(`scheduled_samples_${id}`) || '[]'); } catch { return []; }
  }

  private updateRegistrationStatuses(): void {
    // Load only a recent page of registrations to mark matching receipts
    const pageSize = 200;
    this.http.get<any>(`${environment.apiUrl}/pathology-registration/list?limit=${pageSize}&page=1&_=${Date.now()}`).subscribe({
      next: (res) => {
        const regs = res?.registrations || res?.invoices || [];
        // Build lookup by receipt number for quick match
        const byReceipt = new Map<string, any>();
        regs.forEach((x: any) => {
          const key = String(x?.receiptNumber ?? '').trim();
          if (key) byReceipt.set(key, x);
        });
        this.rows.forEach(r => {
          const key = String(r.receiptNumber ?? '').trim();
          const reg = byReceipt.get(key);
          r.isRegistered = !!reg;
          // If registration has samplesCollected, reflect them in UI state
          const samples = Array.isArray(reg?.samplesCollected) ? reg.samplesCollected : [];
          if (samples.length) {
            r.sampleSelected = samples.slice();
            r.sampleDone = true;
          }
        });
        this.applyFilters(); this.cdr.detectChanges();
      },
      error: () => { /* silent */ }
    });
  }

  // Normalize AgeIn to one of Y/M/D; map words to initials
  private normalizeAgeIn(v: any): string {
    const s = (v ?? '').toString().trim().toUpperCase();
    if (!s) return '';
    if (s === 'Y' || s === 'M' || s === 'D') return s;
    if (s.startsWith('YEAR')) return 'Y';
    if (s.startsWith('MONTH')) return 'M';
    if (s.startsWith('DAY')) return 'D';
    return s.charAt(0);
  }

  goToRegistration(r: ScheduledRow): void {
    // Open Pathology Registration component with receipt hint and mode (OPD/IPD)
    const mode = (r.mode || '').toString().toUpperCase() || 'OPD';
    const samples = (r.sampleSelected || []).join(',');
    this.router.navigate(['/pathology/registration'], { queryParams: { receiptNo: r.receiptNumber, mode, samples } });
  }
}


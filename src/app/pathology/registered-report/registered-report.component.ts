import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom, Subscription } from 'rxjs';
import { DataRefreshService } from '../../core/services/data-refresh.service';
import { environment } from '../../../environments/environment';
import { DeleteConfirmationModalComponent } from '../../shared/components/delete-confirmation-modal/delete-confirmation-modal.component';
import { DeleteSuccessModalComponent } from '../../shared/components/delete-success-modal/delete-success-modal.component';


interface RegistrationRecord {
  _id?: string;
  receiptNumber?: number;
  yearNumber?: number;
  todayNumber?: number;
  registrationDate?: string;
  createdAt?: string;
  status?: string; // REGISTERED, etc.
  registrationMode?: string; // Registration mode
  patient?: {
    name?: string;
    age?: number;
    ageIn?: string;
    gender?: string;
    registrationNumber?: string;
  };
  tests?: Array<{ name?: string; category?: string; }>;
  // Server-provided: toggle to allow editing cash receipt BEFORE report generation
  cashEditAllowed?: boolean;
  // Derived on client: whether a pathology report exists for this receipt
  reportGenerated?: boolean;
}

@Component({
  selector: 'app-registered-report',
  standalone: true,
  imports: [CommonModule, FormsModule,
    DeleteConfirmationModalComponent,
    DeleteSuccessModalComponent
  ],
  templateUrl: './registered-report.component.html',
  styleUrls: ['./registered-report.component.css']
})
export class RegisteredReportComponent implements OnInit {
  // Data
  allRegistrations: RegistrationRecord[] = [];
  filtered: RegistrationRecord[] = [];
  isLoading = false;

  // Filters
  searchTerm = '';
  filterReceiptNo = '';
  filterRegistrationNo = '';
  filterTestName = ''; // ✅ New: Test name search
  filterDateRange = ''; // today, yesterday, week, month, custom
  filterDateFrom = '';
  filterDateTo = '';
  showCustomDateRange = false;
  // New: Status filter ('' | 'pending' | 'generated')
  filterStatus: '' | 'pending' | 'generated' = '';

  // Pagination
  itemsPerPage = 100; // Match all-reports (server-side pagination, 100 per page)
  currentPage = 1;
  totalPages = 1;
  totalRecords = 0; // from backend pagination
  // Global latest receipt number (used to show delete only on the latest registration)
  lastReceiptNumber: number | null = null;

  paginatedData: RegistrationRecord[] = [];

  // Delete modals state
  showDeleteConfirmation = false;
  showDeleteSuccess = false;
  deleteMessage = '';
  deleteSuccessTitle = 'Registration Deleted';
  confirmingDelete = false;
  private pendingDeleteReceipt: string | null = null;
  private pendingDeleteRowIndex: number = -1;

  // Cached index of generated reports with date scoping to avoid false positives across years/days
  // Keys are composed as `${identifier}-${scope}` where scope is year for receipt/yearly and full YYYY-MM-DD for daily
  private receiptYearSet = new Set<string>(); // `${receiptNo}-${year}`
  private yearlyYearSet = new Set<string>();  // `${yearNumber}-${year}`
  private dailyDateSet = new Set<string>();   // `${todayNumber}-${yyyy-mm-dd}`
  private reportIndexReady = false;
  private filterIndexTimer: any = null; // debounce re-indexing after filters

  private subscription = new Subscription();
  private refreshTimeout: any = null;


  constructor(
    private http: HttpClient,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private dataRefresh: DataRefreshService
  ) {}

  ngOnInit(): void {
    // Always show full list on arrival — do not prefill filters from query params
    this.loadRegistrations();
    this.loadLastReceipt();

    // Auto-refresh on pathology events (debounced)
    this.subscription.add(
      this.dataRefresh.onEntityRefresh('pathology').subscribe(() => {
        if (this.isLoading) return;
        clearTimeout(this.refreshTimeout);
        this.refreshTimeout = setTimeout(() => { this.loadRegistrations(); this.loadLastReceipt(); }, 400);
      })
    );
  }

  async loadRegistrations(): Promise<void> {
    this.isLoading = true;
    try {
      // Server-side pagination with server-side filters
      const pageSize = this.itemsPerPage;
      const page = this.currentPage || 1;

      const params: string[] = [
        `limit=${pageSize}`,
        `page=${page}`,
        `_${Date.now()}`
      ];

      const add = (k: string, v?: string) => { if (v && v.toString().trim() !== '') params.push(`${k}=${encodeURIComponent(v.toString().trim())}`); };

      // Text filters
      add('search', this.searchTerm); // patient name search (server-side)
      add('receipt', this.filterReceiptNo);
      add('yearly', this.filterRegistrationNo); // Lab Yearly No (server-side with new param)
      add('test', this.filterTestName);

      // Date filters
      if (this.filterDateRange && this.filterDateRange !== 'custom') {
        add('dateRange', this.filterDateRange);
      } else if (this.filterDateRange === 'custom' || this.filterDateFrom || this.filterDateTo) {
        add('startDate', this.toYMD(this.filterDateFrom));
        add('endDate', this.toYMD(this.filterDateTo));
      }

      const url = `${environment.apiUrl}/pathology-registration/list?${params.join('&')}`;
      const response = await firstValueFrom(this.http.get<any>(url));
      const batch: RegistrationRecord[] = (response?.registrations || response || []) as RegistrationRecord[];

      // Preserve server-provided flags (like cashEditAllowed) as-is
      this.allRegistrations = Array.isArray(batch) ? batch : [];
      this.totalRecords = (response?.pagination?.total as number) || this.allRegistrations.length;

      // Use server-filtered dataset directly
      this.filtered = this.sortNewestFirst([...this.allRegistrations]);

      // Build/refresh fast index first so generated status is accurate
      await this.buildReportIndex();

      // Do not apply status filter here; status is a LOCAL (this page only) filter
      this.updatePagination();
      this.applyStatusLocal(false);
    } catch (error) {
      console.error('Error loading registrations:', error);
      alert('Error loading registrations');
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  // Normalize various date inputs to YYYY-MM-DD string; return '' if invalid
  private toYMD(input: any): string {
    if (!input) return '';
    if (typeof input === 'string') {
      const s = input.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    }
    const d = new Date(input);
    if (isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private async loadLastReceipt(): Promise<void> {
    try {
      // Step 1: get global latest registration to identify the latest yearNumber bucket
      const url1 = `${environment.apiUrl}/pathology-registration/list?limit=1&page=1&_=${Date.now()}`;
      const resp1: any = await firstValueFrom(this.http.get<any>(url1));
      const latestGlobal = Array.isArray(resp1?.registrations) ? resp1.registrations[0] : null;
      const latestYear = Number(latestGlobal?.yearNumber ?? NaN);
      if (!latestYear || Number.isNaN(latestYear)) {
        this.lastReceiptNumber = null;
        return;
      }

      // Step 2: within that yearNumber, get the newest by createdAt
      const url2 = `${environment.apiUrl}/pathology-registration/list?limit=1&page=1&yearly=${encodeURIComponent(String(latestYear))}&_=${Date.now()}`;
      const resp2: any = await firstValueFrom(this.http.get<any>(url2));
      const latestInYear = Array.isArray(resp2?.registrations) ? resp2.registrations[0] : null;
      const recNo = Number(latestInYear?.receiptNumber ?? NaN);
      this.lastReceiptNumber = Number.isNaN(recNo) ? null : recNo;
    } catch {
      this.lastReceiptNumber = null;
    }
  }

  // Build a cached index of generated reports ONLY for currently visible/filtered receipts
  private async buildReportIndex(): Promise<void> {
    try {
      // Choose a small subset: prioritize what the user can currently see
      const source = (this.filtered && this.filtered.length ? this.filtered : this.sortNewestFirst(this.allRegistrations)).slice(0, 500);

      // Group requested receipts by year to scope the search and avoid cross-year collisions
      const byYear = new Map<number, number[]>();
      for (const r of source) {
        const rec = Number((r as any).receiptNumber);
        if (!rec || Number.isNaN(rec)) continue;
        const d = this.toYMD(r.registrationDate || r.createdAt);
        const y = d ? Number(d.slice(0, 4)) : NaN;
        if (Number.isNaN(y)) continue;
        if (!byYear.has(y)) byYear.set(y, []);
        byYear.get(y)!.push(rec);
      }

      // Reset caches
      this.receiptYearSet = new Set<string>();
      this.yearlyYearSet = new Set<string>(); // left empty for now (rarely needed)
      this.dailyDateSet = new Set<string>();  // left empty for now

      // Fire parallel requests per year using new fast API
      const tasks: Promise<any>[] = [];
      byYear.forEach((receipts, year) => {
        const unique = Array.from(new Set(receipts));
        const qs = encodeURIComponent(unique.join(','));
        const url = `${environment.apiUrl}/pathology-reports/exists-bulk?year=${year}&receipts=${qs}`;
        tasks.push(firstValueFrom(this.http.get<any>(url)));
      });

      const results = await Promise.all(tasks);
      for (const res of results) {
        const map = (res && (res.existsByReceiptYear || res.data)) || {};
        Object.keys(map).forEach(k => this.receiptYearSet.add(k));
      }

      this.reportIndexReady = true;
      // Mark statuses for the current filtered list immediately
      this.filtered = this.markReportStatuses(this.filtered);
      this.cdr.detectChanges();
    } catch (e) {
      console.warn('Could not build report index (fast):', e);
      // Fallback: fetch first page of reports and build a quick receipt-year set
      try {
        const resp = await firstValueFrom(this.http.get<any>(`${environment.apiUrl}/pathology-reports?page=1&limit=200&_=${Date.now()}`));
        const reports = resp?.data || [];
        this.receiptYearSet = new Set<string>();
        for (const rep of reports) {
          const rec = (rep?.receiptNo ?? rep?.receiptNumber ?? '').toString().trim();
          const d = this.toYMD(rep?.reportDate || rep?.createdAt);
          const y = d ? d.slice(0, 4) : '';
          if (rec && y) this.receiptYearSet.add(`${rec}-${y}`);
        }
        this.reportIndexReady = true;
        this.filtered = this.markReportStatuses(this.filtered);
        this.cdr.detectChanges();
      } catch (fallbackErr) {
        console.warn('Fallback index build failed:', fallbackErr);
        this.reportIndexReady = false;
      }
    }
  }

  getTestNamesShort(rec: RegistrationRecord): string {
    // Show full test names without truncation
    const names = (rec.tests || []).map(t => t?.name || '').filter(Boolean);
    return names.join(', ');
  }

  getType(rec: RegistrationRecord): string {
    // Get the registration mode from the database record
    return (rec as any).registrationMode || 'OPD';
  }

  applyFilters(): void {
    // Switch to server-side filtering for correctness across pages
    this.currentPage = 1;
    this.loadRegistrations();

    // Debounce index rebuild for status highlighting
    if (this.filterIndexTimer) clearTimeout(this.filterIndexTimer);
    this.filterIndexTimer = setTimeout(() => {
      this.buildReportIndex();
    }, 200);
  }

  updatePagination(): void {
    // Backend already returns one page of results (server-side pagination)
    // Use totalRecords for page count, and display the received page as-is.
    this.totalPages = Math.max(1, Math.ceil(((this.totalRecords || 0)) / this.itemsPerPage));
    if (this.currentPage > this.totalPages) {
      this.currentPage = this.totalPages;
    }
    this.paginatedData = this.filtered; // current page data already
    // Ensure generated status for visible rows updates instantly
    this.ensureStatusForCurrentPage();
  }

  // Quickly mark reportGenerated for only the currently visible page (fast UX)

  // Status filter should be LOCAL to current page (no server call)
  applyStatusLocal(triggerIndexBuild: boolean = true): void {
    // If index not ready, ensure statuses for this page first
    if (triggerIndexBuild && !this.reportIndexReady) {
      this.ensureStatusForCurrentPage().then(() => this.applyStatusLocal(false));
      return;
    }
    const base = this.reportIndexReady ? this.markReportStatuses(this.filtered) : this.filtered;
    if (!this.filterStatus) {
      this.paginatedData = base;
    } else {
      const wantGenerated = this.filterStatus === 'generated';
      this.paginatedData = base.filter(r => !!(r as any).reportGenerated === wantGenerated);
    }
    this.cdr.detectChanges();
  }

  private async ensureStatusForCurrentPage(): Promise<void> {
    try {
      const need = (this.paginatedData || []).filter(r => !r.reportGenerated).map(r => ({
        receipt: (r as any).receiptNumber,
        year: new Date((r as any).registrationDate || (r as any).createdAt).getFullYear()
      })).filter(x => !!x.receipt && !!x.year);
      if (need.length === 0) return;

      const byYear = new Map<number, number[]>();
      for (const n of need) {
        if (!byYear.has(n.year)) byYear.set(n.year, []);
        byYear.get(n.year)!.push(Number(n.receipt));
      }
      const tasks: Promise<any>[] = [];
      byYear.forEach((list, year) => {
        const unique = Array.from(new Set(list));
        const qs = encodeURIComponent(unique.join(','));
        const url = `${environment.apiUrl}/pathology-reports/exists-bulk?year=${year}&receipts=${qs}`;
        tasks.push(firstValueFrom(this.http.get<any>(url)));
      });
      const results = await Promise.all(tasks);
      for (const res of results) {
        const map = (res && (res.existsByReceiptYear || res.data)) || {};
        Object.keys(map).forEach(k => this.receiptYearSet.add(k));
      }
      // Make index usable immediately for marking statuses on current page
      this.reportIndexReady = true;
      // After updating the set, mark statuses for only visible items
      // Server-side pagination: filtered already contains only the current page
      const baseMarked = this.markReportStatuses(this.filtered);
      if (this.filterStatus) {
        const wantGenerated = this.filterStatus === 'generated';
        this.paginatedData = baseMarked.filter(r => !!(r as any).reportGenerated === wantGenerated);
      } else {
        this.paginatedData = baseMarked;
      }
      this.cdr.detectChanges();
    } catch (e) {
      // Fallback: one-shot fetch of recent reports to mark current page
      try {
        const resp = await firstValueFrom(this.http.get<any>(`${environment.apiUrl}/pathology-reports?page=1&limit=200&_=${Date.now()}`));
        const reports = resp?.data || [];
        const set = new Set<string>();
        for (const rep of reports) {
          const rec = (rep?.receiptNo ?? rep?.receiptNumber ?? '').toString().trim();
          const d = this.toYMD(rep?.reportDate || rep?.createdAt);
          const y = d ? d.slice(0, 4) : '';
          if (rec && y) set.add(`${rec}-${y}`);
        }
        set.forEach(k => this.receiptYearSet.add(k));
        this.reportIndexReady = true;
        this.paginatedData = this.markReportStatuses(this.paginatedData);
        this.cdr.detectChanges();
      } catch {}
    }
  }

  // Utility: newest first sort
  private sortNewestFirst(arr: RegistrationRecord[]): RegistrationRecord[] {
    return [...arr].sort((a: any, b: any) => new Date(b.createdAt || b.registrationDate).getTime() - new Date(a.createdAt || a.registrationDate).getTime());
  }

  // Mark report-generated flags for the provided records using cached indices
  private markReportStatuses(records: RegistrationRecord[]): RegistrationRecord[] {
    if (!this.reportIndexReady) return records;
    const norm = (v: any) => (v ?? '').toString().trim();
    return records.map(r => {
      const rec   = norm(r.receiptNumber);
      const yearN = norm((r as any).yearNumber);
      const daily = norm((r as any).todayNumber);
      const rDate = this.toYMD(r.registrationDate || r.createdAt);
      const rYear = rDate ? rDate.slice(0, 4) : '';
      let generated = false;
      if (rec && rYear) {
        generated = this.receiptYearSet.has(`${rec}-${rYear}`);
      } else {
        generated = (!!yearN && !!rYear && this.yearlyYearSet.has(`${yearN}-${rYear}`)) || (!!daily && !!rDate && this.dailyDateSet.has(`${daily}-${rDate}`));
      }
      return { ...r, reportGenerated: generated } as RegistrationRecord;
    });
  }

  // Enter-to-search behaviours (now server-backed)
  onSearchEnter(): void {
    this.currentPage = 1;
    this.loadRegistrations();
  }

  applyExactReceiptFilter(): void {
    this.currentPage = 1;
    this.loadRegistrations();
  }

  applyExactRegistrationFilter(): void {
    this.currentPage = 1;
    this.loadRegistrations();
  }


  onDateRangeChange(): void {
    this.showCustomDateRange = this.filterDateRange === 'custom';
    if (this.filterDateRange !== 'custom') {
      this.filterDateFrom = '';
      this.filterDateTo = '';
    }
    this.applyFilters();
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.filterReceiptNo = '';
    this.filterRegistrationNo = '';
    this.filterTestName = ''; // ✅ Clear test name filter
    this.filterDateRange = '';
    this.filterDateFrom = '';
    this.filterDateTo = '';
    this.filterStatus = '';
    this.showCustomDateRange = false;
    this.currentPage = 1;
    this.applyFilters();
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      // Fetch from server for the requested page to keep UI fast
      this.loadRegistrations();
    }
  }

  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadRegistrations();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadRegistrations();
    }
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, this.currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(this.totalPages, start + maxVisible - 1);

    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }

  printReport(): void {
    window.print();
  }

  downloadPDF(): void {
    // This would typically use a library like jsPDF
    console.log('Download PDF functionality to be implemented');
  }

  getEndIndex(): number {
    const total = this.totalRecords || this.filtered.length;
    return Math.min(this.currentPage * this.itemsPerPage, total);
  }

  refresh(): void {
    this.loadRegistrations();
    this.loadLastReceipt();
  }

  // Helper: only latest row (first of first page) with generated report shows delete
  isTopGenerated(index: number, rec: RegistrationRecord): boolean {
    return this.currentPage === 1 && index === 0 && !!rec.reportGenerated;
  }

  // Allow delete only for the truly latest global receipt number, and only if not generated
  isTopPending(index: number, rec: RegistrationRecord): boolean {
    const last = Number(this.lastReceiptNumber ?? -1);
    return !rec.reportGenerated && Number((rec as any)?.receiptNumber ?? -2) === last;
  }


  // Open confirmation modal for deleting a pending registration by receipt
  async promptDelete(rec: RegistrationRecord, index: number): Promise<void> {
    try {
      const receipt = rec?.receiptNumber?.toString() || '';
      if (!receipt) return;
      this.pendingDeleteRowIndex = index;
      this.pendingDeleteReceipt = receipt;
      this.confirmingDelete = false;
      this.deleteMessage = `Are you sure you want to delete the registration for Receipt No. ${receipt}?`;

      // No need to resolve report id because this action deletes the registration (only when not generated)
      this.showDeleteConfirmation = true;
      this.cdr.detectChanges();
    } catch (e) {
      console.error('Failed to prepare delete:', e);
      alert('Unable to prepare deletion.');
    }
  }

  cancelDelete(): void {
    this.showDeleteConfirmation = false;
    this.confirmingDelete = false;
    this.cdr.detectChanges();
  }

  async confirmDelete(): Promise<void> {
    const receipt = this.pendingDeleteReceipt;
    if (!receipt) { this.cancelDelete(); return; }
    this.confirmingDelete = true;
    this.cdr.detectChanges();
    try {
      const resp = await firstValueFrom(this.http.delete<any>(`${environment.apiUrl}/pathology-registration/receipt/${encodeURIComponent(receipt)}`));
      this.showDeleteConfirmation = false;
      if (resp?.success) {
        this.deleteSuccessTitle = 'Registration Deleted';
        this.showDeleteSuccess = true;
        // Optimistic update for top row on page 1
        if (this.pendingDeleteRowIndex === 0 && this.currentPage === 1) {
          this.paginatedData.splice(0, 1);
        }
        setTimeout(() => { this.loadRegistrations(); this.loadLastReceipt(); }, 300);
      } else {
        alert(resp?.message || 'Delete failed');
      }
    } catch (e: any) {
      console.error('Delete failed:', e);
      alert(e?.error?.message || 'Error deleting registration.');
    } finally {
      this.confirmingDelete = false;
      this.pendingDeleteReceipt = null;
      this.pendingDeleteRowIndex = -1;
      this.cdr.detectChanges();
    }
  }

  onDeleteSuccessClosed(): void {
    this.showDeleteSuccess = false;
    this.cdr.detectChanges();
  }


  // Navigate based on report status
  async generateReport(rec: RegistrationRecord): Promise<void> {
    const receipt = rec.receiptNumber?.toString() || '';

    if (rec.reportGenerated) {
      this.router.navigate(['/pathology-module/all-reports'], { queryParams: { focusReceipt: receipt } });
      return;
    }

    // Quick safety check using fast exists endpoint
    try {
      const resp = await firstValueFrom(this.http.get<any>(`${environment.apiUrl}/pathology-reports/exists?receiptNo=${encodeURIComponent(receipt)}`));
      if (resp && resp.exists) {
        this.router.navigate(['/pathology-module/all-reports'], { queryParams: { focusReceipt: receipt } });
        return;
      }
    } catch {}

    this.router.navigate(['/pathology-module/test-report'], { queryParams: { receiptNo: receipt } });
  }

  // Open registration in lab-numbers-only edit mode
  editLabNumbers(rec: RegistrationRecord): void {
    const receipt = rec?.receiptNumber?.toString() || '';
    if (!receipt) { return; }
    this.router.navigate(['/pathology-module/registration'], { queryParams: { mode: 'edit-lab-numbers', receiptNo: receipt } });
  }


  async toggleCashEdit(rec: RegistrationRecord): Promise<void> {
    try {
      if (!rec?.receiptNumber) return;
      if (rec.reportGenerated) { alert('Report generated — edits are permanently locked.'); return; }
      const newVal = !(rec as any).cashEditAllowed;
      const url = `${environment.apiUrl}/pathology-registration/receipt/${rec.receiptNumber}/cash-edit`;
      const resp = await firstValueFrom(this.http.put(url, { allow: newVal }));
      const ok = (resp as any)?.success ?? typeof (resp as any)?.cashEditAllowed === 'boolean';
      if (ok) {
        (rec as any).cashEditAllowed = Boolean((resp as any)?.cashEditAllowed ?? newVal);
        this.cdr.detectChanges();
      } else {
        alert((resp as any)?.message || 'Failed to update permission');
      }
    } catch (e: any) {
      // Graceful handling for live server without this API (older build)
      if (e && (e.status === 404 || e?.error === 'Not Found')) {
        alert('Live server is missing the cash-edit API. Please update/restart backend. Until then, this toggle will not work.');
        return;
      }
      alert(e?.error?.message || e?.message || 'Error updating permission');
    }
  }
}


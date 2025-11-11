import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom, Subscription } from 'rxjs';
import { environment } from '../../../environments/environment';
import { WhatsAppService } from '../../core/services/whatsapp.service';
import { PdfGeneratorService } from '../../core/services/pdf-generator.service';
import { ImageGeneratorService } from '../../core/services/image-generator.service';
import { DataRefreshService } from '../../core/services/data-refresh.service';

interface PathologyReport {
  _id: string;
  reportId: string;
  receiptNo: string;
  registrationNo: string;
  labYearlyNo: string;
  labDailyNo: string;
  patientType?: string;
  patientData: {
    firstName: string;
    lastName: string;
    fullName: string;
    age: string;
    gender: string;
    phone: string;
  };
  department: string;
  doctor: string;
  reportDate: string;
  registrationDate?: string;
  reportStatus: string;
  createdAt: string;
  testResults: any[];
  // Edited indicators (optional from backend)
  isEdited?: boolean;
  lastEditedAt?: string;
  lastEditedBy?: string;
  editHistory?: Array<{ editedAt: string; editedBy: string; changes: any }>;
}

@Component({
  selector: 'app-all-reports',
  templateUrl: './all-reports.component.html',
  styleUrls: ['./all-reports.component.css'],
  standalone: false
})
export class AllReportsComponent implements OnInit {

  // Data Properties
  allReports: (PathologyReport & { testNamesShort?: string })[] = [];
  filteredReports: (PathologyReport & { testNamesShort?: string })[] = [];
  paginatedReports: (PathologyReport & { testNamesShort?: string })[] = [];
  isLoading = false;

  // Search Properties
  searchTerm = '';
  searchType = 'patientName'; // patientName, receiptNo, labYearlyNo, labDailyNo, testNames

  // Pagination Properties
  currentPage = 1;
  itemsPerPage = 100;
  totalReports = 0;
  todayReports = 0;
  totalPages = 0;

  // Throttle timer for filters to avoid UI freezes on rapid typing
  private filterApplyTimer: any = null;
  private refreshTimeout: any = null;


  // Properties for WhatsApp sharing
  showWhatsAppModal = false;
  selectedReportForShare: any = null;
  whatsappNumber = '';
  isWhatsAppNumberValid = false;
  shareSuccessMessage = '';
  isGeneratingReport = false;
  selectedTimeFilter = 'all';

  // Modal Properties
  showViewModal = false;
  selectedReport: any = null;



  // Filter Properties
  filters = {
    receiptNo: '',
    labYearlyNo: '',
    particularDate: '',
    dateFrom: '',
    dateTo: '',
    month: '' // 1-12 as string; empty means all
  };

  // Edited dropdown state per report
  openEdited: { [id: string]: boolean } = {};

  private subscription = new Subscription();
  focusedReceiptNo: string | null = null;
  // Sequence guard to cancel stale loads
  private loadSeq = 0;



  // Quick Today filter state
  isTodayChecked = false;

  private getTodayStr(): string {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  onTodayToggle(checked: boolean): void {
    this.isTodayChecked = !!checked;
    if (this.isTodayChecked) {
      // Set single-date to today and clear other date filters
      this.filters.particularDate = this.getTodayStr();
      this.filters.dateFrom = '';
      this.filters.dateTo = '';
      this.filters.month = '';
    } else {
      if (this.filters.particularDate === this.getTodayStr()) {
        this.filters.particularDate = '';
      }
    }
    this.searchReports();
  }

  onParticularDateChange(): void {
    // Keep the Today checkbox in sync when user picks a specific date
    this.isTodayChecked = (this.filters.particularDate === this.getTodayStr());
    this.searchReports();
  }

  // In-memory response cache for ultra-fast navigation; cleared on filter changes
  private respCache = new Map<string, { ts: number; resp: any }>();
  private cacheTTL = 30000; // 30s is enough to feel instant while staying fresh

  private async httpGetCached(url: string): Promise<any> {
    const now = Date.now();
    const cached = this.respCache.get(url);
    if (cached && now - cached.ts < this.cacheTTL) {
      try { console.log('CACHING:', url.replace(environment.apiUrl, '')); } catch {}
      return cached.resp;
    }
    const resp = await firstValueFrom(this.http.get<any>(url));
    this.respCache.set(url, { ts: now, resp });
    return resp;
  }

  // When clearing inputs, remove filter immediately; Enter triggers exact server search
  onSearchInput(): void {
    if (!this.searchTerm || this.searchTerm.toString().trim() === '') {
      this.currentPage = 1;
      this.respCache.clear();
      this.loadAllReports();
    }
  }

  onFilterInput(field: 'receiptNo' | 'labYearlyNo'): void {
    const val = (this.filters as any)[field];
    if (!val || val.toString().trim() === '') {
      this.currentPage = 1;
      this.respCache.clear();
      this.loadAllReports();
    }
  }



  // Prefetch next/prev UI pages' first server page into cache to make navigation instant
  private prefetchAdjacentPages(): void {
    try {
      const serverChunk = 20;
      const mkStart = (uiPage: number) => Math.max(1, Math.floor(((uiPage - 1) * this.itemsPerPage) / serverChunk) + 1);
      const urls: string[] = [];
      if (this.currentPage < this.totalPages) {
        const nextStart = mkStart(this.currentPage + 1);
        urls.push(`${environment.apiUrl}/pathology-reports?${this.buildQueryParams(nextStart, serverChunk)}`);
      }
      if (this.currentPage > 1) {
        const prevStart = mkStart(this.currentPage - 1);
        urls.push(`${environment.apiUrl}/pathology-reports?${this.buildQueryParams(prevStart, serverChunk)}`);
      }
      urls.forEach(u => this.httpGetCached(u).catch(() => {}));
    } catch {}
  }

  constructor(
    private http: HttpClient,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private whatsappService: WhatsAppService,
    private pdfGenerator: PdfGeneratorService,
    private imageGenerator: ImageGeneratorService,
    private dataRefresh: DataRefreshService
  ) {}

  // Enrich a single receipt's TYPE from invoice and patch into lists
  async enrichTypeFromInvoice(receipt: string | number): Promise<void> {
    try {
      const rnum = parseInt(String(receipt));
      if (Number.isNaN(rnum)) return;
      const url = `${environment.apiUrl}/pathology-invoice/receipt/${rnum}`;
      const resp: any = await firstValueFrom(this.http.get<any>(url));
      const invoice = resp?.invoice || resp?.__enrichedInvoice || resp;
      const modeRaw = (invoice?.mode || invoice?.addressType || invoice?.patientType || invoice?.patient?.mode || invoice?.patient?.type || '').toString().trim().toUpperCase();
      if (modeRaw === 'IPD' || modeRaw === 'OPD') {
        const mode = modeRaw;
        // Patch existing arrays
        let changed = false;
        this.allReports = this.allReports.map(r => {
          if (String(r.receiptNo) === String(rnum)) {
            changed = true;
            return { ...r, patientType: mode };
          }
          return r;
        });
        this.filteredReports = this.filteredReports.map(r => {
          if (String(r.receiptNo) === String(rnum)) {
            return { ...r, patientType: mode };
          }
          return r;
        });
        if (changed) { this.cdr.detectChanges(); this.applyFiltersThrottled(); }
      }
    } catch (e) {
      console.warn('Could not enrich TYPE from invoice for', receipt, e);
    }
  }

  // Bulk enrich modes (OPD/IPD) for currently loaded reports
  private async bulkEnrichTypesFromInvoices(): Promise<void> {
    try {
      const receipts = Array.from(new Set(this.allReports
        .map(r => parseInt(String((r as any).receiptNo ?? (r as any).receiptNumber)))
        .filter(n => !Number.isNaN(n))));
      if (receipts.length === 0) return;

      // 1) Fast path: try bulk endpoint
      const url = `${environment.apiUrl}/pathology-invoice/receipt-modes?receipts=${receipts.join(',')}`;
      let modes: Record<number, string> = {};
      try {
        const resp: any = await firstValueFrom(this.http.get<any>(url));
        modes = resp?.modes || {};
      } catch {}

      let changed = false;
      this.allReports = this.allReports.map(r => {
        const rec = parseInt(String((r as any).receiptNo ?? (r as any).receiptNumber));
        const m = ((modes as any)[rec] ?? '')
          .toString()
          .trim()
          .toUpperCase();
        if (m === 'IPD' || m === 'OPD') {
          changed = true;
          return { ...r, patientType: m };
        }
        return r;
      });

      // 2) Fallback: for any unresolved receipts, hit per-receipt endpoint
      const unresolved = Array.from(new Set(this.allReports
        .filter(r => !(r.patientType === 'IPD' || r.patientType === 'OPD'))
        .map(r => parseInt(String((r as any).receiptNo ?? (r as any).receiptNumber)))
        .filter(n => !Number.isNaN(n))));

      if (unresolved.length > 0) {
        const fetches = unresolved.map(rec => firstValueFrom(
          this.http.get<any>(`${environment.apiUrl}/pathology-invoice/receipt/${rec}`)
        ).then(resp => {
          const inv = resp?.invoice || resp?.__enrichedInvoice || resp;
          const modeRaw = (inv?.mode || inv?.addressType || inv?.patientType || inv?.patient?.mode || inv?.patient?.type || '')
            .toString().trim().toUpperCase();
          return { rec, mode: (modeRaw === 'IPD' || modeRaw === 'OPD') ? modeRaw : '' };
        }).catch(() => ({ rec, mode: '' })));

        const results = await Promise.all(fetches);
        const perModes: Record<number, string> = {};
        results.forEach(r => { if (r.mode) perModes[r.rec] = r.mode; });

        if (Object.keys(perModes).length > 0) {
          this.allReports = this.allReports.map(r => {
            const rec = parseInt(String((r as any).receiptNo ?? (r as any).receiptNumber));
            const m = ((perModes as any)[rec] ?? '')
              .toString()
              .trim()
              .toUpperCase();
            if (m === 'IPD' || m === 'OPD') {
              changed = true;
              return { ...r, patientType: m };
            }
            return r;
          });
        }
      }

      if (changed) { this.cdr.detectChanges(); this.applyFiltersThrottled(); }
    } catch (e) {
      console.warn('bulkEnrichTypesFromInvoices failed', e);
    }
  }

  ngOnInit(): void {
    // Keep Date (Registration) empty by default (no auto-fill)

    // If navigated with a focus receipt, pre-fill the filter
    const focusReceipt = this.route.snapshot.queryParamMap.get('focusReceipt');
    if (focusReceipt) {
      this.filters.receiptNo = focusReceipt;
      this.focusedReceiptNo = focusReceipt;
      // Proactively enrich TYPE from invoice for the focused receipt to avoid OPD/IPD mismatch
      this.enrichTypeFromInvoice(focusReceipt);
    }
    this.loadAllReports();

    // Auto-refresh on pathology booking or report changes (debounced)
    this.subscription.add(
      this.dataRefresh.onEntityRefresh('pathology').subscribe(() => {
        if (this.isLoading) return;
        clearTimeout(this.refreshTimeout);
        this.refreshTimeout = setTimeout(() => this.loadAllReports(), 400);
      })
    );
  }

  // ✅ Helper to build query params consistently
  private buildQueryParams(page: number, limit: number): string {
    const params: string[] = [
      `page=${page}`,
      `limit=${limit}`,
      `enrich=false`,
      `patientType=OPD`,
      `_=${Date.now()}`
    ];

    // Date filters
    if (this.filters.particularDate) params.push(`particularDate=${encodeURIComponent(this.filters.particularDate)}`);
    if (this.filters.dateFrom) params.push(`dateFrom=${encodeURIComponent(this.filters.dateFrom)}`);
    if (this.filters.dateTo) params.push(`dateTo=${encodeURIComponent(this.filters.dateTo)}`);
    if (this.filters.month) params.push(`month=${encodeURIComponent(this.filters.month)}`);

    // Receipt and yearly no (server-side)
    if (this.filters.receiptNo) params.push(`receipt=${encodeURIComponent(this.filters.receiptNo)}`);
    if (this.filters.labYearlyNo) params.push(`labYearlyNo=${encodeURIComponent(this.filters.labYearlyNo)}`);

    // Search by patient name (server-side)
    const term = (this.searchTerm || '').trim();
    if (term && this.searchType === 'patientName') {
      params.push(`q=${encodeURIComponent(term)}`);
      params.push(`searchType=patientName`);
    } else if (term && this.searchType === 'receiptNo') {
      params.push(`receipt=${encodeURIComponent(term)}`);
    } else if (term && this.searchType === 'labYearlyNo') {
      params.push(`labYearlyNo=${encodeURIComponent(term)}`);
    }

    return params.join('&');
  }

  // ✅ Normalize/map backend rows
  private mapRows(data: any[]): any[] {
    return (data || []).map((r: any) => {
      const rawType = (r.patientType || r.type || r.addressType || r?.patientData?.patientType || r?.patientData?.type || r?.patientData?.registrationMode || '')
        .toString().trim().toUpperCase();
      const patientType = rawType === 'IPD' ? 'IPD' : (rawType === 'OPD' ? 'OPD' : '');
      const roomNo = r.roomNo || r.room || r?.doctor?.roomNumber || r?.patientData?.doctor?.roomNumber || '';
      return { ...r, patientType, roomNo, testNamesShort: this.getTestNamesShort(r.testResults) };
    });
  }

  // ✅ PROGRESSIVE LOAD: first 20, then next 20, then last 10 (to reach 50)
  async loadAllReports(): Promise<void> {
    this.isLoading = true;
    this.cdr.detectChanges();
    try {
      const seq = ++this.loadSeq;
      const serverChunk = 20; // keep server page size constant to maintain correct paging
      const startPage = Math.max(1, Math.floor(((this.currentPage - 1) * this.itemsPerPage) / serverChunk) + 1);

      const tStart = performance.now();
      const totalLabel = `UI Page ${this.currentPage} total-load`;
      console.time(totalLabel);
      console.log(`🔄 Loading UI page ${this.currentPage} (server pages starting at ${startPage})`);

      // 1) First fetch (serverChunk=20). Show only 10 immediately for faster first paint.
      const url1 = `${environment.apiUrl}/pathology-reports?${this.buildQueryParams(startPage, serverChunk)}`;
      const api1Label = `API page ${startPage} x${serverChunk}`;
      console.time(api1Label);
      const resp1: any = await firstValueFrom(this.http.get<any>(url1));
      console.timeEnd(api1Label);
      if (seq !== this.loadSeq) return; // stale response
      if (!resp1?.success) throw new Error('Failed to load reports');

      const data1: any[] = resp1.data || [];
      const pg1 = resp1.pagination || {};
      this.totalReports = pg1.totalReports || data1.length;
      this.totalPages = Math.max(1, Math.ceil(this.totalReports / this.itemsPerPage));

      const mapped1 = this.mapRows(data1);
      const firstPaintCount = Math.min(10, mapped1.length);
      const remainingFromFirst = mapped1.slice(firstPaintCount);

      this.allReports = mapped1.slice(0, firstPaintCount);
      this.filteredReports = [...this.allReports];
      this.calculateTodayReports();
      this.applyFiltersThrottled();
      // Show first results immediately
      this.isLoading = false;
      this.cdr.detectChanges();
      const firstPaint = Math.round(performance.now() - tStart);
      console.log(`⏱️ First results shown in ${firstPaint} ms`);

      // 2) Background chunks to reach itemsPerPage (100) using parallel fetches for speed
      let need = Math.max(0, Math.min(this.itemsPerPage, this.totalReports) - firstPaintCount);
      if (need > 0) {
        const fetches: Promise<any>[] = [];
        // enqueue pages after startPage using constant serverChunk
        const remainingAfterFirst = Math.max(0, need - remainingFromFirst.length);
        const chunks = Math.ceil(remainingAfterFirst / serverChunk);
        for (let k = 1; k <= chunks; k++) {
          const urlk = `${environment.apiUrl}/pathology-reports?${this.buildQueryParams(startPage + k, serverChunk)}`;
          const label = `API page ${startPage + k} x${serverChunk}`;
          fetches.push(
            (async () => {
              console.time(label);
              const r = await firstValueFrom(this.http.get<any>(urlk)).catch(() => ({ data: [] }));
              console.timeEnd(label);
              return r;
            })()
          );
        }
        console.time('API background chunks');
        const responses = await Promise.all(fetches);
        if (seq !== this.loadSeq) return; // stale response
        console.timeEnd('API background chunks');
        let extraData: any[] = [...remainingFromFirst];
        responses.forEach(r => {
          extraData = extraData.concat(this.mapRows(r?.data || []));
        });
        if (extraData.length > need) extraData = extraData.slice(0, need);
        this.allReports = [...this.allReports, ...extraData];
        this.filteredReports = [...this.allReports];
        this.applyFiltersThrottled();
        this.cdr.detectChanges();
        const totalMs = Math.round(performance.now() - tStart);
        console.timeEnd(totalLabel);
        console.log(`⏱️ Page filled to ${Math.min(this.itemsPerPage, this.totalReports)} in ${totalMs} ms`);
      }

      // Enrich TYPE from invoice in background
      setTimeout(() => this.bulkEnrichTypesFromInvoices(), 0);
      if (this.focusedReceiptNo) setTimeout(() => this.scrollToFocusedRow(), 150);

      console.log(`✅ Progressive load complete: ${this.allReports.length}/${Math.min(this.itemsPerPage, this.totalReports)} on UI page ${this.currentPage}`);
    } catch (error) {
      console.error('❌ Error loading reports:', error);
      alert('Error loading reports. Please try again.');
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  // Smooth scroll and highlight the focused receipt row
  private scrollToFocusedRow(): void {
    if (!this.focusedReceiptNo) return;

    const el = document.getElementById(`receipt-${this.focusedReceiptNo}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Temporary pulse highlight via class toggle
      el.classList.add('focused-row');
      setTimeout(() => el.classList.remove('focused-row'), 2500);
    }
  }

  // ✅ SEARCH REPORTS
  // Throttled server-side search (resets to page 1)
  searchReports(): void {
    clearTimeout(this.filterApplyTimer);
    this.filterApplyTimer = setTimeout(() => {
      this.currentPage = 1;
      this.loadAllReports();
    }, 200);
  }

  private applyFiltersThrottled(): void {
    clearTimeout(this.filterApplyTimer);
    this.filterApplyTimer = setTimeout(() => {
      this.applyFilters();
      // Zoneless CD: reflect filtered results
      this.cdr.detectChanges();
    }, 50);
  }

  // ✅ APPLY FILTERS (with optional search term and precomputed names)
  applyFilters(): void {
    const term = (this.searchTerm || '').trim().toLowerCase();
    const hasSearch = term.length > 0;

    this.filteredReports = this.allReports.filter(report => {
      // Enforce OPD-only results on this page
      const pType = ((report as any).patientType || '').toString().trim().toUpperCase();
      if (pType !== 'OPD') {
        return false;
      }
      // Receipt No Filter (normalize to string; support receiptNo or receiptNumber)
      if (this.filters.receiptNo) {
        const rstr = String((report as any).receiptNo ?? (report as any).receiptNumber ?? '').toLowerCase();
        if (!rstr.includes(String(this.filters.receiptNo).toLowerCase())) {
          return false;
        }
      }

      // Lab Yearly No Filter (normalize numeric/string)
      if (this.filters.labYearlyNo) {
        const ystr = String((report as any).labYearlyNo ?? '').toLowerCase();
        if (!ystr.includes(String(this.filters.labYearlyNo).toLowerCase())) {
          return false;
        }
      }

      // Particular Date Filter (by registrationDate)
      if (this.filters.particularDate) {
        const d = new Date((report as any).registrationDate || report.reportDate);
        const reportDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        if (reportDate !== this.filters.particularDate) {
          return false;
        }
      }

      // Date Range Filter (by registrationDate)
      if (this.filters.dateFrom || this.filters.dateTo) {
        const rDate = new Date((report as any).registrationDate || report.reportDate);

        if (this.filters.dateFrom) {
          const fromDate = new Date(this.filters.dateFrom);
          if (rDate < fromDate) {
            return false;
          }
        }

        if (this.filters.dateTo) {
          const toDate = new Date(this.filters.dateTo);
          toDate.setHours(23, 59, 59, 999); // Include full day
          if (rDate > toDate) {
            return false;
          }
        }
      }

      // Month filter (1-12) (by registrationDate)
      if (this.filters.month) {
        const d = new Date((report as any).registrationDate || report.reportDate);
        const monthNum = (d.getMonth() + 1).toString();
        if (monthNum !== this.filters.month) {
          return false;
        }
      }

      // Optional search term (throttled) - use precomputed testNamesShort
      if (hasSearch) {
        switch (this.searchType) {
          case 'patientName':
            return report.patientData.fullName.toLowerCase().includes(term);


          case 'receiptNo':
            return String(report.receiptNo).toLowerCase().includes(term);
          case 'labYearlyNo':
            return report.labYearlyNo && report.labYearlyNo.toLowerCase().includes(term);
          case 'labDailyNo':
            return report.labDailyNo && report.labDailyNo.toLowerCase().includes(term);
          case 'testNames':
            return (report.testNamesShort || '').toLowerCase().includes(term);
          default:
            return true;
        }
      }

      return true;
    });

    // If a single day is selected, order by LAB DAILY NO ascending for that date
    if (this.filters.particularDate && !this.filters.dateFrom && !this.filters.dateTo && !this.filters.month) {
      this.filteredReports.sort((a: any, b: any) => {
        const av = Number(a.labDailyNo ?? 0);
        const bv = Number(b.labDailyNo ?? 0);
        return av - bv;
      });
    }

    // Update pagination for filtered results (server-side pagination: keep totalPages)
    // Do not reset totalPages/currentPage here; they come from server
    this.updatePagination();

    console.log(`🔍 Filter results (current page): ${this.filteredReports.length} reports`);
  }

  trackByReportId(index: number, rpt: any): string {
    return rpt?._id || rpt?.reportId || `${index}`;
  }

  // ✅ CLEAR ALL FILTERS
  clearAllFilters(): void {
    this.filters = {
      receiptNo: '',
      labYearlyNo: '',
      particularDate: '',
      dateFrom: '',
      dateTo: '',
      month: ''
    };
    this.searchTerm = '';
    this.isTodayChecked = false;
    this.currentPage = 1;
    console.log('🗑️ All filters cleared');
    this.loadAllReports();
  }

  // ✅ CLEAR SEARCH (Legacy - keeping for compatibility)
  clearSearch(): void {
    this.clearAllFilters();
  }

  // Apply exact match when pressing Enter on specific filters
  async applyFiltersExact(field: 'receiptNo' | 'labYearlyNo' | 'patientName'): Promise<void> {
    const toStr = (v: any) => (v ?? '').toString().trim().toLowerCase();

    if (field === 'receiptNo') {
      const targetRaw = (this.filters.receiptNo || '').toString().trim();
      if (targetRaw) {
        await this.fetchByReceiptNo(targetRaw);
        return;
      }
    } else if (field === 'labYearlyNo') {
      // Server-side exact search for full dataset
      const target = toStr(this.filters.labYearlyNo);
      if (target) {
        this.currentPage = 1;
        await this.loadAllReports();
        return;
      }
    } else if (field === 'patientName') {
      const target = toStr(this.searchTerm);
      if (target) {
        this.currentPage = 1;
        await this.loadAllReports();
        return;
      }
    }

    // If nothing to search, just refresh current page
    this.currentPage = 1;
    await this.loadAllReports();
  }

  private async fetchByReceiptNo(receipt: string): Promise<void> {
    try {
      this.isLoading = true;
      this.cdr.detectChanges();
      const url = `${environment.apiUrl}/pathology-reports?receipt=${encodeURIComponent(receipt)}&limit=${this.itemsPerPage}&enrich=false&patientType=OPD&_=${Date.now()}`;
      const resp = await firstValueFrom(this.http.get<any>(url));
      const data: any[] = resp?.data || [];
      this.totalReports = resp?.pagination?.totalReports ?? data.length;
      this.totalPages = Math.max(1, Math.ceil(this.totalReports / this.itemsPerPage));
      this.currentPage = 1;
      this.allReports = data.map((r: any) => ({
        ...r,
        patientType: (r.patientType || '').toString().toUpperCase(),
        testNamesShort: this.getTestNamesShort(r.testResults)
      }));
      this.filteredReports = [...this.allReports];
      this.updatePagination();
      this.focusedReceiptNo = receipt;
      setTimeout(() => this.scrollToFocusedRow(), 100);
    } catch (e) {
      console.error('Receipt search failed', e);
      alert('No report found for this receipt');
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }


  // ✅ OPEN VIEW MODAL WITH DETAILED TEST RESULTS
  async openViewModal(report: PathologyReport): Promise<void> {
    console.log('👁️ Opening view modal for report:', report.reportId);

    try {
      // ✅ FETCH DETAILED REPORT DATA FROM BACKEND
      const response = await firstValueFrom(
        this.http.get<any>(`${environment.apiUrl}/pathology-reports/${report._id}`)
      );

      if (response.success && response.data) {
        // Merge with list item so fields enriched on list (like patientType) are preserved
        this.selectedReport = { ...report, ...response.data };
        console.log('✅ Detailed report data loaded:', this.selectedReport);
      } else {
        this.selectedReport = report;
        console.log('⚠️ Using basic report data');
      }
    } catch (error) {
      console.error('❌ Error fetching detailed report:', error);
      this.selectedReport = report;
    }

    this.showViewModal = true;
    this.cdr.detectChanges();
  }

  // ✅ CLOSE VIEW MODAL
  closeViewModal(): void {
    this.showViewModal = false;
    this.selectedReport = null;
  }

  // ✅ CHECK IF TEST RESULT IS ABNORMAL
  isAbnormalResult(test: any): boolean {
    if (!test.result || !test.normalValue) return false;

    const result = parseFloat(test.result);
    const normal = test.normalValue.toString().toLowerCase();

    if (normal.includes('-')) {
      const [min, max] = normal.split('-').map((val: string) => parseFloat(val.trim()));
      return result < min || result > max;
    }

    return false;
  }

  // ✅ GET PATIENT INITIALS FOR AVATAR
  getPatientInitials(patientData: any): string {
    if (!patientData) return 'P';

    const firstName = patientData.firstName || patientData.fullName?.split(' ')[0] || '';
    const lastName = patientData.lastName || patientData.fullName?.split(' ')[1] || '';

    const firstInitial = firstName.charAt(0).toUpperCase();
    const lastInitial = lastName.charAt(0).toUpperCase();

    return firstInitial + (lastInitial || '');
  }

  // ✅ GET TEST CATEGORIES FOR GROUPED DISPLAY
  getTestCategories(testResults: any[]): any[] {
    if (!testResults || testResults.length === 0) {
      return [];
    }

    // Group tests by category
    const categories: { [key: string]: any[] } = {};

    testResults.forEach(test => {
      const categoryName = test.category || test.testCategory || 'GENERAL TESTS';

      if (!categories[categoryName]) {
        categories[categoryName] = [];
      }

      categories[categoryName].push(test);
    });

    // Convert to array format for template
    return Object.keys(categories).map(categoryName => ({
      name: categoryName.toUpperCase(),
      tests: categories[categoryName]
    }));
  }

  // ✅ GET TEST NAME FOR CATEGORY
  getTestNameForCategory(categoryName: string): string {
    const testNameMapping: { [key: string]: string } = {
      'BIOCHEMISTRY': 'SERUM LIPID PROFILE',
      'HEMATOLOGY': 'COMPLETE BLOOD COUNT (CBC)',
      'SEROLOGY': 'SEROLOGY PANEL',
      'URINE': 'URINE ROUTINE EXAMINATION',
      'STOOL': 'STOOL EXAMINATION',
      'MICROBIOLOGY': 'CULTURE & SENSITIVITY',
      'PATHOLOGY': 'HISTOPATHOLOGY',
      'IMMUNOLOGY': 'IMMUNOLOGY PANEL',
      'ENDOCRINOLOGY': 'HORMONE PROFILE',
      'CARDIOLOGY': 'CARDIAC MARKERS',
      'GENERAL TESTS': 'GENERAL HEALTH CHECKUP'
    };

    return testNameMapping[categoryName.toUpperCase()] || categoryName.toUpperCase();
  }

  // ✅ GET MAX VALUE (AVOID DUPLICATES)
  getMaxValue(test: any): string {
    if (test.maxValue !== undefined && test.maxValue !== null && test.maxValue !== '') {
      return test.maxValue.toString();
    }

    // Extract max from normal value range (e.g., "125-200" -> "200")
    if (test.normalValue && typeof test.normalValue === 'string') {
      const rangeMatch = test.normalValue.match(/(\d+)-(\d+)/);
      if (rangeMatch) {
        return rangeMatch[2]; // Return the higher value
      }

      // Handle "< 100" format
      const lessThanMatch = test.normalValue.match(/< (\d+)/);
      if (lessThanMatch) {
        return lessThanMatch[1];
      }

      // Handle "> 40" format
      const greaterThanMatch = test.normalValue.match(/> (\d+)/);
      if (greaterThanMatch) {
        return (parseInt(greaterThanMatch[1]) + 50).toString(); // Add buffer
      }
    }

    return '-';
  }

  // ✅ GET MIN VALUE (AVOID DUPLICATES)
  getMinValue(test: any): string {
    if (test.minValue !== undefined && test.minValue !== null && test.minValue !== '') {
      return test.minValue.toString();
    }

    // Extract min from normal value range (e.g., "125-200" -> "125")
    if (test.normalValue && typeof test.normalValue === 'string') {
      const rangeMatch = test.normalValue.match(/(\d+)-(\d+)/);
      if (rangeMatch) {
        return rangeMatch[1]; // Return the lower value
      }

      // Handle "< 100" format
      const lessThanMatch = test.normalValue.match(/< (\d+)/);
      if (lessThanMatch) {
        return '0';
      }

      // Handle "> 40" format
      const greaterThanMatch = test.normalValue.match(/> (\d+)/);
      if (greaterThanMatch) {
        return greaterThanMatch[1];
      }
    }

    return '-';
  }

  // ✅ EDIT REPORT
  editReport(report: PathologyReport): void {
    console.log('✏️ Editing report:', report.reportId);
    // Navigate to test-report component in edit mode
    this.router.navigate(['/pathology-module/test-report'], {
      queryParams: {
        reportId: report._id,
        receiptNo: report.receiptNo,
        mode: 'edit'
      }
    });
  }

  // ✅ PRINT REPORT
  printReport(report: PathologyReport): void {
    console.log('🖨️ Printing report:', report.reportId);
    // Navigate to test-report component in print mode
    this.router.navigate(['/pathology-module/test-report'], {
      queryParams: {
        reportId: report._id,
        receiptNo: report.receiptNo,
        mode: 'print'
      }
    });
  }

  // ✅ DELETE REPORT
  async deleteReport(report: PathologyReport): Promise<void> {
    if (!confirm(`Are you sure you want to delete report ${report.reportId}?`)) {
      return;
    }

    this.isLoading = true;
    try {
      console.log('🗑️ Deleting report:', report.reportId);

      const response = await firstValueFrom(
        this.http.delete<any>(`${environment.apiUrl}/pathology-reports/${report._id}`)
      );

      if (response.success) {
        alert('Report deleted successfully!');
        // Remove from local arrays
        this.allReports = this.allReports.filter(r => r._id !== report._id);
        this.filteredReports = this.filteredReports.filter(r => r._id !== report._id);
        this.totalReports--;
        this.cdr.detectChanges();
      }
    } catch (error) {
      console.error('❌ Error deleting report:', error);
      alert('Error deleting report. Please try again.');
    } finally {
      this.isLoading = false;
    }
  }

  // ✅ PAGINATION
  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      console.log(`➡️ Go to page ${page}`);
      this.currentPage = page;
      this.loadAllReports();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      console.log(`➡️ Next page ${this.currentPage + 1}`);
      this.currentPage++;
      this.loadAllReports();
    }
  }

  prevPage(): void {
    if (this.currentPage > 1) {
      console.log(`⬅️ Prev page ${this.currentPage - 1}`);
      this.currentPage--;
      this.loadAllReports();
    }
  }

  // Client-side pagination helpers
  private updatePagination(): void {
    // Server-side pagination: do NOT recompute totalPages here; keep server value
    // The filteredReports already contains only the current page worth of data
    this.paginatedReports = [...(this.filteredReports || [])];
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxVisible = 5;
    const start = Math.max(1, this.currentPage - Math.floor(maxVisible / 2));
    const end = Math.min(this.totalPages, start + maxVisible - 1);
    for (let p = start; p <= end; p++) pages.push(p);
    return pages;
  }

  getEndIndex(): number {
    const total = this.totalReports || 0;
    return Math.min(this.currentPage * this.itemsPerPage, total);
  }


  // ✅ REFRESH DATA
  refreshReports(): void {
    this.currentPage = 1;
    this.loadAllReports();
  }

  // ✅ FORMAT DATE
  formatDate(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN');
  }

  // ✅ AGE WITH UNIT (Year/Month/Day)
  getAgeWithUnit(rpt: any): string {
    if (!rpt) return '';
    // If age already includes unit like "12 Y" or "3 D", keep it
    const existing = (rpt?.patientData?.age || rpt?.patient?.age || rpt?.age || '').toString().trim();
    if (/^\d+\s*[YMD]$/i.test(existing)) return existing.toUpperCase();

    const age = existing.replace(/[^0-9]/g, '');
    const rawUnit = (rpt?.patientData?.ageIn || rpt?.patient?.ageIn || rpt?.ageIn || '')
      .toString()
      .trim()
      .toUpperCase();

    const unit = rawUnit === 'Y' || rawUnit.startsWith('YEAR') ? 'Year'
      : (rawUnit === 'M' || rawUnit.startsWith('MON')) ? 'Month'
      : (rawUnit === 'D' || rawUnit.startsWith('DAY')) ? 'Day'
      : '';

    return age ? `${age}${unit ? ' ' + unit : ''}` : existing;
  }



  // ✅ GET STATUS CLASS
  getStatusClass(status: string): string {
    switch (status.toLowerCase()) {
      case 'completed':
        return 'status-completed';
      case 'pending':
        return 'status-pending';
      case 'in-progress':
        return 'status-progress';
      default:
        return 'status-default';
    }
  }

  // ✅ GET TEST NAMES SHORT
  getTestNamesShort(testResults: any[]): string {
    if (!testResults || testResults.length === 0) {
      return 'No tests';
    }

    // Extract test names and create short version
    const testNames = testResults.map(test => {
      if (test.testName) {
        return test.testName;
      } else if (test.name) {
        return test.name;
      } else if (test.category) {
        return test.category;
      }
      return 'Unknown Test';
    });

    // Join with commas and limit length
    const joinedNames = testNames.join(', ');

    // If too long, truncate and add "..."
    if (joinedNames.length > 50) {
      return joinedNames.substring(0, 47) + '...';
    }

    return joinedNames;
  }

  // Calculate today's reports count
  calculateTodayReports(): void {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`; // YYYY-MM-DD format

    this.todayReports = this.allReports.filter(report => {
      const raw = (report as any).registrationDate || report.reportDate;
      if (raw) {
        const d = new Date(raw);
        const reportDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        return reportDate === todayStr;
      }
      return false;
    }).length;
  }

  // Time filter dropdown change handler (legacy support from dropdown)
  onTimeFilterChange(): void {
    if (!this.selectedTimeFilter) {
      return;
    }
    this.setQuickFilter(this.selectedTimeFilter as any);
  }

  // New quick filter handler for pill buttons
  setQuickFilter(range: 'all' | 'today' | 'yesterday' | 'week' | 'lastMonth' | 'year'): void {
    this.selectedTimeFilter = range;

    const today = new Date();

    switch (range) {
      case 'all':
        this.filters.particularDate = '';
        this.filters.dateFrom = '';
        this.filters.dateTo = '';
        break;

      case 'today':
        this.filters.particularDate = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
        this.filters.dateFrom = '';
        this.filters.dateTo = '';
        break;

      case 'yesterday':
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        this.filters.particularDate = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,'0')}-${String(yesterday.getDate()).padStart(2,'0')}`;
        this.filters.dateFrom = '';
        this.filters.dateTo = '';
        break;

      case 'week':
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        this.filters.particularDate = '';
        this.filters.dateFrom = `${weekStart.getFullYear()}-${String(weekStart.getMonth()+1).padStart(2,'0')}-${String(weekStart.getDate()).padStart(2,'0')}`;
        this.filters.dateTo = `${weekEnd.getFullYear()}-${String(weekEnd.getMonth()+1).padStart(2,'0')}-${String(weekEnd.getDate()).padStart(2,'0')}`;
        break;

      case 'lastMonth':
        const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
        this.filters.particularDate = '';
        this.filters.dateFrom = `${lastMonthStart.getFullYear()}-${String(lastMonthStart.getMonth()+1).padStart(2,'0')}-${String(lastMonthStart.getDate()).padStart(2,'0')}`;
        this.filters.dateTo = `${lastMonthEnd.getFullYear()}-${String(lastMonthEnd.getMonth()+1).padStart(2,'0')}-${String(lastMonthEnd.getDate()).padStart(2,'0')}`;
        break;

      case 'year':
        const yearStart = new Date(today.getFullYear(), 0, 1);
        const yearEnd = new Date(today.getFullYear(), 11, 31);
        this.filters.particularDate = '';
        this.filters.dateFrom = `${yearStart.getFullYear()}-${String(yearStart.getMonth()+1).padStart(2,'0')}-${String(yearStart.getDate()).padStart(2,'0')}`;
        this.filters.dateTo = `${yearEnd.getFullYear()}-${String(yearEnd.getMonth()+1).padStart(2,'0')}-${String(yearEnd.getDate()).padStart(2,'0')}`;
        break;
    }

    // Server-side refresh for quick filters
    this.currentPage = 1;
    this.loadAllReports();
  }

  // ✅ WHATSAPP SHARING METHODS

  // Open WhatsApp share modal
  shareOnWhatsApp(report: PathologyReport): void {
    console.log('📱 Opening WhatsApp share modal for report:', report.reportId);
    console.log('📱 Report data:', report);
    this.selectedReportForShare = report;

    // Auto-populate phone number if available
    this.initializeWhatsAppNumber(report);

    this.showWhatsAppModal = true;
    this.cdr.detectChanges();
  }

  // Initialize WhatsApp number from report data
  private initializeWhatsAppNumber(report: PathologyReport): void {
    console.log('📱 Initializing WhatsApp number for report...');
    console.log('📱 Patient data:', report.patientData);

    let phone = '';

    // Try multiple data structure patterns
    if (report.patientData) {
      // Pattern 1: Direct phone field
      phone = report.patientData.phone || (report.patientData as any).mobile || '';

      // Pattern 2: Check for phoneNumber or mobileNumber
      if (!phone) {
        phone = (report.patientData as any).phoneNumber || (report.patientData as any).mobileNumber || '';
      }
    }

    console.log('📱 Found phone number:', phone);

    if (phone) {
      // Clean and format phone number for WhatsApp
      const cleanPhone = phone.replace(/\D/g, ''); // Remove non-digits

      // Ensure proper formatting for direct WhatsApp links
      if (cleanPhone.length === 10) {
        this.whatsappNumber = `+91${cleanPhone}`;
      } else if (cleanPhone.startsWith('91') && cleanPhone.length === 12) {
        this.whatsappNumber = `+${cleanPhone}`;
      } else {
        this.whatsappNumber = `+91${cleanPhone}`;
      }

      this.validateWhatsAppNumber();
      console.log('📱 Formatted WhatsApp number for direct sharing:', this.whatsappNumber);
    } else {
      console.log('⚠️ No phone number found in report data');
      this.whatsappNumber = '';
      this.isWhatsAppNumberValid = false;
    }
  }

  // Close WhatsApp modal
  closeWhatsAppModal(): void {
    this.showWhatsAppModal = false;
    this.selectedReportForShare = null;
    this.whatsappNumber = '';
    this.isWhatsAppNumberValid = false;
    this.isGeneratingReport = false;
    this.shareSuccessMessage = '';
  }

  // Validate WhatsApp number
  validateWhatsAppNumber(): void {
    const phoneRegex = /^\+91[6-9]\d{9}$/;
    this.isWhatsAppNumberValid = phoneRegex.test(this.whatsappNumber);
  }

  // Share report as text
  shareReportAsText(): void {
    if (!this.isWhatsAppNumberValid || !this.selectedReportForShare) {
      alert('Please enter a valid WhatsApp number');
      return;
    }

    console.log('📝 Sharing report as text...');
    const textReport = this.generateTextReport(this.selectedReportForShare);

    this.whatsappService.shareTextMessage({
      phoneNumber: this.whatsappNumber,
      message: textReport
    });

    this.closeWhatsAppModal();
    this.showSuccessMessage('Text report shared successfully!');
  }

  // Share report as PDF
  async shareReportAsPDF(): Promise<void> {
    if (!this.isWhatsAppNumberValid || !this.selectedReportForShare) {
      alert('Please enter a valid WhatsApp number');
      return;
    }

    this.isGeneratingReport = true;
    this.shareSuccessMessage = '📄 Generating PDF report...';

    try {
      console.log('📄 Generating PDF for direct WhatsApp sharing...');
      const pdfBlob = await this.generatePDFReport(this.selectedReportForShare);

      this.shareSuccessMessage = '📎 Preparing file for WhatsApp...';
      this.shareFileViaWhatsApp(pdfBlob, 'pdf');

      this.closeWhatsAppModal();
      this.shareSuccessMessage = '🚀 PDF ready! WhatsApp opening to patient number...';

      // Clear success message after delay
      setTimeout(() => {
        this.shareSuccessMessage = '';
      }, 5000);

    } catch (error) {
      console.error('❌ Error sharing PDF:', error);
      this.shareSuccessMessage = '❌ Error generating PDF. Please try again.';
      setTimeout(() => {
        this.shareSuccessMessage = '';
      }, 3000);
    } finally {
      this.isGeneratingReport = false;
    }
  }

  // Share report as image
  async shareReportAsImage(): Promise<void> {
    if (!this.isWhatsAppNumberValid || !this.selectedReportForShare) {
      alert('Please enter a valid WhatsApp number');
      return;
    }

    this.isGeneratingReport = true;
    try {
      console.log('🖼️ Generating image for sharing...');
      const imageBlob = await this.generateImageReport(this.selectedReportForShare);
      this.shareFileViaWhatsApp(imageBlob, 'image');
      this.showSuccessMessage('Image report generated and shared successfully!');
    } catch (error) {
      console.error('❌ Error sharing image:', error);
      alert('Error generating image. Please try again.');
    } finally {
      this.isGeneratingReport = false;
    }
  }

  // Share report directly (quick message)
  shareReportDirectly(): void {
    if (!this.isWhatsAppNumberValid || !this.selectedReportForShare) {
      alert('Please enter a valid WhatsApp number');
      return;
    }

    console.log('📱 Sharing report directly...');
    const quickMessage = `🏥 *PATHOLOGY TEST REPORT*\n\n👤 *Patient:* ${this.selectedReportForShare.patientData.fullName}\n📋 *Receipt:* ${this.selectedReportForShare.receiptNo}\n📅 *Date:* ${new Date(this.selectedReportForShare.reportDate).toLocaleDateString('en-IN')}\n\n✅ Report is ready for collection.\n\nPlease visit the hospital to collect your detailed report.`;

    this.whatsappService.shareTextMessage({
      phoneNumber: this.whatsappNumber,
      message: quickMessage
    });

    this.closeWhatsAppModal();
    this.showSuccessMessage('Quick message sent successfully!');
  }

  // Generate text report
  generateTextReport(report: PathologyReport): string {
    const reportData = {
      hospitalName: 'PATHOLOGY TEST REPORT',
      patientName: report.patientData.fullName,
      age: report.patientData.age,
      gender: report.patientData.gender,
      receiptNo: report.receiptNo,
      reportDate: report.reportDate,
      testResults: report.testResults
    };

    return this.whatsappService.generateMedicalReportMessage(reportData);
  }

  // Generate PDF report
  async generatePDFReport(report: PathologyReport): Promise<Blob> {
    console.log('📄 Generating PDF report...');

    try {
      const reportData = {
        patientName: report.patientData.fullName,
        age: report.patientData.age,
        gender: report.patientData.gender,
        receiptNo: report.receiptNo,
        reportDate: report.reportDate,
        labYearlyNo: report.labYearlyNo,
        labDailyNo: report.labDailyNo,
        doctorName: report.doctor,
        department: report.department,
        testResults: report.testResults
      };

      return await this.pdfGenerator.generatePathologyReport(reportData);
    } catch (error) {
      console.error('❌ Error generating PDF:', error);
      // Fallback to simple text
      const textReport = this.generateTextReport(report);
      return new Blob([textReport], { type: 'text/plain' });
    }
  }

  // Generate image report
  async generateImageReport(report: PathologyReport): Promise<Blob> {
    console.log('🖼️ Generating image report...');

    try {
      const reportData = {
        patientName: report.patientData.fullName,
        age: report.patientData.age,
        gender: report.patientData.gender,
        receiptNo: report.receiptNo,
        reportDate: report.reportDate,
        labYearlyNo: report.labYearlyNo,
        labDailyNo: report.labDailyNo,
        doctorName: report.doctor,
        department: report.department,
        testResults: report.testResults
      };

      return await this.imageGenerator.generateReportImage(reportData);
    } catch (error) {
      console.error('❌ Error generating image:', error);
      // Fallback to simple text
      const textReport = this.generateTextReport(report);
      return new Blob([textReport], { type: 'text/plain' });
    }
  }

  // Share file via WhatsApp with enhanced attachment support
  shareFileViaWhatsApp(fileBlob: Blob, type: 'pdf' | 'image'): void {
    try {
      const fileName = `${this.selectedReportForShare?.patientData.fullName}_Report_${this.selectedReportForShare?.receiptNo}.${type === 'pdf' ? 'pdf' : 'png'}`;

      // Enhanced message for file sharing
      const message = `🏥 *PATHOLOGY TEST REPORT*\n\n👤 *Patient:* ${this.selectedReportForShare?.patientData.fullName}\n📋 *Receipt:* ${this.selectedReportForShare?.receiptNo}\n📅 *Date:* ${new Date(this.selectedReportForShare?.reportDate || '').toLocaleDateString('en-IN')}\n\n📎 *${type.toUpperCase()} Report Ready!*`;

      // Use enhanced WhatsApp service with file attachment
      this.whatsappService.shareFile({
        phoneNumber: this.whatsappNumber,
        message: message,
        fileBlob: fileBlob,
        fileName: fileName
      });

      this.closeWhatsAppModal();
      this.showSuccessMessage(`🚀 Enhanced ${type.toUpperCase()} sharing activated! Check your WhatsApp.`);

    } catch (error) {
      console.error('❌ Error sharing file via WhatsApp:', error);
      alert('Error sharing file. Please try again.');
    }
  }

  // Smart Share - AI-powered sharing with best method detection
  async shareSmartly(): Promise<void> {
    if (!this.isWhatsAppNumberValid || !this.selectedReportForShare) {
      alert('Please enter a valid WhatsApp number');
      return;
    }

    console.log('🚀 Starting Smart Share for all-reports...');
    this.isGeneratingReport = true;

    try {
      // Show smart sharing notification
      this.shareSuccessMessage = '🤖 Smart Share analyzing best sharing method...';

      // Detect best sharing method based on device and capabilities
      const bestMethod = await this.detectBestSharingMethod();

      this.shareSuccessMessage = `🎯 Smart Share selected: ${bestMethod}`;

      // Always use direct PDF sharing for Smart Share
      console.log('🚀 Smart Share: Using direct PDF sharing to patient WhatsApp');
      await this.shareReportAsPDF();

    } catch (error) {
      console.error('❌ Smart Share failed:', error);
      // Fallback to text sharing
      this.shareReportAsText();
    } finally {
      this.isGeneratingReport = false;
    }
  }

  // Detect the best sharing method for current device/browser
  private async detectBestSharingMethod(): Promise<string> {
    // Always prefer direct WhatsApp sharing for specific phone numbers
    // This ensures we go directly to the patient's WhatsApp without contact selection
    console.log('🎯 Smart Share: Selecting direct WhatsApp method for patient number');

    // Check clipboard API for images as secondary option
    if ('clipboard' in navigator && 'write' in navigator.clipboard) {
      try {
        // Test if we can write to clipboard
        await navigator.clipboard.writeText('test');
        return 'Clipboard + Text';
      } catch (e) {
        // Clipboard not available
      }
    }

    // Check if mobile device (prefer image for mobile)
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
      return 'Enhanced Image';
    }

    // Desktop - prefer PDF
    return 'Enhanced PDF';
  }

  // Share via Web Share API (most advanced)
  private async shareViaWebShareAPI(): Promise<void> {
    try {
      // Generate PDF for sharing
      const pdfBlob = await this.generatePDFReport(this.selectedReportForShare!);
      const file = new File([pdfBlob], `${this.selectedReportForShare?.patientData.fullName}_Report_${this.selectedReportForShare?.receiptNo}.pdf`, {
        type: 'application/pdf'
      });

      const shareData = {
        title: '🏥 Pathology Test Report',
        text: `Pathology report for ${this.selectedReportForShare?.patientData.fullName} (Receipt: ${this.selectedReportForShare?.receiptNo})`,
        files: [file]
      };

      await navigator.share(shareData);
      this.closeWhatsAppModal();
      this.showSuccessMessage('🚀 Smart Share completed successfully!');

    } catch (error) {
      console.error('❌ Web Share API failed:', error);
      throw error;
    }
  }

  // Share via clipboard + text message
  private async shareViaClipboardAndText(): Promise<void> {
    try {
      // Generate image and copy to clipboard
      const imageBlob = await this.generateImageReport(this.selectedReportForShare!);
      const clipboardItem = new ClipboardItem({
        [imageBlob.type]: imageBlob
      });

      await navigator.clipboard.write([clipboardItem]);

      // Then send text message with instructions
      const message = `🏥 *PATHOLOGY TEST REPORT*\n\n👤 *Patient:* ${this.selectedReportForShare?.patientData.fullName}\n📋 *Receipt:* ${this.selectedReportForShare?.receiptNo}\n📅 *Date:* ${new Date(this.selectedReportForShare?.reportDate || '').toLocaleDateString('en-IN')}\n\n📋 *Report image copied to clipboard!*\n\n💡 *To send:*\n1️⃣ Click in WhatsApp message box\n2️⃣ Press Ctrl+V (or Cmd+V on Mac)\n3️⃣ The report image will appear\n4️⃣ Click Send!\n\n✨ Smart Share made it easy!`;

      this.whatsappService.shareTextMessage({
        phoneNumber: this.whatsappNumber,
        message: message
      });

      this.closeWhatsAppModal();
      this.showSuccessMessage('📋 Smart Share: Image copied! Press Ctrl+V in WhatsApp.');

    } catch (error) {
      console.error('❌ Clipboard sharing failed:', error);
      throw error;
    }
  }



  // Show success message
  showSuccessMessage(message: string): void {
    this.shareSuccessMessage = message;

    // Clear success message after 5 seconds for smart share
    setTimeout(() => {
      this.shareSuccessMessage = '';
    }, 5000);
  }
}

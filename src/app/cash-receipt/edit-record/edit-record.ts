import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, NavigationEnd } from '@angular/router';
import { Subscription } from 'rxjs';
import { PathologyInvoiceService } from '../../services/pathology-invoice.service';
import { DataRefreshService } from '../../core/services/data-refresh.service';

import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

import { PatientService } from '../../reception/patient.service';
import { AlertService } from '../../shared/services/alert.service';

import { LabSettingsService, LabSettings } from '../../setup/lab-setup/lab-settings.service';

@Component({

  selector: 'app-edit-record',
  standalone: false,
  templateUrl: './edit-record.html',
  styleUrls: ['./edit-record.css']
})
export class EditRecord implements OnInit, OnDestroy {

  // Data properties
  invoiceRecords: any[] = [];
  filteredRecords: any[] = [];
  selectedRecord: any = null;
  editForm!: FormGroup;

  // UI properties
  isLoading = false;
  isPageLoading = false;
  isEditing = false;
  showEditModal = false;
  // View modal state
  // Lab branding settings (used for header/footer/logo)
  labSettings: LabSettings | null = null;

  showViewModal = false;
  selectedViewRecord: any = null;
  // Edit-audit modal state
  showEditAuditModal = false;
  selectedAuditRecord: any = null;
  // Delete modal state (use the same component as Alter OPD)
  showDeleteConfirmation = false;
  showDeleteSuccess = false;
  deleteMessage = '';
  recordToDelete: any = null;
  deleting = false;
  // Center success modal content
  deleteSuccessTitle: string = 'Deleted Successfully!';
  deleteSuccessMessage: string = '';
  // Expanded previous-values state per record id
  expandedRows: { [id: string]: boolean } = {};

  // Global last receipt number (for delete button visibility)
  lastReceiptNumber: number = 0;

  // Show delete only for the latest global receipt number
  isLastReceipt(record: any): boolean {
    return Number(record?.receiptNumber) === Number(this.lastReceiptNumber);
  }


  // Invoice data for printing
  invoiceData: any = null;
  // Logo for print
  logoBase64: string = '';

  // Filter properties
  receiptNoTerm = '';
  searchTerm = '';
  dateFilter = '';
  // Removed from UI: departmentFilter; kept for backward compatibility (not used in filters)
  departmentFilter = '';
  paymentModeFilter: '' | 'CASH' | 'CARD' | 'UPI' = '';
  visitModeFilter: string = '';

  // Pagination (disabled visually; keep values for compatibility)
  currentPage = 1;
  itemsPerPage = 100;
  totalItems = 0;
  totalPages = 1;
  paginatedRecords: any[] = [];
  // Authoritative revenue totals from backend
  private todayRevenueTotal: number = 0;
  private overallRevenueTotal: number = 0;

  pages: number[] = []; // for simple page buttons
  pageList: Array<number | string> = []; // for ellipsis-style pager
  useServerPagination = false; // true when backend provides paged data

  private routerSub?: any;
  // cache and de-dupe fetches for patient snapshot refresh
  private patientSnapshotFetched: { [id: string]: number } = {};
  private pathologySub?: Subscription;

  constructor(
    private fb: FormBuilder,
    private pathologyInvoiceService: PathologyInvoiceService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private dataRefresh: DataRefreshService,
    private patientService: PatientService,
    private alertService: AlertService,
    private http: HttpClient,
    private labService: LabSettingsService
  ) {}

  ngOnInit(): void {
    console.log('🎯 Edit Record Component Loaded!');
    this.initializeEditForm();

    // Load lab settings for header/footer/logo
    try {
      const cached = localStorage.getItem('labSettings');
      if (cached) this.labSettings = JSON.parse(cached);
    } catch {}
    try {
      this.labService.getMyLab().subscribe({
        next: (res) => {
          this.labSettings = res.lab || this.labSettings;
          if (this.labSettings?.logoDataUrl) this.logoBase64 = this.labSettings.logoDataUrl;
          this.cdr.detectChanges();
        },
        error: () => {}
      });
    } catch {}

    this.loadLogoForPrint();
    this.loadInvoiceRecords();

    // Get latest receipt number (global) so delete button appears only on last receipt
    this.pathologyInvoiceService.getLastReceipt().subscribe({
      next: (res) => {
        this.lastReceiptNumber = Number((res as any)?.lastReceiptNumber || 0);
        this.cdr.detectChanges();
      },
      error: () => { this.lastReceiptNumber = 0; }
    });

    this.loadRevenueAggregates();

    // Auto-refresh when navigating to this route
    this.routerSub = this.router.events.subscribe((evt) => {
      if (evt instanceof NavigationEnd) {
        const url = (evt.urlAfterRedirects || evt.url || '').toString();
        if (url.includes('/cash-receipt/edit-record')) {
          this.refreshData();
        }
      }
    });

    // Auto-refresh when pathology invoices are created/updated (no manual refresh needed)
    this.pathologySub = this.dataRefresh.onEntityRefresh('pathology').subscribe((evt) => {
      console.log('🔔 EditRecord: pathology event received', evt);
      this.refreshData();
    });
  }

  initializeEditForm(): void {
    this.editForm = this.fb.group({
      receiptNumber: ['', Validators.required],
      patientName: ['', Validators.required],
      patientPhone: ['', Validators.required],
      patientAge: ['', [Validators.required, Validators.min(1)]],
      patientGender: ['', Validators.required],
      patientAddress: ['', Validators.required],
      department: ['', Validators.required],
      doctorName: ['', Validators.required],
      totalAmount: ['', [Validators.required, Validators.min(0)]],
      paymentMethod: ['CASH', Validators.required],
      remarks: ['']
    });
  }

  // Load logo for print; prefer Lab Settings logo, fallback to assets
  loadLogoForPrint(): void {
    try {
      if (this.labSettings?.logoDataUrl) {
        this.logoBase64 = this.labSettings.logoDataUrl;
        return;
      }
      const cached = localStorage.getItem('labSettings');
      if (cached) {
        const obj = JSON.parse(cached);
        if (obj?.logoDataUrl) {
          this.logoBase64 = obj.logoDataUrl;
          return;
        }
      }
    } catch {}
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx?.drawImage(img, 0, 0);
        this.logoBase64 = canvas.toDataURL('image/png');
        console.log('✅ EditRecord: Fallback logo loaded for print');
      };
      img.onerror = () => {
        console.warn('⚠️ EditRecord: Fallback logo failed to load');
        this.logoBase64 = '';
      };
      img.src = 'assets/images/upremovebg.png';
    } catch (e) {
      console.warn('⚠️ EditRecord: Error preparing logo for print', e);
      this.logoBase64 = '';
    }
  }

  loadInvoiceRecords(page?: number, soft?: boolean): void {
    if (page && page > 0) this.currentPage = page;
    if (soft) { this.isPageLoading = true; } else { this.isLoading = true; }
    console.log('📋 Loading invoice records...');

    // Load from backend (authoritative data)
    this.pathologyInvoiceService.getAllInvoices(this.currentPage, this.itemsPerPage).subscribe({
      next: (response) => {
        console.log('✅ Backend response:', response);
        if (response.success && response.invoices && response.invoices.length > 0) {
          console.log('🔍 Processing backend invoices:', response.invoices.length);
          console.log('🔍 Sample invoice structure:', response.invoices[0]);

          // Process backend data to ensure proper structure
          this.invoiceRecords = response.invoices.map((invoice: any, index: number) => {
            console.log(`🔍 Processing invoice ${index + 1}:`, invoice);
            console.log(`🔍 Patient data in invoice ${index + 1}:`, invoice.patient);

            const processedInvoice = {
              ...invoice,
              // Carry reference to patient ObjectId for live snapshot
              patientRef: invoice.patientRef || invoice.patient?._id || (invoice.patientDetails as any)?._id,
              // Ensure receipt number is properly displayed
              receiptNumber: invoice.receiptNumber || (index + 1),
              // Preserve and lift registration number for table column (fall back ONLY to patient.registrationNumber, never UHID/patientId)
              registrationNumber: invoice.registrationNumber || invoice.patient?.registrationNumber || (invoice.patientDetails as any)?.registrationNumber || '',
              // FIXED: Enhanced patient data structure mapping with better extraction
              patient: {
                _id: invoice.patient?._id || invoice.patientRef,
                name: this.extractPatientName(invoice),
                registrationNumber: invoice.patient?.registrationNumber || (invoice.patientDetails as any)?.registrationNumber || '',
                age: this.extractPatientAge(invoice),
                ageIn: (invoice.patient?.ageIn || (invoice.patientDetails as any)?.ageIn || ''),
                gender: this.extractPatientGender(invoice),
                phone: this.extractPatientPhone(invoice),
                address: this.extractPatientAddress(invoice)
              },
              // Ensure payment data structure
              payment: {
                totalAmount: invoice.payment?.totalAmount || 0,
                paymentMethod: invoice.payment?.paymentMethod || 'CASH',
                paymentStatus: invoice.payment?.paymentStatus || 'PAID'
              },
              // Ensure department data
              department: {
                name: invoice.department?.name || 'PATHOLOGY'
              }
            };

            console.log(`✅ Processed invoice ${index + 1} patient name:`, processedInvoice.patient.name);
            return processedInvoice;
          });

          // Sort by date - latest first
          this.invoiceRecords.sort((a, b) => {
            const dateA = new Date(a.bookingDate || a.createdAt || new Date());
            const dateB = new Date(b.bookingDate || b.createdAt || new Date());
            return dateB.getTime() - dateA.getTime();
          });

          // Server-side pagination: backend returns one page slice + totals
          this.filteredRecords = [...this.invoiceRecords];
          // Use server pagination object when available (matches backend /pathology-invoice/list)
          const pg = (response && response.pagination) ? response.pagination : {} as any;
          // total items across all pages
          this.totalItems = Number(
            (pg as any)?.total ?? (pg as any)?.totalInvoices ?? (pg as any)?.totalItems ??
            response?.total ?? response?.totalCount ?? response?.count ?? response?.totalDocuments ?? 0
          );
          // total pages
          this.totalPages = Number(
            (pg as any)?.pages ?? (pg as any)?.totalPages ?? response?.totalPages ?? Math.max(1, Math.ceil((this.totalItems || 0) / this.itemsPerPage))
          );
          // current page from server if provided
          if (typeof (pg as any)?.page === 'number') {
            this.currentPage = Number((pg as any).page) || this.currentPage;
          }
          this.useServerPagination = true;
          // In server mode, current page slice is already loaded
          this.updatePagination();

          console.log('✅ Loaded from backend:', this.invoiceRecords.length, 'records');
          console.log('📋 Sample record:', this.invoiceRecords[0]);
          console.log('👤 Patient name check:', this.invoiceRecords[0]?.patient?.name);
          // Enrich current page with latest patient snapshot for correct Age/ageIn display
          this.paginatedRecords.forEach((rec) => this.ensureLatestPatientSnapshot(rec));

          if (soft) { this.isPageLoading = false; } else { this.isLoading = false; }
          this.cdr.detectChanges();
        } else {
          console.log('📋 No backend data from server.');
          this.invoiceRecords = [];
          this.filteredRecords = [];
          this.paginatedRecords = [];
          this.totalItems = 0;
          this.totalPages = 1;
          if (soft) { this.isPageLoading = false; } else { this.isLoading = false; }
          this.cdr.detectChanges();
        }
      },
      error: (error) => {
        console.error('❌ Backend error:', error);
        this.invoiceRecords = [];
        this.filteredRecords = [];
        this.paginatedRecords = [];
        this.totalItems = 0;
        this.totalPages = 1;
        if (soft) { this.isPageLoading = false; } else { this.isLoading = false; }
        this.cdr.detectChanges();
      }
    });
  }

  private loadRevenueAggregates(): void {
    try {
      // Build local YYYY-MM-DD (same as Daily Cash Report screen)
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const today = `${yyyy}-${mm}-${dd}`;

      // Today's revenue (edit-aware) from backend — identical params as report screen
      const params = { filterType: 'range', fromDate: today, toDate: today } as const;
      console.log('💰 [EditRecord] Loading Today revenue with params:', params);
      this.http.get<any>(`${environment.apiUrl}/reports/daily-cash`, { params }).subscribe({
        next: (res) => {
          this.todayRevenueTotal = Number(res?.totalAmount || 0);
          // Cross-check via pivot to avoid any edge-case mismatch
          this.reconcileTodayRevenueWithPivot(today);
          this.cdr.detectChanges();
        },
        error: (e) => console.warn('⚠️ Failed to load today revenue aggregate', e)
      });


      // Overall revenue (all-time) from backend (authoritative endpoint)
      this.http.get<any>(`${environment.apiUrl}/reports/daily-cash/overall-total`).subscribe({
        next: (res) => {
          this.overallRevenueTotal = Number(res?.totalAmount || 0);
          this.cdr.detectChanges();
        },
        error: (e) => console.warn('⚠️ Failed to load overall revenue aggregate', e)
      });
    } catch (e) {
      console.warn('⚠️ loadRevenueAggregates error', e);
    }
  }


  // Cross-check backend Today total using the same pivot logic as Daily Cash Report
  private reconcileTodayRevenueWithPivot(todayISO: string): void {
    try {
      const start = new Date(todayISO); start.setHours(0, 0, 0, 0);
      const end = new Date(todayISO); end.setHours(23, 59, 59, 999);
      const inRange = (d: any) => {
        const dt = d ? new Date(d) : null;
        return !!(dt && dt >= start && dt <= end);
      };

      const url = `${environment.apiUrl}/pathology-invoice/list?limit=1000000`;
      this.http.get<any>(url).subscribe({
        next: (resp) => {
          const invoices: any[] = Array.isArray(resp?.invoices) ? resp.invoices : [];
          let grand = 0;

          for (const inv of invoices) {
            // Respect backend match: exclude CANCELLED and only include PAID
            const status = String(inv?.status || '').toUpperCase();
            const payStatus = String(inv?.payment?.paymentStatus || 'PAID').toUpperCase();
            if (status === 'CANCELLED' || (payStatus !== 'PAID')) continue;

            // Count if ANY of paymentDate/bookingDate/createdAt falls today (to mirror backend $or)
            const anyInRange = [inv?.payment?.paymentDate, inv?.bookingDate, inv?.createdAt]
              .some((x: any) => { const dt = x ? new Date(x) : null; return !!(dt && dt >= start && dt <= end); });

            // Edit Record tile should reflect sums of today's invoices only; ignore adjustments
            const netDelta = 0;

            // invoice total from tests (prefer netAmount)
            const tests: any[] = Array.isArray(inv?.tests) ? inv.tests : (Array.isArray(inv?.selectedTests) ? inv.selectedTests : []);
            const invoiceTotal = tests.reduce((sum: number, t: any) => {
              const amt = Number(t?.netAmount ?? t?.amount ?? t?.cost ?? 0);
              return sum + (isNaN(amt) ? 0 : amt);
            }, 0);

            if (anyInRange) grand += Number(invoiceTotal || 0);
            // ignore adjustments for tile
          }

          const pivotTotal = Math.max(0, Math.round(grand));
          // Prefer pivot if it differs notably from backend. Pivot matches the invoice list logic and is "ground truth" for Edit Record.
          if (Math.abs(pivotTotal - Number(this.todayRevenueTotal || 0)) >= 1) {
            console.log('ℹ️ [EditRecord] Overriding Today total from backend', this.todayRevenueTotal, '→ pivot', pivotTotal);
            this.todayRevenueTotal = pivotTotal;
            this.cdr.detectChanges();
          }
        },
        error: (e) => console.warn('⚠️ Failed to reconcile Today total via pivot', e)
      });
    } catch (e) {
      console.warn('⚠️ reconcileTodayRevenueWithPivot error', e);
    }
  }

  loadFromLocalStorage(): void {
    // Merge today's-key storage and legacy 'paidPatients' for robustness
    const today = (() => { const d=new Date(); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; })();
    const todayKey = `paidPatients_${today}`;
    const todays = JSON.parse(localStorage.getItem(todayKey) || '[]');
    const legacy = JSON.parse(localStorage.getItem('paidPatients') || '[]');

    const mergedLocal: any[] = (() => {
      const map = new Map<string, any>();
      const keyOf = (x: any) => x?.receiptNumber || x?.invoiceNumber || x?.backendId || x?.patientId || x?.patientDetails?.patientId;
      [...legacy, ...todays].forEach(item => { const k = String(keyOf(item) ?? Math.random()); map.set(k, item); });
      return Array.from(map.values());
    })();

    if (mergedLocal.length > 0) {
      console.log('📋 Found invoices in localStorage (merged):', mergedLocal.length);

      // Convert localStorage data to invoice format
      this.invoiceRecords = mergedLocal.map((patient: any, index: number) => ({
        _id: patient.backendId || patient.patientId || `local_${index}`,
        receiptNumber: patient.receiptNumber || (index + 1),
        invoiceNumber: patient.invoiceNumber || `INV-${index + 1}`,
        bookingDate: patient.paymentDate || new Date(),
        createdAt: patient.paymentDate || new Date(),
        patient: {
          name: patient.patientName || `Patient ${index + 1}`,
          registrationNumber: patient.registrationNumber || patient.patientDetails?.patientId || (index + 1),
          age: patient.age || patient.patientDetails?.age || 25,
          ageIn: patient.ageIn || patient.patientDetails?.ageIn || '',
          gender: patient.gender || patient.patientDetails?.gender || 'MALE',
          phone: patient.contact || patient.patientDetails?.contact || '',
          address: patient.patientDetails?.address || patient.address || 'Address'
        },
        department: { name: 'PATHOLOGY' },
        doctor: { name: 'DR M. SHEKHAR', specialization: 'SHALYA CHIKITSA' },
        payment: {
          totalAmount: patient.totalAmount || 500,
          paymentMethod: 'CASH',
          paymentStatus: 'PAID'
        },
        tests: patient.testDetails || [],
        isPrinted: !!patient.isPrinted
      }));

      // Sort by date - latest first
      this.invoiceRecords.sort((a, b) => {
        const dateA = new Date(a.bookingDate || a.createdAt || new Date());
        const dateB = new Date(b.bookingDate || b.createdAt || new Date());
        return dateB.getTime() - dateA.getTime();
      });

      this.filteredRecords = [...this.invoiceRecords];
      this.totalItems = this.invoiceRecords.length;
      this.totalPages = Math.ceil(this.totalItems / this.itemsPerPage);
      this.useServerPagination = false;
      this.buildPageList();

      console.log('✅ Invoice records loaded from localStorage:', this.invoiceRecords.length);
      this.applyFilters();
      this.isLoading = false;
    } else {
      console.log('📋 No localStorage data found, generating sample data...');
      this.generateSampleData();
    }
  }

  applyFilters(): void {
    let list = [...this.invoiceRecords];

    // 1) Exact filter by Receipt No. (top-left input)
    const rTerm = (this.receiptNoTerm || '').trim();
    if (rTerm) {
      const rnum = parseInt(rTerm, 10);
      if (!Number.isNaN(rnum)) {
        list = list.filter(r => Number(r.receiptNumber) === rnum);
      } else {
        // If not numeric, no results
        list = [];
      }
    }

    // 2) Search box behavior
    const sTerm = (this.searchTerm || '').trim();
    const onlyDigits = /^[0-9]+$/.test(sTerm);
    const isUhid = /^PAT[0-9]+$/i.test(sTerm);
    const exactSearch = !!rTerm || onlyDigits || isUhid;

    if (sTerm) {
      const lower = sTerm.toLowerCase();
      const upper = sTerm.toUpperCase();

      if (isUhid) {
        // Exact UHID match
        list = list.filter(rec => {
          const pid = String(rec.patient?.patientId || rec.patientDetails?.patientId || '').toUpperCase();
          return pid === upper;
        });
      } else if (onlyDigits) {
        // Exact Registration No. match only (receipt no is handled by Receipt No filter)
        list = list.filter(rec => {
          const reg = String(
            rec.patient?.registrationNumber ||
            rec.registrationNumber ||
            rec.patientDetails?.registrationNumber ||
            ''
          ).replace(/\s+/g, '');
          return reg === sTerm;
        });
      } else {
        // Fallback general search: name, Reg. No., UHID, phone (no receipt number here)
        list = list.filter(record =>
          record.patient?.name?.toLowerCase().includes(lower) ||
          record.patient?.registrationNumber?.toLowerCase().includes(lower) ||
          record.patientDetails?.registrationNumber?.toLowerCase().includes(lower) ||
          record.patient?.patientId?.toLowerCase().includes(lower) ||
          record.patientDetails?.patientId?.toLowerCase().includes(lower) ||
          record.patient?.phone?.includes(sTerm)
        );
      }
    }

    // When using an exact search (receipt/reg/UHID), IGNORE date/payment/visit filters
    if (!exactSearch) {
      // 3) Date filter (exact day match)
      if (this.dateFilter) {
        const wanted = new Date(this.dateFilter).toDateString();
        list = list.filter(r => new Date(r.bookingDate || r.createdAt).toDateString() === wanted);
      }

      // 4) Payment mode filter
      if (this.paymentModeFilter) {
        const pm = this.paymentModeFilter;
        list = list.filter(r => (this.getPaymentMethod(r) || '').toString().toUpperCase() === pm);
      }

      // 5) Visit (OPD/IPD)
      if (this.visitModeFilter) {
        const vm = this.visitModeFilter;
        list = list.filter(r => this.getVisitMode(r) === vm);
      }
    }

    // Finalize + paginate
    this.filteredRecords = list;
    if (!this.useServerPagination) {
      this.totalItems = list.length;
    }
    this.updatePagination();
    console.log('🔍 Filtered records:', this.filteredRecords.length);
  }

  onSearchChange(forceBackend?: boolean): void {
    this.currentPage = 1;
    const sTerm = (this.searchTerm || '').trim();
    if (!sTerm) {
      // Clearing search: restore server pagination view
      if (!this.useServerPagination) {
        this.loadInvoiceRecords(1, true);
      } else {
        this.applyFilters();
        this.updatePagination();
      }
      return;
    }

    // If we are currently on server slice, fetch a larger batch once
    if (this.useServerPagination) {
      this.fetchBackendForSearch(sTerm);
      return;
    }

    this.applyFilters();

    // Optional: user pressed Enter and still nothing matched → retry with large fetch
    if (forceBackend && this.filteredRecords.length === 0) {
      this.fetchBackendForSearch(sTerm);
    }
  }

  onReceiptNoChange(): void {
    this.currentPage = 1;
    const term = (this.receiptNoTerm || '').trim();
    if (!term) {
      // Clearing receipt filter: restore paginated list
      this.loadInvoiceRecords(1, true);
      return;
    }
    const rnum = parseInt(term, 10);
    if (Number.isNaN(rnum)) {
      this.filteredRecords = [];
      this.paginatedRecords = [];
      this.totalItems = 0;
      this.totalPages = 1;
      this.updatePagination();
      return;
    }
    // Try local first (current page slice)
    this.applyFilters();
    if (this.filteredRecords.length > 0) {
      this.totalItems = this.filteredRecords.length;
      this.totalPages = 1;
      this.useServerPagination = false;
      this.updatePagination();
      return;
    }
    // Fallback: fetch exact invoice by receipt number from backend
    this.isPageLoading = true;
    this.pathologyInvoiceService.getInvoiceByReceiptNumber(rnum).subscribe({
      next: (resp: any) => {
        const inv = resp?.invoice || resp?.data || resp;
        if (inv) {
          const rec = {
            ...inv,
            patientRef: inv.patientRef || inv.patient?._id || (inv.patientDetails as any)?._id,
            receiptNumber: inv.receiptNumber || rnum,
            registrationNumber: inv.registrationNumber || inv.patient?.registrationNumber || (inv.patientDetails as any)?.registrationNumber || '',
            patient: {
              _id: inv.patient?._id || inv.patientRef,
              name: this.extractPatientName(inv),
              registrationNumber: inv.patient?.registrationNumber || (inv.patientDetails as any)?.registrationNumber || '',
              age: this.extractPatientAge(inv),
              ageIn: (inv.patient?.ageIn || (inv.patientDetails as any)?.ageIn || ''),
              gender: this.extractPatientGender(inv),
              phone: this.extractPatientPhone(inv),
              address: this.extractPatientAddress(inv)
            },
            payment: {
              totalAmount: inv.payment?.totalAmount || 0,
              paymentMethod: inv.payment?.paymentMethod || 'CASH',
              paymentStatus: inv.payment?.paymentStatus || 'PAID'
            },
            department: { name: inv.department?.name || 'PATHOLOGY' }
          };
          this.invoiceRecords = [rec];
          this.filteredRecords = [rec];
          this.useServerPagination = false;
          this.totalItems = 1;
          this.totalPages = 1;
          this.updatePagination();
        } else {
          this.invoiceRecords = [];
          this.filteredRecords = [];
          this.paginatedRecords = [];
          this.totalItems = 0;
          this.totalPages = 1;
        }
        this.isPageLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.invoiceRecords = [];
        this.filteredRecords = [];
        this.paginatedRecords = [];
        this.totalItems = 0;
        this.totalPages = 1;
        this.isPageLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  private fetchBackendForSearch(term: string): void {
    // Pull a bigger page so older invoices are included for exact matching
    const BIG_LIMIT = 500;
    this.isPageLoading = true;
    this.pathologyInvoiceService.getAllInvoices(1, BIG_LIMIT).subscribe({
      next: (response) => {
        try {
          const list = (response?.invoices || []) as any[];
          this.invoiceRecords = list.map((invoice: any, index: number) => ({
            ...invoice,
            patientRef: invoice.patientRef || invoice.patient?._id || (invoice.patientDetails as any)?._id,
            receiptNumber: invoice.receiptNumber || (index + 1),
            registrationNumber: invoice.registrationNumber || invoice.patient?.registrationNumber || (invoice.patientDetails as any)?.registrationNumber || '',
            patient: {
              _id: invoice.patient?._id || invoice.patientRef,
              name: this.extractPatientName(invoice),
              registrationNumber: invoice.patient?.registrationNumber || (invoice.patientDetails as any)?.registrationNumber || '',
              age: this.extractPatientAge(invoice),
              ageIn: (invoice.patient?.ageIn || (invoice.patientDetails as any)?.ageIn || ''),
              gender: this.extractPatientGender(invoice),
              phone: this.extractPatientPhone(invoice),
              address: this.extractPatientAddress(invoice)
            },
            payment: {
              totalAmount: invoice.payment?.totalAmount || 0,
              paymentMethod: invoice.payment?.paymentMethod || 'CASH',
              paymentStatus: invoice.payment?.paymentStatus || 'PAID'
            },
            department: { name: invoice.department?.name || 'PATHOLOGY' }
          }));
        } catch {}

        this.filteredRecords = [...this.invoiceRecords];
        this.totalItems = this.invoiceRecords.length;
        this.totalPages = 1;
        this.isPageLoading = false;
        // Re-apply the active search term to the newly loaded larger set
        this.applyFilters();
        this.cdr.detectChanges();
      },
      error: () => {
        this.isPageLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  onDateFilterChange(): void {
    this.currentPage = 1;
    this.applyFilters();
  }

  onPaymentModeFilterChange(): void {
    this.currentPage = 1;
    this.applyFilters();
  }

  onVisitModeFilterChange(): void {
    this.currentPage = 1;
    this.applyFilters();
  }

  private async getEditLockStatus(receiptNumber: number | string): Promise<{ locked: boolean; reason?: string; canOverride?: boolean; }> {
    try {
      const receipt = String(receiptNumber);
      // 1) Is there any pathology registration for this receipt?
      const regUrl = `${environment.apiUrl}/pathology-registration/receipt/${receipt}`;
      const regResp: any = await this.http.get(regUrl).toPromise().catch(() => null);
      // API returns { invoice: ... } for this route; keep fallbacks for older responses
      const registration = regResp?.invoice || regResp?.registration || regResp?.data || null;

      if (!registration) {
        return { locked: false };
      }

      // 2) If any pathology report exists for this receipt -> hard lock
      const repUrl = `${environment.apiUrl}/pathology-reports/exists?receiptNo=${encodeURIComponent(receipt)}`;
      const repResp: any = await this.http.get(repUrl).toPromise().catch(() => ({ exists: false }));
      if (repResp?.exists) {
        return { locked: true, reason: 'Pathology report already generated', canOverride: false };
      }

      // 3) Registration exists but no report: require explicit allow toggle
      const allowed = Boolean(registration?.cashEditAllowed);
      if (!allowed) {
        return { locked: true, reason: 'Pathology registration exists (enable "Edit Allowed" in Registered Reports)', canOverride: true };
      }

      return { locked: false };
    } catch (e) {
      console.warn('⚠️ EditRecord: lock check failed, defaulting to unlocked', e);
      return { locked: false };
    }
  }

  async editRecord(record: any): Promise<void> {
    // Pre-check lock
    const status = await this.getEditLockStatus(record?.receiptNumber);
    // Do not show any toast on opening edit. We will enforce/notify only inside the edit form when a restricted action is attempted.
    // Hard/soft locks are still checked here for potential future routing but without UI alerts.

    console.log('✏️ Editing record:', record.receiptNumber);
    console.log('📋 Record data for editing:', record);

    // Normalize patient
    const patient = record.patient || {};

    // Normalize tests for edit form
    const normalizedTests = Array.isArray(record.tests) ? record.tests.map((t: any) => ({
      name: t?.name || t?.testName || 'Medical Test',
      testName: t?.testName || t?.name || 'Medical Test',
      cost: Number(t?.netAmount ?? t?.amount ?? t?.cost ?? 0),
      netAmount: Number(t?.netAmount ?? t?.amount ?? t?.cost ?? 0),
      discount: Number(t?.discount ?? 0),
      quantity: Number(t?.quantity ?? 1),
      category: t?.category || record?.department?.name || 'PATHOLOGY',
      _id: t?._id || t?.id || undefined
    })) : [];

    const editData = {
      // ids
      invoiceId: record._id,
      receiptNumber: record.receiptNumber,
      // patient
      patientId: patient._id || patient.patientId || record.patientId,
      patientName: patient.name || `${patient.firstName || ''} ${patient.lastName || ''}`.trim(),
      registrationNumber: record.registrationNumber || '',
      age: patient.age || record.age || '',
      // carry unit so edit form shows correct Days/Months/Years
      ageIn: (patient as any)?.ageIn || (record.patientDetails as any)?.ageIn || (record.patient as any)?.ageIn || (record as any)?.ageIn || '',
      gender: patient.gender || record.gender || '',
      contact: patient.phone || patient.contact || record.contact || '',
      address: patient.address || record.address || '',
      // org/doctor
      department: record.department?.name || record.departmentName || (record.category || ''),
      doctor: record.doctor?.name || record.doctorName || '',
      // misc
      mode: (record.mode || record.payment?.mode || record.payment?.paymentMode || '').toString().toUpperCase(),
      doctorRefNo: record.doctorRefNo || record.doctorRef || '',
      // payment
      totalAmount: record.payment?.totalAmount ?? record.totalAmount ?? 0,
      paymentMethod: record.payment?.paymentMethod || record.paymentMethod || 'CASH',
      // tests
      testDetails: normalizedTests,
      patientDetails: patient
    };

    // Store in localStorage for navigation (same as pathology-detail-form)
    localStorage.setItem('editInvoiceData', JSON.stringify(editData));

    // Navigate to cash receipt form with edit flag and pass department/doctor IDs if available
    const navMode = (record.mode || record.payment?.mode || record.payment?.paymentMode || '').toString().toUpperCase();
    this.router.navigate(['/cash-receipt/register-opt-ipd'], {
      queryParams: {
        edit: true,
        receiptNumber: record.receiptNumber,
        patientId: patient._id || patient.patientId || record.patientId,
        mode: navMode === 'IPD' || navMode === 'OPD' ? navMode : 'OPD',
        departmentId: record.department?._id || record.departmentId || undefined,
        doctorId: record.doctor?._id || record.doctorId || undefined
      }
    });
  }

  saveRecord(): void {
    if (this.editForm.valid && this.selectedRecord) {
      this.isLoading = true;
      console.log('💾 Saving record updates');

      this.closeEditModal();
      this.isLoading = false;
      console.log('✅ Record updated successfully');
    }
  }

  async deleteRecord(record: any): Promise<void> {
    const rn = record?.receiptNumber;
    if (rn === undefined || rn === null) return;

    // Open confirmation modal immediately for snappy UX; rely on backend 409 to block if linked
    this.recordToDelete = record;
    this.deleteMessage = `You are about to delete receipt #${rn}. This will archive the full invoice and then permanently delete it. Only the latest receipt can be deleted.`;
    this.showDeleteConfirmation = true;
  }

  async confirmDelete(): Promise<void> {
    if (!this.recordToDelete) { return; }
    const rn = this.recordToDelete.receiptNumber;
    this.deleting = true;
    this.pathologyInvoiceService.deleteByReceipt(rn, '')
      .subscribe({
        next: (resp) => {
          // Remove from list using robust _id comparison
          const toRemove = (this.recordToDelete as any)?._id;
          this.invoiceRecords = (this.invoiceRecords || []).filter(r =>
            (r?._id?.toString?.() ?? r?._id) !== (toRemove?.toString?.() ?? toRemove)
          );
          this.applyFilters();
          // Refresh last receipt number after deletion
          this.pathologyInvoiceService.getLastReceipt().subscribe({
            next: (res) => { this.lastReceiptNumber = Number((res as any)?.lastReceiptNumber || 0); this.cdr.detectChanges(); },
            error: () => { this.lastReceiptNumber = 0; }
          });
          this.deleting = false;
          this.showDeleteConfirmation = false;
          // Show centered success modal instead of top toaster
          this.deleteSuccessTitle = 'Deleted Successfully!';
          this.deleteSuccessMessage = `Receipt #${rn} deleted successfully.`;
          this.showDeleteSuccess = true;
          try { this.dataRefresh.triggerRefresh('pathology', 'DELETE', { receiptNumber: rn }); } catch {}
          this.cdr.detectChanges();
          this.recordToDelete = null;
        },
        error: async (err) => {
          console.error('❌ Delete failed', err);
          // Even on error 404, treat as success and update UI
          if (err?.status === 409) {
            this.deleting = false;
            this.showDeleteConfirmation = false;
            this.cdr.detectChanges();
            if (err?.error?.code === 'NOT_LAST_RECEIPT') {
              await this.alertService.showBlockingError(
                'Not Allowed',
                'Only the latest receipt can be deleted. Please clear filters and select the last receipt number.'
              );
            } else {
              await this.alertService.showBlockingError(
                'Editing Locked',
                'Cannot delete this receipt because it is registered in Pathology (report may or may not be generated). Please remove the pathology registration first.'
              );
            }
          } else if (err?.status === 404) {
            const toRemove = (this.recordToDelete as any)?._id;
            this.invoiceRecords = (this.invoiceRecords || []).filter(r =>
              (r?._id?.toString?.() ?? r?._id) !== (toRemove?.toString?.() ?? toRemove)
            );
            this.applyFilters();
            // Refresh last receipt number just in case
            this.pathologyInvoiceService.getLastReceipt().subscribe({
              next: (res) => { this.lastReceiptNumber = Number((res as any)?.lastReceiptNumber || 0); this.cdr.detectChanges(); },
              error: () => { this.lastReceiptNumber = 0; }
            });
            this.deleting = false;
            this.showDeleteConfirmation = false;
            // Show centered success modal instead of top toaster
            this.deleteSuccessTitle = 'Deleted Successfully!';
            this.deleteSuccessMessage = `Receipt #${rn} deleted successfully.`;
            this.showDeleteSuccess = true;
            try { this.dataRefresh.triggerRefresh('pathology', 'DELETE', { receiptNumber: rn }); } catch {}
            this.cdr.detectChanges();
          } else {
            this.deleting = false;
            this.showDeleteConfirmation = false;
            this.cdr.detectChanges();
            await this.alertService.showBlockingError(
              'Delete Failed',
              'Something went wrong while deleting the receipt. Please try again.'
            );
          }
          this.recordToDelete = null;
        }
      });
  }

  cancelDelete(): void {
    this.showDeleteConfirmation = false;
    this.recordToDelete = null;
    this.deleting = false;
  }

  closeEditModal(): void {
    this.showEditModal = false;
    this.isEditing = false;
    this.selectedRecord = null;
    this.editForm.reset();
  }

  // FIXED: Helper methods to extract patient data from various invoice structures
  extractPatientName(invoice: any): string {
    console.log('🔍 Extracting patient name from invoice:', invoice);
    console.log('🔍 Patient object structure:', invoice.patient);

    // Try multiple possible paths for patient name based on PathologyInvoice model
    const possibleNames = [
      // PathologyInvoice model structure (patient.name)
      invoice.patient?.name,
      // Alternative structures
      invoice.patientName,
      invoice.patientDetails?.name,
      // Try firstName + lastName combination from Patient model
      (invoice.patient?.firstName && invoice.patient?.lastName) ?
        `${invoice.patient.firstName} ${invoice.patient.lastName}` : null,
      (invoice.patientDetails?.firstName && invoice.patientDetails?.lastName) ?
        `${invoice.patientDetails.firstName} ${invoice.patientDetails.lastName}` : null,
      // Try individual fields
      invoice.patient?.firstName,
      invoice.patientDetails?.firstName,
      // Check if patient is populated from Patient model
      (invoice.patient && typeof invoice.patient === 'object' && invoice.patient.firstName) ?
        `${invoice.patient.firstName} ${invoice.patient.lastName || ''}`.trim() : null,
      // Fallback to registration number if name not found
      invoice.patient?.registrationNumber ? `Patient ${invoice.patient.registrationNumber}` : null,
      // Final fallback
      'Unknown Patient'
    ];

    const name = possibleNames.find(n => n && n.trim() && n !== 'undefined undefined' && n !== 'undefined' && n !== '') || 'Unknown Patient';
    console.log('✅ Final extracted patient name:', name);
    return name;
  }

  extractRegistrationNumber(invoice: any): string {
    console.log('🔍 Extracting registration number from invoice');

    // Strict: show only real registration number stored with invoice
    const possibleRegNumbers = [
      invoice.registrationNumber,
      invoice.patient?.registrationNumber,
      (invoice.patientDetails as any)?.registrationNumber
    ];

    const regNumber = possibleRegNumbers.find(n => n && n.toString().trim()) || '';
    console.log('✅ Extracted registration number (strict):', regNumber);
    return regNumber ? regNumber.toString() : '';
  }

  extractPatientAge(invoice: any): string {
    const raw = ((invoice.patient?.age || invoice.patientDetails?.age || '') + '').toString();
    let ageInPref = (((invoice.patient?.ageIn || (invoice.patientDetails as any)?.ageIn || '') + '').toString()).toLowerCase();

    // If ageIn sometimes comes like '9Days', strip any leading numbers
    ageInPref = ageInPref.replace(/^\s*\d+\s*/, '');

    // If nothing, return empty
    if (!raw && !ageInPref) return '';

    // Get numeric part from raw if present (even if it contains letter like '3 Y')
    const mNum = raw.match(/\d+/);
    const n = mNum ? parseInt(mNum[0], 10) : NaN;

    // Prefer explicit ageIn unit (Days/Months/Years) when available
    if (ageInPref) {
      let unit = 'Y';
      if (ageInPref.startsWith('day') || ageInPref.startsWith('d')) unit = 'D';
      else if (ageInPref.startsWith('month') || ageInPref.startsWith('m')) unit = 'M';
      else if (ageInPref.startsWith('year') || ageInPref.startsWith('y')) unit = 'Y';
      return isNaN(n) ? raw : `${n} ${unit}`;
    }

    // Otherwise, if raw already has a unit, keep it
    const m = raw.match(/^\s*(\d+)\s*([YMD])\s*$/i);
    if (m) return `${m[1]} ${m[2].toUpperCase()}`;

    // Fallback to years
    return isNaN(n) ? raw : `${n} Y`;
  }

  extractPatientGender(invoice: any): string {
    const gender = invoice.patient?.gender ||
                   invoice.patientDetails?.gender ||
                   '';
    console.log('✅ Extracted patient gender:', gender);
    return (gender && gender.toString().toUpperCase().charAt(0)) || '';
  }

  extractPatientPhone(invoice: any): string {
    console.log('🔍 Extracting patient phone from:', invoice.patient);

    // Try multiple possible paths for phone number
    const possiblePhones = [
      // PathologyInvoice model structure
      invoice.patient?.phone,
      // Patient model structure
      invoice.patient?.contact,
      // Alternative structures
      invoice.patientDetails?.contact,
      invoice.patientDetails?.phone,
      // If patient is populated from Patient model
      (invoice.patient && typeof invoice.patient === 'object' && invoice.patient.phone)
        ? invoice.patient.phone : null
    ];

    const raw = (possiblePhones.find(p => p && p.toString().trim()) || '').toString().trim();

    // Blank-out placeholder numbers like 9999999999/0000000000/N-A etc.
    const digits = raw.replace(/\D/g, '');
    const isPlaceholder = !raw ||
      digits === '9999999999' || digits === '0000000000' || digits === '1234567890' ||
      /^9{7,}$/.test(digits) || /^0+$/.test(digits) ||
      ['N/A', 'NA', '-', 'NULL', 'UNAVAILABLE'].includes(raw.toUpperCase());

    const phone = isPlaceholder ? '' : raw;
    console.log('✅ Extracted patient phone:', phone);
    return phone;
  }

  extractPatientAddress(invoice: any): string {
    const address = invoice.patient?.address ||
                    invoice.patientDetails?.address ||
                    'Address';
    console.log('✅ Extracted patient address:', address);
    return address;
  }

  // Data Helper Methods - Fixed for Real Data Display
  getPatientName(record: any): string {
    console.log('🔍 Getting patient name for record ID:', record._id);
    console.log('🔍 Full record structure:', record);
    console.log('🔍 Patient object:', record.patient);
    console.log('🔍 Patient name field:', record.patient?.name);
    console.log('🔍 Patient firstName:', record.patient?.firstName);
    console.log('🔍 Patient lastName:', record.patient?.lastName);

    // Use the enhanced extraction method
    const name = this.extractPatientName(record);
    console.log('✅ Final patient name returned:', name);

    // Additional debugging - check if name is still showing as ???
    if (name === 'Unknown Patient' || name === '???' || !name || name.trim() === '') {
      console.warn('⚠️ Patient name extraction failed, trying direct access...');
      console.log('🔍 Direct patient.name:', record.patient?.name);
      console.log('🔍 Direct patientName:', record.patientName);
      console.log('🔍 All patient keys:', record.patient ? Object.keys(record.patient) : 'No patient object');
    }

    return name;
  }

  getRegistrationNumber(record: any, _index: number): string {
    return (record?.registrationNumber || record?.patient?.registrationNumber || '').toString();
  }

  getPatientAge(record: any): string {
    const p = record?.patient || record?.patientDetails || {};
    const raw = (((p as any).age ?? (record as any).age ?? '') + '').toString();

    // 1) If already like "7 D" / "7 M" / "7 Y"
    const m = raw.match(/^\s*(\d+)\s*([YMD])\s*$/i);
    if (m) return `${m[1]} ${m[2].toUpperCase()}`;

    // 2) If like "7 days" / "7 months" / "7 years"
    const mw = raw.match(/^\s*(\d+)\s*(day|days|month|months|year|years)\s*$/i);
    if (mw) {
      const nword = parseInt(mw[1], 10);
      const uw = (mw[2] || '').toLowerCase();
      const u = uw.startsWith('day') ? 'D' : uw.startsWith('month') ? 'M' : 'Y';
      return isNaN(nword) ? raw : `${nword} ${u}`;
    }

    // 3) Otherwise, if we have only a number, use latest ageIn field
    const mNum = raw.match(/\d+/);
    const n = mNum ? parseInt(mNum[0], 10) : NaN;
    const ageInPref = ((((p as any).ageIn ?? record?.patient?.ageIn ?? (record as any).ageIn) || '') + '').toString().toLowerCase().replace(/^\s*\d+\s*/, '');
    if (!isNaN(n)) {
      let unit = 'Y';
      if (ageInPref.startsWith('day') || ageInPref.startsWith('d')) unit = 'D';
      else if (ageInPref.startsWith('month') || ageInPref.startsWith('m')) unit = 'M';
      else if (ageInPref.startsWith('year') || ageInPref.startsWith('y')) unit = 'Y';
      return `${n} ${unit}`;
    }

    // 4) Nothing numeric — return raw as-is (empty or unknown)
    return raw;
  }

  getPatientGender(record: any): string {
    return this.extractPatientGender(record);
  }

  getPatientPhone(record: any): string {
    return this.extractPatientPhone(record);
  }

  getDepartmentName(record: any): string {
    // Try multiple possible data structures
    if (record.department?.name) return record.department.name;
    if (record.departmentName) return record.departmentName;
    if (record.category) return record.category;
    const departments = ['PATHOLOGY', 'X-RAY', 'ECG', 'SHALAKYA', 'SHALYA', 'PANCHKARMA'];
    return departments[Math.floor(Math.random() * departments.length)];
  }

  // Robust amount resolver: exact 0 allowed; never fallback to random
  getAmount(record: any): number {
    // Prefer explicit payment.totalAmount if present (even 0)
    if (record?.payment && record.payment.totalAmount !== undefined && record.payment.totalAmount !== null) {
      return Number(record.payment.totalAmount) || 0;
    }
    // Next, consider flat fields (even 0)
    if (record.totalAmount !== undefined && record.totalAmount !== null) return Number(record.totalAmount) || 0;
    if (record.amount !== undefined && record.amount !== null) return Number(record.amount) || 0;

    // Otherwise, compute from tests arrays
    const tests = Array.isArray(record?.tests) ? record.tests
                : (Array.isArray(record?.testDetails) ? record.testDetails : []);
    if (Array.isArray(tests) && tests.length) {
      return tests.reduce((sum: number, t: any) => {
        const qty = Number(t?.quantity ?? 1);
        const disc = Number(t?.discount ?? 0);
        const line = (t?.netAmount != null && !isNaN(Number(t.netAmount)))
          ? Number(t.netAmount)
          : (qty * (Number(t?.cost ?? t?.amount ?? 0)) - disc);
        return sum + (isNaN(line) ? 0 : Number(line));
      }, 0);

    }

    // Default: zero when unknown
    return 0;
  }

  getPaymentMethod(record: any): string {
    // Try multiple possible data structures
    if (record.payment?.paymentMethod) return record.payment.paymentMethod;
    if (record.paymentMethod) return record.paymentMethod;
    return 'CASH'; // Default payment method
  }

  isFullyRefunded(record: any): boolean {
    try {
      // Explicit flags first
      if (record?.refund?.isRefunded === true || record?.isRefunded === true) return true;



      const amountNow = this.getAmount(record);
      if (amountNow > 0) return false;

      // Zero amount: consider previous state or removed tests as refund
      const prev = this.getPreviousAmount(record);
      if (typeof prev === 'number' && prev > 0) return true;

      // If tests array is empty after edit and there was any edit history, treat as refund
      if (this.hasEditHistory(record)) {
        const afterTests = this.getAfterTests(record);
        if (Array.isArray(afterTests) && afterTests.length === 0) return true;
      }
    } catch {}
    return false;
  }

  getPaymentStatus(record: any): string {
    if (this.isFullyRefunded(record)) return 'REFUNDED';


    // Try multiple possible data structures
    if (record?.payment?.paymentStatus) return (record.payment.paymentStatus as string).toUpperCase();
    if (record?.paymentStatus) return (record.paymentStatus as string).toUpperCase();
    if (record?.status) return (record.status as string).toUpperCase();
    return 'PAID';
  }

  // Utility methods
  formatDate(date: string): string {
    if (!date) return new Date().toLocaleDateString('en-IN');
    return new Date(date).toLocaleDateString('en-IN');


  }

  formatCurrency(amount: number): string {
    return `${amount?.toFixed(2) || '0.00'}`;
  }

  getStatusBadgeClass(status: string): string {
    switch (status?.toLowerCase()) {
      case 'paid': return 'badge-success';
      case 'pending': return 'badge-warning';
      case 'cancelled': return 'badge-danger';
      default: return 'badge-secondary';
    }
  }

  refreshData(): void {
    console.log('🔄 Refreshing invoice records...');
    this.currentPage = 1;
    this.isLoading = true;
    this.invoiceRecords = [];
    this.filteredRecords = [];
    this.paginatedRecords = [];
    this.loadInvoiceRecords();
    // also refresh latest receipt number for delete button visibility
    this.pathologyInvoiceService.getLastReceipt().subscribe({
      next: (res) => { this.lastReceiptNumber = Number((res as any)?.lastReceiptNumber || 0); this.cdr.detectChanges(); },
      error: () => { this.lastReceiptNumber = 0; }
    });
    this.loadRevenueAggregates();

  }

  ngOnDestroy(): void {
    try { this.routerSub?.unsubscribe?.(); } catch {}
    try { this.pathologySub?.unsubscribe?.(); } catch {}
    this.routerSub = undefined;
    this.pathologySub = undefined;
  }

  clearFilters(): void {
    this.receiptNoTerm = '';
    this.searchTerm = '';
    this.dateFilter = '';
    this.departmentFilter = '';
    this.paymentModeFilter = '';
    this.visitModeFilter = '';
    // If we had switched to local big list or single-receipt view, restore server list
    if (!this.useServerPagination) {
      this.loadInvoiceRecords(1, true);
    } else {
      this.applyFilters();
    }
  }

  generateSampleData(): void {
    console.log('🎯 Generating sample invoice data...');

    const samplePatients = [
      { name: 'Rajesh Kumar', age: 35, gender: 'M', phone: '9876543210' },
      { name: 'Priya Sharma', age: 28, gender: 'F', phone: '9876543211' },
      { name: 'Amit Singh', age: 42, gender: 'M', phone: '9876543212' },
      { name: 'Sunita Devi', age: 38, gender: 'F', phone: '9876543213' },
      { name: 'Vikash Gupta', age: 31, gender: 'M', phone: '9876543214' }
    ];

    const departments = ['PATHOLOGY', 'X-RAY', 'ECG', 'SHALAKYA', 'SHALYA', 'PANCHKARMA'];
    const amounts = [100, 200, 300, 500, 150];

    this.invoiceRecords = Array.from({ length: 5 }, (_, index) => {
      const patient = samplePatients[index];
      const randomDept = departments[index % departments.length];
      const amount = amounts[index];

      return {
        _id: `sample_${index + 1}`,
        receiptNumber: index + 1,
        invoiceNumber: `INV${String(index + 1).padStart(6, '0')}`,
        bookingDate: new Date(),
        createdAt: new Date(),
        patient: {
          name: patient.name,
          patientId: `PAT${String(index + 1).padStart(6, '0')}`,
          registrationNumber: `PAT${String(index + 1).padStart(6, '0')}`,
          age: patient.age,
          gender: patient.gender,
          phone: patient.phone,
          address: `Address ${index + 1}, Varanasi`
        },
        department: {
          name: randomDept
        },
        doctor: {
          name: 'DR M. SHEKHAR',
          specialization: 'SHALYA CHIKITSA'
        },
        payment: {
          totalAmount: amount,
          paymentMethod: 'CASH',
          paymentStatus: 'PAID'
        },
        tests: [
          { name: 'Blood Test', amount: amount / 2 },
          { name: 'X-Ray', amount: amount / 2 }
        ],
        isPrinted: true
      };
    });

    this.filteredRecords = [...this.invoiceRecords];
    this.totalItems = this.invoiceRecords.length;
    this.totalPages = 1;

    console.log('✅ Sample data generated:', this.invoiceRecords.length, 'records');
    this.applyFilters();
    this.isLoading = false;
    this.cdr.detectChanges();
  }

  // New methods for professional table functionality
  getTotalAmount(): string {
    // Prefer backend aggregate when it's non-zero; otherwise fall back to what we have in memory
    const backend = Number(this.overallRevenueTotal || 0);
    if (this.useServerPagination) {
      if (backend !== 0) return backend.toFixed(2);
      // Fallback to whatever records are currently loaded (filtered first, then all loaded)
      const local = (this.filteredRecords?.length ? this.filteredRecords : this.invoiceRecords)
        .reduce((sum, record) => sum + this.getAmount(record), 0);
      return Number(local || 0).toFixed(2);
    }
    // Local mode: compute from loaded invoices, but still prefer backend if provided and non-zero
    const clientTotal = this.invoiceRecords.reduce((sum, record) => sum + this.getAmount(record), 0);
    if (!isNaN(backend) && backend !== 0) return backend.toFixed(2);
    return Number(clientTotal || 0).toFixed(2);
  }

  getPaidCount(): number {
    return this.invoiceRecords.filter(record => this.getPaymentStatus(record) === 'PAID').length;
  }

  getPaidAmount(): string {
    // Same display strategy as total: prefer backend if non-zero, else use visible client sum
    const clientTotal = this.invoiceRecords
      .filter(record => this.getPaymentStatus(record) === 'PAID')
      .reduce((sum, record) => sum + this.getAmount(record), 0);
    if (typeof this.overallRevenueTotal === 'number') {
      if (this.overallRevenueTotal !== 0 || clientTotal === 0) {
        return this.overallRevenueTotal.toFixed(2);
      }
    }
    return clientTotal.toFixed(2);
  }

  getPendingCount(): number {
    return this.invoiceRecords.filter(record => this.getPaymentStatus(record) !== 'PAID').length;
  }

  getPendingAmount(): string {
    const total = this.invoiceRecords
      .filter(record => this.getPaymentStatus(record) !== 'PAID')
      .reduce((sum, record) => sum + this.getAmount(record), 0);
    return total.toFixed(2);
  }

  getTodayCount(): number {
    const today = new Date().toDateString();
    return this.invoiceRecords.filter(record => {
      const recordDate = new Date(record.bookingDate || record.createdAt).toDateString();
      return recordDate === today;
    }).length;
  }

  getTodayAmount(): string {
    // Always use backend aggregate; never show negative — clamp to 0 for UX
    const backend = Number(this.todayRevenueTotal || 0);
    const clamped = Math.max(0, isNaN(backend) ? 0 : backend);
    return clamped.toFixed(2);
  }


  // Net of today's activity: new invoices add their amount; edits/refunds done today add their delta (can be negative)
  computeTodayNetFromRecords(): number {
    const today = new Date();
    let net = 0;
    for (const record of this.invoiceRecords) {
      const createdToday = this.isSameDay(record?.bookingDate || record?.createdAt, today);
      const updatedToday = this.isSameDay(record?.updatedAt, today);
      if (createdToday) {
        net += Number(this.getAmount(record) ?? 0);
        continue;
      }
      if (updatedToday) {
        net += Number(this.getEditDelta(record) ?? 0);
      }
    }
    return Number(net.toFixed(2));
  }

  isSameDay(d: any, ref: Date): boolean {
    if (!d) return false;
    try {
      const x = new Date(d);
      return x.getFullYear() === ref.getFullYear() && x.getMonth() === ref.getMonth() && x.getDate() === ref.getDate();
    } catch {
      return false;
    }
  }



  getReceiptNumber(record: any, index: number): string {
    return record.receiptNumber || `REC${String(index + 1).padStart(3, '0')}`;
  }

  getTestCount(record: any): number {
    if (record?.tests && Array.isArray(record.tests)) {
      return record.tests.length;
    }
    if (record?.testDetails && Array.isArray(record.testDetails)) {
      return record.testDetails.length;
    }
    return 0;
  }

  getTestSummary(record: any): string {
    // Show first test name(s) instead of department
    if (record?.tests && Array.isArray(record.tests) && record.tests.length > 0) {
      const names = record.tests
        .map((t: any) => t?.testName || t?.name)
        .filter((n: any) => !!n)
        .slice(0, 2);
      if (names.length > 0) {
        const more = record.tests.length > names.length ? ` +${record.tests.length - names.length} more` : '';
        return `${names.join(', ')}${more}`;
      }
    }
    // Fallback to department + count if no names
    const count = this.getTestCount(record);
    return `${count} Tests`;
  }

  getPaymentModeClass(record: any): string {
    const method = this.getPaymentMethod(record);
    switch (method) {
      case 'CASH': return 'mode-cash';
      case 'UPI': return 'mode-upi';
      default: return 'mode-cash';
    }
  }

  getStatusClass(record: any): string {
    const status = this.getPaymentStatus(record);
    switch ((status || '').toLowerCase()) {
      case 'paid': return 'status-paid';
      case 'pending': return 'status-pending';
      case 'cancelled': return 'status-cancelled';
      case 'refunded': return 'status-cancelled';
      default: return 'status-paid';
    }
  }

  // Action methods
  createNewInvoice(): void {
    console.log('➕ Creating new invoice...');
    // Navigate to Cash Receipt form (PathologyDetailFormComponent)
    this.router.navigate(['/cash-receipt/register-opt-ipd']);
  }

  // View modal handlers
  viewRecord(record: any): void {
    console.log('👁️ Viewing record:', record.receiptNumber);

    // Try to refresh patient snapshot using ObjectId if available (prefer latest Age/AgeIn)
    this.ensureLatestPatientSnapshot(record);

    // Prepare grouped categories for modal
    (record as any).__viewCategories = this.getViewCategories(record);
    this.selectedViewRecord = record;
    this.showViewModal = true;
    this.cdr.detectChanges();
  }

  // Fetch latest patient snapshot and merge into record for correct AgeIn display
  private ensureLatestPatientSnapshot(record: any): void {
    try {
      const id = record?.patient?._id || record?.patientRef;
      if (!id) return;
      // Prevent too-frequent fetches for the same record within 10 seconds
      const last = (this as any)._lastFetchMap?.[id] || 0;
      const now = Date.now();
      if (now - last < 10_000) return;
      (this as any)._lastFetchMap = { ...(this as any)._lastFetchMap, [id]: now };

      this.patientService.getPatientById(id).subscribe({
        next: (res) => {
          const p = (res && (res.patient || res)) || null;
          if (!p) return;
          record.patient = {
            ...(record.patient || {}),
            _id: p._id || record?.patient?._id,
            name: `${p.firstName || ''} ${p.lastName || ''}`.trim() || record?.patient?.name,
            registrationNumber: p.patientId || p.registrationNumber || record?.patient?.registrationNumber,
            // Prefer invoice snapshot values; only fill from Patient master if missing
            age: (record?.patient?.age ?? (record as any)?.age ?? p.age),
            ageIn: (((record?.patient as any)?.ageIn ?? (record as any)?.ageIn) ?? (p as any)?.ageIn),
            gender: p.gender || record?.patient?.gender,
            phone: p.contact || p.phone || record?.patient?.phone,
            address: this.formatAddressForPrint(p.address, p) || record?.patient?.address
          };
          this.cdr.detectChanges();
        },
        error: (e) => console.warn('⚠️ Failed to refresh patient snapshot', e)
      });
    } catch (e) {
      console.warn('⚠️ ensureLatestPatientSnapshot error', e);
    }
  }

  closeViewModal(): void {
    this.showViewModal = false;
    this.selectedViewRecord = null;
  }

  // Group tests by category for View modal
  getViewCategories(record: any): Array<{name: string; tests: any[]; subtotal: number}> {
    if (!record) return [];
    const tests = Array.isArray(record.tests) ? record.tests : [];
    const groups: {[k: string]: any[]} = {};
    tests.forEach((t: any) => {
      const cat = (t?.category || record?.department?.name || 'PATHOLOGY').toString().toUpperCase();
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(t);
    });
    return Object.keys(groups).map(name => ({
      name,
      tests: groups[name],
      // Prefer netAmount; otherwise compute with quantity and discount
      subtotal: groups[name].reduce((sum: number, t: any) => {
        const qty = Number(t?.quantity ?? 1);
        const cost = Number(t?.cost ?? t?.amount ?? 0);
        const discount = Number(t?.discount ?? 0);
        const line = (t?.netAmount != null && !isNaN(Number(t.netAmount))) ? Number(t.netAmount) : (cost * qty - discount);
        return sum + line;
      }, 0)
    }));
  }

  getRecordTotalAmount(record: any): number {
    if (!record) return 0;
    if (record.payment?.totalAmount !== undefined) return Number(record.payment.totalAmount);
    if (record.totalAmount !== undefined) return Number(record.totalAmount);
    const tests = Array.isArray(record.tests) ? record.tests : [];
    return tests.reduce((s: number, t: any) => {
      const qty = Number(t?.quantity ?? 1);
      const cost = Number(t?.cost ?? t?.amount ?? 0);
      const discount = Number(t?.discount ?? 0);
      const line = (t?.netAmount != null && !isNaN(Number(t.netAmount))) ? Number(t.netAmount) : (cost * qty - discount);
      return s + line;
    }, 0);
  }

  // Previous values helpers (similar to all-reports view)
  hasEditHistory(record: any): boolean {
    try {
      // Explicit flag from backend
      if (record?.isEdited) return true;

      // Real edits present in history (ignore system-only touches)
      const hist = Array.isArray(record?.editHistory) ? record.editHistory : [];
      for (const e of hist) {
        const delta = this.getEntryDelta(e, record);
        const added = (this.getEntryAddedTests(e) || []).length;
        const removed = (this.getEntryRemovedTests(e) || []).length;
        if (delta !== 0 || added > 0 || removed > 0) return true;
      }

      // Legacy snapshot-based detection: treat as edit only if 'previous' differs from current
      if (record?.previous) {
        const prevAmt = record.previous.totalAmount;
        const currAmt = this.getAmount(record);
        if (prevAmt !== undefined && Number(prevAmt) !== Number(currAmt)) return true;
        if (Array.isArray(record.previous.tests) && record.previous.tests.length) {
          const before = record.previous.tests;
          const after = this.getAfterTests(record) || [];
          const beforeKeys: string[] = before.map((t: any) => this.testKey(t));
          const afterKeys: string[] = after.map((t: any) => this.testKey(t));
          const beforeSet = new Set<string>(beforeKeys);
          const afterSet = new Set<string>(afterKeys);
          if (beforeKeys.length !== afterKeys.length) return true;
          for (const k of beforeSet.values()) { if (!afterSet.has(k)) return true; }
        }
      }
    } catch {}
    return false;
  }
  private lastEditEntry(record: any): any | null {
    const hist = record?.editHistory;
    if (Array.isArray(hist) && hist.length) return hist[hist.length - 1] || null;
    return null;
  }
  togglePreviousRow(record: any): void {
    const id = record?._id || record?.id || record?.receiptNumber;
    if (!id) return;
    this.expandedRows[id] = !this.expandedRows[id];
  }
  getPreviousTests(record: any): any[] {
    const last = this.lastEditEntry(record);
    if (!last) return [];
    const ch = last.changes || {};
    // Common patterns we might receive from backend
    if (Array.isArray((ch as any).testsBefore)) return (ch as any).testsBefore;
    if ((ch as any).tests && Array.isArray((ch as any).tests.before)) return (ch as any).tests.before;
    if (Array.isArray((ch as any).tests)) {
      // entries might have before/after
      const before = (ch as any).tests.map((t: any) => t?.before).filter((x: any) => !!x);
      if (before.length) return before;
    }
    // Fallback: record.previous?.tests
    if (Array.isArray(record?.previous?.tests)) return record.previous.tests;
    return [];
  }
  getAfterTests(record: any): any[] {
    const last = this.lastEditEntry(record);
    const ch = last?.changes || {};
    // Prefer explicit arrays in history
    if (Array.isArray((ch as any).testsAfter)) return (ch as any).testsAfter;
    if ((ch as any).tests && Array.isArray((ch as any).tests.after)) return (ch as any).tests.after;
    if (Array.isArray((ch as any).tests)) {
      const after = (ch as any).tests.map((t: any) => t?.after).filter((x: any) => !!x);
      if (after.length) return after;
    }
    // Fallback to record current tests
    if (Array.isArray(record?.tests)) return record.tests;
    if (Array.isArray(record?.testDetails)) return record.testDetails;
    return [];
  }

  getPreviousAmount(record: any): number | null {
    const last = this.lastEditEntry(record);
    const ch = last?.changes || {};
    // 1) Prefer explicit amounts from history
    if ((ch as any)?.totalAmount?.before !== undefined) return Number((ch as any).totalAmount.before);
    if ((ch as any)?.payment?.totalAmount?.before !== undefined) return Number((ch as any).payment.totalAmount.before);
    if ((ch as any)?.amount?.before !== undefined) return Number((ch as any).amount.before);
    if (record?.previous?.totalAmount !== undefined) return Number(record.previous.totalAmount);
    // 2) Fallback: sum of previous tests if available
    const prevTests = this.getPreviousTests(record);
    if (Array.isArray(prevTests) && prevTests.length) {
      return prevTests.reduce((s: number, t: any) => s + Number(t?.netAmount ?? t?.amount ?? t?.cost ?? 0), 0);
    }
    return null;
  }

  printRecord(record: any): void {
    console.log('🖨️ Printing record:', record.receiptNumber);
    console.log('📋 Record data for printing:', record);

    // Set invoice data for printing (same structure as pathology-detail-form)
    this.setInvoiceDataForPrint(record);

    // Print and then set printed flag in backend
    this.printInvoice(record?._id || record?.id || undefined);
  }

  // Set invoice data for printing (matching invoice template: group tests by category)
  setInvoiceDataForPrint(record: any): void {
    const patientName = record.patient?.name || record.patientName || 'Unknown Patient';
    const patientAge = record.patient?.age || record.age || 'N/A';
    const patientGender = record.patient?.gender || record.gender || 'N/A';
    const patientPhone = record.patient?.phone || record.patient?.contact || record.contact || 'N/A';
    // Robust address formatting similar to cash receipt screen
    const patientAddress = this.formatAddressForPrint(record.patient?.address || record.address, record.patient || record);
    const receiptNumber = record.receiptNumber || 'N/A';

    const normalizedTests = Array.isArray(record.tests) ? record.tests.map((t: any) => ({
      name: t?.name || t?.testName || 'Medical Test',
      category: (t?.category || record?.department?.name || 'PATHOLOGY').toString().toUpperCase(),
      netAmount: Number(t?.netAmount ?? t?.amount ?? t?.cost ?? 0)
    })) : [];

    // Fallback single row if tests missing
    const testsForPrint = normalizedTests.length ? normalizedTests : [{
      name: (record.department?.name || record.departmentName || 'PATHOLOGY') + ' Tests',
      category: (record.department?.name || record.departmentName || 'PATHOLOGY').toString().toUpperCase(),
      netAmount: Number(record.payment?.totalAmount ?? record.totalAmount ?? 0)
    }];

    const totalAmount = Number(record.payment?.totalAmount ?? record.totalAmount ?? testsForPrint.reduce((s: number, t: any)=>s+(t.netAmount||0),0));

    // Resolve lab settings for header/footer
    const activeLab: any = this.labSettings || ((): any => { try { const s = localStorage.getItem('labSettings'); return s ? JSON.parse(s) : null; } catch { return null; } })();
    const labAddress: string = activeLab ? [activeLab.addressLine1, activeLab.addressLine2, activeLab.city, activeLab.state, activeLab.pincode].filter(Boolean).join(', ') : '';

    this.invoiceData = {
      receiptNumber: receiptNumber,
      bookingDate: record.bookingDate || record.createdAt || new Date(),
      patient: {
        name: patientName,
        age: patientAge,
        // Do NOT default to 'Years' here; if unknown, leave blank so raw age like '3 D' is respected at print time
        ageIn: (record.patient?.ageIn || (record.patientDetails as any)?.ageIn || ''),
        gender: patientGender,
        phone: patientPhone,
        address: patientAddress,
        registrationNumber: record.registrationNumber || 'N/A'
      },
      tests: testsForPrint,
      payment: {


        totalAmount: totalAmount,

        paymentStatus: (record.payment?.paymentStatus || 'PAID').toString().toUpperCase(),
        paymentMethod: record.payment?.paymentMethod || record.paymentMethod || 'CASH'
      },
      labInfo: {
        name: (activeLab?.labName || 'राजकीय आयुर्वेद महाविद्यालय एवं चिकित्सालय'),
        address: (labAddress || 'चौकाघाट, वाराणसी')
      },
      mode: (record.mode || record.payment?.mode || record.payment?.paymentMode || '').toString().toUpperCase(),
      doctorRefNo: record.doctorRefNo || record.doctorRef || '',
      department: { name: record.department?.name || record.departmentName || '' },
      doctor: { name: record.doctor?.name || record.doctorName || '', roomNumber: record.doctor?.roomNumber || '' }
    };

    console.log('✅ Invoice data set for printing:', this.invoiceData);
  }

  // Print method matching pathology-detail-form
  printInvoice(invoiceId?: string): void {
    console.log('🖨️ Print function called');
    console.log('📄 Invoice data check:', this.invoiceData);

    if (!this.invoiceData) {
      console.error('❌ No invoice data available for printing');
      alert('No invoice data available');
      return;
    }

    console.log('✅ Invoice data found, opening print window...');

    // Create a new window for printing
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
      console.error('❌ Failed to open print window - popup blocked');
      alert('Please allow popups to print the invoice');
      return;
    }

    console.log('✅ Print window opened successfully');

    // Generate HTML content for printing
    const printContent = this.generatePrintHTML();

    // NOTE: .write is deprecated in TS types but still works across browsers.
    // Keeping it for compatibility as we're writing full HTML.
    (printWindow.document as any).write(printContent);
    printWindow.document.close();

    const markPrinted = () => {
      if (invoiceId) {
        this.pathologyInvoiceService.updatePrintStatus(invoiceId).subscribe({
          next: () => console.log('🖨️ Print flag updated in backend'),
          error: (e) => console.warn('⚠️ Failed to update print flag', e)
        });
      }
    };

    // Wait for content to load then print
    printWindow.onload = () => {
      printWindow.print();
      // Close after print
      printWindow.onafterprint = () => {
        console.log('🖨️ Print completed');
        markPrinted();
        printWindow.close();
      };
      // Fallback for browsers that don't support onafterprint
      setTimeout(() => {
        if (!printWindow.closed) {
          console.log('🖨️ Print timeout - closing window');
          markPrinted();
          printWindow.close();
        }
      }, 3000);
    };
  }

  generatePrintHTML(): string {
    if (!this.invoiceData) return '';

    // Normalize tests and group by category for category-wise printing (same as invoice screen)
    const normTests = (this.invoiceData.tests || []).map((t: any) => ({
      category: (t.category || t.categoryName || 'PATHOLOGY').toString().toUpperCase(),
      name: t.name || t.testName || 'Medical Test',
      amount: Number(t.netAmount || t.cost || 0),
      status: (t.status || 'PAID').toString().toUpperCase()
    }));

    const grouped: Record<string, Array<{name:string;amount:number;status:string}>> = {};
    normTests.forEach((t: any) => { (grouped[t.category] ||= []).push({ name: t.name, amount: t.amount, status: t.status }); });

    const categoriesHTML = Object.entries(grouped).map(([cat, items], idx) => {
      const rows = items.map(it => `
        <tr>
           <td style="font-size:13px;">${it.name}</td>
          <td style="text-align:center; font-weight:bold; font-size:13px;">₹${it.amount}</td>
        </tr>`).join('');
      const catTotal = items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0);
      return `
        <tr><th colspan="2" style="text-align:left; background:#e9ecef; font-size:13px;">${idx + 1}) ${cat}</th></tr>
        ${rows}
        <tr>
          <td style="text-align:right; font-weight:bold; font-size:14px;">${cat} SUBTOTAL</td>
          <td style="text-align:center; font-weight:750; font-size:15px;">₹${catTotal}</td>
        </tr>`;
    }).join('');

    const grandTotal = this.invoiceData?.payment?.totalAmount ?? normTests.reduce((s: number, t: any)=>s+(t.amount||0),0);


    // Build Age display robustly: if DB has '5 M' use it; if only number is present, append unit from ageIn
    const rawAgePrint = (((this.invoiceData?.patient?.age ?? '') + '').toString());
    const ageInPrint = (((this.invoiceData?.patient?.ageIn ?? '') + '').toString()).toLowerCase();
    let ageDisplay = '';
    if (rawAgePrint) {
      const mNum = rawAgePrint.match(/\d+/);
      const nn = mNum ? parseInt(mNum[0], 10) : NaN;
      if (ageInPrint) {
        let unit = 'Y';
        if (ageInPrint.startsWith('day') || ageInPrint.startsWith('d')) unit = 'D';
        else if (ageInPrint.startsWith('month') || ageInPrint.startsWith('m')) unit = 'M';
        else if (ageInPrint.startsWith('year') || ageInPrint.startsWith('y')) unit = 'Y';
        ageDisplay = isNaN(nn) ? rawAgePrint : `${nn} ${unit}`;
      } else {
        const mm = rawAgePrint.match(/^\s*(\d+)\s*([YMD])\s*$/i);
        ageDisplay = mm ? `${mm[1]} ${mm[2].toUpperCase()}` : (isNaN(nn) ? rawAgePrint : `${nn} Y`);
      }
    }
    // Normalize gender for print - only show first letter
    const genderRaw = ((this.invoiceData?.patient?.gender || '') + '').trim().toUpperCase();
    const genderDisplay = (genderRaw && genderRaw.charAt(0)) || '';


    // Lab settings for template/header/footer/notes
    const activeLab: any = this.labSettings || ((): any => { try { const s = localStorage.getItem('labSettings'); return s ? JSON.parse(s) : null; } catch { return null; } })();
    const template = (activeLab?.printLayout?.template || 'classic') as 'classic' | 'compact' | 'minimal';
    const showHeader = activeLab?.printLayout?.showHeader !== false;
    const showFooter = activeLab?.printLayout?.showFooter !== false;
    const headerNote = (activeLab?.headerNote || '').toString();
    const footerNote = (activeLab?.footerNote || '').toString();
    const disclaimer = (activeLab?.reportDisclaimer || '').toString();
    const signImg = (activeLab?.signatureDataUrl || '').toString();


    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Hospital Invoice</title>
        <link href="https://fonts.googleapis.com/css2?family=Raleway:wght@400;500;600;700&display=swap" rel="stylesheet">
       <style>
          /* A4 portrait full-page invoice */
          @media print {
            @page { size: A4; margin: 0; }
            html, body { width: 210mm; height: 297mm; margin: 0 !important; padding: 0 !important; }
            body { display: block !important; }
            .invoice-container {
              width: 210mm;
              min-height: auto;
              margin: 0 !important;
              padding: 8mm;
              border: none;
              box-sizing: border-box;
              page-break-inside: auto;
              box-shadow: none;
              overflow: visible;
            }
            /* Ensure nothing else prints */
            .no-print, button { display: none !important; }
          }

          body { font-family: 'Raleway', Arial, sans-serif; margin: 0; padding: 0; }
          .invoice-container { width: 210mm; margin: 0; padding: 8mm; border: none; }
          .hospital-header { display: grid; grid-template-columns: 100px 1fr 140px; align-items: center; column-gap: 6px; margin-bottom: 0px; width: 100%; }
          .logo-section { width: 140px; }
          .gov-logo { width: 80px; height: 80px; object-fit: contain; }
          .hospital-info { text-align: center; }
         .header-spacer { width: 0px; }
          .hospital-name { font-size: 20px; margin: 0 0 4px 0; font-weight: 600; letter-spacing: 0px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right:12px}
          .hospital-address { font-size: 18px; margin: 0 0 0px 0; font-weight: 500; white-space: nowrap;margin-right: 70px; }
          .receipt-head { display: flex; align-items: center; position: relative; padding-bottom: 0px; }
          .receipt-title { font-size: 14px; font-weight: bold; margin: 0; position: absolute; left: 50%; transform: translateX(-50%); text-align: center; }
          .date-container { margin-left: auto; text-align: right; }
          .reciept-date { font-size: 14px; margin: 0 0 5px 0; }
          .date-value { font-size: 14px; }
          .receipt-details { margin-bottom: 5px; border: none; padding: 10px; font-size: 13px; }
          .receipt-row { display: flex; justify-content: space-between; margin-bottom: 5px; }
          .label { font-weight: bold; white-space: nowrap; font-size: 13px; }

          /* Template variants */
          .invoice-container.tpl-compact { padding: 5mm !important; }
          .invoice-container.tpl-compact .hospital-name { font-size: 18px; }
          .invoice-container.tpl-minimal { padding: 4mm !important; border: 1px solid #000; }
          .invoice-container.tpl-minimal .hospital-name { font-size: 17px; }
          .footer-section { text-align: center; margin-top: 10px; }
          .footer-section .sign { height: 28px; display: block; margin: 4px auto; }

          .value { min-width: 100px; padding-bottom: 2px; white-space: nowrap;font-size: 13px; }
          .age-center { display: inline-block; min-width: 24px; text-align: center; }
          .bill-table { width: 100%; border-collapse: collapse; border: none; margin: 0 auto; }
          .bill-table th, .bill-table td { border: 1px solid #000; padding: 5px 8px; text-align: left; }
          .bill-table th { background-color: #ffffffff; font-weight: bold; text-align: left; font-size: 14px; }
          .total-section { border: 1px solid #000; padding: 0; margin: 10px 0; }
          .total-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 16px; background-color: #ffffffff; margin: 0; border-top: 1px solid #000; border-bottom: 1px solid #000; }
          .total-label { font-weight: bold; font-size: 15px; color: #333; }
          .total-amount { font-weight: bold; font-size: 15px; color: #d63384; }
          .total-summary-row { page-break-inside: avoid; break-inside: avoid; }


          .footer-note { text-align: center; margin-top: 16px; font-size: 10px; color: #666; border-top: 1px solid #ddd; padding-top: 10px; }


          /* Brand chevrons and tri-signature */
          .invoice-container { --brand-green: #16a34a; }
          .chevron { height: 6mm; background: repeating-linear-gradient(-45deg, var(--brand-green) 0 12px, transparent 12px 24px); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .chevron-top { margin: 6px 0 8px 0; }
          .chevron-bottom { margin: 8px 0 0 0; }
          .footer-row.tri { display: flex; justify-content: space-between; gap: 10px; }
          .footer-row.tri .sign-col { width: 33.33%; text-align: center; }
          .footer-row.tri .signature-line { width: 90%; margin: 6px auto 0; height: 12px; border-bottom: 1px solid #000; }
          .barcode-box svg { width: 100%; max-width: 160px; height: 44px; }

          /* Print behavior: table header/footer on each A4 page */
          @media print {
            thead { display: table-header-group !important; }
            tfoot { display: table-footer-group !important; }
            tbody { display: table-row-group !important; }
            tr { page-break-inside: avoid; }
            .page-top-spacer th, .page-bottom-spacer td { height: 0; padding: 0 !important; border: none !important; }
            .bill-table { border: none !important; margin-top: 0 !important; }
          }
        </style>
      </head>
      <body>

        <div class="invoice-container tpl-${template}">
          ${showHeader ? `
          <div class="hospital-header">
            <div class="logo-section">
              ${this.logoBase64 ? `<img src="${this.logoBase64}" alt="Lab Logo" class="gov-logo" style="background: white; padding: 5px; border-radius: 5px;">` : '<div class="gov-logo" style="background: #f0f0f0; display: flex; align-items: center; justify-content: center; font-size: 12px;">LOGO</div>'}
            </div>
            <div class="hospital-info">
              <h1 class="hospital-name">${this.invoiceData.labInfo?.name || 'राजकीय आयुर्वेद महाविद्यालय एवं चिकित्सालय'}</h1>
              <p class="hospital-address">${this.invoiceData.labInfo?.address || 'चौकाघाट, वाराणसी'}</p>
              ${headerNote ? `<div class="header-note" style="font-size:12px; margin-top:4px;">${headerNote}</div>` : ''}
            </div>
            <div class="logo-section" style="text-align:right">
              ${this.labSettings?.sideLogoDataUrl ? `<img src="${this.labSettings?.sideLogoDataUrl}" alt="Side Logo" class="gov-logo" style="height:80px; width:auto; object-fit:contain;">` : ''}
            </div>
          </div>
          ` : ''}
          <div class="receipt-head">
              <h2 class="receipt-title">Hospital Cash Receipt</h2>
          <div class="chevron chevron-top"></div>

              <div class="date-container"><span class="reciept-date label">Date:</span> <span class="date-value">${this.invoiceData.bookingDate ? new Date(this.invoiceData.bookingDate).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN')}</span></div>
            </div>

          <table class="bill-table">
            <thead>
            <tr class="page-top-spacer"><th colspan="2"></th></tr>
              <!-- Patient Information row (repeats on every printed page) -->
              <tr class="patient-info-row">
                <th colspan="2" class="patient-cell">
                  <div class="receipt-details">
                    <div class="receipt-row">
                      <div><span class="label">Receipt No.:</span> <span class="value">${this.invoiceData.receiptNumber || ''}</span></div>
                      <div><span class="label">Age/Gender : </span> <span class="value age-center">${ageDisplay}/${genderDisplay}</span></div>
                    </div>
                    <div class="receipt-row">
                      <div><span class="label">Reg. No./Doc Ref. No.:</span> <span class="value">${this.invoiceData.patient?.registrationNumber || ''}${((this.invoiceData?.doctorRefNo || '').toString().match(/^[a-f0-9]{24}$/i)) ? '' : (this.invoiceData?.doctorRefNo ? (' / ' + this.invoiceData.doctorRefNo) : '')}</span></div>
                      <div><span class="label">OPD/IPD:</span> <span class="value" style="${((this.invoiceData.mode || '').toString().toUpperCase()==='IPD') ? 'font-weight:900;font-size:14px,' : ''} : ''}">${this.invoiceData.mode || ''}</span></div>
                    </div>
                    <div class="receipt-row">
                      <div><span class="label">Name:</span> <span class="value">${this.invoiceData.patient?.name || ''}</span></div>
                      <div><span class="label">Department:</span> <span class="value">${this.invoiceData.department?.name || this.invoiceData.doctor?.specialization || ''}</span></div>
                    </div>
                    <div class="receipt-row">


                      <div><span class="label">Address:</span> <span class="value">${this.invoiceData.patient?.address || ''}</span></div>
                      <div><span class="label">Doctor:</span> <span class="value">${this.invoiceData.doctor?.name || ''}${this.invoiceData.doctor?.roomNumber ? ' ( ' + this.invoiceData.doctor.roomNumber + ')' : ''}</span></div>
                    </div>
                  </div>
                </th>
              </tr>
              <!-- Column headers (repeat on every page) -->
              <tr>
                <th style="width: 70%;">Test</th>
                <th style="width: 30%; text-align:center;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${categoriesHTML}
              <tr class="total-summary-row">
                <td style="font-weight:bold;font-size: 17px;">Total Amount</td>
                <td style="text-align:center;font-size: 17px; font-weight:bold; color: #d63384;">₹${grandTotal}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="page-bottom-spacer"><td colspan="2"></td></tr>
            </tfoot>
          </table>

          ${showFooter ? `
          <div class="footer-section">
            <div class="footer-note">${footerNote || 'Not Valid for MedicoLegal Purpose.'}</div>
            ${signImg ? `<img class="sign" src="${signImg}" alt="Authorized Sign">` : ''}
            ${disclaimer ? `<div class="footer-note">${disclaimer}</div>` : ''}
          </div>
          ` : ''}

        </div>
      </body>
      </html>
    `;
  }



  // ---------- Edit Audit Modal handlers ----------
  openEditAudit(record: any): void {
    this.selectedAuditRecord = record;
    this.showEditAuditModal = true;
  }

  closeEditAudit(): void {
    this.showEditAuditModal = false;
    this.selectedAuditRecord = null;
  }

  getLastEditedAt(record: any): Date | null {
    const last = this.lastEditEntry(record);
    const at = last?.at || record?.lastEditedAt || record?.updatedAt;
    return at ? new Date(at) : null;
  }

  getLastEditedBy(record: any): string | null {
    const last = this.lastEditEntry(record);
    return last?.by || record?.lastEditedBy || null;
  }

  // ===== Edit history helpers for modal timeline =====
  getHistory(record: any): any[] { return Array.isArray(record?.editHistory) ? record.editHistory : []; }
  getEditCount(record: any): number { return this.getHistory(record).length; }
  getHistoryDesc(record: any): any[] {
    const h = this.getHistory(record).slice();
    // Sort by time descending (latest first)
    try {
      h.sort((a: any, b: any) => new Date(b?.at || b?.editedAt || 0).getTime() - new Date(a?.at || a?.editedAt || 0).getTime());
    } catch {}
    return h;
  }
  ordinal(n: number): string {
    const s = ["th", "st", "nd", "rd"], v = n % 100;
    return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
  }

  entryPrevTests(entry: any): any[] {
    const ch = entry?.changes || {};
    if (Array.isArray((ch as any).testsBefore)) return (ch as any).testsBefore;
    if (Array.isArray((ch as any).beforeTests)) return (ch as any).beforeTests;
    if (Array.isArray((ch as any).testsPrev)) return (ch as any).testsPrev;
    if (Array.isArray((ch as any).previous?.tests)) return (ch as any).previous.tests;
    return [];
  }
  entryAfterTests(entry: any): any[] {
    const ch = entry?.changes || {};
    if (Array.isArray((ch as any).testsAfter)) return (ch as any).testsAfter;
    if (Array.isArray((ch as any).afterTests)) return (ch as any).afterTests;
    if (Array.isArray((ch as any).tests)) return (ch as any).tests;
    return [];
  }
  private sumTestsList(tests: any[]): number {
    return (tests || []).reduce((s: number, t: any) => s + Number(t?.netAmount ?? t?.amount ?? t?.cost ?? 0), 0);
  }
  entryPrevAmount(entry: any, record?: any): number | null {
    const ch = entry?.changes || {};
    if ((ch as any)?.totalAmount?.before !== undefined) return Number((ch as any).totalAmount.before);
    if ((ch as any)?.payment?.totalAmount?.before !== undefined) return Number((ch as any).payment.totalAmount.before);
    if ((ch as any)?.amount?.before !== undefined) return Number((ch as any).amount.before);
    const prevTests = this.entryPrevTests(entry);
    if (prevTests.length) return this.sumTestsList(prevTests);
    if (record?.previous?.totalAmount !== undefined) return Number(record.previous.totalAmount);
    return null;
  }
  entryAfterAmount(entry: any, record?: any): number | null {
    const ch = entry?.changes || {};
    if ((ch as any)?.totalAmount?.after !== undefined) return Number((ch as any).totalAmount.after);
    if ((ch as any)?.payment?.totalAmount?.after !== undefined) return Number((ch as any).payment.totalAmount.after);
    if ((ch as any)?.amount?.after !== undefined) return Number((ch as any).amount.after);
    const afterTests = this.entryAfterTests(entry);
    if (afterTests.length) return this.sumTestsList(afterTests);
    if (record?.totalAmount !== undefined) return Number(record.totalAmount);
    return null;
  }
  getEntryDelta(entry: any, record?: any): number {
    const prev = Number(this.entryPrevAmount(entry, record) ?? 0);
    const curr = Number(this.entryAfterAmount(entry, record) ?? 0);
    return curr - prev;
  }
  private testKeyForEntry(t: any): string {
    const nameKey = (t?.name || t?.testName || '').toString().trim().toLowerCase();
    const catKey = (t?.category || t?.dept || '').toString().trim().toLowerCase();
    return (catKey ? catKey + ':' : '') + nameKey;
  }
  getEntryAddedTests(entry: any): any[] {
    const before = this.entryPrevTests(entry) || [];
    const after = this.entryAfterTests(entry) || [];
    const beforeSet = new Set(before.map((t: any) => this.testKeyForEntry(t)));
    return after.filter((t: any) => {
      const key = this.testKeyForEntry(t);
      return key && !beforeSet.has(key);
    });
  }
  getEntryRemovedTests(entry: any): any[] {
    const before = this.entryPrevTests(entry) || [];
    const after = this.entryAfterTests(entry) || [];
    const afterSet = new Set(after.map((t: any) => this.testKeyForEntry(t)));
    return before.filter((t: any) => {
      const key = this.testKeyForEntry(t);
      return key && !afterSet.has(key);
    });
  }
  getAddedTotalForEntry(entry: any): number { return this.getEntryAddedTests(entry).reduce((s: number, t: any) => s + Number(t?.netAmount ?? t?.amount ?? t?.cost ?? 0), 0); }
  getRemovedTotalForEntry(entry: any): number { return this.getEntryRemovedTests(entry).reduce((s: number, t: any) => s + Number(t?.netAmount ?? t?.amount ?? t?.cost ?? 0), 0); }


  // Format patient address (string or object) with fallbacks similar to cash receipt form
  private formatAddressForPrint(address: any, fallback?: any): string {
    const parts: string[] = [];
    const push = (v?: any) => {
      if (!v) return;
      const s = String(v).trim();
      if (!s || s === '[object Object]') return;
      if (!parts.some(p => p.toLowerCase() === s.toLowerCase())) parts.push(s);
    };

    if (typeof address === 'string') {
      (address.split(',') || []).map(s => s.trim()).filter(Boolean).forEach(push);
    }
    if (address && typeof address === 'object') {
      push(address.street); push((address as any).area); push(address.post);
      push(address.city); push(address.state); push(address.zipCode); push((address as any).pincode); push((address as any).pin);
    }

    if (fallback && typeof fallback === 'object') {
      push((fallback as any).post); push((fallback as any).city); push((fallback as any).state); push((fallback as any).zipCode); push((fallback as any).pincode);
      const faddr = (fallback as any).address;
      if (faddr && typeof faddr === 'object') {
        push(faddr.street); push((faddr as any).area); push(faddr.post); push(faddr.city); push(faddr.state); push(faddr.zipCode); push((faddr as any).pincode); push((faddr as any).pin);
      }
    }

    if (parts.length === 0 && address) push(address);
    return parts.join(', ');
  }

  getEditDelta(record: any): number {
    const prev = Number(this.getPreviousAmount(record) ?? 0);
    const curr = Number(this.getAmount(record) ?? 0);
    return curr - prev;
  }

  // Canonicalization helpers to avoid false Added/Removed due to naming typos/variants (e.g., 'S. Cholestrol' vs 'Serum Cholesterol')
  private canonicalTestName(n: any): string {
    let s = (n ?? '').toString().toLowerCase().trim();
    if (!s) return '';
    // Remove dots and extra separators
    s = s.replace(/\./g, '').replace(/[\s_]+/g, ' ').trim();
    // Common prefixes and synonyms
    s = s.replace(/^(serum|s)\s+/, '');
    // Common typos
    s = s.replace(/cholestrol/g, 'cholesterol');
    // Remove generic words
    s = s.replace(/\b(test|profile|level|levels)\b/g, '').replace(/\s{2,}/g, ' ').trim();
    return s.replace(/[^a-z0-9]+/g, '-');
  }

  private canonicalCategory(c: any): string {
    let s = (c ?? '').toString().toLowerCase().trim();
    if (!s) return '';
    s = s.replace(/\./g, '').replace(/[\s_]+/g, ' ').trim();
    // Normalizations
    if (s === 'xray') s = 'x-ray';
    return s.replace(/[^a-z0-9]+/g, '-');
  }


  // Helper to build a stable key for a test (name+category) with canonicalization (handles typos like 'cholestrol' and prefixes like 'S.'/'Serum')
  private testKey(t: any): string {
    if (!t) return '';
    const nameKey = this.canonicalTestName(t?.name || t?.testName || t?.test || t?.title);
    const catKey = this.canonicalCategory(t?.category || t?.categoryName || t?.department || t?.dept);
    return (catKey ? catKey + ':' : '') + nameKey;
  }

  // Added vs Removed tests: robust set-diff by id/name only
  getAddedTests(record: any): any[] {
    const before = Array.isArray(this.getPreviousTests(record)) ? this.getPreviousTests(record) : [];
    const after = this.getAfterTests(record);
    const beforeSet = new Set(before.map((t: any) => this.testKey(t)));
    return after.filter((t: any) => {
      const key = this.testKey(t);
      return key && !beforeSet.has(key);
    });
  }

  getRemovedTests(record: any): any[] {
    const before = Array.isArray(this.getPreviousTests(record)) ? this.getPreviousTests(record) : [];
    const after = this.getAfterTests(record);
    const afterSet = new Set(after.map((t: any) => this.testKey(t)));
    return before.filter((t: any) => {
      const key = this.testKey(t);
      return key && !afterSet.has(key);
    });
  }

  // Totals for change summary columns
  getAddedTotal(record: any): number {
    const tests = this.getAddedTests(record) || [];
    return tests.reduce((sum: number, t: any) => sum + Number(t?.netAmount ?? t?.amount ?? t?.cost ?? 0), 0);
  }

  getRemovedTotal(record: any): number {
    const tests = this.getRemovedTests(record) || [];
    return tests.reduce((sum: number, t: any) => sum + Number(t?.netAmount ?? t?.amount ?? t?.cost ?? 0), 0);
  }


  getVisitMode(record: any): string {
    const raw = (record?.mode || record?.visitType || record?.patient?.visitType || '').toString().toUpperCase();
    if (raw.includes('IPD')) return 'IPD';
    if (raw.includes('OPD')) return 'OPD';
    // sometimes stored under payment.mode improperly
    const alt = (record?.payment?.mode || '').toString().toUpperCase();
    return alt.includes('IPD') ? 'IPD' : 'OPD';
  }

  formatCurrencyNumber(n: number): string {
    const num = Number(n || 0);
    return num.toFixed(2);
  }

  // Pagination helpers
  updatePagination(): void {
    if (this.useServerPagination) {
      // Server already sent the slice for this page; just mirror it
      if (this.currentPage < 1) this.currentPage = 1;
      if (this.currentPage > this.totalPages) this.currentPage = this.totalPages;
      this.paginatedRecords = [...this.filteredRecords];
      this.pages = Array.from({ length: this.totalPages }, (_, i) => i + 1);
      this.buildPageList();
      return;
    }
    // Client-side pagination fallback
    this.totalPages = Math.max(1, Math.ceil(this.totalItems / this.itemsPerPage));
    if (this.currentPage > this.totalPages) this.currentPage = this.totalPages;
    if (this.currentPage < 1) this.currentPage = 1;
    const start = (this.currentPage - 1) * this.itemsPerPage;
    const end = start + this.itemsPerPage;
    this.paginatedRecords = this.filteredRecords.slice(start, end);
    this.pages = Array.from({ length: this.totalPages }, (_, i) => i + 1);
    this.buildPageList();
  }

  onPageClick(p: number | string): void {
    if (typeof p === 'number') {
      this.goToPage(p);
    }
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    if (this.useServerPagination) {
      this.loadInvoiceRecords(page, true);
    } else {
      this.currentPage = page;
      this.updatePagination();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      if (this.useServerPagination) {
        this.loadInvoiceRecords(this.currentPage + 1, true);
      } else {
        this.currentPage++;
        this.updatePagination();
      }
    }
  }

  prevPage(): void {
    if (this.currentPage > 1) {
      if (this.useServerPagination) {
        this.loadInvoiceRecords(this.currentPage - 1, true);
      } else {
        this.currentPage--;
        this.updatePagination();
      }
    }
  }

  // Build condensed page list like: 1 … 4 5 [6] 7 8 … 20
  buildPageList(): void {
    const total = this.totalPages;
    const current = this.currentPage;
    const delta = 2; // how many pages to show around current
    const range: number[] = [];

    const left = Math.max(1, current - delta);
    const right = Math.min(total, current + delta);

    // Always include first/last
    range.push(1);
    for (let p = left; p <= right; p++) range.push(p);
    if (total > 1) range.push(total);

    // Remove duplicates and sort
    const unique = Array.from(new Set(range)).sort((a, b) => a - b);

    // Insert ellipsis markers
    const pageList: Array<number | string> = [];
    let prev = 0;
    for (const p of unique) {
      if (prev) {
        if (p - prev === 2) {
          pageList.push(prev + 1);
        } else if (p - prev > 2) {
          pageList.push('…');
        }
      }
      pageList.push(p);
      prev = p;
    }

    this.pageList = pageList;
  }


  absValue(n: number): number { return Math.abs(Number(n || 0)); }
}

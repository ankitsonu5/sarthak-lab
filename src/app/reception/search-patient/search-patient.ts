
import { Component, OnInit, ChangeDetectorRef, OnDestroy, NgZone } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PatientService } from '../patient.service';
import { PatientViewModalComponent } from '../patient-view-modal/patient-view-modal.component';
import { Subject, Subscription, forkJoin } from 'rxjs';
import { environment } from '../../../environments/environment';
import { filter, finalize, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { SelfRegistrationService } from '../../shared/services/self-registration.service';
import { Auth } from '../../core/services/auth';

@Component({
  selector: 'app-search-patient',
  standalone: false,
  templateUrl: './search-patient.html',
  styleUrl: './search-patient.css'
})
export class SearchPatient implements OnInit, OnDestroy {
  patients: any[] = [];
  filteredPatients: any[] = [];
  searchTerm: string = '';

  uhidSearchTerm: string = '';

  // Patient Source Filter (All, Self, Lab)
  selectedSourceFilter: string = 'all';
  selfRegisteredPatients: any[] = [];

  // Enhanced filter properties
  selectedDateFilter: string = 'all';
  selectedAgeFilter: string = 'all';
  selectedGenderFilter: string = 'all';
  customDate: string = '';

  // Pagination properties
  currentPage: number = 1;
  totalPages: number = 1;
  totalPatients: number = 0;
  pageSize: number = 100;
  isLoading: boolean = false; // full load (first load or hard refresh)
  isPageLoading: boolean = false; // soft load for Prev/Next

  // Fast pagination cache
  private pageCache = new Map<string, any>();
  private pendingRequestSub?: Subscription;

  // Perf instrumentation
  private perfDebug = true;
  private lastLabel = '';
  private lastStartMs = 0;

  // Debounced search stream for fast, low-chatter search
  private searchInput$ = new Subject<string>();
  private searchSub?: Subscription;

  // Delete modal properties
  showDeleteConfirmation = false;
  showDeleteSuccess = false;
  deleteMessage = '';

  // Subscription properties
  private patientUpdateSubscription?: Subscription;
  private newPatientSubscription?: Subscription;
  private navigationSubscription?: Subscription;
  patientToDelete: any = null;

  // Highlighting properties
  newlyAddedPatientId: string | null = null;

  constructor(
    private patientService: PatientService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private dialog: MatDialog,
    private ngZone: NgZone,
    private selfRegService: SelfRegistrationService,
    private authService: Auth
    ,
    private snackBar: MatSnackBar
  ) {
    // Set up debounced search handler to avoid API calls on every keypress
    this.searchSub = this.searchInput$
      .pipe(
        debounceTime(350),
        distinctUntilChanged()
      )
      .subscribe((term: string) => {
        this.ngZone.run(() => {
          this.uhidSearchTerm = '';
          this.searchTerm = term || '';
          this.currentPage = 1;
          this.loadAllPatients();
        });
      });
  }

  ngOnInit(): void {
    console.log('🔄 SEARCH PATIENT: Component initialized - loading patients...');
    this.loadAllPatients();
    this.loadSelfRegisteredPatients(); // Load self-registered patients

    // DISABLED: BehaviorSubject subscription to prevent infinite loops
    console.log('🚫 DEPARTMENT STYLE: BehaviorSubject subscription disabled to prevent loops');
    // this.patientUpdateSubscription = this.patientService.patientsList$.subscribe((patients) => {
    //   console.log('🏥 DEPARTMENT STYLE: ✅ BehaviorSubject notification received!');
    //   console.log('🏥 DEPARTMENT STYLE: Patients count:', patients.length);
    //   console.log('🏥 DEPARTMENT STYLE: First patient:', patients[0]?.firstName, patients[0]?.lastName);

    //   if (patients.length > 0) {
    //     console.log('🏥 DEPARTMENT STYLE: Updating component data...');
    //     this.patients = patients;
    //     this.filteredPatients = patients;
    //     this.totalPatients = patients.length;
    //     // Remove manual change detection to prevent loops
    //     console.log('🏥 DEPARTMENT STYLE: Component updated successfully!');
    //   } else {
    //     console.log('🏥 DEPARTMENT STYLE: No patients received, keeping current data');
    //   }
    // });

    // DISABLED: Backup notification system to prevent infinite loops
    console.log('🚫 SEARCH PATIENT: Backup notification system disabled to prevent loops');
    // this.newPatientSubscription = this.patientService.patientUpdated$.subscribe(() => {
    //   console.log('🔄 SEARCH PATIENT: ✅ Backup notification RECEIVED - refreshing...');
    //   this.loadAllPatients();
    //   // Remove manual change detection to prevent loops
    // });

    // ENABLED: Refresh when navigating to this page (lightweight and safe)
    this.navigationSubscription = this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      if (event.urlAfterRedirects && event.urlAfterRedirects.includes('/reception/search-patient')) {
        console.log('🔄 SEARCH PATIENT: Navigation detected - refreshing list');
        this.loadAllPatients();
      }
    });

    // DISABLED: Window focus listener to prevent infinite loops
    // window.addEventListener('focus', () => {
    //   console.log('🔄 WINDOW FOCUS: Refreshing patient data...');
    //   this.loadAllPatients();
    // });

    // TESTING: Manual refresh button for debugging
    console.log('🧪 TESTING: Manual refresh available for debugging');

    console.log('✅ SEARCH PATIENT: DEPARTMENT STYLE subscriptions setup complete!');

    // 🔥 REAL-TIME SYNC: Check for force refresh flag
    this.checkForForceRefresh();

    // Check for new patient UHID
    this.checkForNewPatient();
  }

  ngOnDestroy(): void {
    // Clean up subscriptions
    if (this.patientUpdateSubscription) {
      this.patientUpdateSubscription.unsubscribe();
      console.log('🧹 SEARCH PATIENT: Patient update subscription cleaned up');
    }
    if (this.newPatientSubscription) {
      this.newPatientSubscription.unsubscribe();
      console.log('🧹 SEARCH PATIENT: New patient subscription cleaned up');
    }
    if (this.navigationSubscription) {
      this.navigationSubscription.unsubscribe();
      console.log('🧹 SEARCH PATIENT: Navigation subscription cleaned up');
    }
    if (this.searchSub) {
      this.searchSub.unsubscribe();
    }
  }

  private getCacheKey(page: number): string {
    return [
      this.searchTerm || '',
      this.selectedDateFilter || 'all',
      this.customDate || '',
      this.selectedAgeFilter || 'all',
      this.selectedGenderFilter || 'all',
      this.pageSize,
      page
    ].join('|');
  }

  loadAllPatients(soft: boolean = false): void {
    // Build filters and cache key
    const filters = {
      dateFilter: this.selectedDateFilter,
      customDate: this.customDate,
      ageFilter: this.selectedAgeFilter,
      genderFilter: this.selectedGenderFilter,
      // Fresh network for full loads; allow cache for soft (Prev/Next) loads
      nocache: !soft,
      sortBy: 'registrationDate',
      sortOrder: 'desc'
    };

    // Perf: mark start
    this.lastLabel = `SP page=${this.currentPage} soft=${soft}`;
    this.lastStartMs = performance.now();
    if (this.perfDebug) {
      console.time(`HTTP ${this.lastLabel}`);
    }

    const cacheKey = this.getCacheKey(this.currentPage);

    // Seed from sessionStorage if available (persisted cache across navigations)
    try {
      if (!this.pageCache.has(cacheKey)) {
        const raw = sessionStorage.getItem('sp:' + cacheKey);
        if (raw) this.pageCache.set(cacheKey, JSON.parse(raw));
      }
    } catch {}

    // If we have cached data for this view, show it instantly (stale-while-revalidate)
    const cached = this.pageCache.get(cacheKey);
    if (cached) {
      this.ngZone.run(() => {
        const t0 = performance.now();
        this.patients = cached.patients || [];
        this.filteredPatients = [...this.patients];
        this.totalPages = cached.totalPages || 1;
        this.totalPatients = cached.totalPatients || 0;
        this.applyUhidFilterIfAny();
        this.cdr.detectChanges();
        if (this.perfDebug) {
          const dt = Math.round(performance.now() - t0);
          console.log(`⚡ CACHE HIT (${this.lastLabel}) -> render ${dt}ms, patients=${this.patients.length}`);
        }
      });
    } else {
      if (this.perfDebug) {
        console.log(`ℹ️ CACHE MISS (${this.lastLabel})`);
      }
    }

    // Indicate background fetch; keep table visible
    if (soft) {
      this.isPageLoading = true;
    } else {
      this.isLoading = true;
    }

    // Cancel any in-flight request to keep only the latest
    if (this.pendingRequestSub) {
      this.pendingRequestSub.unsubscribe();
    }

    // Force clear any stale local flags so we don't block refreshes
    try { localStorage.removeItem('newPatientRegistered'); } catch {}

    this.pendingRequestSub = this.patientService
      .getAllPatients(this.currentPage, this.pageSize, this.searchTerm, false, filters)
      .pipe(
        finalize(() => {
          this.ngZone.run(() => {
            if (soft) {
              this.isPageLoading = false;
            } else {
              this.isLoading = false;
            }
            this.cdr.detectChanges();
          });
        })
      )
      .subscribe({
        next: (response) => {
          this.ngZone.run(() => {
            const networkEnd = performance.now();
            if (this.perfDebug) {
              const net = Math.round(networkEnd - this.lastStartMs);
              console.log(`⏱️ HTTP DONE (${this.lastLabel}) in ${net}ms`);
            }
            const patients = response.patients || [];

            // Update state
            const r0 = performance.now();
            this.patients = patients;
            this.filteredPatients = [...patients];
            this.applyUhidFilterIfAny();

            // Pagination totals mapping
            if (response.pagination) {
              this.totalPages = response.pagination.totalPages || 1;
              this.totalPatients = response.pagination.totalPatients || 0;
            } else {
              this.totalPages = response.totalPages || 1;
              this.totalPatients = response.total || 0;
            }

            if (this.perfDebug) {
              const renderMs = Math.round(performance.now() - r0);
              console.log(`🎨 RENDER (${this.lastLabel}) took ${renderMs}ms, rows=${this.patients.length}`);
            }

            // Cache for instant Prev/Next + persist in sessionStorage
            const snapshot = {
              patients: this.patients,
              totalPages: this.totalPages,
              totalPatients: this.totalPatients
            };
            this.pageCache.set(cacheKey, snapshot);
            try { sessionStorage.setItem('sp:' + cacheKey, JSON.stringify(snapshot)); } catch {}

            // Background prefetch previous/next ±3 pages for instant clicks
            const neighbors = [
              this.currentPage - 3,
              this.currentPage - 2,
              this.currentPage - 1,
              this.currentPage + 1,
              this.currentPage + 2,
              this.currentPage + 3
            ].filter(p => p >= 1 && p <= this.totalPages);
            neighbors.forEach((p) => {
              const k = this.getCacheKey(p);
              if (!this.pageCache.has(k)) {
                this.patientService.getAllPatients(p, this.pageSize, this.searchTerm, false, filters)
                  .subscribe({
                    next: (r) => {
                      const np = r.patients || [];
                      const tp = r.pagination?.totalPatients ?? r.total ?? 0;
                      const tpg = r.pagination?.totalPages ?? r.totalPages ?? 1;
                      const snap = { patients: np, totalPatients: tp, totalPages: tpg };
                      this.pageCache.set(k, snap);
                      try { sessionStorage.setItem('sp:' + k, JSON.stringify(snap)); } catch {}
                    },
                    error: () => {}
                  });
              }
            });

            console.log(`📄 SEARCH PATIENT: Loaded ${this.patients.length} patients on page ${this.currentPage}`);
          });
        },
        error: (error) => {
          this.ngZone.run(() => {
            console.error('❌ SEARCH PATIENT: Error loading patients:', error);
            if (!cached) {
              this.patients = [];
            }
          });
        }
      });
  }

  onSearchChange(value?: string): void {
    // When using general search, clear UHID-only filter and debounce
    const term = value !== undefined ? value : this.searchTerm;
    this.searchInput$.next(term ?? '');
  }

  onFilterChange(): void {
    this.currentPage = 1; // Reset to first page when filtering
    this.loadAllPatients(); // Reload with filters
  }

  onDateFilterChange(): void {
    // Clear custom date when switching away from custom
    if (this.selectedDateFilter !== 'custom') {
      this.customDate = '';
    }
    this.currentPage = 1; // Reset to first page when filtering
    this.loadAllPatients(); // Reload with filters
  }

  onCustomDateChange(): void {
    console.log('📅 Custom date selected:', this.customDate);
    this.currentPage = 1; // Reset to first page when filtering
    this.loadAllPatients(); // Reload with filters
  }

  clearCustomDate(): void {
    this.customDate = '';
    this.selectedDateFilter = 'all';
    this.currentPage = 1; // Reset to first page when filtering
    this.loadAllPatients(); // Reload with filters
  }

  setQuickDate(type: 'today' | 'yesterday'): void {
    const date = new Date();
    if (type === 'yesterday') {
      date.setDate(date.getDate() - 1);
    }

    // Format date as YYYY-MM-DD for input[type="date"]
    this.customDate = date.toISOString().split('T')[0];
    console.log(`📅 Quick date set to ${type}:`, this.customDate);
    this.currentPage = 1; // Reset to first page when filtering
    this.loadAllPatients(); // Reload with filters
  }

  // Note: Client-side filtering removed - all filtering now handled server-side
  // Filters are passed to backend via loadAllPatients() method

  // Note: Pagination now handled by backend response
  // No need for client-side pagination calculation

  clearSearch(): void {
    this.searchTerm = '';
    this.selectedDateFilter = 'all';
    this.selectedAgeFilter = 'all';
    this.selectedGenderFilter = 'all';
    this.customDate = '';
    this.currentPage = 1;
    this.loadAllPatients(); // Reload without search
  }

  clearAllFilters(): void {
    this.searchTerm = '';
    this.selectedDateFilter = 'all';
    this.selectedAgeFilter = 'all';
    this.selectedGenderFilter = 'all';
    this.selectedSourceFilter = 'all';
    this.customDate = '';
    this.currentPage = 1;
    this.loadAllPatients(); // Reload without filters
  }

  // Source filter change handler
  onSourceFilterChange(): void {
    this.currentPage = 1;
    this.applySourceFilter();
  }

  // Load self-registered patients
  loadSelfRegisteredPatients(): void {
    const labCode = this.getCurrentLabCode();
    if (!labCode) {
      console.log('⚠️ No lab code available for self-registration fetch');
      this.selfRegisteredPatients = [];
      return;
    }

    this.selfRegService.listRecentByCode(labCode).subscribe({
      next: async (res) => {
        try {
          const items = res?.items || [];

          // Assign server-backed registration numbers where possible (async)
          const assigned = await Promise.all(items.map(async (sr: any) => {
            // Try to get server-assigned SR number; if it fails, fall back to local mapping
            let reg = '-';
            try {
              reg = await this.assignServerNumberFor(sr, 'self');
            } catch (e) {
              console.warn('⚠️ assignServerNumberFor failed, falling back to local generation:', (e as any)?.message || e);
              reg = this.generateLocalRegistration(sr, 'self');
            }

            return {
              _id: sr.id,
              firstName: sr.firstName || '',
              lastName: sr.lastName || '',
              phone: sr.phone || '',
              gender: sr.gender || '',
              age: sr.age || '',
              address: sr.address ? { city: sr.city, street: sr.address } : { city: sr.city },
              createdAt: sr.createdAt,
              preferredDate: sr.preferredDate,
              preferredTime: sr.preferredTime,
              testsNote: sr.testsNote,
              homeCollection: sr.homeCollection,
              source: 'self', // Mark as self-registered
              registrationNumber: reg,
              patientId: sr.patientId || sr.id || undefined
            };
          }));

          this.selfRegisteredPatients = assigned;
          console.log(`📱 Loaded ${this.selfRegisteredPatients.length} self-registered patients`);
          this.applySourceFilter();
        } catch (errInner) {
          console.error('❌ Error processing self-registered patients:', errInner);
          this.selfRegisteredPatients = [];
        }
      },
      error: (err) => {
        console.error('❌ Error loading self-registered patients:', err);
        this.selfRegisteredPatients = [];
      }
    });
  }

  // Try to get or reserve a server-side registration number for a self/lab registration.
  // Returns formatted id like 'SR-0001' or 'LAB-0001'. Throws on failure.
  private async assignServerNumberFor(sr: any, kind: 'self' | 'lab' = 'self'): Promise<string> {
    const lab = this.getCurrentLabCode() || 'global';
    const mapKey = `${kind}RegMap:${lab}`;
    const idKey = sr.id || sr._id || sr.patientId || String(Date.now());

    // Check existing mapping first
    try {
      const raw = localStorage.getItem(mapKey);
      if (raw) {
        const map = JSON.parse(raw) || {};
        if (map[idKey]) return String(map[idKey]);
      }
    } catch {}

    // Reserve on server
    const counterName = kind === 'self' ? `self_registration_${lab}` : `lab_registration_${lab}`;
    const format = kind === 'self' ? 'SR-' : 'LAB-';
    const padding = 4;
    const url = `${environment.apiUrl}/counter-management/next/${encodeURIComponent(counterName)}`;
    const token = this.authService.getToken();

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ format, padding })
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(`Server returned ${resp.status}: ${txt}`);
    }

    const payload = await resp.json();
    const formatted = payload?.data?.formattedId || payload?.data?.formatted || payload?.data;
    if (!formatted) throw new Error('No formatted id from counter service');

    // Persist mapping locally
    try {
      const raw = localStorage.getItem(mapKey);
      const map = raw ? (JSON.parse(raw) || {}) : {};
      map[idKey] = String(formatted);
      localStorage.setItem(mapKey, JSON.stringify(map));
    } catch {}

    return String(formatted);
  }

  // Apply source filter to combine or filter patients
  applySourceFilter(): void {
    const labPatients = this.patients.map(p => ({ ...p, source: 'lab' }));

    if (this.selectedSourceFilter === 'self') {
      this.filteredPatients = [...this.selfRegisteredPatients];
      this.totalPatients = this.selfRegisteredPatients.length;
    } else if (this.selectedSourceFilter === 'lab') {
      // Ensure lab patients have a display registration number; create a local LAB-<n> if missing,
      // and try to reserve a server LAB number asynchronously.
      const assigned = labPatients.map(p => ({ ...p }));
      assigned.forEach(p => {
        if (!p.registrationNumber || String(p.registrationNumber).trim() === '' || String(p.registrationNumber) === '-') {
          p.registrationNumber = this.generateLocalRegistration(p, 'lab');
          // Fire-and-forget server reservation to make numbering authoritative
          (async () => {
            try {
              const formatted = await this.assignServerNumberFor(p, 'lab');
              p.registrationNumber = formatted;
              try { this.cdr.detectChanges(); } catch {}
            } catch (e) {
              // ignore
            }
          })();
        }
      });

      this.filteredPatients = assigned;
      this.totalPatients = assigned.length;
    } else {
      // 'all' - combine both
      const assignedLab = labPatients.map(p => ({ ...p }));
      assignedLab.forEach(p => {
        if (!p.registrationNumber || String(p.registrationNumber).trim() === '' || String(p.registrationNumber) === '-') {
          p.registrationNumber = this.generateLocalRegistration(p, 'lab');
          (async () => {
            try {
              const formatted = await this.assignServerNumberFor(p, 'lab');
              p.registrationNumber = formatted;
              try { this.cdr.detectChanges(); } catch {}
            } catch (e) {
              // ignore
            }
          })();
        }
      });

      this.filteredPatients = [...this.selfRegisteredPatients, ...assignedLab];
      this.totalPatients = this.filteredPatients.length;
    }

    // Apply UHID filter if any
    this.applyUhidFilterIfAny();
    this.cdr.detectChanges();
  }

  // Get patient source badge
  getPatientSourceBadge(patient: any): string {
    return patient?.source === 'self' ? '🏠 Self' : '🏥 Lab';
  }

  refreshPatients(): void {
    console.log('🔄 REFRESH: Refreshing patient data...');
    this.currentPage = 1;
    this.searchTerm = '';
    this.selectedDateFilter = 'all';
    this.selectedAgeFilter = 'all';
    this.selectedGenderFilter = 'all';
    this.customDate = '';
    this.loadAllPatients();
  }

  // Format address object to string for display
  getFormattedAddress(patient: any): string {
    if (!patient.address) return '';
    if (typeof patient.address === 'string') return patient.address;
    if (typeof patient.address === 'object') {
      const p = patient.address;
      return [p.street, p.city, p.state, p.zipCode, p.post].filter(Boolean).join(', ');
    }
    return '';
  }

  // Display simple numeric Registration No.; fallback to UHID-derived number
  displayRegNo(patient: any): string {
    if (patient && patient.registrationNumber != null) {
      return String(patient.registrationNumber);
    }
    const raw = (patient?.patientId || patient?.uhid || '').toString();
    if (!raw) return '';
    const d = parseInt(raw.replace('PAT', '').replace(/^0+/, ''), 10);
    return isNaN(d) ? '' : String(d);
  }

  // Local fallback generator for registration numbers when server reservation fails or is unavailable.
  // Produces stable per-lab, per-kind numbers stored in localStorage: e.g., SR-0001 or LAB-0001
  private generateLocalRegistration(sr: any, kind: 'self' | 'lab' = 'self'): string {
    try {
      const lab = this.getCurrentLabCode() || 'global';
      const counterKey = `${kind}RegCounter:${lab}`;
      const mapKey = `${kind}RegMap:${lab}`;

      let map: { [key: string]: string } = {};
      try {
        const raw = localStorage.getItem(mapKey);
        if (raw) map = JSON.parse(raw) || {};
      } catch {}

      const idKey = sr.id || sr._id || sr.patientId || String(Date.now());
      if (map[idKey]) return String(map[idKey]);

      let counter = 0;
      try { counter = parseInt(localStorage.getItem(counterKey) || '0', 10) || 0; } catch {}
      counter = counter + 1;
      map[idKey] = (kind === 'self' ? 'SR-' : 'LAB-') + String(counter).padStart(4, '0');

      try {
        localStorage.setItem(counterKey, String(counter));
        localStorage.setItem(mapKey, JSON.stringify(map));
      } catch {}

      return map[idKey];
    } catch (e) {
      const fallback = String(Date.now()).slice(-6);
      return (kind === 'self' ? 'SR-' : 'LAB-') + fallback;
    }
  }


  // Pagination methods
  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages && !this.isPageLoading) {
      this.currentPage = page;
      this.loadAllPatients(true); // Soft load for fast page switch
    }
  }

  getStartIndex(): number {
    return (this.currentPage - 1) * this.pageSize + 1;
  }

  getEndIndex(): number {
    const end = this.currentPage * this.pageSize;
    return Math.min(end, this.totalPatients);
  }

  getVisiblePages(): number[] {
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

  getPaginatedPatients(): any[] {
    // Return current filtered list (no pagination UI)
    return this.filteredPatients;
  }

  // UHID-only filter handlers
  onUhidSearch(): void {
    const term = (this.uhidSearchTerm || '').trim().toUpperCase();
    if (!term) {
      this.clearUhid();
      return;
    }

    // Instant single-record fetch from backend (global search)
    this.isLoading = true;
    this.patientService
      .getPatientByRegistrationNumber(term)
      .pipe(finalize(() => {
        this.isLoading = false;
        this.cdr.detectChanges();
      }))
      .subscribe({
        next: (res) => {
          const p = res?.patient || res;
          if (p) {
            this.patients = [p];
            this.filteredPatients = [p];
            this.totalPages = 1;
            this.totalPatients = 1;
          } else {
            this.patients = [];
            this.filteredPatients = [];
            this.totalPages = 1;
            this.totalPatients = 0;
          }
        },
        error: (_err) => {
          this.patients = [];
          this.filteredPatients = [];
          this.totalPages = 1;
          this.totalPatients = 0;
        }
      });
  }

  onUhidChange(value: string): void {
    if (!value || !String(value).trim()) {
      this.clearUhid();
    }
  }

  clearUhid(): void {
    this.uhidSearchTerm = '';
    this.currentPage = 1;
    // Reload full list instantly
    this.loadAllPatients();
  }

  private applyUhidFilterIfAny(): void {
    const term = (this.uhidSearchTerm || '').trim();
    if (!term) {
      this.filteredPatients = [...this.patients];
      return;
    }
    // If numeric, match registrationNumber exactly
    if (/^\d+$/.test(term)) {
      this.filteredPatients = this.patients.filter(p => String(p?.registrationNumber ?? '').trim() === term);
      return;
    }
    const upper = term.toUpperCase();
    this.filteredPatients = this.patients.filter(p => {
      const id = (p.patientId || p.uhid || '').toString().toUpperCase();
      return id === upper; // exact match only
    });
  }

  hasActiveFilters(): boolean {
    return this.uhidSearchTerm.trim() !== '' ||
           this.searchTerm.trim() !== '' ||
           this.selectedDateFilter !== 'all' ||
           this.selectedAgeFilter !== 'all' ||
           this.selectedGenderFilter !== 'all' ||
           this.selectedSourceFilter !== 'all' ||
           this.customDate !== '';
  }

  // Patient action methods
  viewPatient(patient: any): void {
    console.log('👁️ VIEW PATIENT:', patient);
    const dialogRef = this.dialog.open(PatientViewModalComponent, {
      width: '90%',
      maxWidth: '1200px',
      height: '90%',
      data: {
        patient: patient,
        mode: 'view'
      },
      disableClose: false
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        console.log('✅ VIEW MODAL CLOSED:', result);
      }
    });
  }

  editPatient(patient: any): void {
    console.log('✏️ EDIT PATIENT:', patient);
    const dialogRef = this.dialog.open(PatientViewModalComponent, {
      width: '90%',
      maxWidth: '1200px',
      height: '90%',
      data: {
        patient: patient,
        mode: 'edit'
      },
      disableClose: false
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && result.updated) {
        console.log('✅ PATIENT UPDATED:', result);
        // Refresh the patient list to show updated data
        this.refreshPatients();
      }
    });
  }

  // Delete patient methods
  deletePatient(patient: any): void {
    this.patientToDelete = patient;
    this.deleteMessage = `You are about to remove patient "${patient.firstName} ${patient.lastName || ''}" forever. Once deleted, this cannot be restored.`;
    this.showDeleteConfirmation = true;
  }

  // Delete Confirmation Methods
  cancelDelete(): void {
    this.showDeleteConfirmation = false;
    this.patientToDelete = null;
    this.deleteMessage = '';
  }

  confirmDelete(): void {
    if (this.patientToDelete) {
      this.patientService.deletePatient(this.patientToDelete._id).subscribe({
        next: (response) => {
          console.log('Patient deleted successfully:', response);
          this.showDeleteSuccess = true;
          this.cancelDelete();
          // Refresh the patient list
          this.refreshPatients();
        },
        error: (error) => {
          console.error('Error deleting patient:', error);
          alert('Error deleting patient. Please try again.');
          this.cancelDelete();
        }
      });
    }
  }

  // Delete Success Methods
  onDeleteSuccessClosed(): void {
    this.showDeleteSuccess = false;
  }

  // Register self-registered patient as lab patient
  registerSelfPatient(patient: any): void {
    console.log('📝 Registering self-patient as lab patient:', patient);
    // Navigate to patient registration with pre-filled data
    this.router.navigate(['/reception/patient-registration'], {
      state: {
        prefillData: {
          firstName: patient.firstName || '',
          lastName: patient.lastName || '',
          phone: patient.phone || '',
          gender: patient.gender || '',
          age: patient.age || '',
          address: patient.address?.street || patient.address || '',
          city: patient.address?.city || ''
        },
        fromSelfRegistration: true
      }
    });
  }

  // Navigation methods for tabs

  navigateToSearchPatient() {
    this.router.navigate(['/reception/search-patient']);
  }

  navigateToOpdRegistration() {
    this.router.navigate(['/reception/opd-registration']);
  }

  navigateToPatientRegistration() {
    this.router.navigate(['/reception/patient-registration']);
  }

  // Check for new patient in localStorage and auto-fill search
  checkForNewPatient(): void {
    const newPatient = localStorage.getItem('newPatient');
    const latestPatient = localStorage.getItem('latestPatient');

    if (newPatient) {
      try {
        const patientData = JSON.parse(newPatient);
        console.log('🆕 SEARCH PATIENT: Found new patient in localStorage:', patientData);

        // Auto-fill search term with UHID
        if (patientData.patientId) {
          this.searchTerm = patientData.patientId;
          console.log('✅ SEARCH PATIENT: Auto-filled search with UHID:', patientData.patientId);

          // Trigger search
          this.onSearchChange();
        }

        // Clear localStorage
        localStorage.removeItem('newPatient');

      } catch (error) {
        console.error('SEARCH PATIENT: Error parsing new patient data:', error);
      }
    }

    if (latestPatient) {
      try {
        const patientData = JSON.parse(latestPatient);
        console.log('📝 SEARCH PATIENT: Found latest patient in localStorage:', patientData);

        // Auto-fill search term with UHID if not already filled
        if (patientData.patientId && !this.searchTerm) {
          this.searchTerm = patientData.patientId;
          console.log('✅ SEARCH PATIENT: Auto-filled search with latest UHID:', patientData.patientId);

          // Trigger search
          this.onSearchChange();
        }

      } catch (error) {
        console.error('SEARCH PATIENT: Error parsing latest patient data:', error);
      }
    }
  }

  // Track by function for ngFor performance
  trackByPatientId(index: number, patient: any): any {
    return patient.patientId || patient.uhid || patient._id || index;
  }

  // Get page numbers for pagination
  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxPagesToShow = 5;
    const halfRange = Math.floor(maxPagesToShow / 2);

    let startPage = Math.max(1, this.currentPage - halfRange);
    let endPage = Math.min(this.totalPages, this.currentPage + halfRange);

    // Adjust if we're near the beginning or end
    if (endPage - startPage + 1 < maxPagesToShow) {
      if (startPage === 1) {
        endPage = Math.min(this.totalPages, startPage + maxPagesToShow - 1);
      } else {
        startPage = Math.max(1, endPage - maxPagesToShow + 1);
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return pages;
  }



  // 🔥 REAL-TIME SYNC: Check for force refresh flag
  private checkForForceRefresh(): void {
    const forceRefresh = localStorage.getItem('forceSearchRefresh');
    const latestPatient = localStorage.getItem('latestPatient');

    if (forceRefresh === 'true') {
      console.log('🔄 SEARCH PATIENT: Force refresh flag detected');

      // Clear flag
      localStorage.removeItem('forceSearchRefresh');

      // Force immediate refresh
      this.loadAllPatients();

      // If we have latest patient data, highlight it
      if (latestPatient) {
        try {
          const patientData = JSON.parse(latestPatient);
          this.newlyAddedPatientId = patientData._id;
          console.log('✅ SEARCH PATIENT: Latest patient will be highlighted:', patientData.patientId);
        } catch (error) {
          console.error('❌ SEARCH PATIENT: Error parsing latest patient:', error);
        }
      }
    }
  }

  // Helper to get current lab code
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

  /**
   * Mark sample as collected for a self-registered patient
   */
  markSampleCollected(patient: any): void {
    console.log('🧪 MARK SAMPLE COLLECTED:', patient);
    // TODO: Implement sample collection marking logic
    // For now, just show a notification
    this.snackBar.open('Sample collected for ' + (patient.fullName || patient.name), 'Close', {
      duration: 3000
    });
  }

  /**
   * Create a pathology report for a self-registered patient
   */
  createReportForPatient(patient: any): void {
    console.log('📋 CREATE REPORT FOR PATIENT:', patient);
    // Navigate to pathology registration with patient data
    this.router.navigate(['/pathology-module/pathology-entry'], {
      queryParams: {
        patientId: patient._id || patient.id,
        uhid: patient.uhid,
        name: patient.fullName || patient.name,
        source: 'self-registration'
      }
    });
  }
}

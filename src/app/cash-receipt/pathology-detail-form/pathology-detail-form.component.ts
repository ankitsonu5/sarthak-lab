import { Component, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { Router, ActivatedRoute, NavigationEnd } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { PathologyService, PathologyTest, Patient, TestParameter, TestInfo } from '../pathology.service';
import { ServiceHeadService, ServiceHead } from '../../services/service-head.service';
import { PatientService } from '../../reception/patient.service';
import { DoctorService, Doctor } from '../../setup/doctors/services/doctor.service';
import { CategoryHeadService, CategoryHead } from '../../setup/category-heads/services/category-head.service';
import { PathologyInvoiceService, PathologyInvoiceData } from '../../services/pathology-invoice.service';
import { DataRefreshService } from '../../core/services/data-refresh.service';
import { AlertService } from '../../shared/services/alert.service';
import { trigger, state, style, transition, animate } from '@angular/animations';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../../environments/environment';

import { AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { LabSettingsService, LabSettings } from '../../setup/lab-setup/lab-settings.service';
import { DefaultLabConfigService } from '../../core/services/default-lab-config.service';

@Component({
  selector: 'app-pathology-detail-form',
  standalone: false,
  templateUrl: './pathology-detail-form.component.html',
  styleUrls: ['./pathology-detail-form.component.css'],
  animations: [
    trigger('slideDown', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-10px)' }),
        animate('200ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ])
  ]
})
export class PathologyDetailFormComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('registrationNumberInput') registrationNumberInput?: ElementRef<HTMLInputElement>;
  @ViewChild('doctorRefNoInput') doctorRefNoInput?: ElementRef<HTMLInputElement>;

  // Make top section read-only except Mode and Doctor Ref No.
  topReadOnly: boolean = true;
  // Lock gender selection when coming from Patient Registration
  isGenderLocked: boolean = false;
  // Compact two-column billing layout toggle (screenshot-like)
  showCompactBillingLayout: boolean = true;

  // View modal state for Today's Invoices table
  showViewModal: boolean = false;
  selectedViewRecord: any = null;
  pathologyForm!: FormGroup;
  patients: Patient[] = [];
  doctors: Doctor[] = [];
  serviceCategories: CategoryHead[] = [];

  availableTests: any[] = [];
  selectedTestsDropdown: string[] = [];
  addedTests: any[] = [];
  totalCost = 0;
  isSubmitting = false;
  isEditMode = false;
  testId?: string;
  editingInvoiceId?: string;
  originalReceiptNumber?: string;
  // Use LOCAL date (not UTC) so after midnight date switches correctly in IST
  today: string = (() => { const d = new Date(); const y = d.getFullYear(); const m = String(d.getMonth()+1).padStart(2,'0'); const da = String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; })();
  selectedPatient: Patient | null = null;
  selectedTestId: string = '';
  doctorRefNo = '';

  // Lock state for edit-protection (Pathology Registration / Report)
  isCashEditLockedHard = false;   // Report generated
  isCashEditLockedSoft = false;   // Registration exists but not allowed
  cashEditLockReason = '';

  // New dynamic functionality properties
  filteredTests: any[] = [];
  selectedServiceCategory = '';
  selectedServiceHead = '';
  selectedServiceHeads: string[] = [];
  searchTerm = '';


  // Icon-only category dropdown state
  showCatIconDropdown: boolean = false;




  // Calculation properties
  subtotal = 0;
  totalDiscount = 0;
  netPayableAmount = 0;
  // For edit-mode cash adjustment logic
  // Payment entry UI state
  amountReceived: number = 0;
  get paymentBalance(): number {
    const net = Number(this.netPayableAmount || 0);
    const rec = Number(this.amountReceived || 0);
    const bal = net - rec;
    return bal > 0 ? Math.round(bal) : 0;
  }

  onAmountReceivedInput(evt: any): void {
    let val = Number((evt?.target?.value ?? '').toString().trim());
    if (isNaN(val) || val < 0) val = 0;
    const max = Number(this.netPayableAmount || 0);
    if (val > max) val = max;
    this.amountReceived = val;
    try { this.safeDetectChanges(); } catch {}
  }

  originalTotalAmount: number = 0; // previously paid total
  editBaselineTotal: number = 0;


  // --- Edit-mode adjustment helpers ---
  private deriveOriginalTotal(invoice: any): number {
    try {
      const paymentTotal = Number(invoice?.payment?.totalAmount ?? invoice?.totalAmount ?? 0);
      const tests: any[] = Array.isArray(invoice?.testDetails)
        ? invoice.testDetails
        : (Array.isArray(invoice?.tests) ? invoice.tests : []);

      if (Array.isArray(tests) && tests.length > 0) {
        let sum = 0;
        for (const t of tests) {
          const hasNet = t != null && t.netAmount != null && !isNaN(Number(t.netAmount));
          if (hasNet) {
            sum += Number(t.netAmount);
          } else {
            const base = Number(t?.amount ?? t?.cost ?? t?.price ?? 0);
            const disc = Number(t?.discount ?? 0);
            sum += (base - disc);
          }
        }
        // Prefer backend-stored total if valid; otherwise, use computed
        return paymentTotal > 0 ? paymentTotal : sum;
      }
      return paymentTotal || 0;
    } catch {
      return Number(invoice?.payment?.totalAmount ?? invoice?.totalAmount ?? 0) || 0;
    }
  }

  get adjustmentDelta(): number {
    const baseline = Number(this.editBaselineTotal ?? this.originalTotalAmount ?? 0);
    return Math.round((Number(this.netPayableAmount) || 0) - baseline);
  }

  get adjustmentAbs(): number { return Math.abs(this.adjustmentDelta); }

  get adjustmentDirection(): string {
    return this.adjustmentDelta > 0 ? 'Collect from Patient' : (this.adjustmentDelta < 0 ? 'Refund to Patient' : 'No Adjustment');
  }


  // Department and doctor management
  departments: any[] = [];
  filteredDoctors: any[] = [];
  selectedDepartment = '';

  // Patient data from registration
  patientRegistrationData: any = null;
  appointmentData: any = null;

  // For registration number search
  private searchTimeout: any;

  // Logo for print
  logoBase64: string = '';

  // Lab branding settings loaded from Lab Setup
  labSettings: LabSettings | null = null;

  // Department/Doctor handling for query params
  pendingDepartmentName: string = '';
  pendingDepartmentId: string = '';
  pendingDoctorName: string = '';
  pendingDoctorId: string = '';

  // Backend invoice data
  todaysInvoices: any[] = [];
  isSearching = false; // Prevent search loops

  // testTypes will be loaded dynamically from service heads



  statusOptions = [
    'Pending',
    'Sample Collected',
    'In Progress',
    'Completed',
    'Reported'
  ];

  // Invoice data and print functionality
  showPrintButton = false;
  invoiceData: any = null;
  paymentCompleted = false;
  showPatientPaidData = false;

  // Store all paid patients for display
  paidPatients: any[] = [];

  // Store current selected category object for easy access
  currentSelectedCategoryObject: any = null;

  private destroyed = false;

  // Safe wrapper to avoid NG0130 after destroy
  private safeDetectChanges(): void {
    if (!this.destroyed) {
      try { this.cdr.detectChanges(); } catch {}
    }
  }

  private safeTimeout(fn: () => void, ms: number): void {
    setTimeout(() => { if (!this.destroyed) { try { fn(); } catch {} } }, ms);
  }

  constructor(
    private fb: FormBuilder,
    private http: HttpClient,
    private pathologyService: PathologyService,
    public serviceHeadService: ServiceHeadService,
    private patientService: PatientService,
    private doctorService: DoctorService,
    private categoryHeadService: CategoryHeadService,
    private pathologyInvoiceService: PathologyInvoiceService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private dataRefresh: DataRefreshService,
    private alertService: AlertService,
    private labService: LabSettingsService,
    private defaultLabConfig: DefaultLabConfigService
  ) {}

  private routerSub?: any;
  private patientUpdateSub?: any;


  // Success alert helper using new AlertService
  private showSuccess(message: string, title: string = '🎉 Success!'): void {
    this.alertService.showSuccess(title, message);
  }

  ngOnInit(): void {
    console.log('🚀 COMPONENT INIT - Starting...');
    this.initializeForm();
    this.loadDropdownData();
    this.loadServiceCategories(); // Load real categories from setup

    // Debug initial state
    console.log('🔍 INITIAL STATE:', {
      selectedServiceCategory: this.selectedServiceCategory,
      currentSelectedCategoryObject: this.currentSelectedCategoryObject,
      serviceCategories: this.serviceCategories
    });
    this.seedServiceHeadsData();
    /* removed fallback data: using dynamic tests only */

    // Load Lab Settings (cache + refresh) for branding/logo
    try {
      const cached = localStorage.getItem('labSettings');
      if (cached) this.labSettings = JSON.parse(cached);
    } catch {}
    try {
      this.labService.getMyLab().subscribe({
        next: (res) => {
          this.labSettings = res.lab || this.labSettings;
          if (this.labSettings?.logoDataUrl) this.logoBase64 = this.labSettings.logoDataUrl;
          try { this.cdr.detectChanges(); } catch {}
        },
        error: () => {}
      });
    } catch {}

    this.loadLogo(); // Ensure logo present for print

    // Load today's cached invoices first for instant UI, then fetch from backend
    this.loadTodaysPaidPatientsFromLocalStorage();
    this.loadTodaysInvoicesFromBackend(); // Load today's invoices from backend

    // Auto-refresh when navigating back to this screen
    this.routerSub = this.router.events.subscribe((evt) => {
      if (evt instanceof NavigationEnd) {
        const url = (evt.urlAfterRedirects || evt.url || '').toString();
        if (url.includes('/cash-receipt/register-opt-ipd') || url.includes('/cash-receipt/register-opd-ipd') || url.includes('/cash-receipt/generate-report')) {
          this.loadTodaysInvoicesFromBackend();
          try { this.updateDisplayedPaidPatients(); } catch {}
        }
      }
    });

    // Refresh invoices and the currently selected patient's snapshot when patient master data changes
    try {
      this.patientUpdateSub = this.patientService.patientUpdated$.subscribe(() => {
        console.log('🔄 Patient update detected — refreshing invoices and current form fields');
        // Reload today's invoices so table reflects latest age/phone/address
        this.loadTodaysInvoicesFromBackend();
        // If a patient is selected in the form, pull the latest details and patch
        const selId: any = (this.selectedPatient as any)?._id;
        if (selId) {
          this.patientService.getPatientById(selId).subscribe({
            next: (resp: any) => {
              const p = resp?.patient || resp;
              if (!p) return;
              const parsed = this.parseAgeValue(p.age, (p as any)?.ageIn);
              this.pathologyForm.patchValue({
                contact: p.phone || p.contact || this.pathologyForm.get('contact')?.value,
                address: this.formatPatientAddress(p.address, p) || this.pathologyForm.get('address')?.value,
                age: parsed.num || '',
                ageIn: parsed.ageIn,
                gender: (p.gender || this.pathologyForm.get('gender')?.value || '').toString().toUpperCase()
              });
              this.selectedPatient = {
                ...(this.selectedPatient || {}),
                age: p.age,
                ageIn: (p as any)?.ageIn,
                gender: p.gender || (this.selectedPatient as any)?.gender,
                contact: p.phone || p.contact || (this.selectedPatient as any)?.contact,
                address: this.formatPatientAddress(p.address, p) || (this.selectedPatient as any)?.address
              } as any;
              this.safeDetectChanges();
            },
            error: (e:any) => console.warn('⚠️ Failed to refresh selected patient after update:', e)
          });
        }
      });
    } catch {}


    // Check if editing existing test
    this.testId = this.route.snapshot.paramMap.get('id') || undefined;
    if (this.testId) {
      this.isEditMode = true;
      this.loadTestData(this.testId);
    }

    // Handle patient data from OPD Registration query parameters
    this.handlePatientDataFromQueryParams();

    // Check for edit mode from invoice table
    this.checkEditMode();
  }

  // Derived view-model for today's paid patients to avoid template method calls
  displayedPaidPatients: any[] = [];

  // Simple filters for table
  receiptFilter: string = '';
  registrationFilter: string = '';

  // Recompute displayed list when sources change (prevents endless change loops)
  updateDisplayedPaidPatients(): void {
    // Merge backend + local so freshly-paid rows never disappear during refresh cycles
    const merged = this.mergeInvoiceLists((this.paidPatients || []), (this.todaysInvoices || []));
    const source = merged;

    // Map to view model
    const toView = (invoice: any) => {
      const createdAt = invoice.createdAt;
      const updatedAt = invoice.updatedAt;
      const hasEditHistory = Boolean(
        invoice.isEdited ||
        (invoice.editHistory && invoice.editHistory.length) ||
        (updatedAt && createdAt && String(updatedAt) !== String(createdAt))
      );

      // Normalize age to a display string like '5 M' regardless of source shape
      const rawAge = (((invoice.patient || {}).age ?? invoice.age ?? '') + '').toString();
      let ageInSrc = (((invoice.patient || {}).ageIn ?? invoice.ageIn ?? '') + '').toString().toLowerCase();
      // Handle cases like '9days' or '9 Days' by stripping leading numbers
      ageInSrc = ageInSrc.replace(/^\s*\d+\s*/, '');
      let ageDisplay = '';
      if (rawAge) {
        const m = rawAge.match(/^\s*(\d+)\s*([YMD])\s*$/i);
        if (m) {
          ageDisplay = `${m[1]} ${m[2].toUpperCase()}`;
        } else {
          const n = parseInt(rawAge, 10);
          if (!isNaN(n)) {
            let unit = 'Y';
            if (ageInSrc.startsWith('day') || ageInSrc.startsWith('d')) {
              unit = 'D';
            } else if (ageInSrc.startsWith('month') || ageInSrc.startsWith('m')) {
              unit = 'M';
            } else if (ageInSrc.startsWith('year') || ageInSrc.startsWith('y')) {
              unit = 'Y';
            }
            ageDisplay = `${n} ${unit}`;
          } else {
            ageDisplay = rawAge;
          }
        }
      }

      return {
        patientId: invoice.patient?.patientId || invoice.patientId || 'N/A',
        registrationNumber: invoice.patient?.registrationNumber || invoice.registrationNumber || 'N/A',
        patientName: invoice.patient?.name || invoice.patientName || 'Unknown Patient',
        age: ageDisplay,
        gender: invoice.patient?.gender || invoice.gender || 'N/A',
        contact: invoice.patient?.phone || invoice.contact || 'N/A',
        receiptNumber: invoice.receiptNumber,
        invoiceNumber: invoice.invoiceNumber,
        testsCount: (invoice.tests || invoice.testDetails)?.length || invoice.testsCount || 0,
        totalAmount: invoice.payment?.totalAmount ?? invoice.totalAmount ?? 0,
        paymentDate: invoice.createdAt || invoice.bookingDate || invoice.paymentDate,
        createdAt: createdAt,
        updatedAt: updatedAt,
        bookingDate: invoice.bookingDate,
        paymentMode: invoice.payment?.paymentMethod || invoice.paymentMode || 'CASH',
        status: invoice.payment?.paymentStatus || invoice.status || 'PAID',
        mode: (invoice.mode || '').toUpperCase() || 'OPD',
        isPrinted: invoice.isPrinted || false,
        tests: invoice.tests || invoice.testDetails || [],
        testDetails: invoice.tests || invoice.testDetails || [],
        isEdited: invoice.isEdited || false,
        lastEditedAt: invoice.lastEditedAt || null,
        lastEditedBy: invoice.lastEditedBy || '',
        editHistory: invoice.editHistory || [],
        hasEditHistory: hasEditHistory,
        department: invoice.department || null,
        doctor: invoice.doctor || null,
        doctorRefNo: invoice.doctorRefNo || ''
      };
    };

    // Sort by receipt number desc (numeric) or createdAt desc
    const sorted = [...source].sort((a: any, b: any) => {
      const ra = Number(a?.receiptNumber) || 0;
      const rb = Number(b?.receiptNumber) || 0;
      if (ra !== rb) return rb - ra;
      const da = new Date(a?.createdAt || a?.paymentDate || 0).getTime();
      const db = new Date(b?.createdAt || b?.paymentDate || 0).getTime();
      return db - da;
    });

    // Map then apply filters
    let viewRows = sorted.map(toView);
    const rFilter = (this.receiptFilter || '').toString().trim();
    const regFilter = (this.registrationFilter || '').toString().trim().toLowerCase();
    if (rFilter) {
      viewRows = viewRows.filter(v => String(v.receiptNumber || '').includes(rFilter));
    }
    if (regFilter) {
      viewRows = viewRows.filter(v => (v.registrationNumber || '').toString().toLowerCase().includes(regFilter));
    }

    this.displayedPaidPatients = viewRows;
    // Ensure UI updates even under OnPush or async merges
    try { this.safeDetectChanges(); } catch {}
  }

  onFilterChange(): void {
    this.updateDisplayedPaidPatients();
  }


  trackByReceipt(index: number, item: any) {
    return item?.receiptNumber ?? item?.registrationNumber ?? item?.patientId ?? index;
  }

  // Merge helper: keeps unique by receiptNumber/invoiceNumber/backendId. Prefers newer (backend) but never drops local unique
  private mergeInvoiceLists(localList: any[], backendList: any[]): any[] {
    const key = (x: any) => x?.receiptNumber || x?.invoiceNumber || x?.backendId || x?.patient?.patientId || x?.patientId || x?.registrationNumber;
    const map = new Map<string, any>();
    // Add local first so UI shows immediately after payment
    for (const item of localList) {
      const k = String(key(item) ?? Math.random());
      map.set(k, item);
    }
    // Overlay backend (will update same receipts when available)
    for (const item of backendList) {
      const k = String(key(item) ?? Math.random());
      map.set(k, item);
    }
    return Array.from(map.values());
  }


  ngAfterViewInit(): void {
    // Decide focus based on presence of registration number
    this.safeTimeout(() => {
      const regNo = (this.pathologyForm?.get('registrationNumber')?.value || '').toString().trim();
      if (regNo) {
        // If registration number present (coming from another screen), focus Doctor Ref. No
        this.doctorRefNoInput?.nativeElement?.focus();
      } else {
        // If opened from sidebar (no reg no), focus Registration No
        this.registrationNumberInput?.nativeElement?.focus();
      }
    }, 100);
  }

  // Check for edit mode from invoice table
  private checkEditMode(): void {
    this.route.queryParams.subscribe(params => {
      if (params['edit'] === 'true') {
        console.log('🔄 Edit mode detected');

        // Prefer fetching fresh from backend by receiptNumber or invoiceId
        const receiptParam = params['receiptNumber'] || params['receiptNo'] || this.pathologyForm.get('registrationNumber')?.value;
        const invoiceIdParam = params['invoiceId'] || params['id'];

        // Restore department/doctor from query params if provided
        const qpDeptId = params['departmentId'];
        const qpDoctorId = params['doctorId'];
        if (qpDeptId) {
          this.pathologyForm.patchValue({ department: qpDeptId });
          this.selectedDepartment = qpDeptId;
          this.onDepartmentChange();
        }
        if (qpDoctorId) {
          // if doctors already loaded, set immediately; else keep pending
          const found = this.doctors.find(d => d._id === qpDoctorId);
          if (found) {
            this.pathologyForm.patchValue({ doctor: qpDoctorId });
          } else {
            this.pendingDoctorId = qpDoctorId;
          }
        }

        if (receiptParam) {
          const rn = parseInt(receiptParam, 10);
          if (!isNaN(rn)) {
            console.log('🧾 Fetching invoice by receipt number:', rn);
            this.pathologyInvoiceService.getInvoiceByReceiptNumber(rn).subscribe({
              next: (res: any) => {
                if (res && (res.invoice || res.data)) {
                  const invoice = res.invoice || res.data;
                  console.log('✅ Invoice fetched for edit:', invoice);
                  this.applyInvoiceToForm(invoice);
                } else {
                  console.warn('⚠️ No invoice found by receipt; falling back to localStorage data');
                  this.fallbackLoadFromLocalStorage();
                }
              },
              error: (err) => {
                console.error('❌ Error fetching invoice by receipt:', err);
                this.fallbackLoadFromLocalStorage();
              }
            });
            return; // stop further processing
          }
        }

        // If id-based fetch is added later, we can use it here. For now, fallback.
        this.fallbackLoadFromLocalStorage();
      }
    });
  }

  private fallbackLoadFromLocalStorage(): void {
    const editData = localStorage.getItem('editInvoiceData');
    if (editData) {
      const invoiceData = JSON.parse(editData);
      console.log('📋 Loading invoice data for editing (fallback localStorage):', invoiceData);
      this.loadInvoiceForEdit(invoiceData);
      localStorage.removeItem('editInvoiceData');
    }
  }

  // Check and set edit lock flags for current receipt
  private async checkCashEditLock(receipt: string): Promise<void> {
    try {
      if (!receipt) return;
      const regUrl = `${environment.apiUrl}/pathology-registration/receipt/${encodeURIComponent(receipt)}`;
      const regResp: any = await this.http.get(regUrl).toPromise().catch(() => null);
      // API returns { invoice: ... } — keep fallbacks for older responses
      const registration = regResp?.invoice || regResp?.registration || regResp?.data || null;
      if (!registration) {
        this.isCashEditLockedHard = false;
        this.isCashEditLockedSoft = false;
        this.cashEditLockReason = '';
        this.safeDetectChanges();
        return;
      }
      const repUrl = `${environment.apiUrl}/pathology-reports/exists?receiptNo=${encodeURIComponent(receipt)}`;
      const repResp: any = await this.http.get(repUrl).toPromise().catch(() => ({ exists: false }));
      if (repResp?.exists) {
        this.isCashEditLockedHard = true;
        this.isCashEditLockedSoft = false;
        this.cashEditLockReason = 'Pathology report generated — editing is permanently locked';
        this.safeDetectChanges();
        return;
      }
      const allowedRaw = (registration?.cashEditAllowed ?? regResp?.cashEditAllowed ?? (regResp?.invoice?.cashEditAllowed)) as any;
      const allowed = allowedRaw === true || allowedRaw === 'true' || allowedRaw === 1 || allowedRaw === '1';
      this.isCashEditLockedHard = false;
      this.isCashEditLockedSoft = !allowed;
      this.cashEditLockReason = allowed ? '' : 'Pathology registration exists — enable "Edit Allowed" in Registered Reports';
      console.log('[CashEditLock] receipt', receipt, 'cashEditAllowed:', allowedRaw, '=> softLocked?', this.isCashEditLockedSoft);
      this.safeDetectChanges();
    } catch (e) {
      console.warn('Lock check failed:', e);
    }
  }


  // Apply full invoice object from backend into the form
  private applyInvoiceToForm(invoice: any): void {
    try {
      const patient = invoice.patient || {};
      const dept = invoice.department || {};
      const doc = invoice.doctor || {};

      console.log('DEBUG - patient.age:', patient.age);
      console.log('DEBUG - patient.ageIn:', (patient as any)?.ageIn);
      const parsedAge = this.parseAgeValue(patient.age, (patient as any)?.ageIn);
      console.log('DEBUG - parsedAge:', parsedAge);
      this.pathologyForm.patchValue({
        registrationNumber: patient.registrationNumber || invoice.receiptNumber || '',
        patient: patient.name || '',
        contact: patient.phone || '',
        age: parsedAge.num || '',
        ageIn: parsedAge.ageIn, // Use parsed ageIn directly, no fallback to 'Years'
        gender: (patient.gender || '').toString().toUpperCase(),
        address: this.formatPatientAddress(patient.address, patient) || '',
        doctorRefNo: invoice.doctorRefNo || '',
        mode: (invoice.mode || '').toString().toUpperCase() || 'OPD',
        paymentMethod: (invoice.payment?.paymentMethod || 'CASH').toString().toUpperCase(),
        registrationDate: invoice.registrationDate ? new Date(invoice.registrationDate).toISOString().slice(0,10) : this.today,
        collectionDate: this.today,
        department: (dept && (dept._id || dept.id)) ? (dept._id || dept.id) : ''
      });

      // Select patient object for table/printing
      this.selectedPatient = {
        _id: patient._id || patient.patientId,
        patientId: patient.patientId || patient._id,

        firstName: (patient.name || '').split(' ')[0] || '',
        lastName: (patient.name || '').split(' ').slice(1).join(' ') || '',
        age: patient.age,
        ageIn: (patient as any)?.ageIn,
        gender: patient.gender,
        contact: patient.phone,
        address: this.formatPatientAddress(patient.address, patient),
        registrationNumber: patient.registrationNumber
      } as any;


      // Lock gender when invoice/patient data sets the gender
      this.isGenderLocked = true;
      try { this.pathologyForm.get('gender')?.disable({ emitEvent: false }); } catch {}

      // Load tests
      this.addedTests = (invoice.tests || []).map((t: any) => {
        const catId = t.category;

        const catObj = this.serviceCategories.find(c => (c as any)._id === catId || (c as any).categoryId === catId);
        const categoryName = catObj?.categoryName || (typeof t.category === 'string' && t.category ? t.category : (dept.name || 'PATHOLOGY'));
        return {
          _id: t._id || t.id,
          name: t.name || t.testName,
          testName: t.testName || t.name,
          category: categoryName,
          categoryName,
          cost: Number(t.netAmount ?? t.amount ?? t.cost ?? 0),
          quantity: Number(t.quantity ?? 1),
          discount: Number(t.discount ?? 0),
          netAmount: Number(t.netAmount ?? t.amount ?? t.cost ?? 0),
          sessionAdded: false
        };
      });
      this.calculateTotal();

      // Prefer setting by IDs if provided; else map by name after data loads
      if (dept && (dept._id || dept.id)) {
        this.pathologyForm.patchValue({ department: dept._id || dept.id });
        this.selectedDepartment = dept._id || dept.id;
        this.onDepartmentChange();
      } else if (dept?.name) {
        this.pendingDepartmentName = dept.name;
        this.setDepartmentAfterLoad();
      }
      if (doc && (doc._id || doc.id)) {
        // ensure department filter so doctor appears
        this.setDoctorAfterLoad();
        const setDoc = () => {
          const found = this.doctors.find(d => d._id === (doc._id || doc.id));
          if (found) this.pathologyForm.patchValue({ doctor: found._id });
        };
        setTimeout(setDoc, 50);
      } else if (doc?.name) {
        this.pendingDoctorName = doc.name;
        this.setDoctorAfterLoad();
      }

      // Edit mode flags
      this.isEditMode = true;
      this.editingInvoiceId = invoice._id;
      // Ensure action buttons are enabled for edit
      this.isSubmitting = false;
      this.paymentCompleted = false;
      // After invoice applied, enforce edit lock based on pathology registration/report
      this.checkCashEditLock(String(invoice.receiptNumber || this.originalReceiptNumber || ''));

      this.originalReceiptNumber = invoice.receiptNumber;
      this.originalTotalAmount = this.deriveOriginalTotal(invoice);
      this.editBaselineTotal = this.originalTotalAmount;

      // Trigger UI
      this.safeTimeout(() => this.safeDetectChanges(), 50);
      console.log('✅ Applied invoice to form');
    } catch (e:any) {
      console.error('❌ Failed to apply invoice to form:', e.message);
    }
  }

  // Load invoice data for editing
  private loadInvoiceForEdit(invoiceData: any): void {
    console.log('✏️ Loading invoice for edit:', invoiceData);
    console.log('📋 Edit data structure:', invoiceData);

    // Set form values with all available data
    const pAge = this.parseAgeValue(invoiceData.age, (invoiceData as any)?.ageIn);
    this.pathologyForm.patchValue({
      registrationNumber: invoiceData.registrationNumber || invoiceData.receiptNumber,
      patient: invoiceData.patientName,
      contact: invoiceData.contact,
      age: pAge.num,
      ageIn: pAge.ageIn,
      gender: (invoiceData.gender || '').toString().toUpperCase(),
      address: this.formatPatientAddress(invoiceData.address, invoiceData),
      doctorRefNo: invoiceData.doctorRefNo || '',
      mode: (invoiceData.mode || '').toString().toUpperCase() || this.pathologyForm.get('mode')?.value || 'OPD',
      paymentMethod: (invoiceData.paymentMethod || invoiceData.paymentMode || invoiceData.payment?.paymentMethod || 'CASH').toString().toUpperCase(),
      // department will be set by name after load; set placeholder now
      department: '',
      registrationDate: invoiceData.registrationDate || this.today,
      collectionDate: this.today
    });

    // Restore department by id or name
    if (invoiceData.departmentId) {
      this.pathologyForm.patchValue({ department: invoiceData.departmentId });
      this.selectedDepartment = invoiceData.departmentId;
      this.onDepartmentChange();
    } else if (invoiceData.department) {
      this.pendingDepartmentName = invoiceData.department;
      this.setDepartmentAfterLoad();
    }

    // Restore doctor by id or name
    if (invoiceData.doctorId) {
      const doc = this.doctors.find(d => d._id === invoiceData.doctorId);
      if (doc) {
        this.pathologyForm.patchValue({ doctor: doc._id });

    // Lock gender when loading invoice into form
    this.isGenderLocked = true;
    try { this.pathologyForm.get('gender')?.disable({ emitEvent: false }); } catch {}


      } else {
        this.pendingDoctorId = invoiceData.doctorId;
        // will try after doctors load
        setTimeout(() => {
          const found = this.doctors.find(d => d._id === this.pendingDoctorId);
          if (found) this.pathologyForm.patchValue({ doctor: found._id });
        }, 200);
      }
    } else if (invoiceData.doctor) {
      this.pendingDoctorName = invoiceData.doctor;
      this.setDoctorAfterLoad();
    }


    // Lock gender when loading invoice into form (after invoice data applied)
    this.isGenderLocked = true;
    try { this.pathologyForm.get('gender')?.disable({ emitEvent: false }); } catch {}

    // Set selected patient with complete details
    // Enforce edit lock flags (always run after invoice is applied)
    this.checkCashEditLock(String(this.originalReceiptNumber || invoiceData.receiptNumber || ''));

    this.selectedPatient = {
      _id: invoiceData.patientId,
      patientId: invoiceData.patientId,
      registrationNumber: invoiceData.registrationNumber || invoiceData.receiptNumber,
      firstName: invoiceData.patientName?.split(' ')[0] || '',
      lastName: invoiceData.patientName?.split(' ').slice(1).join(' ') || '',
      age: invoiceData.age,
      ageIn: (invoiceData as any)?.ageIn,
      gender: invoiceData.gender,
      contact: invoiceData.contact,
      address: this.formatPatientAddress(invoiceData.address, invoiceData),
      department: invoiceData.department,
      doctor: invoiceData.doctor,
      ...invoiceData.patientDetails
    } as any;

    // Load tests if available
    if (invoiceData.testDetails && invoiceData.testDetails.length > 0) {
      this.addedTests = invoiceData.testDetails.map((t: any) => ({ ...t, sessionAdded: false }));
      this.calculateTotal();
    }

    // Set edit mode flags
    this.isEditMode = true;
    // Enable action buttons for edit
    this.isSubmitting = false;
    this.paymentCompleted = false;
    // Be resilient: accept multiple shapes for backend ID
    this.editingInvoiceId = invoiceData.invoiceId || invoiceData.backendId || invoiceData._id;
    this.originalReceiptNumber = invoiceData.receiptNumber;
    this.originalTotalAmount = this.deriveOriginalTotal(invoiceData);
    this.editBaselineTotal = this.originalTotalAmount;

    console.log('✅ Invoice loaded for editing with complete data');
    console.log('👤 Selected patient:', this.selectedPatient);
    console.log('📋 Form values:', this.pathologyForm.value);
  }



  // Update existing invoice in edit mode
  updateExistingInvoice(): void {
    // Prevent double click in edit flow
    // Allow calls originating from payInvoice() where isSubmitting is already true.
    // Only set the flag if not already set.
    if (!this.isSubmitting) {
      this.isSubmitting = true;
    }

    // Allow update; just inform about restrictions on PATHOLOGY items
    if (this.isEditMode && (this.isCashEditLockedHard || this.isCashEditLockedSoft)) {
      this.alertService.showInfo('Note', 'Edit allowed. PATHOLOGY tests cannot be removed (and may require permission). Other categories can be updated.');
      // Do NOT return; proceed to update
    }
    console.log('🔄 Updating existing invoice:', this.editingInvoiceId);

    const patientName = this.selectedPatient ?
      `${this.selectedPatient.firstName || ''} ${this.selectedPatient.lastName || ''}`.trim() :
      'Unknown Patient';

    // Derive age unit letter for update (Y/M/D)
    const ageInRawUpdate = (this.pathologyForm.get('ageIn')?.value || (this.selectedPatient as any)?.ageIn || (this.patientRegistrationData as any)?.ageIn || '') + '';
    const ageUnitUpdate = ageInRawUpdate.startsWith('M') ? 'M' : (ageInRawUpdate.startsWith('D') ? 'D' : 'Y');
    const ageInFullUpdate = ageUnitUpdate === 'M' ? 'Months' : ageUnitUpdate === 'D' ? 'Days' : 'Years';

    const updateData = {
      // IDs for reliable joins/updates
      patientId: this.selectedPatient?.patientId || this.selectedPatient?._id,
      doctorId: this.pathologyForm.get('doctor')?.value || (this.appointmentData?.doctor?._id || (this.appointmentData as any)?.doctor) || '',
      departmentId: this.pathologyForm.get('department')?.value || '',

      // Snapshot (for print history)
      patient: {
        patientId: this.selectedPatient?.patientId || this.selectedPatient?._id,
        registrationNumber: this.pathologyForm.get('registrationNumber')?.value,
        name: patientName,
        phone: (this.pathologyForm.get('contact')?.value || this.selectedPatient?.contact || (this.selectedPatient as any)?.phone || '').toString(),
        gender: this.selectedPatient?.gender || 'M',
        age: this.pathologyForm.get('age')?.value ?? (this.selectedPatient as any)?.age, // Send age as number only
        ageIn: ageInFullUpdate, // Normalize to full word (Years/Months/Days)
        address: this.formatPatientAddress((this.selectedPatient as any)?.address, this.selectedPatient) || ''
      },
      tests: this.addedTests.map(test => {
        const catName = (test.categoryName || test.category || 'PATHOLOGY').toString();
        const cat = this.serviceCategories.find(c => (c as any).categoryName?.toUpperCase() === catName.toUpperCase());
        const categoryId = (test.categoryId || (cat as any)?._id || (cat as any)?.categoryId || (this.currentSelectedCategoryObject as any)?._id || (this.currentSelectedCategoryObject as any)?.categoryId || '');
        return {
          name: test.testName || test.name || 'Medical Test',
          category: catName,
          categoryId: categoryId,
          cost: test.amount || test.cost || test.price || 0,
          quantity: test.quantity || 1,
          discount: test.discount || 0,
          netAmount: test.netAmount ?? this.calculateNetAmount((test.amount || test.cost || test.price || 0), (test.quantity || 1), (test.discount || 0))
        };
      }),
      payment: {
        subtotal: this.subtotal,
        totalDiscount: this.totalDiscount,
        totalAmount: this.netPayableAmount || this.totalCost || 0,
        paymentMethod: this.getSelectedPaymentMethod(),
        paymentStatus: 'PAID'
      },
      updatedDate: new Date(),
      doctorRefNo: this.pathologyForm.get('doctorRefNo')?.value || '',
      // Keep mode present on update too
      mode: this.getSelectedMode(),
      appointmentId: this.appointmentData?.appointmentId || (this.selectedPatient as any)?.appointmentId || ''
    };

    console.log('💾 Sending update data to backend:', updateData);

    // Update existing invoice
    this.http.put(`${environment.apiUrl}/pathology-invoice/${this.editingInvoiceId}`, updateData).subscribe({
      next: (response: any) => {
        console.log('✅ Invoice updated successfully:', response);
        if (response && response.success) {
          // Update invoice data for printing
          if (this.invoiceData) {
            this.invoiceData.receiptNumber = this.originalReceiptNumber;
            this.invoiceData.backendId = this.editingInvoiceId;
            this.invoiceData.tests = updateData.tests.map(t => ({ name: t.name, category: t.category, netAmount: t.cost }));
            this.invoiceData.payment = { totalAmount: updateData.payment.totalAmount } as any;
          }

          // Show adjustment toast (collect/refund)
          const d = response.adjustment?.delta ?? (this.netPayableAmount - this.originalTotalAmount);
          const action = d > 0 ? 'Collect' : d < 0 ? 'Refund' : 'No Adjustment';
          this.showSuccess(`${action}: ₹${Math.abs(d)}`, 'Adjustment');


          // After successful update, baseline should become the newly saved total
          this.originalTotalAmount = this.netPayableAmount;
          this.editBaselineTotal = this.netPayableAmount;


          // Force UI to refresh button/banners immediately
          this.safeDetectChanges();

          // Notify pathology modules to refresh (Scheduled Tests, Dashboard)
          try {
            this.dataRefresh.triggerRefresh('pathology', 'UPDATE', {
              invoiceId: this.editingInvoiceId,
              receiptNumber: this.originalReceiptNumber,
              tests: updateData.tests
            });
          } catch (e) {
            console.warn('⚠️ DataRefresh notify failed (UPDATE pathology):', e);
          }

          // Print updated invoice (final items only)
          console.log('🖨️ Printing updated invoice');
          this.printInvoice();

          // Immediately reflect the updated data in current screen (no navigation)
          const updatedInvoice: any = (response && response.invoice) ? response.invoice : ({
            _id: this.editingInvoiceId,
            receiptNumber: this.originalReceiptNumber,
            tests: updateData.tests.map(t => ({ name: t.name, category: t.category, netAmount: t.cost })),
            payment: { totalAmount: updateData.payment.totalAmount },
            patient: this.invoiceData?.patient,
            mode: this.getSelectedMode(),
            department: this.invoiceData?.department,
            doctor: this.invoiceData?.doctor,
            bookingDate: (this.invoiceData as any)?.bookingDate
          });

          const matchFn = (inv: any) => (
            (inv?._id && updatedInvoice?._id && inv._id === updatedInvoice._id) ||
            (inv?.receiptNumber && updatedInvoice?.receiptNumber && inv.receiptNumber === updatedInvoice.receiptNumber)
          );

          this.paidPatients = (this.paidPatients || []).map(inv => matchFn(inv)
            ? ({
                ...inv,
                ...updatedInvoice,
                totalAmount: updatedInvoice?.payment?.totalAmount ?? inv.totalAmount,
                tests: updatedInvoice.tests || inv.tests,
                testDetails: updatedInvoice.tests || inv.testDetails
              })
            : inv
          );

          this.todaysInvoices = (this.todaysInvoices || []).map(inv => matchFn(inv) ? ({ ...inv, ...updatedInvoice }) : inv);

          try { this.saveTodaysPaidPatientsToLocalStorage(); } catch {}
          this.updateDisplayedPaidPatients();
          this.showPatientPaidData = true;
          this.safeDetectChanges();

          // Reset form and exit edit mode
          this.resetFormAfterPayment();
          this.isEditMode = false;
          this.editingInvoiceId = undefined;
          this.originalReceiptNumber = undefined;
          this.isSubmitting = false; // re-enable
  // Navigate back to edit records
          setTimeout(() => {
            this.router.navigate(['/cash-receipt/edit-record']);
          }, 1000);
        } else {
          console.error('❌ Failed to update invoice:', response.message);
          this.alertService.showError('Update Failed', 'Failed to update invoice. Please try again.');
          this.isSubmitting = false; // re-enable on failure
        }
      },
      error: (error) => {
        console.error('❌ Error updating invoice:', error);
        const msg = (error?.error?.message || '').toString();
        if (error?.status === 403 || /report generated/i.test(msg)) {
          this.alertService.showBlockingError('Editing Locked', 'Cannot update invoice. Pathology report already generated. Editing is permanently locked.');
        } else {
          this.alertService.showError('Update Error', 'Error updating invoice. Please try again.');
        }
        this.isSubmitting = false; // re-enable on error
      }
    });
  }

  private handlePatientDataFromQueryParams(): void {
    console.log('🔍 Checking for patient data in query parameters...');
    console.log('🔍 Current URL:', window.location.href);

    this.route.queryParams.subscribe(params => {
      console.log('📋 Query parameters received:', params);
      console.log('📋 Number of parameters:', Object.keys(params).length);

      // If we came here via Edit flow, skip prefill from query params to avoid overwriting
      // the invoice data applied by checkEditMode/applyInvoiceToForm.
      if ((params['edit'] + '') === 'true') {
        console.log('✋ Edit mode detected in query params — skipping OPD param prefill to preserve invoice data');
        return;
      }

      if (params['patientId']) {
        console.log('👤 Patient ID found in query params:', params['patientId']);

        // Create patient object from query parameters
        const appointmentId = params['appointmentId'] || '';
        const extractedNumber = appointmentId ? this.getAppointmentNumber(appointmentId) : '';

        const patientFromParams = {
          _id: params['patientId'],
          patientId: params['uhid'] || '',
          registrationNumber: (params['regNo'] || params['registrationNumber'] || '') || extractedNumber || params['uhid'] || params['patientId'] || '', // Prefer explicit regNo from nav, else fallback to extracted/uhid/patientId
          appointmentId: appointmentId, // ✅ STORE: Full appointment ID for reference
          firstName: params['patientName']?.split(' ')[0] || '',
          lastName: params['patientName']?.split(' ').slice(1).join(' ') || '',
          age: parseInt(params['age']) || 0,
          gender: params['gender'] || '',
          contact: params['contact'] || '',
          address: params['address'] || '',
          department: params['department'] || '',
          doctor: params['doctor'] || '',
          appointmentDate: params['appointmentDate'] || '',
          registrationDate: params['registrationDate'] || ''
        };

        console.log('🔍 Query Params:', params);
        console.log('🔍 Patient from params - firstName:', patientFromParams.firstName);
        console.log('🔍 Patient from params - lastName:', patientFromParams.lastName);
        console.log('🔍 Patient from params - patientId:', patientFromParams.patientId);
        console.log('🆔 APPOINTMENT ID from params:', params['appointmentId']); // ✅ ADDED: Debug appointment ID
        console.log('🆔 UHID from params:', params['uhid']); // ✅ ADDED: Debug UHID
        console.log('🔢 EXTRACTED NUMBER from appointment ID:', extractedNumber); // ✅ ADDED: Debug extracted number
        console.log('🆔 Registration Number set to:', patientFromParams.registrationNumber); // ✅ ADDED: Debug final registration number

        console.log('👤 Patient data from OPD Registration:', patientFromParams);
        console.log('🏥 Department from OPD:', patientFromParams.department);

        // Set the selected patient
        this.selectedPatient = patientFromParams;

        // Convert gender to match form options
        let formGender = '';
        if (patientFromParams.gender) {
          const gender = patientFromParams.gender.toUpperCase();
          if (gender === 'MALE' || gender === 'M') formGender = 'MALE';
          else if (gender === 'FEMALE' || gender === 'F') formGender = 'FEMALE';
          else formGender = 'OTHER';
        }

        // Set registration date from appointment date
        let registrationDate = '';
        console.log('📅 Appointment date from params:', (patientFromParams as any).appointmentDate);
        console.log('📅 Registration date from params:', (patientFromParams as any).registrationDate);

        if ((patientFromParams as any).appointmentDate) {
          { const d=new Date((patientFromParams as any).appointmentDate); registrationDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
          console.log('✅ Using appointment date:', registrationDate);
        } else if ((patientFromParams as any).registrationDate) {
          { const d=new Date((patientFromParams as any).registrationDate); registrationDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
          console.log('✅ Using registration date:', registrationDate);
        } else {
          console.log('⚠️ No date found, using current date');
          { const d=new Date(); registrationDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
        }

        // Pre-fill the form with patient data including department and appointment ID
        this.pathologyForm.patchValue({
          registrationNumber: extractedNumber || (patientFromParams as any).registrationNumber || patientFromParams.patientId || '', // ✅ FIXED: Use extracted number (38 instead of APT000038)
          patient: `${patientFromParams.firstName} ${patientFromParams.lastName}`.trim(),
          age: patientFromParams.age,
          gender: formGender,



          contact: patientFromParams.contact,
          address: this.formatPatientAddress(patientFromParams.address, patientFromParams),

          // Merge address parts from query params (post/city/state/pincode) after initial patch

          // Note: This must be outside of the object literal, so we do a second patch below
        });

        const qpPost = (params['post'] || '').toString().trim();
        const qpCity = (params['city'] || '').toString().trim();
        const qpState = (params['state'] || '').toString().trim();

        // Lock gender after prefilling from registration
        this.isGenderLocked = true;
        try { this.pathologyForm.get('gender')?.disable({ emitEvent: false }); } catch {}

        const qpPin = (params['pincode'] || params['zipCode'] || '').toString().trim();
        if (qpPost || qpCity || qpState || qpPin) {
          const mergedAddr = this.formatPatientAddress(
            this.pathologyForm.get('address')?.value || patientFromParams.address,
            { post: qpPost, city: qpCity, state: qpState, pincode: qpPin }
          );
          this.pathologyForm.patchValue({ address: mergedAddr });
        }

        // Continue with remaining patches after merging address
        this.pathologyForm.patchValue({
          registrationDate: registrationDate,
          doctor: (patientFromParams as any).doctor
        });

        // ✅ Fetch fresh patient by ObjectId to ensure latest phone/address (post/city)
        if (params['patientId']) {
          this.patientService.getPatientById(params['patientId']).subscribe({
            next: (resp: any) => {
              const fresh = resp?.patient || resp;
              if (fresh) {
                // Prefer the richer between current (from query params) and fresh (backend)
                const currentAddr = this.pathologyForm.get('address')?.value || '';
                const freshAddr = this.formatPatientAddress(fresh.address, { ...fresh, ...patientFromParams });
                const baseAddr = this.pickRicherAddress(currentAddr, freshAddr);
                const mergedAddress = this.formatPatientAddress(baseAddr, { ...fresh, ...patientFromParams });
                // Patch latest contact/address (keep richer address if already present)
                const parsedAgeFresh = this.parseAgeValue(fresh.age, (fresh as any)?.ageIn);

                // Lock gender after refresh from backend
                this.isGenderLocked = true;
                try { this.pathologyForm.get('gender')?.disable({ emitEvent: false }); } catch {}

                this.pathologyForm.patchValue({
                  contact: fresh.phone || fresh.contact || this.pathologyForm.get('contact')?.value,
                  address: mergedAddress || currentAddr,
                  age: parsedAgeFresh.num || '',
                  ageIn: parsedAgeFresh.ageIn,
                  gender: (fresh.gender || this.pathologyForm.get('gender')?.value || '').toString().toUpperCase()
                });
                // Ensure registration number is set (UHID/reg no) for auto fetch
                const currentReg = (this.pathologyForm.get('registrationNumber')?.value || '').toString().trim();
                if (!currentReg) {
                  const rn = (fresh.registrationNumber || fresh.patientId || fresh._id || '').toString();
                  this.pathologyForm.patchValue({ registrationNumber: rn });
                }
                // Update selectedPatient snapshot with latest fields including ageIn
                this.selectedPatient = {
                  ...(this.selectedPatient || {}),
                  _id: fresh._id || this.selectedPatient?._id,
                  patientId: fresh.patientId || this.selectedPatient?.patientId,
                  firstName: fresh.firstName || this.selectedPatient?.firstName || '',
                  lastName: fresh.lastName || this.selectedPatient?.lastName || '',
                  age: fresh.age ?? this.selectedPatient?.age,
                  ageIn: (fresh as any)?.ageIn ?? (this.selectedPatient as any)?.ageIn,
                  gender: fresh.gender || this.selectedPatient?.gender,
                  contact: fresh.phone || fresh.contact || this.selectedPatient?.contact,
                  address: mergedAddress
                } as any;
                this.safeDetectChanges();
              }
            },
            error: (err) => {
              console.warn('⚠️ Failed to fetch fresh patient by ID:', err);



            }
          });
        }


        // Prefer department/doctor by id if provided
        const deptIdFromParams = params['departmentId'] || '';
        const docIdFromParams = params['doctorId'] || '';
        const deptFromParamsRaw = (params['department'] || '').toString();
        const looksLikeObjectId = (s: string) => /^[a-f0-9]{24}$/i.test(s);
        if (deptIdFromParams) {
          this.pathologyForm.patchValue({ department: deptIdFromParams });
          this.selectedDepartment = deptIdFromParams;
          this.onDepartmentChange();
        } else if (deptFromParamsRaw && looksLikeObjectId(deptFromParamsRaw)) {
          // Department passed as _id under 'department'
          this.pathologyForm.patchValue({ department: deptFromParamsRaw });
          this.selectedDepartment = deptFromParamsRaw;
          this.onDepartmentChange();
        } else if (patientFromParams.department) {
          // Department name; will map after departments load
          this.pendingDepartmentName = patientFromParams.department;
          this.setDepartmentAfterLoad();
        }
        if (docIdFromParams) {
          this.pendingDoctorId = docIdFromParams;
          // doctor will be set after doctors load
          this.setDoctorAfterLoad();
        }

        // Force-fetch appointment by registration no. only when navigated from OPD/appointment context
        const regNoNow = (this.pathologyForm.get('registrationNumber')?.value || '').toString().trim();
        const navSource = (params['source'] || '').toString().toLowerCase();
        if (regNoNow && navSource !== 'patient-registration') {
          console.log('🔄 Forcing appointment fetch by registration number to hydrate dept/doctor:', regNoNow);
          this.fetchAppointmentByRegistrationNumber(regNoNow);
        } else {
          console.log('⏭️ Skipping appointment fetch (source indicates patient-registration or no reg no).');
        }


        console.log('✅ Patient data pre-filled in pathology form');
        console.log('📋 Form values after pre-fill:', this.pathologyForm.value);
        console.log('🏥 Department to set:', patientFromParams.department);

        // Force change detection to update UI
        setTimeout(() => {
          console.log('🔄 Triggering change detection for form update');
          this.cdr.detectChanges();
        }, 100);
      } else {
        console.log('ℹ️ No patient data found in query parameters');
      }
    });
  }


  private seedServiceHeadsData(): void {
    console.log('🌱 Seeding service heads data...');
    this.serviceHeadService.seedServiceHeads().subscribe({
      next: (response) => {
        console.log('✅ Seeding response:', response);
        if (response.success) {
          console.log('✅ Service heads data ready');
          // Test load karte hain PATHOLOGY category
          this.testLoadPathologyData();
        }
      },
      error: (error) => {
        console.error('❌ Error seeding service heads:', error);
        // Fallback to local data
        console.log('🔄 Using fallback local data...');
        this.useLocalTestData();
      }
    });
  }

  private testLoadPathologyData(): void {
    console.log('🧪 Testing PATHOLOGY data load...');
    this.serviceHeadService.getServiceHeadsByCategory('PATHOLOGY').subscribe({
      next: (data) => {
        console.log('✅ PATHOLOGY test data:', data);
      },
      error: (error) => {
        console.error('❌ PATHOLOGY test failed:', error);
      }
    });
  }

  private useLocalTestData(): void {
    console.log('📋 Using local test data as fallback');
    // Agar API fail ho jaye to local data use karte hain
  }

  testAPI(): void {
    console.log('🧪 Manual API Test Started...');

    // Test 1: Seed data
    this.serviceHeadService.seedServiceHeads().subscribe({
      next: (response) => {
        console.log('✅ Seed Test Result:', response);

        // Test 2: Get PATHOLOGY data
        this.serviceHeadService.getServiceHeadsByCategory('PATHOLOGY').subscribe({
          next: (data) => {
            console.log('✅ PATHOLOGY Data:', data);
            this.alertService.showInfo('API Working!', `Found ${data.length} PATHOLOGY tests`);

            // Manually set the data
            this.availableTests = data.map(sh => ({
              _id: sh._id,
              name: sh.testName,
              cost: sh.price,
              category: sh.category
            }));
            this.filteredTests = [...this.availableTests];
            console.log('✅ Manually set tests:', this.availableTests);
          },
          error: (error) => {
            console.error('❌ PATHOLOGY Test Failed:', error);
            this.alertService.showError('API Error', error.message);
          }
        });
      },
      error: (error) => {
        console.error('❌ Seed Test Failed:', error);
        this.alertService.showError('Seed Error', error.message);
      }
    });
  }

  initializeForm(): void {
    this.pathologyForm = this.fb.group({
      // Basic Information
      registrationNumber: ['', Validators.required],
      registrationDate: [''],
      collectionDate: [this.today, Validators.required],
      patient: ['', Validators.required],
      contact: ['', [Validators.required, Validators.pattern(/^[0-9]{10}$/)]],
      age: ['', [Validators.required, Validators.min(1), Validators.max(120)]],
      ageIn: ['Years'],
      gender: ['', Validators.required],
      address: [''],

      // Department and Doctor
      department: [''],
      // Doctor is optional; leave blank if not available
      doctor: [''],

      // Test Details
      serviceCategory: ['', Validators.required],
      selectedTestsDropdown: [[]],

      // Status and Mode
      status: ['Pending', Validators.required],
      mode: ['OPD'],
      // Payment Method
      paymentMethod: ['CASH'],

      // Test Parameters
      testParameters: this.fb.array([]),

      // Additional Information
      technician: [''],
      pathologist: [''],
      doctorRefNo: [''],
      cost: [0, [Validators.required, Validators.min(0)]],
      isPaid: [false]
    });
  }

  get testParametersArray(): FormArray {
    return this.pathologyForm.get('testParameters') as FormArray;
  }


  // Normalize selected mode (OPD/IPD/Emergency) to uppercase and provide safe default
  private getSelectedMode(): string {
    // Prefer reactive form value; fallback to DOM select if change detection lagged
    const formVal = (this.pathologyForm.get('mode')?.value || '').toString();
    const domVal = (document.querySelector('select[formControlName="mode"]') as HTMLSelectElement)?.value || '';
    const finalVal = (formVal || domVal).trim().toUpperCase();
    return finalVal; // no default here
  }

  // Build '23 Y' style age string from numeric + unit
  private getAgeUnitLetter(ageIn: string | undefined): 'Y' | 'M' | 'D' {
    const s = (ageIn || '').toString();
    if (s.toUpperCase().startsWith('M')) return 'M';
    if (s.toUpperCase().startsWith('D')) return 'D';
    return 'Y';
  }

  private buildAgeWithUnit(ageValue: any, ageIn?: string): string {
    const n = parseInt((ageValue ?? '').toString(), 10);
    if (isNaN(n) || n <= 0) return '';
    const unit = this.getAgeUnitLetter(ageIn);
    return `${n} ${unit}`;
  }

  // Parse DB/display age like '23 Y' back to form values
  private parseAgeValue(age: any, ageIn?: any): { num: number | '', ageIn: 'Years' | 'Months' | 'Days' } {
    const raw = (age ?? '').toString();
    let num: number | '' = '';
    // Normalize incoming ageIn like '9Days' or '9 Days' -> 'days'
    const normAgeIn = ((ageIn ?? '') + '')
      .toLowerCase()
      .replace(/^\s*\d+\s*/, '');
    const unitFrom = (s: string): 'Years' | 'Months' | 'Days' =>
      s.startsWith('m') ? 'Months' : s.startsWith('d') ? 'Days' : s.startsWith('y') ? 'Years' : 'Years';

    let unit: 'Years' | 'Months' | 'Days' = 'Years';

    // Case 1: raw already like "7 D" / "7 M" / "7 Y"
    const m = raw.match(/^\s*(\d+)\s*([YMD])\s*$/i);
    if (m) {
      num = parseInt(m[1], 10);
      const letter = m[2].toUpperCase();
      unit = letter === 'M' ? 'Months' : letter === 'D' ? 'Days' : 'Years';
    } else if (raw) {
      // Case 2: raw is numeric-only; take unit from ageIn if provided
      const n = parseInt(raw, 10);
      if (!isNaN(n)) num = n;
      unit = unitFrom(normAgeIn);
    } else {
      // Case 3: no raw age; fall back purely to ageIn
      unit = unitFrom(normAgeIn);
    }
    return { num, ageIn: unit };
  }

  // Normalize selected payment method (supports CASH, UPI, CARD, NET_BANKING)
  private getSelectedPaymentMethod(): string {
    const val = (this.pathologyForm.get('paymentMethod')?.value || 'CASH').toString().trim().toUpperCase();
    // Support multiple payment methods
    const validMethods = ['CASH', 'UPI', 'CARD', 'NET_BANKING'];
    return validMethods.includes(val) ? val : 'CASH';
  }

  // React to manual dropdown change and normalize to uppercase



  loadDropdownData(): void {
    // Load patients
    this.pathologyService.getPatients().subscribe({
      next: (patients) => {
        this.patients = patients;
        console.log('✅ Patients loaded:', patients.length);
      },
      error: (error) => {
        console.error('❌ Error loading patients:', error);
      }
    });~

    // Load departments using same service as OPD
    this.patientService.getDepartments().subscribe({
      next: (departments) => {
        this.departments = departments || [];
        console.log('✅ Pathology departments loaded:', this.departments.length);

        // Set department if pending from query params
        this.setDepartmentAfterLoad();
      },
      error: (error) => {
        console.error('❌ Error loading departments:', error);
        this.departments = [];
      }
    });

    // Load doctors using DoctorService
    this.doctorService.getDoctors().subscribe({
      next: (doctors) => {
        this.doctors = doctors;
        console.log('✅ Doctors loaded:', doctors.length);
        console.log('👨‍⚕️ Doctor sample:', doctors[0]);

        // Always show all doctors in the dropdown
        this.filteredDoctors = this.doctors.slice();

        // If department already set from appointment/query, keep it but do not filter doctors
        const deptId = this.pathologyForm.get('department')?.value || this.selectedDepartment;
        if (deptId) {
          console.log('ℹ️ Department set, but doctor list remains unfiltered');
        }
        // If a doctor was specified earlier (from appointment or query), set it now
        if (this.pendingDoctorId || this.pendingDoctorName) {
          this.setDoctorAfterLoad();
        }
      },
      error: (error) => {
        console.error('❌ Error loading doctors:', error);
        // Fallback doctors for testing
        this.doctors = [
          {
            _id: 'doc1',
            doctorId: 'DOC001',
            name: 'Dr. John Smith',
            firstName: 'Dr. John',
            lastName: 'Smith',
            email: 'john@hospital.com',
            phone: '9876543210',
            specialization: 'Cardiology',
            qualification: 'MBBS, MD',
            experience: 10,
            department: 'dept1',
            licenseNumber: 'LIC001',
            fee: 500,
            address: { city: 'Mumbai', state: 'Maharashtra', zipCode: '400001', country: 'India' },
            isActive: true,
            dateOfBirth: '1980-01-01',
            age: 44,
            gender: 'Male'
          },
          {
            _id: 'doc2',
            doctorId: 'DOC002',
            name: 'Dr. Sarah Johnson',
            firstName: 'Dr. Sarah',
            lastName: 'Johnson',
            email: 'sarah@hospital.com',
            phone: '9876543211',
            specialization: 'Neurology',
            qualification: 'MBBS, MD',
            experience: 8,
            department: 'dept2',
            licenseNumber: 'LIC002',
            fee: 600,
            address: { city: 'Mumbai', state: 'Maharashtra', zipCode: '400001', country: 'India' },
            isActive: true,
            dateOfBirth: '1985-05-15',
            age: 39,
            gender: 'Female'
          }
        ];
        console.log('🔄 Using fallback doctors:', this.doctors.length);
      }
    });
  }

  // Set department after departments are loaded
  setDepartmentAfterLoad(): void {
    if (this.pendingDepartmentName && this.departments.length > 0) {
      console.log('🏥 Setting department from query params:', this.pendingDepartmentName);

      // Find department by name
      const department = this.departments.find(dept =>
        dept.name?.toLowerCase() === this.pendingDepartmentName.toLowerCase()
      );

      if (department) {
        console.log('✅ Department found:', department);
        this.pathologyForm.patchValue({
          department: department._id
        });
        this.pendingDepartmentName = ''; // Clear pending

        // Trigger department change to filter doctors
        this.safeTimeout(() => {
          this.onDepartmentChange();
          // Try doctor set after department is applied
          this.setDoctorAfterLoad();
          this.safeDetectChanges();
        }, 100);
      } else {
        console.log('⚠️ Department not found in list:', this.pendingDepartmentName);
        console.log('📋 Available departments:', this.departments.map(d => d.name));
      }
    }
  }

  // Set doctor after doctors are loaded
  setDoctorAfterLoad(): void {
    // Helper to also ensure department is aligned with doctor so filtered list contains it
    const ensureDepartmentForDoctor = (doc: any) => {
      const deptId = typeof doc?.department === 'string' ? doc.department : (doc?.department?._id || '');
      const currentDept = this.pathologyForm.get('department')?.value;
      if (deptId && currentDept !== deptId) {
        console.log('🏥 Setting department from doctor match:', deptId);
        this.pathologyForm.patchValue({ department: deptId });
        this.selectedDepartment = deptId;
        this.onDepartmentChange();
      }
    };

    // First try by pending doctor ID (most reliable)
    if (this.pendingDoctorId && this.doctors.length > 0) {
      const d = this.doctors.find(x => x._id === this.pendingDoctorId);
      if (d) {
        console.log('👨‍⚕️ Doctor matched by ID:', d);
        ensureDepartmentForDoctor(d);
        // After department filter is applied, set doctor again to guarantee it appears in options
        this.safeTimeout(() => {
          this.pathologyForm.patchValue({ doctor: d._id });
          this.safeDetectChanges();
        }, 50);
        this.pendingDoctorId = '';
        return;
      }
    }

    // Fallback: try by name (invoice had only name)
    if (this.pendingDoctorName && this.doctors.length > 0) {
      const targetName = String(this.pendingDoctorName).trim().toLowerCase();
      const match = this.doctors.find(d => {
        const full = ((d.firstName || '') + ' ' + (d.lastName || '')).trim().toLowerCase();
        const single = String(d.name || '').trim().toLowerCase();
        return !!targetName && (full === targetName || single === targetName);
      });
      if (match) {
        console.log('👨‍⚕️ Doctor matched by name:', match);
        ensureDepartmentForDoctor(match);
        this.safeTimeout(() => {
          this.pathologyForm.patchValue({ doctor: match._id });
          this.safeDetectChanges();
        }, 50);
        this.pendingDoctorName = '';
      } else {
        console.log('⚠️ Doctor not found by name:', this.pendingDoctorName);
      }
    }
  }

  // Load service categories from setup - ONLY FROM BACKEND
  loadServiceCategories(): void {
    console.log('🔄 Loading service categories (ensure defaults + fetch)...');

    // Always ensure defaults first so missing ones get added (even if some already exist)
    this.categoryHeadService.ensureDefaultCategoryHeads().subscribe({
      next: () => {
        console.log('✅ Defaults ensured. Fetching categories...');
        this.categoryHeadService.getCategoryHeads(200, true).subscribe({
          next: (categories: CategoryHead[]) => {
            console.log('✅ Categories loaded:', categories?.length || 0);
            this.serviceCategories = categories || [];
            this.sortServiceCategoriesForDisplay();

            // Log each category for debugging
            (categories || []).forEach((cat, index) => {
              console.log(`Category ${index + 1}: ID=${cat._id}, Name=${cat.categoryName}`);
            });

            // Auto-select first category for better UX if none selected
            this.autoSelectFirstCategory();
            this.safeDetectChanges();
          },
          error: (error) => {
            console.error('❌ Error loading categories after ensuring defaults:', error);
            this.serviceCategories = [];
            this.cdr.detectChanges();
          }
        });
      },
      error: (err) => {
        console.error('❌ Error ensuring default categories (continuing to fetch anyway):', err);
        this.categoryHeadService.getCategoryHeads(200, true).subscribe({
          next: (categories: CategoryHead[]) => {
            this.serviceCategories = categories || [];
            this.sortServiceCategoriesForDisplay();
            this.autoSelectFirstCategory();
            this.safeDetectChanges();
          },
          error: (error) => {
            console.error('❌ Error loading service categories from backend:', error);
            this.serviceCategories = [];
            this.cdr.detectChanges();
          }
        });
      }
    });
  }

  // Auto-select first category for better UX and immediately load tests
  private autoSelectFirstCategory(): void {
    try {
      if (!this.selectedServiceCategory && Array.isArray(this.serviceCategories) && this.serviceCategories.length > 0) {
        const first = this.serviceCategories[0] as any;
        this.selectedServiceCategory = String(first?._id || first?.categoryId || '');
        this.currentSelectedCategoryObject = first;
        try { this.pathologyForm.patchValue({ serviceCategory: this.selectedServiceCategory }); } catch {}
        if (this.selectedServiceCategory) {
          // Load tests dynamically from Service Heads only (no hardcoded)
          this.loadAvailableTestsFromAPI(this.selectedServiceCategory);
        }
      }
    } catch {}
  }

  // Quick action: refresh categories from backend (bypass caches)
  refreshCategories(): void {
    this.loadServiceCategories();
  }

  // Open Setup -> Category Heads -> Service Head to add/manage tests
  navigateToManageTests(): void {
    const qp: any = {};
    if (this.selectedServiceCategory) { qp.categoryId = this.selectedServiceCategory; }
    this.router.navigate(['/setup/category-heads/service-head'], { queryParams: qp });
  }

  // Display overrides to match expected labels (e.g., show LAB instead of PATHOLOGY)
  getCategoryDisplayName(name: string): string {
    const n = (name || '').toUpperCase();
    if (n === 'PATHOLOGY') return 'LAB';
    if (n === 'X-RAY') return 'XRAY';
    if (n === 'DIGITAL X-RAY') return 'DIGITAL XRAY';
    return name || '';
  }

  // Fixed ordering for category tiles as requested
  private sortServiceCategoriesForDisplay(): void {
    try {
      if (!Array.isArray(this.serviceCategories)) return;
      const order = [
        'LAB', 'USG', 'DIGITAL XRAY', 'XRAY', 'OUTSOURCE LAB',
        'ECG', 'CT SCAN', 'MRI', 'EPS', 'OPG', 'CARDIOLOGY', 'EEG', 'MAMMOGRAPHY'
      ];
      this.serviceCategories.sort((a: any, b: any) => {
        const aName = this.getCategoryDisplayName(a?.categoryName || '').toUpperCase();
        const bName = this.getCategoryDisplayName(b?.categoryName || '').toUpperCase();
        const ai = order.indexOf(aName);
        const bi = order.indexOf(bName);
        const aval = ai === -1 ? Number.MAX_SAFE_INTEGER : ai;
        const bval = bi === -1 ? Number.MAX_SAFE_INTEGER : bi;
        if (aval !== bval) return aval - bval;
        return aName.localeCompare(bName);
      });
    } catch {}
  }


  loadTestData(testId: string): void {
    this.pathologyService.getTestById(testId).subscribe({
      next: (test) => {
        this.pathologyForm.patchValue({
          collectionDate: test.collectionDate,
          patient: test.patient,
          doctor: test.doctor,
          testType: test.testType,
          status: test.status,
          mode: test.mode || 'OPD',
          technician: test.technician,
          pathologist: test.pathologist,
          doctorRefNo: test.doctorRefNo,
          cost: test.cost,
          isPaid: test.isPaid
        });

        // Load test parameters
        if (test.testParameters) {
          this.setTestParameters(test.testParameters);
        }
      },
      error: (error) => {
        console.error('Error loading test data:', error);
      }
    });
  }

  onTestCategoryChange(): void {
    const testCategory = this.pathologyForm.get('testCategory')?.value;
    // Reset dependent fields when category changes (but keep added tests)
    this.pathologyForm.get('testType')?.setValue('');
    this.pathologyForm.get('selectedTestsDropdown')?.setValue([]);
    this.availableTests = [];
    // Don't reset added tests - keep them when category changes

    // Test types are now loaded as service heads from the selected category
  }

  onTestTypeChange(): void {
    const testCategory = this.pathologyForm.get('testCategory')?.value;
    const testType = this.pathologyForm.get('testType')?.value;

    if (testCategory && testType) {
      this.pathologyService.getTestsByCategoryAndType(testCategory, testType).subscribe({
        next: (tests) => {
          this.availableTests = tests;
          this.pathologyForm.get('selectedTestsDropdown')?.setValue([]);
        },
        error: (error) => {
          console.error('Error loading tests:', error);
        }
      });
    } else {
      this.availableTests = [];
      this.pathologyForm.get('selectedTestsDropdown')?.setValue([]);
    }
  }



  resetAddedTests(): void {
    this.addedTests = [];
    this.clearTestParameters();
    this.updateTotalCost();
    this.pathologyForm.get('cost')?.setValue(this.totalCost);
  }

  isPathologyDeleteLocked(test: any): boolean {
    const cat = (test?.categoryName || test?.category || '').toString().trim().toUpperCase();
    const isPath = cat === 'PATHOLOGY' || cat === 'PATH';
    if (test?.sessionAdded === true) return false;
    return this.isEditMode && isPath && (this.isCashEditLockedHard || this.isCashEditLockedSoft);
  }


  async removeTest(testToRemove: any): Promise<void> {
    if (this.isEditMode) {
      const catRaw = (testToRemove?.categoryName || testToRemove?.category || '').toString();
      const isPathology = catRaw.trim().toUpperCase() === 'PATHOLOGY' || catRaw.trim().toUpperCase() === 'PATH';
      if (isPathology) {
        // Allow removing PATHOLOGY tests added in this session regardless of locks
        if (testToRemove?.sessionAdded === true) {
          // proceed without lock checks
        } else {
          // If lock flags suggest block, refresh once from server to honor latest permission toggle
          if (this.isCashEditLockedHard || this.isCashEditLockedSoft) {
            const rec = String(this.originalReceiptNumber || this.pathologyForm.get('registrationNumber')?.value || '');
            try { await this.checkCashEditLock(rec); } catch {}
          }
          if (this.isCashEditLockedHard) {
            this.alertService.showBlockingError('Editing Locked', 'Cannot remove Pathology tests. Pathology report already generated. Editing is permanently locked.');
            return;
          }
          if (this.isCashEditLockedSoft) {
            this.alertService.showBlockingError('Permission Required', 'Cannot remove Pathology tests. Ask Pathology → Registered Reports → toggle "Edit Allowed".');
            return;
          }
        }
      }
    }
    this.addedTests = this.addedTests.filter(test => test._id !== testToRemove._id);
    this.calculateTotal();
  }



  onCategoryChange(event: any): void {
    const selectedCategory = event.target.value;
    console.log('🔄 CATEGORY CHANGE DEBUG: Selected category ID (event.target.value):', selectedCategory);

    // Find category object from backend data
    const categoryObject = this.serviceCategories.find(cat => cat._id === selectedCategory);
    console.log('🔄 CATEGORY CHANGE DEBUG: Found category object:', categoryObject);
    console.log('🔄 CATEGORY CHANGE DEBUG: All available categories:', this.serviceCategories);

    this.selectedServiceCategory = selectedCategory;

    // Store selected category object for easy access
    this.currentSelectedCategoryObject = categoryObject;

    // ✅ FIX: Don't clear existing tests - allow mixed categories in one receipt
    console.log('📝 Allowing mixed categories in single receipt');

    if (selectedCategory) {
      console.log('📡 Loading tests from API for category:', selectedCategory);
      // Load tests dynamically from Service Heads only (no hardcoded fallback/local)
      this.loadAvailableTestsFromAPI(selectedCategory);
    } else {
      console.log('❌ No category selected, clearing tests');
      this.availableTests = [];
      this.filteredTests = [];
    }

    // Reset service head selection and search
    this.selectedServiceHead = '';
    this.searchTerm = '';
  }

  // Category tile click → reuse dropdown change logic
  onCategoryTileClick(cat: CategoryHead): void {
    if (!cat || !(cat as any)._id) { return; }
    try {
      this.pathologyForm.patchValue({ serviceCategory: (cat as any)._id });
    } catch {}
    this.onCategoryChange({ target: { value: (cat as any)._id } } as any);
  }

  // Small emoji icon mapping for category tiles
  getCategoryIcon(name: string): string {
    const n = (name || '').toUpperCase();
    if (n.includes('PATH') || n === 'LAB') return '🧪';
    if (n.includes('XRAY') || n === 'X-RAY' || n === 'X RAY') return '🩻';
    if (n.includes('USG') || n.includes('ULTRA')) return '🔊';
    if (n.includes('CT')) return '💠';
    if (n.includes('MRI')) return '🧲';
    if (n.includes('ECG')) return '🫀';
    if (n.includes('EPS')) return '⚡';
    if (n.includes('EEG')) return '🧠';
    if (n.includes('OPG')) return '🦷';
    if (n.includes('CARD')) return '❤️';
    if (n.includes('MAMMO')) return '🎀';
    if (n.includes('OUTSOURCE')) return '🚚';
    return '🧫';
  }

  // Font Awesome icon class for tiles (prefer DB icon, fallback mapping)
  getCategoryIconClass(cat: CategoryHead): string {
    const icon = (cat as any)?.icon;
    if (icon && typeof icon === 'string' && icon.trim().length) return icon.trim();
    const n = ((cat?.categoryName) || '').toUpperCase();
    if (n.includes('PATH') || n === 'LAB') return 'fa-solid fa-flask-vial';
    if (n.includes('XRAY') || n === 'X-RAY' || n === 'X RAY') return 'fa-solid fa-x-ray';
    if (n.includes('USG') || n.includes('ULTRA')) return 'fa-solid fa-wave-square';
    if (n.includes('CT')) return 'fa-solid fa-brain';
    if (n.includes('MRI')) return 'fa-solid fa-magnet';
    if (n.includes('ECG')) return 'fa-solid fa-heart-pulse';
    if (n.includes('EPS')) return 'fa-solid fa-bolt';
    if (n.includes('EEG')) return 'fa-solid fa-brain';
    if (n.includes('OPG')) return 'fa-solid fa-tooth';
    if (n.includes('CARD')) return 'fa-solid fa-stethoscope';

    if (n.includes('MAMMO')) return 'fa-solid fa-user-nurse';
    if (n.includes('OUTSOURCE')) return 'fa-solid fa-arrow-right-arrow-left';
    return 'fa-solid fa-clipboard-list';
  }



  private loadAvailableTestsFromAPI(categoryOrId: string): void {
    console.log('🔄 Loading tests for category/id:', categoryOrId);

    // Always treat the selected value as CategoryHead ObjectId for API calls
    const categoryId = categoryOrId;

    this.serviceHeadService.getServiceHeadsByCategoryId(categoryId).subscribe({
      next: (serviceHeads: ServiceHead[]) => {
        console.log('✅ Received service heads (byId):', serviceHeads);

        if (serviceHeads && serviceHeads.length > 0) {
          // Convert ServiceHead to TestInfo format

          this.availableTests = serviceHeads.map(sh => ({
            _id: sh._id,
            name: sh.testName,
            cost: sh.price,
            category: sh.category
          }));

          this.filteredTests = [...this.availableTests];
          console.log('📋 Available tests updated:', this.availableTests.length, 'tests');
        } else {
          console.warn('⚠️ No service heads received from API');
          this.availableTests = [];
          this.filteredTests = [];
        }
      },
      error: (error) => {
        console.error('❌ Error loading service heads (byId):', error);
        this.availableTests = [];
        this.filteredTests = [];
      }
    });
  }

  // Icon-only category dropdown helpers
  getCategoryIconClassById(id: string): string {
    if (!id) { return 'fa-solid fa-clipboard-list'; }
    const cat = (this.serviceCategories || []).find((c: any) => String(c?._id) === String(id));
    return cat ? this.getCategoryIconClass(cat as any) : 'fa-solid fa-clipboard-list';
  }
  toggleCatIconDropdown(): void {
    this.showCatIconDropdown = !this.showCatIconDropdown;
  }
  selectServiceCategoryById(id: string): void {
    try { this.pathologyForm.patchValue({ serviceCategory: id }); } catch {}
    this.onCategoryChange({ target: { value: id } } as any);
    this.showCatIconDropdown = false;
  }

  // Enhanced search functionality with API
  onSearchChange(event: any): void {
    this.searchTerm = (event?.target?.value ?? '').toString();

    // Always do instant loose client-side filtering for snappy UX
    this.filterTestsLoosely(this.searchTerm);

    // If nothing matched locally and a category is selected, try API as fallback
    if (this.selectedServiceCategory) {
      if (this.searchTerm.trim() && this.filteredTests.length === 0) {
        this.searchTestsFromAPI(this.selectedServiceCategory, this.searchTerm);
      } else if (!this.searchTerm.trim()) {
        // When cleared, show all available tests without network
        this.filteredTests = [...this.availableTests];
      }
    }
  }

  private searchTestsFromAPI(categoryOrId: string, searchTerm: string): void {
    console.log('Searching tests by categoryId:', categoryOrId, searchTerm);

    this.serviceHeadService.getServiceHeadsByCategoryId(categoryOrId, searchTerm).subscribe({
      next: (serviceHeads: ServiceHead[]) => {
        console.log('Search results:', serviceHeads);

        // Convert ServiceHead to TestInfo format
        this.filteredTests = serviceHeads.map(sh => ({
          _id: sh._id,
          name: sh.testName,
          cost: sh.price,
          category: sh.category
        }));

        console.log('Filtered tests updated:', this.filteredTests);
      },
      error: (error) => {
        console.error('Error searching tests:', error);
        // Fallback to local filtering
        this.filterTestsLocally();
      }
    });
  }

  // Loose, case-insensitive, multi-token client-side search
  private normalizeForLooseSearch(text: string): string {
    return (text || '')
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // strip diacritics
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private filterTestsLoosely(term: string): void {
    const q = this.normalizeForLooseSearch(term);
    if (!q) {
      this.filteredTests = [...this.availableTests];
      return;
    }
    const tokens = q.split(' ').filter(Boolean);
    this.filteredTests = this.availableTests.filter((t: any) => {
      const hay = this.normalizeForLooseSearch(`${t?.name || t?.testName || ''} ${t?.cost || ''}`);
      // every token must be present (AND match)
      return tokens.every(tok => hay.includes(tok));
    });
  }

  private filterTestsLocally(): void {
    this.filterTestsLoosely(this.searchTerm || '');
  }

  onServiceHeadChange(event: any): void {
    this.selectedServiceHead = event.target.value;
  }

  onMultipleServiceHeadChange(event: any): void {
    const selectElement = event.target;
    const selectedOptions = Array.from(selectElement.selectedOptions);
    this.selectedServiceHeads = selectedOptions.map((option: any) => option.value);

    console.log('🧪 Multiple service heads selected:', this.selectedServiceHeads);
    console.log('📊 Selected count:', this.selectedServiceHeads.length);
    console.log('🎯 Button should be:', this.selectedServiceHeads.length > 0 ? 'ENABLED' : 'DISABLED');

    // Force change detection
    this.safeTimeout(() => {
      console.log('🔄 After timeout - Selected count:', this.selectedServiceHeads.length);
    }, 100);
  }

  onTestSelect(event: any): void {
    this.selectedTestId = event.target.value;
  }

  // Deprecated path: keep consistent behavior across create/edit
  // If a test is already present, do NOT increment quantity; show "Already Added"
  addSelectedTest(): void {
    if (!this.selectedServiceHead) {
      this.alertService.showWarning('Selection Required', 'Please select a service head first');
      return;
    }

    const selectedTest = this.availableTests.find(test => test._id === this.selectedServiceHead);
    if (!selectedTest) {
      this.alertService.showError('Test Not Found', 'Selected test not found');
      return;
    }

    // Unified duplicate check (by id or normalized name)
    if (this.isDuplicateTest(selectedTest)) {
      this.alertService.showWarning('Already Added', 'This service is already in the list.');
      return;
    }

    // Add new test with default values
    const newTest = {
      ...selectedTest,
      quantity: 1,
      discount: 0,
      netAmount: selectedTest.cost,
      sessionAdded: true
    };
    this.addedTests.push(newTest);

    this.calculateTotal();
    this.selectedServiceHead = '';
    this.selectedTestId = '';
  }

  // Add single test when clicked (double-click to add once only)
  addSingleTest(testId: string): void {
    console.log('🎯 Single test clicked:', testId);

    // Find the test
    let selectedTest = this.availableTests.find(test => test._id === testId);
    if (!selectedTest) {
      selectedTest = this.filteredTests.find(test => test._id === testId);
    }

    if (!selectedTest) {
      console.warn('❌ Test not found for ID:', testId);
      return;
    }

    // Unified duplicate check by id or normalized name
    if (this.isDuplicateTest(selectedTest)) {
      console.log('⚠️ Test already present, blocking duplicate add:', selectedTest.name);
      this.alertService.showWarning('Already Added', 'This service is already in the list.');
      return;
    }

    // Add to table only once
    this.addTestToTableOnce(selectedTest);
  }

  // Add test to table only once (no quantity increase)
  // Normalize a test to a comparable key (prefer _id; fallback to cleaned name)
  private normalizeTestKey(test: any): string {
    if (!test) return '';
    // Use NAME-BASED key only for robust duplicate detection across sources
    // (invoice line item id vs service head id may differ)
    const name = (test?.name || test?.testName || '').toString()
      .trim()
      .toLowerCase()
      .replace(/\./g, '')
      .replace(/\s+/g, ' ');
    return name ? `name:${name}` : '';
  }

  // Check duplicates against current addedTests using id or normalized name
  private isDuplicateTest(candidate: any): boolean {
    const candKey = this.normalizeTestKey(candidate);
    if (!candKey) return false;
    return this.addedTests.some(t => this.normalizeTestKey(t) === candKey);
  }

  addTestToTableOnce(test: any): void {
    console.log('➕ Adding test once:', test.name);

    // Prevent duplicate add (id or name match)
    if (this.isDuplicateTest(test)) {
      this.alertService.showWarning('Already Added', 'This service is already in the list.');
      return;
    }

    // Get category name from test's category field (ObjectId) or from dropdown - SAME LOGIC AS addSelectedTests
    const testCategoryId = test.category; // This is ObjectId from backend
    const dropdownCategoryId = this.pathologyForm.get('serviceCategory')?.value;

    // Try to find category name from test's category first, then from dropdown
    let selectedCategory = this.serviceCategories.find(cat => cat._id === testCategoryId);
    if (!selectedCategory) {
      selectedCategory = this.serviceCategories.find(cat => cat._id === dropdownCategoryId);
    }

    const categoryName = selectedCategory?.categoryName || 'UNKNOWN';

    console.log('🔍 DOUBLE CLICK CATEGORY DEBUG:', {
      testCategoryId: testCategoryId,
      dropdownCategoryId: dropdownCategoryId,
      selectedCategory: selectedCategory,
      categoryName: categoryName,
      test: test
    });

    const testToAdd = {
      _id: test._id,
      name: test.name,
      testName: test.name,
      category: categoryName, // 🚨 FIX: Store category NAME not ObjectId
      categoryName: categoryName,
      cost: test.price || test.cost || 0,
      price: test.price || test.cost || 0,
      amount: test.price || test.cost || 0,
      quantity: 1, // Always start with 1
      discount: 0,
      netAmount: test.price || test.cost || 0,
      sessionAdded: true
    };

    this.addedTests.push(testToAdd);
    this.updateTotalCost();
    this.calculateTotal();

    console.log('✅ Test added once:', testToAdd);
    console.log('📋 Current added tests:', this.addedTests);
  }

  // Helper method to add test to table (with quantity increase)
  addTestToTable(selectedTest: any): void {
    console.log('🔍 Processing test:', selectedTest.name, 'ID:', selectedTest._id);
    console.log('🔍 Current addedTests before adding:', this.addedTests);

    // Unified duplicate check (by id or normalized name)
    if (this.isDuplicateTest(selectedTest)) {
      this.alertService.showWarning('Already Added', 'This service is already in the list.');
      return;
    }

    // Check if test already exists in the table
    const existingTest = this.addedTests.find(test => test._id === selectedTest._id);

    if (existingTest) {
      // Do NOT add again or increase quantity; show alert and exit
      console.log('⚠️ Test already present in table. Blocking duplicate add:', selectedTest.name);
      this.alertService.showWarning('Already Added', 'This service is already in the list. Please adjust quantity if needed.');
      return;
    } else {
      // Get category name from test's category field (ObjectId) or from dropdown
      const testCategoryId = selectedTest.category; // This is ObjectId from backend
      const dropdownCategoryId = this.pathologyForm.get('serviceCategory')?.value;

      // Try to find category name from test's category first, then from dropdown
      let selectedCategory = this.serviceCategories.find(cat => cat._id === testCategoryId);
      if (!selectedCategory) {
        selectedCategory = this.serviceCategories.find(cat => cat._id === dropdownCategoryId);
      }

      const categoryName = selectedCategory?.categoryName || 'UNKNOWN';

      console.log('🔍 CATEGORY DEBUG:', {
        testCategoryId: testCategoryId,
        dropdownCategoryId: dropdownCategoryId,
        selectedCategory: selectedCategory,
        categoryName: categoryName,
        selectedTest: selectedTest
      });

      const newTest = {
        _id: selectedTest._id,
        name: selectedTest.name || selectedTest.testName || 'Unknown Test',
        cost: parseFloat(selectedTest.cost) || parseFloat(selectedTest.price) || 0,
        category: categoryName, // 🚨 FIX: Store category NAME not ObjectId
        categoryName: categoryName,
        quantity: 1,
        discount: 0,
        netAmount: parseFloat(selectedTest.cost) || parseFloat(selectedTest.price) || 0,
        sessionAdded: true
      };

      console.log('✅ FINAL TEST OBJECT:', newTest);
      console.log('✅ CATEGORY NAME ASSIGNED:', categoryName);
      console.log('✅ TABLE WILL SHOW:', newTest.categoryName);
      console.log('🔍 COMPLETE TEST OBJECT DEBUG:', {
        testName: newTest.name,
        categoryId: newTest.category,
        categoryName: newTest.categoryName,
        currentSelectedCategoryObject: this.currentSelectedCategoryObject,
        selectedServiceCategory: this.selectedServiceCategory,
        allServiceCategories: this.serviceCategories
      });
      this.addedTests.push(newTest);
      console.log('✅ Added new test:', newTest);
      console.log('✅ Total tests now:', this.addedTests.length);
    }

    console.log('🔍 Current addedTests after adding:', this.addedTests);
    this.calculateTotal();
  }

  addSelectedTests(): void {
    console.log('🚀 Add Selected Tests clicked');
    console.log('📊 Current selectedServiceHeads:', this.selectedServiceHeads);
    console.log('📊 Length:', this.selectedServiceHeads.length);
    console.log('📊 Available tests count:', this.availableTests.length);
    console.log('📊 Filtered tests count:', this.filteredTests.length);

    if (!this.selectedServiceHeads || this.selectedServiceHeads.length === 0) {
      console.warn('❌ No tests selected');
      this.alertService.showWarning('Selection Required', 'Please select at least one test from the dropdown first');
      return;
    }

    console.log('🧪 Adding multiple tests:', this.selectedServiceHeads);
    console.log('📋 Available tests:', this.availableTests);
    console.log('📊 Current added tests before:', this.addedTests.length);

    this.selectedServiceHeads.forEach(testId => {
      // Try to find in both availableTests and filteredTests
      let selectedTest = this.availableTests.find(test => test._id === testId);
      if (!selectedTest) {
        selectedTest = this.filteredTests.find(test => test._id === testId);
      }

      if (!selectedTest) {
        console.warn('❌ Test not found for ID:', testId);
        console.log('Available test IDs:', this.availableTests.map(t => t._id));
        console.log('Filtered test IDs:', this.filteredTests.map(t => t._id));
        return;
      }

      // Use the common method to add test
      this.addTestToTable(selectedTest);
    });

    console.log('📊 Final added tests:', this.addedTests.length);
    console.log('📋 Added tests details:', this.addedTests.map(t => ({ name: t.name, cost: t.cost, quantity: t.quantity })));

    this.calculateTotal();

    // Reset selection
    this.selectedServiceHeads = [];
    console.log('🔄 Selection reset');
  }





  // Debug function to clear all tests
  debugClearTests(): void {
    console.log('🗑️ DEBUG: Clearing all tests. Current tests:', this.addedTests);
    this.addedTests = [];

    // Clear localStorage
    localStorage.removeItem('addedTests');
    localStorage.removeItem('pathologyTests');

    // Clear any cached data
    this.availableTests = [];
    this.filteredTests = [];

    this.calculateTotal();
    this.safeDetectChanges();
    console.log('🗑️ DEBUG: All tests and storage cleared');
  }

  // Force refresh function
  forceRefresh(): void {
    console.log('🔄 FORCE REFRESH: Reloading everything...');

    // Clear all data
    this.debugClearTests();

    // Clear all form data
    this.pathologyForm.reset();
    this.pathologyForm.patchValue({
      registrationNumber: '',
      bookingDate: (() => { const d=new Date(); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; })(),
      serviceCategory: '',
      patientName: '',
      age: '',
      gender: '',
      contact: '',
      address: '',
      doctorRefNo: '',
      paymentMethod: 'CASH'
    });

    // Reset all variables
    this.selectedServiceCategory = '';
    this.availableTests = [];
    this.filteredTests = [];
    this.selectedTestId = '';
    this.addedTests = [];
    this.totalCost = 0;
    this.subtotal = 0;
    this.totalDiscount = 0;
    this.netPayableAmount = 0;

    // Reload categories
    this.loadServiceCategories();

    // Force UI update
    this.safeDetectChanges();

    console.log('🔄 FORCE REFRESH: Complete reset done!');
  }

  // Emergency clear function
  emergencyClear(): void {
    console.log('🚨 EMERGENCY CLEAR: Clearing everything...');

    // Clear all localStorage
    localStorage.clear();

    // Clear all arrays
    this.addedTests = [];
    this.availableTests = [];
    this.filteredTests = [];
    this.serviceCategories = [];

    // Reset form completely
    this.pathologyForm.reset();

    // Reload page
    window.location.reload();
  }

  calculateTotal(): void {
    console.log('🧮 Calculating total for tests:', this.addedTests);

    // Calculate subtotal (sum of all net amounts) - ensure numbers
    this.subtotal = this.addedTests.reduce((total, test) => {
      const netAmount = parseFloat(test.netAmount) || parseFloat(test.cost) || 0;
      console.log(`Test: ${test.name}, NetAmount: ${netAmount}`);
      return total + netAmount;
    }, 0);

    // Calculate total discount - ensure numbers
    this.totalDiscount = this.addedTests.reduce((total, test) => {
      const discount = parseFloat(test.discount) || 0;
      return total + discount;
    }, 0);

    // Net payable amount
    this.netPayableAmount = this.subtotal - this.totalDiscount;

    // Default amount received to net on first calc; clamp if over
    if (!this.amountReceived || this.amountReceived === 0) {
      this.amountReceived = this.netPayableAmount;
    } else if (this.amountReceived > this.netPayableAmount) {
      this.amountReceived = this.netPayableAmount;
    }

    // Keep totalCost for backward compatibility
    this.totalCost = this.netPayableAmount;

    console.log(`💰 Calculation Result - Subtotal: ${this.subtotal}, Discount: ${this.totalDiscount}, Net: ${this.netPayableAmount}, Received: ${this.amountReceived}, Balance: ${this.paymentBalance}`);
  }

  calculateNetAmount(cost: number, quantity: number = 1, discount: number = 0): number {
    return (cost * quantity) - discount;
  }

  // Method to update net amount when quantity or discount changes
  onQuantityChange(test: any, event: any): void {
    const quantity = parseInt(event.target.value) || 1;
    test.quantity = quantity;
    test.netAmount = this.calculateNetAmount(test.cost, test.quantity, test.discount);
    this.calculateTotal();
  }

  onDiscountChange(test: any, event: any): void {
    const discount = parseFloat(event.target.value) || 0;
    test.discount = discount;
    test.netAmount = this.calculateNetAmount(test.cost, test.quantity, test.discount);
    this.calculateTotal();
  }

  // Check if Pay Invoice button should be enabled
  isPayInvoiceEnabled(): boolean {
    // In edit mode, always allow update (even with zero tests) to support full refunds/cancellations
    if (this.isEditMode) {
      return true;
    }
    const hasTests = this.addedTests.length > 0;
    const net = Number(this.netPayableAmount || 0);
    const rec = Number(this.amountReceived || 0);
    const enabled = hasTests && net > 0 && rec >= net;
    console.log('🔍 Pay Invoice Enabled Check:', {
      isEditMode: this.isEditMode,
      addedTestsLength: this.addedTests.length,
      netPayableAmount: this.netPayableAmount,
      amountReceived: this.amountReceived,
      enabled: enabled
    });
    return enabled;
  }


  rebuildTestParameters(): void {
    this.clearTestParameters();
    this.addedTests.forEach(test => {
      this.setTestParameters(test.parameters);
    });
  }

  updateTotalCost(): void {
    this.totalCost = this.addedTests.reduce((total, test) => total + test.price, 0);
  }

  payInvoice(): void {
    // Prevent double click
    if (this.isSubmitting) {
      console.warn('⏳ Duplicate click ignored while submitting');
      return;
    }
    this.isSubmitting = true;

    console.log('💰 Pay Invoice clicked!');
    console.log('🔍 Debug - Added tests:', this.addedTests);
    console.log('🔍 Debug - Added tests length:', this.addedTests.length);
    console.log('🔍 Debug - Net payable amount:', this.netPayableAmount);
    console.log('🔍 Debug - Selected patient:', this.selectedPatient);
    console.log('🔍 Debug - Payment completed:', this.paymentCompleted);

    // In edit mode allow zero tests and zero net amount (for full refund/cancel cases)
    if (!this.isEditMode) {
      if (this.addedTests.length === 0) {
        console.error('❌ No tests added - showing alert');
        this.alertService.showWarning('Tests Required', 'Please add tests before making payment');
        this.isSubmitting = false; // allow retry
        return;
      }
      if (this.netPayableAmount <= 0) {
        console.error('❌ Invalid amount - showing alert');
        this.alertService.showError('Invalid Amount', 'Invalid total amount');
        this.isSubmitting = false; // allow retry
        return;
      }
    }

    console.log('✅ All validations passed, proceeding with payment...');

    try {
      // Step 1: Generate invoice data
      console.log('📄 Step 1: Generating invoice data...');
      this.generateInvoiceData();

      // Step 2: Save to backend first, then print and update table
      console.log('📥 Step 2: Saving to backend first...');
      this.saveInvoiceToBackendThenPrint();

      console.log('✅ Payment process kicked off');
    } catch (error) {
      console.error('❌ Error in payment process:', error);
      this.alertService.showError('Payment Error', 'Error processing payment. Please try again.');
      this.isSubmitting = false; // allow retry
    }
  }

  // Save invoice to backend first, then print with correct receipt number
  saveInvoiceToBackendThenPrint(): void {
    console.log('🔍 Saving to backend first, then printing...');
    console.log('🔄 Edit mode check:', this.isEditMode);
    console.log('📋 Editing invoice ID:', this.editingInvoiceId);

    if (!this.invoiceData) {
      console.error('❌ Missing invoice data');
      this.alertService.showError('Data Missing', 'Invoice data missing. Please try again.');
      return;
    }

    if (!this.selectedPatient && !this.invoiceData.patient) {
      console.error('❌ Missing patient information');
      this.alertService.showError('Patient Required', 'Patient information missing. Please search patient first.');
      return;
    }

    // Edit mode: directly go to update flow (allow zero tests)
    if (this.isEditMode && this.editingInvoiceId) {
      console.log('✏️ Edit mode detected - updating existing invoice');
      this.updateExistingInvoice();
      return;
    }

    // Create mode validations
    if (this.addedTests.length === 0) {
      console.error('❌ No tests added');
      this.alertService.showWarning('Tests Required', 'Please add tests before payment.');
      return;
    }

    const patientName = this.selectedPatient ?
      `${this.selectedPatient.firstName || ''} ${this.selectedPatient.lastName || ''}`.trim() :
      'Unknown Patient';

    // Get doctor and department information
    const doctorName = this.getSelectedDoctorName();
    const departmentName = this.getSelectedDepartmentName();
    const selectedDoctorId = this.pathologyForm.get('doctor')?.value;
    const selectedDeptId = this.pathologyForm.get('department')?.value;

    // Get doctor details
    const selectedDoctor = this.doctors.find(d => d._id === selectedDoctorId);
    const selectedDepartment = this.departments.find(d => d._id === selectedDeptId);

    // Get room number from appointment data if available
    const roomNumber = this.appointmentData?.room?.roomNumber || '';

    console.log('🏥 Backend Save - Doctor Name:', doctorName);
    console.log('🏥 Backend Save - Department Name:', departmentName);
    console.log('🏥 Backend Save - Room Number:', roomNumber);
    console.log('🏥 Backend Save - Selected Doctor:', selectedDoctor);
    console.log('🏥 Backend Save - Selected Department:', selectedDepartment);
    console.log('🏥 Backend Save - Appointment Data:', this.appointmentData);

    const fullAddress = this.formatPatientAddress(
      this.pathologyForm.get('address')?.value || (this.selectedPatient as any)?.address,
      this.selectedPatient
    ) || '';

    // Derive age unit letter for saving (Y/M/D)
    const ageInRawCreate = (this.pathologyForm.get('ageIn')?.value || (this.selectedPatient as any)?.ageIn || (this.patientRegistrationData as any)?.ageIn || '') + '';
    const ageUnitCreate = ageInRawCreate.startsWith('M') ? 'M' : (ageInRawCreate.startsWith('D') ? 'D' : 'Y');
    const ageInFullCreate = ageUnitCreate === 'M' ? 'Months' : ageUnitCreate === 'D' ? 'Days' : 'Years';

    const simpleData = {
      // Explicit references for reliable joins
      patientId: this.selectedPatient?.patientId || '', // UHID only
      patientRef: this.selectedPatient?._id || '', // Mongo ObjectId
      doctorId: selectedDoctorId || (this.appointmentData?.doctor?._id || (this.appointmentData as any)?.doctor) || '',
      doctorRef: selectedDoctorId || (this.appointmentData?.doctor?._id || (this.appointmentData as any)?.doctor) || '',
      departmentId: selectedDeptId || (this.appointmentData?.department?._id || (this.appointmentData as any)?.department) || '',
      departmentRef: selectedDeptId || (this.appointmentData?.department?._id || (this.appointmentData as any)?.department) || '',
      appointmentRef: (this.appointmentData as any)?._id || null, // ✅ send appointment ObjectId when available

      // Snapshot for print/history
      patient: {
        patientId: this.selectedPatient?.patientId || `PAT${Date.now()}`,
        registrationNumber: this.pathologyForm.get('registrationNumber')?.value || `REG${Date.now()}`,
        name: patientName,
        phone: (this.pathologyForm.get('contact')?.value || this.selectedPatient?.contact || (this.selectedPatient as any)?.phone || (this.patientRegistrationData as any)?.contact || (this.patientRegistrationData as any)?.phone || '').toString(),
        gender: this.selectedPatient?.gender || '',
        age: this.pathologyForm.get('age')?.value ?? (this.selectedPatient as any)?.age, // Send age as number only
        ageIn: ageInFullCreate, // Normalize to full word (Years/Months/Days)
        address: fullAddress
      },
      doctor: {
        name: doctorName,
        specialization: selectedDoctor?.specialization || departmentName,
        roomNumber: roomNumber
      },
      department: {
        name: departmentName,
        code: selectedDepartment?.code || ''
      },
      tests: this.addedTests.map(test => {
        const catName = (test.categoryName || test.category || 'PATHOLOGY').toString();
        const cat = this.serviceCategories.find(c => (c as any).categoryName?.toUpperCase() === catName.toUpperCase());
        const categoryId = (test.categoryId || (cat as any)?._id || (cat as any)?.categoryId || (this.currentSelectedCategoryObject as any)?._id || (this.currentSelectedCategoryObject as any)?.categoryId || '');
        return {
          name: test.testName || test.name || 'Medical Test',
          category: catName,
          categoryId: categoryId,
          cost: test.amount || test.cost || test.price || 0,
          quantity: test.quantity || 1,
          discount: test.discount || 0,
          netAmount: test.netAmount ?? this.calculateNetAmount((test.amount || test.cost || test.price || 0), (test.quantity || 1), (test.discount || 0))
        };
      }),
      payment: {
        totalAmount: this.netPayableAmount || this.totalCost || 0,
        paymentMethod: this.getSelectedPaymentMethod(),
        paymentStatus: 'PAID'
      },
      bookingDate: new Date(),
      doctorRefNo: this.pathologyForm.get('doctorRefNo')?.value || '',
      // Context
      appointmentId: this.appointmentData?.appointmentId || (this.selectedPatient as any)?.appointmentId || '',
      mode: this.getSelectedMode(),
      // Use appointment registration number for backend room/doctor derivation
      registrationNumber: this.pathologyForm.get('registrationNumber')?.value || ''
    };

    console.log('💾 Sending data to backend first:', simpleData);

    // Save to backend first
    this.http.post(`${environment.apiUrl}/pathology-invoice/create`, simpleData).subscribe({
      next: (response: any) => {
        console.log('✅ Backend response received:', response);
        if (response && (response.success || response.invoice)) {
          console.log('✅ Invoice saved successfully to backend');
          console.log('📧 Receipt Number:', response.invoice.receiptNumber);

          // Update invoice data with backend receipt number
          if (this.invoiceData) {
            this.invoiceData.receiptNumber = response.invoice.receiptNumber;
            this.invoiceData.backendId = response.invoice._id;
          }

          // Now print with correct receipt number
          console.log('🖨️ Now printing with receipt number:', response.invoice.receiptNumber);
          this.printInvoice();

          // Add the new invoice to BOTH arrays immediately for instant UI update
          console.log('🔍 Response structure check:', response);
          console.log('🔍 Response.invoice:', response.invoice);
          console.log('🔍 Response.invoice.patient:', response.invoice?.patient);

          const newInvoice = {
            ...response.invoice,
            patient: {
              patientId: response.invoice?.patient?.patientId || simpleData.patient.patientId,
              registrationNumber: response.invoice?.patient?.registrationNumber || simpleData.patient.registrationNumber,
              name: response.invoice?.patient?.name || patientName || 'Unknown',
              phone: response.invoice?.patient?.phone || simpleData.patient.phone,
              gender: response.invoice?.patient?.gender || simpleData.patient.gender,
              age: response.invoice?.patient?.age || simpleData.patient.age,
              ageIn: response.invoice?.patient?.ageIn || simpleData.patient.ageIn,
              address: response.invoice?.patient?.address || simpleData.patient.address
            },
            tests: response.invoice?.tests || simpleData.tests,
            payment: response.invoice?.payment || simpleData.payment,
            createdAt: new Date().toISOString(),
            bookingDate: response.invoice?.bookingDate || simpleData.bookingDate
          };

          console.log('🔍 New invoice object created:', newInvoice);

          // Add to the beginning of BOTH arrays (latest first)
          try {
            // Reassign arrays to new references so Angular change detection picks it up immediately
            this.paidPatients = [newInvoice, ...(this.paidPatients || [])];
            this.todaysInvoices = [newInvoice, ...(this.todaysInvoices || [])];
            this.updateDisplayedPaidPatients();

            console.log('✅ Invoice added to arrays:', {
              paidPatients: this.paidPatients.length,
              todaysInvoices: this.todaysInvoices.length,
              newInvoiceReceiptNumber: newInvoice.receiptNumber
            });

            // Show table immediately
            this.showPatientPaidData = true;
            this.paymentCompleted = true;

            // Clear active filters so the newly paid invoice is visible instantly
            this.receiptFilter = '';
            this.registrationFilter = '';
            this.updateDisplayedPaidPatients();

            // Safety: ensure row appears on top immediately even if any race occurs
            try {
              const top = (this.displayedPaidPatients || [])[0];
              const topReceipt = top ? String(top.receiptNumber || '') : '';
              const newReceipt = String(newInvoice.receiptNumber || '');
              if (topReceipt !== newReceipt) {
                const viewRow = {
                  patientId: newInvoice.patient?.patientId || newInvoice.patientId || 'N/A',
                  registrationNumber: newInvoice.patient?.registrationNumber || newInvoice.registrationNumber || 'N/A',
                  patientName: newInvoice.patient?.name || newInvoice.patientName || 'Unknown Patient',
                  age: newInvoice.patient?.age ? `${newInvoice.patient.age} ${(newInvoice.patient.ageIn || 'Y').toString().charAt(0).toUpperCase()}` : '',
                  gender: newInvoice.patient?.gender || newInvoice.gender || 'N/A',
                  contact: newInvoice.patient?.phone || newInvoice.contact || 'N/A',
                  receiptNumber: newInvoice.receiptNumber,
                  invoiceNumber: newInvoice.invoiceNumber,
                  testsCount: (newInvoice.tests || newInvoice.testDetails || []).length || 0,
                  totalAmount: newInvoice.payment?.totalAmount ?? newInvoice.totalAmount ?? 0,
                  paymentDate: newInvoice.createdAt || newInvoice.bookingDate || newInvoice.paymentDate || new Date(),
                  createdAt: newInvoice.createdAt || new Date(),
                  updatedAt: newInvoice.updatedAt || newInvoice.createdAt || new Date(),
                  bookingDate: newInvoice.bookingDate || null,
                  paymentMode: newInvoice.payment?.paymentMethod || newInvoice.paymentMode || 'CASH',
                  status: newInvoice.payment?.paymentStatus || newInvoice.status || 'PAID',
                  mode: (newInvoice.mode || '').toUpperCase() || 'OPD',
                  isPrinted: newInvoice.isPrinted || false,
                  tests: newInvoice.tests || newInvoice.testDetails || [],
                  testDetails: newInvoice.tests || newInvoice.testDetails || []
                } as any;
                this.displayedPaidPatients = [viewRow, ...(this.displayedPaidPatients || [])];
                this.safeDetectChanges();
              }
            } catch {}

            try { this.saveTodaysPaidPatientsToLocalStorage(); } catch {}
            // Notify other modules (including Edit Record) to auto-refresh
            try { this.dataRefresh.triggerRefresh('pathology', 'CREATE', { receiptNumber: newInvoice.receiptNumber, invoiceId: newInvoice._id }); } catch {}

            // Refresh view safely
            this.safeDetectChanges();
            this.safeTimeout(() => {
              console.log('🔄 First refresh attempt...');
              this.forceTableRefresh();
            }, 50);
            this.safeTimeout(() => {
              console.log('🔄 Second refresh attempt...');
              this.safeDetectChanges();
            }, 200);

          } catch (error) {
            console.error('❌ Error adding invoice to arrays:', error);
          }

          // 📢 Notify OPD/Follow-up dashboard about pathology booking so UI updates instantly
          try {
            const patientId = this.selectedPatient?._id || this.selectedPatient?.patientId;
            const registrationNumber = this.pathologyForm.get('registrationNumber')?.value;
            if (patientId && registrationNumber) {
              const notificationData = {
                patientId,
                registrationNumber,
                receiptNumber: response.invoice.receiptNumber,
                timestamp: new Date()
              };
              console.log('📢 NOTIFICATION (save-first path): Sending pathology booking notification:', notificationData);
              this.dataRefresh.notifyPathologyBooked(notificationData);
            } else {
              console.warn('⚠️ Notification skipped. Missing patientId or registrationNumber', { patientId, registrationNumber });
            }
          } catch (notifyErr) {
            console.warn('⚠️ Failed to send pathology booking notification:', notifyErr);
          }

          // Show success message
          this.showSuccess(`Payment successful! Receipt Number: ${response.invoice.receiptNumber}`, '🎉 Payment Success!');

          // Also refresh from backend to ensure data consistency
          setTimeout(() => {
            this.loadTodaysInvoicesFromBackend();
            this.updateDisplayedPaidPatients();
          }, 500);

          // Reset form after successful payment and print
          console.log('🔄 Resetting form after successful payment...');
          this.resetFormAfterPayment();
          this.isSubmitting = false; // re-enable after reset

          // Auto-navigate to Pathology Registration after payment
          setTimeout(() => {
            try { this.goToRegistrationFromCash(response.invoice); } catch (e) { console.warn('Navigation failed', e); }
          }, 800);

          console.log('✅ Backend save, print, table update and form reset completed successfully');
        } else {
          console.error('❌ Failed to save invoice:', response.message);
          this.alertService.showError('Save Failed', 'Failed to save invoice. Please try again.');
          this.isSubmitting = false; // re-enable on failure
        }
      },
      error: (error) => {
        console.error('❌ Error saving invoice to backend:', error);
        console.error('❌ Error details:', error.error);
        console.error('❌ Error message:', error.message);
        console.error('❌ Full error object:', JSON.stringify(error, null, 2));
        console.error('❌ Error status:', error.status);
        console.error('❌ Error statusText:', error.statusText);
        this.alertService.showError('Backend Error', 'Backend save failed: ' + (error.error?.message || error.message || 'Unknown error'));
        this.isSubmitting = false; // re-enable on error
      }
    });
  }

  // Save invoice to backend database (original function for reprint)
  saveInvoiceToBackend(): void {
    console.log('🔍 Checking data before backend save...');
    console.log('📄 Invoice data:', this.invoiceData);
    console.log('👤 Selected patient:', this.selectedPatient);
    console.log('📋 Added tests:', this.addedTests);

    if (!this.invoiceData) {
      console.error('❌ Missing invoice data');
      this.alertService.showError('Data Missing', 'Invoice data missing. Please try again.');
      return;
    }

    if (!this.selectedPatient && !this.invoiceData.patient) {
      console.error('❌ Missing patient information');
      this.alertService.showError('Patient Required', 'Patient information missing. Please search patient first.');
      return;
    }

    if (this.addedTests.length === 0) {
      console.error('❌ No tests added');
      this.alertService.showWarning('Tests Required', 'Please add tests before payment.');
      return;
    }

    // Prepare invoice data for backend
    const invoiceData: PathologyInvoiceData = {
      patient: {
        patientId: this.selectedPatient?.patientId || this.selectedPatient?._id || `PAT${Date.now()}`,
        registrationNumber: this.pathologyForm.get('registrationNumber')?.value || this.selectedPatient?.patientId || `REG${Date.now()}`,
        name: `${this.selectedPatient?.firstName || 'Patient'} ${this.selectedPatient?.lastName || 'Name'}`,
        phone: this.selectedPatient?.contact || '',
        gender: this.selectedPatient?.gender?.toUpperCase() || 'OTHER',
        age: this.selectedPatient?.age ?? this.pathologyForm.get('age')?.value, // Send age as number only
        ageIn: this.pathologyForm.get('ageIn')?.value || (this.selectedPatient as any)?.ageIn, // Send ageIn separately
        address: (this.selectedPatient as any).address || this.pathologyForm.get('address')?.value || ''
      },
      doctor: {
        name: this.invoiceData.doctor?.name || '',
        specialization: this.invoiceData.doctor?.specialization || '',
        roomNumber: this.invoiceData.doctor?.roomNumber || ''
      },
      department: {
        name: this.invoiceData.doctor?.specialization || '',
        code: 'SH'
      },
      tests: this.addedTests.map(test => ({
        name: test.name,
        category: test.category,
        cost: test.cost,
        quantity: test.quantity || 1,
        discount: test.discount || 0,
        netAmount: test.netAmount || test.cost
      })),
      payment: {
        subtotal: this.subtotal,
        totalDiscount: this.totalDiscount,
        totalAmount: this.netPayableAmount,
        paymentMethod: this.getSelectedPaymentMethod()
      },
      registrationNumber: this.pathologyForm.get('registrationNumber')?.value,
      bookingDate: new Date(),
      registrationDate: this.patientRegistrationData?.registrationDate ? new Date(this.patientRegistrationData.registrationDate) : undefined,
      doctorRefNo: this.pathologyForm.get('doctorRefNo')?.value || '',
      // Extra context
      appointmentId: this.appointmentData?.appointmentId || (this.selectedPatient as any)?.appointmentId || '',
      mode: this.getSelectedMode()
    };

    console.log('💾 Saving invoice to backend:', invoiceData);
    console.log('🔍 Backend API URL:', 'http://localhost:3000/api/pathology-invoice/create');
    console.log('🔍 Patient data:', invoiceData.patient);
    console.log('🔍 Tests data:', invoiceData.tests);
    console.log('🔍 Payment data:', invoiceData.payment);

    // Simple data for backend - NO VALIDATION
    console.log('🔍 Selected Patient Data:', this.selectedPatient);
    console.log('🔍 Selected Patient firstName:', this.selectedPatient?.firstName);
    console.log('🔍 Selected Patient lastName:', this.selectedPatient?.lastName);
    console.log('🔍 Selected Patient contact:', this.selectedPatient?.contact);

    const patientName = this.selectedPatient ?
      `${this.selectedPatient.firstName || ''} ${this.selectedPatient.lastName || ''}`.trim() :
      'Unknown Patient';

    console.log('🔍 Constructed Patient Name:', patientName);

    const fullAddress2 = this.formatPatientAddress(
      this.pathologyForm.get('address')?.value || (this.selectedPatient as any)?.address,
      this.selectedPatient
    ) || '';

    // Derive age unit letter for saving (Y/M/D) - create (2nd build)
    const ageInRawCreate2 = (this.pathologyForm.get('ageIn')?.value || (this.selectedPatient as any)?.ageIn || (this.patientRegistrationData as any)?.ageIn || '') + '';
    const ageUnitCreate2 = ageInRawCreate2.startsWith('M') ? 'M' : (ageInRawCreate2.startsWith('D') ? 'D' : 'Y');
    const ageInFullCreate2 = ageUnitCreate2 === 'M' ? 'Months' : ageUnitCreate2 === 'D' ? 'Days' : 'Years';

    const simpleData = {
      // Explicit references (UHID + ObjectIds)
      patientId: this.selectedPatient?.patientId || '', // UHID only
      patientRef: this.selectedPatient?._id || '',
      doctorId: this.pathologyForm.get('doctor')?.value || this.appointmentData?.doctor?._id || (this.appointmentData as any)?.doctor || '',
      doctorRef: this.pathologyForm.get('doctor')?.value || this.appointmentData?.doctor?._id || (this.appointmentData as any)?.doctor || '',
      departmentId: this.pathologyForm.get('department')?.value || '',
      departmentRef: this.pathologyForm.get('department')?.value || '',
      appointmentRef: (this.appointmentData as any)?._id || null,

      // Snapshot for print/history
      patient: {
        patientId: this.selectedPatient?.patientId || `PAT${Date.now()}`,
        registrationNumber: this.pathologyForm.get('registrationNumber')?.value || `REG${Date.now()}`,
        name: patientName,
        phone: this.selectedPatient?.contact || '',
        gender: this.selectedPatient?.gender || 'M',
        age: this.pathologyForm.get('age')?.value ?? (this.selectedPatient as any)?.age, // Send age as number only
        ageIn: ageInFullCreate2, // Normalize to full word (Years/Months/Days)
        address: fullAddress2
      },
      tests: this.addedTests.map(test => {
        const catName = (test.categoryName || test.category || 'PATHOLOGY').toString();
        const cat = this.serviceCategories.find(c => (c as any).categoryName?.toUpperCase() === catName.toUpperCase());
        const categoryId = (test.categoryId || (cat as any)?._id || (cat as any)?.categoryId || (this.currentSelectedCategoryObject as any)?._id || (this.currentSelectedCategoryObject as any)?.categoryId || '');
        return {
          name: test.testName || test.name || 'Medical Test',
          category: catName,
          categoryId: categoryId,
          cost: test.amount || test.cost || test.price || 0,
          quantity: test.quantity || 1,
          discount: test.discount || 0,
          netAmount: test.netAmount ?? this.calculateNetAmount((test.amount || test.cost || test.price || 0), (test.quantity || 1), (test.discount || 0))
        };
      }),
      payment: {
        totalAmount: this.netPayableAmount || this.totalCost || 0,
        paymentMethod: this.getSelectedPaymentMethod(),
        paymentStatus: 'PAID'
      },
      bookingDate: new Date(),
      doctorRefNo: this.pathologyForm.get('doctorRefNo')?.value || '',
      // Context required by backend
      mode: this.getSelectedMode(),
      appointmentId: this.appointmentData?.appointmentId || (this.selectedPatient as any)?.appointmentId || '',
      registrationNumber: this.pathologyForm.get('registrationNumber')?.value || ''
    };

    console.log('💾 Sending simple data to backend:', simpleData);

    // Debug: Log the data being sent to backend
    console.log('🔍 FRONTEND DEBUG - Data being sent to backend:');
    console.log('📄 Patient age:', simpleData.patient.age, 'type:', typeof simpleData.patient.age);
    console.log('📄 Patient ageIn:', simpleData.patient.ageIn, 'type:', typeof simpleData.patient.ageIn);
    console.log('📄 Full simpleData:', JSON.stringify(simpleData, null, 2));

    // Direct HTTP call to backend
    this.http.post(`${environment.apiUrl}/pathology-invoice/create`, simpleData).subscribe({
      next: (response: any) => {
        console.log('✅ Backend response received:', response);
        if (response && (response.success || response.invoice)) {
          console.log('✅ Invoice saved successfully to backend');
          console.log('📧 Receipt Number:', response.invoice.receiptNumber);
          console.log('📄 Invoice Number:', response.invoice.invoiceNumber);

          // Update invoice data with backend receipt number
          if (this.invoiceData) {
            this.invoiceData.receiptNumber = response.invoice.receiptNumber;
            this.invoiceData.backendId = response.invoice._id;
          }

          // Update receipt number in local table
          if (this.paidPatients.length > 0) {
            this.paidPatients[this.paidPatients.length - 1].receiptNumber = response.invoice.receiptNumber;
            this.paidPatients[this.paidPatients.length - 1].backendId = response.invoice._id;
            this.saveTodaysPaidPatientsToLocalStorage();
          }

          // Add the new invoice to BOTH arrays immediately for instant UI update
          const newInvoice = {
            ...response.invoice,
            patient: {
              ...response.invoice.patient,
              name: response.invoice.patient.name || (this.selectedPatient as any)?.name || 'Unknown'
            }
          };

          // Add to the beginning of BOTH arrays (latest first) using immutable refs
          this.paidPatients   = [newInvoice, ...(this.paidPatients || [])];
          this.todaysInvoices = [newInvoice, ...(this.todaysInvoices || [])];

          // Show table immediately and ensure visibility
          this.showPatientPaidData = true;
          this.paymentCompleted = true;

          // Clear filters so the newly paid invoice appears instantly
          this.receiptFilter = '';
          this.registrationFilter = '';
          this.updateDisplayedPaidPatients();

          // Safety: ensure row appears on top immediately even if any race occurs
          try {
            const top = (this.displayedPaidPatients || [])[0];
            const topReceipt = top ? String(top.receiptNumber || '') : '';
            const newReceipt = String(newInvoice.receiptNumber || '');
            if (topReceipt !== newReceipt) {
              const viewRow = {
                patientId: newInvoice.patient?.patientId || newInvoice.patientId || 'N/A',
                registrationNumber: newInvoice.patient?.registrationNumber || newInvoice.registrationNumber || 'N/A',
                patientName: newInvoice.patient?.name || newInvoice.patientName || 'Unknown Patient',
                age: newInvoice.patient?.age ? `${newInvoice.patient.age} ${(newInvoice.patient.ageIn || 'Y').toString().charAt(0).toUpperCase()}` : '',
                gender: newInvoice.patient?.gender || newInvoice.gender || 'N/A',
                contact: newInvoice.patient?.phone || newInvoice.contact || 'N/A',
                receiptNumber: newInvoice.receiptNumber,
                invoiceNumber: newInvoice.invoiceNumber,
                testsCount: (newInvoice.tests || newInvoice.testDetails || []).length || 0,
                totalAmount: newInvoice.payment?.totalAmount ?? newInvoice.totalAmount ?? 0,
                paymentDate: newInvoice.createdAt || newInvoice.bookingDate || newInvoice.paymentDate || new Date(),
                createdAt: newInvoice.createdAt || new Date(),
                updatedAt: newInvoice.updatedAt || newInvoice.createdAt || new Date(),
                bookingDate: newInvoice.bookingDate || null,
                paymentMode: newInvoice.payment?.paymentMethod || newInvoice.paymentMode || 'CASH',
                status: newInvoice.payment?.paymentStatus || newInvoice.status || 'PAID',
                mode: (newInvoice.mode || '').toUpperCase() || 'OPD',
                isPrinted: newInvoice.isPrinted || false,
                tests: newInvoice.tests || newInvoice.testDetails || [],
                testDetails: newInvoice.tests || newInvoice.testDetails || []
              } as any;
              this.displayedPaidPatients = [viewRow, ...(this.displayedPaidPatients || [])];
              this.safeDetectChanges();
            }
          } catch {}

          try { this.saveTodaysPaidPatientsToLocalStorage(); } catch {}

          console.log('✅ Invoice added to arrays:', {
            paidPatients: this.paidPatients.length,
            todaysInvoices: this.todaysInvoices.length
          });

          // Force change detection multiple times to ensure UI updates
          this.safeDetectChanges();
          this.safeTimeout(() => {
            this.forceTableRefresh();
          }, 100);

          console.log('✅ Backend save successful - Receipt Number:', response.invoice.receiptNumber);
          console.log('✅ Data saved to edit record successfully');
          console.log('✅ Table updated with new invoice');

          // ✅ NOTIFY OPD: Send pathology booking notification
          console.log('📢 NOTIFICATION: Sending pathology booking notification to OPD');
          console.log('🔍 NOTIFICATION: Selected patient object:', this.selectedPatient);
          const patientId = this.selectedPatient?._id || this.selectedPatient?.patientId;
          const registrationNumber = this.pathologyForm.get('registrationNumber')?.value;

          console.log('🔍 NOTIFICATION: Patient ID extracted:', patientId);
          console.log('🔍 NOTIFICATION: Registration number:', registrationNumber);
          console.log('🔍 NOTIFICATION: DataRefresh service:', this.dataRefresh);

          if (patientId) {
            const notificationData = {
              patientId: patientId,
              registrationNumber: registrationNumber,
              receiptNumber: response.invoice.receiptNumber,
              timestamp: new Date()
            };

            console.log('🚀 NOTIFICATION: Sending notification data:', notificationData);
            this.dataRefresh.notifyPathologyBooked(notificationData);
            console.log('✅ NOTIFICATION: Pathology booking notification sent for patient:', patientId);

            // ✅ BACKUP: Also use localStorage for immediate communication
            console.log('💾 BACKUP: Setting localStorage flag for pathology booking');
            localStorage.setItem('pathologyBookingNotification', JSON.stringify({
              patientId: patientId,
              registrationNumber: registrationNumber,
              timestamp: new Date().getTime()
            }));
            console.log('✅ BACKUP: localStorage flag set for immediate OPD update');
          } else {
            console.log('⚠️ NOTIFICATION: No patient ID found for notification');
            console.log('⚠️ NOTIFICATION: selectedPatient._id:', this.selectedPatient?._id);
            console.log('⚠️ NOTIFICATION: selectedPatient.patientId:', this.selectedPatient?.patientId);
          }

          // Show success message
          this.showSuccess(`Payment successful! Receipt Number: ${response.invoice.receiptNumber}`, '🎉 Payment Success!');

          // Also refresh from backend to ensure data consistency
          setTimeout(() => {
            this.loadTodaysInvoicesFromBackend();
            this.updateDisplayedPaidPatients();
          }, 500);

          // Reset form after successful payment
          this.resetFormAfterPayment();

          // Auto-navigate to Pathology Registration after payment
          setTimeout(() => {
            try { this.goToRegistrationFromCash(response.invoice); } catch (e) { console.warn('Navigation failed', e); }
          }, 800);

        } else {
          console.error('❌ Failed to save invoice:', response.message);
          this.alertService.showError('Save Failed', 'Failed to save invoice. Please try again.');
        }
      },
      error: (error) => {
        console.error('❌ Error saving invoice to backend:', error);
        console.error('❌ Error details:', error.error);
        console.error('❌ Error status:', error.status);
        console.error('❌ Error message:', error.message);
        this.alertService.showError('Backend Error', 'Backend save failed: ' + (error.error?.message || error.message || 'Unknown error'));

        // Reset form even if backend fails
        this.resetFormAfterPayment();
      }
    });
  }

  resetFormAfterPayment(): void {
    console.log('🔄 Resetting form after payment...');

    // Use the comprehensive reset to clear all fields and state
    this.resetForm();

    // Persist today's table to localStorage and refresh table immediately
    try { this.saveTodaysPaidPatientsToLocalStorage(); } catch {}
    this.showPatientPaidData = true;
    this.updateDisplayedPaidPatients();

    // Focus back to registration number for faster next entry
    this.safeTimeout(() => {
      const regInput = document.querySelector('input[formControlName="registrationNumber"]') as HTMLInputElement;
      if (regInput) {
        regInput.focus();
        regInput.select();
      }
    }, 100);

    console.log('✅ Form reset completed');
  }

  // Load today's invoices from backend
  loadTodaysInvoicesFromBackend(): void {
    console.log('🔄 Loading today\'s invoices from backend...');
    console.log('🔗 API URL:', `${environment.apiUrl}/pathology-invoice/list?limit=50`);
    this.http.get(`${environment.apiUrl}/pathology-invoice/list?limit=50`).subscribe({
      next: (response: any) => {
        console.log('✅ Backend invoices response:', response);
        if (response && response.success && response.invoices) {
          // Filter for today's invoices (robust across different date fields)
          const now = new Date();
          const isToday = (d: any) => {
            const dt = new Date(d || '');
            return !isNaN(dt.getTime()) &&
              dt.getFullYear() === now.getFullYear() &&
              dt.getMonth() === now.getMonth() &&
              dt.getDate() === now.getDate();
          };
          this.todaysInvoices = (response.invoices || []).filter((inv: any) =>
            isToday(inv.invoiceDate) || isToday(inv.paymentDate) || isToday(inv.createdAt) || isToday(inv.bookingDate)
          );

          // Merge backend list with local so freshly-paid (local) rows never disappear
          this.paidPatients = this.mergeInvoiceLists((this.paidPatients || []), (this.todaysInvoices || []));
          try {
            const today = (() => { const d=new Date(); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; })();
            localStorage.removeItem(`paidPatients_${today}`);
            // Persist merged list for resilience on reloads
            localStorage.setItem('paidPatients', JSON.stringify(this.paidPatients));
          } catch {}

          console.log('📋 Today\'s invoices loaded:', this.todaysInvoices.length);
          console.log('📋 Paid patients (merged) count:', this.paidPatients.length);

          // Show table if there are invoices
          if (this.paidPatients.length > 0) {
            this.showPatientPaidData = true;
            try { this.saveTodaysPaidPatientsToLocalStorage(); } catch {}
          }

          // Recompute view list for template
          this.updateDisplayedPaidPatients();
        }
      },
      error: (error) => {
        console.error('❌ Error loading invoices:', error);
        this.todaysInvoices = [];
      }
    });
  }

  // 🚫 SIMPLIFIED: Table refresh without manual change detection
  forceTableRefresh(): void {
    console.log('🔄 Simple table refresh...');
    this.showPatientPaidData = true;
    // 🚫 REMOVED: Manual change detection to prevent infinite loops
    console.log('✅ Table refresh completed');
  }

  // Get today's paid patients from backend data
  getTodaysPaidPatients(): any[] {
    console.log('🔍 getTodaysPaidPatients called');
    console.log('🔍 todaysInvoices length:', this.todaysInvoices?.length || 0);
    console.log('🔍 paidPatients length:', this.paidPatients?.length || 0);

    // Return backend data if available, otherwise fallback to local data
    if (this.todaysInvoices && this.todaysInvoices.length > 0) {
      return this.todaysInvoices.map((invoice: any) => ({
        patientId: invoice.patient?.patientId || 'N/A',
        registrationNumber: invoice.patient?.registrationNumber || 'N/A',
        patientName: invoice.patient?.name || 'Unknown Patient',
        age: invoice.patient?.age || 0,
        gender: invoice.patient?.gender || 'N/A',
        contact: invoice.patient?.phone || 'N/A',
        receiptNumber: invoice.receiptNumber,
        invoiceNumber: invoice.invoiceNumber,
        testsCount: invoice.tests?.length || 0,
        totalAmount: invoice.payment?.totalAmount || 0,
        paymentDate: invoice.createdAt || invoice.bookingDate,
        createdAt: invoice.createdAt,
        bookingDate: invoice.bookingDate,
        paymentMode: invoice.payment?.paymentMethod || 'CASH',
        status: invoice.payment?.paymentStatus || 'PAID',
        mode: (invoice.mode || '').toUpperCase() || 'OPD',
        isPrinted: invoice.isPrinted || false,
        // bring complete tests for grouping and print
        tests: invoice.tests || [],
        testDetails: invoice.tests || [],
        // edit flags for header chip
        isEdited: invoice.isEdited || false,
        lastEditedAt: invoice.lastEditedAt || null,
        lastEditedBy: invoice.lastEditedBy || '',
        editHistory: invoice.editHistory || [],
        // bonus context used elsewhere
        department: invoice.department || null,
        doctor: invoice.doctor || null,
        doctorRefNo: invoice.doctorRefNo || ''
      }));
    }

    // Fallback to local storage data
    const today = new Date();
    const todayStr = today.toDateString();
    return this.paidPatients.filter(patient => {
      if (patient.paymentDate) {
        const paymentDate = new Date(patient.paymentDate);
        return paymentDate.toDateString() === todayStr;
      }
      return true;
    });
  }

  // Get current date string
  getCurrentDate(): string {
    const today = new Date();
    return today.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  // Get payment time
  getPaymentTime(paymentDate: any): string {
    if (!paymentDate) return 'N/A';

    const date = new Date(paymentDate);
    return date.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }

  // Navigate to Edit Record page
  navigateToEditRecord(): void {
    console.log('🔄 Navigating to Edit Record page...');
    this.router.navigate(['/cash-receipt/edit-record']);
  }

  // Quick jump to Pathology Registration after payment from Cash Receipt
  goToRegistrationFromCash(patient: any): void {
    try {
      const receipt = (patient && (patient.receiptNumber || patient.receiptNo)) || (this.invoiceData?.receiptNumber);
      const mode = ((patient && (patient.mode || patient.addressType)) || this.pathologyForm.get('mode')?.value || 'OPD')
        .toString()
        .toUpperCase();
      if (!receipt) {
        this.alertService.showWarning('Missing Receipt', 'No receipt number found to schedule tests.');
        return;
      }
      this.router.navigate(['/pathology/registration'], { queryParams: { receiptNo: receipt, mode } });
    } catch (e) {
      console.warn('⚠️ Failed to navigate to Pathology Registration from Cash Receipt:', e);
      try { this.alertService.showError('Navigation Error', 'Could not open Registration page.'); } catch {}
    }
  }


  // Edit specific invoice
  editInvoice(patient: any): void {
    console.log('✏️ Editing invoice for patient:', patient.patientName);
    console.log('📋 Patient data:', patient);

    // Store patient data for editing (temporary storage for navigation)
    localStorage.setItem('editInvoiceData', JSON.stringify(patient));

    // Navigate to same form but in edit mode
    // Navigate directly to the concrete route so query params are preserved (no redirect)
    this.router.navigate(['/cash-receipt/register-opt-ipd'], {
      queryParams: {
        edit: true,
        receiptNumber: patient.receiptNumber,
        patientId: patient.patientId
      }
    });
  }

  // Delete specific invoice
  deleteInvoice(patient: any): void {
    console.log('🗑️ Delete request for patient:', patient.patientName);

    // Confirmation dialog
    const confirmDelete = confirm(`Are you sure you want to delete invoice for ${patient.patientName}?\nReceipt No: ${patient.receiptNumber}\nAmount: ₹${patient.totalAmount}`);

    if (confirmDelete) {
      try {
        // Prefer backend receipt number
        const receiptNo = patient.receiptNumber || patient.invoiceNumber;
        if (!receiptNo) {
          this.alertService.showError('Delete Failed', 'Missing receipt number for this invoice.');
          return;
        }

        this.alertService.showInfo('Deleting', `Deleting receipt ${receiptNo}...`);
        this.pathologyInvoiceService.deleteByReceipt(receiptNo).subscribe({
          next: (resp: any) => {
            if (resp?.success) {
              // Remove from local arrays
              this.paidPatients = (this.paidPatients || []).filter(p => p.receiptNumber !== receiptNo);
              this.todaysInvoices = (this.todaysInvoices || []).filter(p => p.receiptNumber !== receiptNo);
              this.updateDisplayedPaidPatients();
              try { this.saveTodaysPaidPatientsToLocalStorage(); } catch {}

              this.alertService.showSuccess('Deleted', `Receipt ${receiptNo} deleted successfully.`);
            } else {
              this.alertService.showError('Delete Failed', resp?.message || 'Unknown error');
            }
          },
          error: (err: any) => {
            console.error('❌ Delete error:', err);
            this.alertService.showError('Delete Failed', err?.error?.message || err?.message || 'Server error');
          }
        });
      } catch (e) {
        console.error('❌ Delete exception:', e);
        this.alertService.showError('Delete Failed', (e as any)?.message || 'Unexpected error');
      }
    } else {
      console.log('❌ Delete cancelled');
    }
  }

  generateInvoiceData(): void {
    console.log('📄 Generating invoice data...');
    console.log('👤 Selected Patient:', this.selectedPatient);
    console.log('📋 Patient Registration Data:', this.patientRegistrationData);

    // Use either selectedPatient or form data
    const patientData = this.selectedPatient || this.patientRegistrationData;

    if (!patientData && !this.pathologyForm.get('patient')?.value) {
      console.error('❌ No patient data available for invoice');
      this.alertService.showError('Patient Required', 'Patient information is required to generate invoice');
      return;
    }

    // Get patient info from form if no patient object
    const patientName = patientData ?
      `${patientData.firstName || ''} ${patientData.lastName || ''}`.trim() :
      this.pathologyForm.get('patient')?.value || 'Unknown Patient';

    const patientId = patientData?.patientId || patientData?._id || 'PAT000001';

    // Get doctor and department info for invoice
    const doctorName = this.getSelectedDoctorName();
    const departmentName = this.getSelectedDepartmentName();
    const selectedDoctorId = this.pathologyForm.get('doctor')?.value;
    const selectedDeptId = this.pathologyForm.get('department')?.value;

    // Get doctor and department details
    const selectedDoctor = this.doctors.find(d => d._id === selectedDoctorId);
    const selectedDepartment = this.departments.find(d => d._id === selectedDeptId);

    // Get room number from appointment data if available
    const roomNumber = this.appointmentData?.room?.roomNumber || '';

    console.log('🏥 Invoice Creation - Doctor Name:', doctorName);
    console.log('🏥 Invoice Creation - Department Name:', departmentName);
    console.log('🏥 Invoice Creation - Room Number:', roomNumber);
    console.log('🏥 Selected Doctor ID:', selectedDoctorId);
    console.log('🏥 Selected Department ID:', selectedDeptId);
    console.log('🏥 Selected Doctor Object:', selectedDoctor);
    console.log('🏥 Selected Department Object:', selectedDepartment);

    this.invoiceData = {
      invoiceNumber: `INV${Date.now()}`,
      bookingId: `PB${Date.now()}`,
      receiptNumber: 0, // Will be set by backend
      bookingDate: new Date(),
      patient: {
        patientId: patientId,
        name: patientName,
        phone: this.pathologyForm.get('contact')?.value || patientData?.contact || '',
        gender: this.pathologyForm.get('gender')?.value || patientData?.gender || 'M',
        age: this.pathologyForm.get('age')?.value ?? patientData?.age, // Send age as number only
        ageIn: this.pathologyForm.get('ageIn')?.value || (this.selectedPatient as any)?.ageIn || (patientData as any)?.ageIn || '',
        address: this.formatPatientAddress(this.pathologyForm.get('address')?.value || patientData?.address || '', this.selectedPatient || patientData)
      },
      doctor: {
        name: doctorName || '',
        specialization: selectedDoctor?.specialization || departmentName || '',
        roomNumber: roomNumber || ''
      },
      department: {
        name: departmentName || '',
        code: selectedDepartment?.code || ''
      },
      // Pass raw department ObjectId so backend can derive room/doctor
      departmentId: this.pathologyForm.get('department')?.value || '',
      mode: this.getSelectedMode(),
      appointmentId: this.appointmentData?.appointmentId || patientData?.appointmentId || '',
      tests: this.addedTests.map(test => ({
        name: test.name || test.testName || 'Medical Test',
        category: test.categoryName || test.category || 'PATHOLOGY',
        cost: test.cost || test.price || 0,
        quantity: test.quantity || 1,
        discount: test.discount || 0,
        netAmount: test.netAmount || test.cost || test.price || 0
      })),
      payment: {
        totalAmount: this.totalCost,
        paidAmount: this.totalCost,
        dueAmount: 0,
        paymentStatus: 'Paid',
        paymentMethod: this.getSelectedPaymentMethod()
      },
      labInfo: {
        name: this.labSettings?.labName || 'राजकीय आयुर्वेद महाविद्यालय एवं चिकित्सालय',
        address: [this.labSettings?.addressLine1, this.labSettings?.addressLine2, this.labSettings?.city, this.labSettings?.state, this.labSettings?.pincode].filter(Boolean).join(', ') || 'चौकाघाट, वाराणसी',
        phone: this.labSettings?.phone || this.labSettings?.altPhone || ''
      }
    };

    console.log('✅ Invoice data generated:', this.invoiceData);
  }

  // Test function removed - using only real data

  // Load logo as base64 for print
  loadLogo(): void {
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
    // Use default lab config logo as fallback
    this.logoBase64 = this.defaultLabConfig.getLabLogo();
    console.log('✅ Using default lab logo for print');
  }

  // Get short version of receipt number for table display
  getShortReceiptNumber(receiptNumber: string): string {
    if (!receiptNumber) return '';
    // Show last 8 characters of the unique ID
    return receiptNumber.length > 8 ? receiptNumber.slice(-8).toUpperCase() : receiptNumber.toUpperCase();
  }

  // Receipt number is generated by backend only (fallback)
  getNextReceiptNumber(): number {
    // Fallback for display - real receipt number comes from backend
    return this.invoiceData?.receiptNumber || 0;
  }

  // Add to local table with correct receipt number from backend
  addToLocalTableWithReceiptNumber(receiptNumber: number, backendId: string): void {
    console.log('🔍 Adding to table - Selected Patient:', this.selectedPatient);
    console.log('🔍 Patient firstName:', this.selectedPatient?.firstName);
    console.log('🔍 Patient lastName:', this.selectedPatient?.lastName);
    console.log('🔍 Form patient field:', this.pathologyForm.get('patient')?.value);

    // Try multiple sources for patient name
    let patientName = 'Unknown Patient';

    if (this.selectedPatient?.firstName && this.selectedPatient?.lastName) {
      patientName = `${this.selectedPatient.firstName} ${this.selectedPatient.lastName}`.trim();
    } else if (this.pathologyForm.get('patient')?.value) {
      patientName = this.pathologyForm.get('patient')?.value;
    } else if (this.selectedPatient?.firstName) {
      patientName = this.selectedPatient.firstName;
    }

    console.log('🔍 Final patient name for table:', patientName);

    const paidPatientData = {
      patientId: this.selectedPatient?.patientId || this.selectedPatient?._id || `PAT${Date.now()}`,
      registrationNumber: this.pathologyForm.get('registrationNumber')?.value || this.selectedPatient?.patientId || `REG${Date.now()}`,
      patientName: patientName,
      age: this.buildAgeWithUnit(this.selectedPatient?.age ?? this.pathologyForm.get('age')?.value, this.pathologyForm.get('ageIn')?.value || (this.selectedPatient as any)?.ageIn),
      gender: this.selectedPatient?.gender || 'N/A',
      contact: this.selectedPatient?.contact || '',
      // Carry address for accurate print in table
      address: this.formatPatientAddress((this.selectedPatient as any)?.address, this.selectedPatient),
      // Carry department/doctor snapshot for table print
      department: this.invoiceData?.department || { name: this.invoiceData?.doctor?.specialization || '' },
      doctor: this.invoiceData?.doctor || null,
      doctorRefNo: this.pathologyForm.get('doctorRefNo')?.value || this.invoiceData?.doctorRefNo || '',

      receiptNumber: receiptNumber, // Correct receipt number from backend
      invoiceNumber: this.invoiceData?.invoiceNumber,
      testsCount: this.addedTests.length,
      totalAmount: this.netPayableAmount,
      paymentDate: new Date(),
      paymentMode: this.getSelectedPaymentMethod(),
      status: 'PAID',
      isPrinted: true,
      patientDetails: this.selectedPatient,
      testDetails: this.addedTests.map(test => ({
        name: test.name,
        testName: test.name,
        cost: test.cost,
        quantity: test.quantity || 1,
        category: test.category || 'PATHOLOGY'
      })),
      backendId: backendId,
      tests: this.addedTests.map(test => ({
        testName: test.name,
        cost: test.cost,
        quantity: test.quantity || 1
      }))
    };

    this.paidPatients.push(paidPatientData);
    console.log('📋 Added to local table with receipt number:', paidPatientData);

    // Save to localStorage with today's date key
    this.saveTodaysPaidPatientsToLocalStorage();
  }

  // Add to local table immediately (fallback)
  addToLocalTable(): void {
    const paidPatientData = {
      patientId: this.selectedPatient?.patientId || this.selectedPatient?._id || `PAT${Date.now()}`,
      patientName: `${this.selectedPatient?.firstName || 'Patient'} ${this.selectedPatient?.lastName || 'Name'}`,
      // Include registration number and filters related fields
      registrationNumber: this.pathologyForm.get('registrationNumber')?.value || this.selectedPatient?.patientId || `REG${Date.now()}`,
      receiptNumber: this.invoiceData?.receiptNumber || 0, // Will be updated from backend
      invoiceNumber: this.invoiceData?.invoiceNumber,
      testsCount: this.addedTests.length,
      totalAmount: this.netPayableAmount,
      paymentDate: new Date(),
      status: 'PAID',
      mode: (this.pathologyForm.get('mode')?.value || 'OPD'),
      isPrinted: true,
      // Carry address/department/doctor snapshot for correct table print
      address: this.formatPatientAddress((this.selectedPatient as any)?.address, this.selectedPatient),
      department: this.invoiceData?.department || { name: this.invoiceData?.doctor?.specialization || '' },
      doctor: this.invoiceData?.doctor || null,
      doctorRefNo: this.pathologyForm.get('doctorRefNo')?.value || this.invoiceData?.doctorRefNo || '',

      patientDetails: this.selectedPatient,
      testDetails: this.addedTests
    };

    this.paidPatients.push(paidPatientData);
    console.log('📋 Added to local table:', paidPatientData);

    // Save to localStorage (per-day key)
    this.saveTodaysPaidPatientsToLocalStorage();
  }

  // Add invoice to paid patients list
  addToPaidPatientsList(invoice: any): void {
    const paidPatientData = {
      patientId: invoice.patient?.patientId,
      patientName: invoice.patient?.name,
      receiptNumber: invoice.receiptNumber,
      invoiceNumber: invoice.invoiceNumber,
      testsCount: invoice.tests?.length || 0,
      totalAmount: invoice.payment?.totalAmount,
      paymentDate: new Date(),
      status: 'PAID',
      mode: (invoice.mode || '').toUpperCase() || 'OPD',
      isPrinted: true,
      patientDetails: invoice.patient,
      testDetails: invoice.tests,
      backendId: invoice._id
    };

    this.paidPatients.push(paidPatientData);
    console.log('📋 Added to paid patients list:', paidPatientData);

    // Save to localStorage for immediate access (per-day key)
    this.saveTodaysPaidPatientsToLocalStorage();
  }

  // Save paid patients to localStorage
  savePaidPatientsToLocalStorage(): void {
    try {
      localStorage.setItem('paidPatients', JSON.stringify(this.paidPatients));
      console.log('💾 Paid patients saved to localStorage:', this.paidPatients.length);
    } catch (error) {
      console.error('❌ Error saving to localStorage:', error);
    }
  }

  // Load paid patients from localStorage
  loadPaidPatientsFromLocalStorage(): void {
    try {
      const savedData = localStorage.getItem('paidPatients');
      if (savedData) {
        this.paidPatients = JSON.parse(savedData);
        console.log('📂 Loaded paid patients from localStorage:', this.paidPatients.length);
      }
    } catch (error) {
      console.error('❌ Error loading from localStorage:', error);
      this.paidPatients = [];
    }
  }

  // Save today's paid patients to localStorage (disabled — always show current backend)
  saveTodaysPaidPatientsToLocalStorage(): void {
    try {
      const today = (() => { const d=new Date(); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; })();
      localStorage.removeItem(`paidPatients_${today}`);
      localStorage.removeItem('paidPatients');
      // no-op: caching disabled to avoid stale/deleted rows showing
    } catch {}
  }

  // Load today's paid patients from localStorage (disabled — always fetch from backend)
  loadTodaysPaidPatientsFromLocalStorage(): void {
    try {
      const today = (() => { const d=new Date(); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; })();
      localStorage.removeItem(`paidPatients_${today}`);
      localStorage.removeItem('paidPatients');
    } catch {}
    // Ensure we start clean and wait for backend
    this.paidPatients = [];
    this.showPatientPaidData = false;
    try { this.updateDisplayedPaidPatients(); } catch {}
    this.safeDetectChanges();
  }

  // Clear paid patients list and refresh from backend
  clearPaidPatients() {
    this.paidPatients = [];
    this.todaysInvoices = [];
    this.showPatientPaidData = false;

    // Clear localStorage data
    const today = (() => { const d=new Date(); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; })();
    const storageKey = `paidPatients_${today}`;
    localStorage.removeItem(storageKey);
    localStorage.removeItem('paidPatients');

    // Refresh from backend
    this.loadTodaysInvoicesFromBackend();

    console.log(`🗑️ Today's paid patients list cleared and refreshed from backend`);
  }

  // View patient details
  viewPatientDetails(patient: any) {
    console.log('👁️ Viewing patient details:', patient);
    this.alertService.showInfo('Patient Details', `ID: ${patient.patientId}\nName: ${patient.patientName}\nTests: ${patient.testsCount}\nAmount: ₹${patient.totalAmount}\nInvoice: ${patient.invoiceNumber}\nStatus: ${patient.status}`);
  }

  // Edit patient details
  editPatientDetails(patient: any) {
    console.log('✏️ Editing patient details:', patient);
    this.alertService.showInfo('Coming Soon', 'Edit functionality will be implemented in next update!');
  }

  // Reprint invoice for specific patient
  reprintInvoice(patient: any) {
    console.log('🖨️ Reprinting invoice for:', patient);

    // Mark as printed in UI
    patient.isPrinted = true;

    // Try to fetch full invoice from backend using receipt number for most accurate print
    const receiptNo = Number(patient?.receiptNumber || 0);
    if (receiptNo) {
      this.pathologyInvoiceService.getInvoiceByReceiptNumber(receiptNo).subscribe({
        next: (resp: any) => {
          const inv = resp?.invoice || resp;
          if (inv) {
            const p = (inv.patient || {}) as any;
            const tests = (inv.tests || []).map((t: any) => ({
              category: t.category || t.categoryName || 'PATHOLOGY',
              name: t.name || t.testName || 'Medical Test',
              netAmount: t.netAmount || t.amount || t.cost || 0
            }));

            this.invoiceData = {
              receiptNumber: inv.receiptNumber || patient.receiptNumber,
              bookingDate: inv.bookingDate || inv.createdAt || patient.paymentDate || patient.createdAt || new Date().toISOString(),
              patient: {
                name: p.name || patient.patientName || 'Patient',
                age: p.age || patient.age || '',
                ageIn: p.ageIn || patient.ageIn || '',
                gender: p.gender || patient.gender || '',
                address: this.formatPatientAddress(p.address || patient.address || '', p),
                phone: p.phone || patient.contact || '',
                registrationNumber: p.registrationNumber || patient.registrationNumber || p.patientId || ''
              },
              tests,
              payment: { totalAmount: inv.payment?.totalAmount ?? inv.totalAmount ?? patient.totalAmount ?? patient.payment?.totalAmount ?? 0 },
              mode: (inv.mode || patient.mode || this.pathologyForm.get('mode')?.value || 'OPD'),
              labInfo: { name: this.labSettings?.labName || 'राजकीय आयुर्वेद महाविद्यालय एवं चिकित्सालय', address: [this.labSettings?.addressLine1, this.labSettings?.addressLine2, this.labSettings?.city, this.labSettings?.state, this.labSettings?.pincode].filter(Boolean).join(', ') || 'चौकाघाट, वाराणसी', phone: this.labSettings?.phone || this.labSettings?.altPhone || '' },
              department: inv.department || patient.department || null,
              doctor: inv.doctor || patient.doctor || null,
              doctorRefNo: inv.doctorRefNo || patient.doctorRefNo || this.pathologyForm.get('doctorRefNo')?.value || ''
            } as any;

            this.printInvoice();
            console.log('✅ Invoice reprinted (backend) for:', this.invoiceData.patient?.name);
            return;
          }
          // If backend did not return invoice, fallback to local row
          this.reprintFromLocalRow(patient);
        },
        error: (e) => {
          console.warn('⚠️ Reprint fetch failed, falling back to local row', e);
          this.reprintFromLocalRow(patient);
        }
      });
    } else {
      // No receipt number: fallback
      this.reprintFromLocalRow(patient);
    }
  }

  // Fallback: build print data from the table row if backend fetch fails
  private reprintFromLocalRow(patient: any) {
    const p = (patient.patientDetails || patient.patient || {}) as any;
    const normalizedPatient = {
      name: p.name || patient.patientName || 'Patient',
      age: p.age || patient.age || '',
      ageIn: (p as any)?.ageIn || (patient as any)?.ageIn || '',
      gender: p.gender || patient.gender || '',
      address: this.formatPatientAddress(p.address || patient.address || '', { post: (p as any)?.post || patient.post, city: (p as any)?.city || patient.city, state: (p as any)?.state || patient.state, pincode: (p as any)?.pincode || patient.pincode || patient.zipCode }),
      phone: p.phone || patient.contact || patient.phone || '',
      patientId: p.patientId || patient.patientId || patient.registrationNumber || '',
      registrationNumber: p.registrationNumber || patient.registrationNumber || p.patientId || ''
    };

    const tests = (patient.testDetails || patient.tests || []).map((t: any) => ({
      category: t.category || t.categoryName || 'PATHOLOGY',
      name: t.name || t.testName || 'Medical Test',
      netAmount: t.netAmount || t.cost || 0
    }));

    this.invoiceData = {
      receiptNumber: patient.receiptNumber,
      bookingDate: patient.paymentDate || patient.createdAt || new Date().toISOString(),
      patient: { ...normalizedPatient, ageIn: (normalizedPatient as any)?.ageIn || '' },
      tests: tests,
      payment: { totalAmount: patient.totalAmount || patient.payment?.totalAmount || 0 },
      mode: patient.mode || this.pathologyForm.get('mode')?.value || 'OPD',
      labInfo: {
        name: this.defaultLabConfig.getLabName(this.labSettings?.labName),
        address: this.defaultLabConfig.getLabAddress([this.labSettings?.addressLine1, this.labSettings?.addressLine2, this.labSettings?.city, this.labSettings?.state, this.labSettings?.pincode].filter(Boolean).join(', ')),
        phone: this.labSettings?.phone || this.labSettings?.altPhone || ''
      },
      department: patient.department || null,
      doctor: patient.doctor || null,
      doctorRefNo: patient.doctorRefNo || this.pathologyForm.get('doctorRefNo')?.value || ''
    } as any;

    this.printInvoice();
    console.log('✅ Invoice reprinted (local) for:', normalizedPatient.name);
  }

  printInvoice(patient?: any): void {
    console.log('🖨️ Print function called');
    console.log('📄 Invoice data check:', this.invoiceData);




    if (!this.invoiceData) {
      console.error('❌ No invoice data available for printing');
      this.alertService.showError('Print Error', 'No invoice data available');
      return;
    }

    console.log('✅ Invoice data found, opening print window...');

    // Create a new window for printing
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
      console.error('❌ Failed to open print window - popup blocked');
      this.alertService.showWarning('Popup Blocked', 'Please allow popups to print the invoice');
      return;
    }

    console.log('✅ Print window opened successfully');

    // Generate HTML content for printing
    const printContent = this.generatePrintHTML();

    printWindow.document.write(printContent);
    printWindow.document.close();

    // Wait for content to load then render barcode and print
    printWindow.onload = () => {
      const anyWin: any = printWindow as any;
      const doc = printWindow.document;
      const barcodeVal = (this.invoiceData?.receiptNumber || (this.invoiceData as any)?.patient?.registrationNumber || '').toString();

      const renderAndPrint = () => {
        try {
          const svg = doc.getElementById('rcptBarcode') as SVGElement | null;
          if (svg && anyWin.JsBarcode && barcodeVal) {
            anyWin.JsBarcode(svg, barcodeVal, {
              format: 'CODE128',
              displayValue: true,
              font: 'Raleway',
              fontSize: 12,
              height: 40,
              margin: 0,
              textMargin: 2,
              width: 1.4,
            });
          }
        } catch (_) { /* ignore */ }

        printWindow.focus();
        printWindow.print();

        // Just close after print (backend save already done)
        printWindow.onafterprint = () => {
          console.log('🖨️ Print completed');
          printWindow.close();
          // ✅ FIX: Reset form after print
          this.resetFormAfterPayment();
        };

        // Fallback for browsers that don't support onafterprint
        setTimeout(() => {
          if (!printWindow.closed) {
            console.log('🖨️ Print timeout - closing window');
            printWindow.close();
            // ✅ FIX: Reset form after print timeout
            this.resetFormAfterPayment();
          }
        }, 3000);
      };

      // Load QRCode library first, then barcode
      const loadQRCode = () => {
        return new Promise<void>((resolve) => {
          if ((anyWin as any).QRCode) {
            resolve();
            return;
          }
          const qrScript = doc.createElement('script');
          qrScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
          qrScript.onload = () => resolve();
          qrScript.onerror = () => resolve(); // Continue even if QR fails
          doc.head.appendChild(qrScript);
        });
      };

      const renderQRCode = () => {
        try {
          const qrContainer = doc.getElementById('rcptQRCode');
          if (qrContainer && (anyWin as any).QRCode && barcodeVal) {
            // Clear any existing QR code
            qrContainer.innerHTML = '';
            new (anyWin as any).QRCode(qrContainer, {
              text: barcodeVal,
              width: 80,
              height: 80,
              colorDark: '#000000',
              colorLight: '#ffffff',
              correctLevel: (anyWin as any).QRCode?.CorrectLevel?.H || 2
            });
          }
        } catch (err) {
          console.warn('QR code generation failed:', err);
        }
      };

      loadQRCode().then(() => {
        renderQRCode();
        if (!anyWin.JsBarcode) {
          const s = doc.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js';
          s.onload = () => setTimeout(renderAndPrint, 0);
          s.onerror = renderAndPrint;
          doc.head.appendChild(s);
        } else {
          renderAndPrint();
        }
      });
    };
  }

  // Build final address string for printing using all available sources
  private getPatientAddressForPrint(): string {
    const inv = this.invoiceData || {} as any;
    const invPatient = (inv as any).patient || {};
    const formAddr = this.pathologyForm?.get('address')?.value || '';
    const selAddr = (this.selectedPatient as any)?.address || '';
    const base = invPatient.address || formAddr || selAddr || '';
    const fallback = { ...(this.selectedPatient as any), ...(this.appointmentData?.patient || {}), ...invPatient };
    return this.formatPatientAddress(base, fallback);
  }

  generatePrintHTML(): string {
    if (!this.invoiceData) return '';

    // Normalize tests and group by category for category-wise printing
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

    // Compute grand total fallback if payment missing
    const grandTotal = this.invoiceData?.payment?.totalAmount ?? normTests.reduce((s: number, t: any)=>s+(t.amount||0),0);

    // Age display: PREFER current unit (ageIn) over any stale DB letter in age string
    // 1) Try to read unit from sources; if present AND we can get a number, build fresh
    // 2) Otherwise fall back to DB age string pattern like '5 M' or raw string
    const rawAgePrint = (((this.invoiceData as any)?.patient?.age ?? '') + '').toString();
    // Prefer the unit saved in the invoice (source of truth), then fall back to form/selectedPatient
    const ageInPrint = (
      (
        ((this.invoiceData as any)?.patient?.ageIn) ||
        this.pathologyForm.get('ageIn')?.value ||
        ((this.selectedPatient as any)?.ageIn) ||
        ((this.patientRegistrationData as any)?.ageIn) ||
        ''
      ) + ''
    ).toString().toLowerCase();

    // Try to extract numeric age from: form value -> DB string -> plain number
    const formAgeRaw = ((this.pathologyForm.get('age')?.value ?? '') + '').toString();
    const formAgeNum = parseInt(formAgeRaw, 10);
    let numAge: number | null = !isNaN(formAgeNum) ? formAgeNum : null;
    if (numAge === null) {
      const m1 = rawAgePrint.match(/^\s*(\d+)\s*([YMD])\s*$/i);
      if (m1) {
        numAge = parseInt(m1[1], 10);
      } else {
        const n2 = parseInt(rawAgePrint, 10);
        if (!isNaN(n2)) numAge = n2; else numAge = null;
      }
    }

    let ageDisplay = '';
    if (numAge !== null && (ageInPrint || rawAgePrint)) {
      // Prefer explicit ageIn unit first; fallback to any letter present in raw age string
      let unitP = 'Y';
      if (ageInPrint) {
        if (ageInPrint.startsWith('day') || ageInPrint.startsWith('d')) unitP = 'D';
        else if (ageInPrint.startsWith('month') || ageInPrint.startsWith('m')) unitP = 'M';
        else if (ageInPrint.startsWith('year') || ageInPrint.startsWith('y')) unitP = 'Y';
      } else {
        const m2 = rawAgePrint.match(/^\s*\d+\s*([YMD])\s*$/i);
        if (m2) unitP = m2[1].toUpperCase();
      }
      ageDisplay = `${numAge} ${unitP}`;
    } else if (rawAgePrint) {
      // Fallback: keep DB string as-is (including any letter)
      ageDisplay = rawAgePrint;
    }

    const rawDocRef = (this.pathologyForm.get('doctorRefNo')?.value || (this.invoiceData as any)?.doctorRefNo || '').toString();
    const isObjectId = /^[a-f0-9]{24}$/i.test(rawDocRef);
    const docRefDisplay = (!rawDocRef || isObjectId) ? '' : rawDocRef;

    // Gender display - only show first letter
    const genderRaw = ((this.invoiceData as any)?.patient?.gender || this.pathologyForm.get('gender')?.value || '').toString();
    const g = genderRaw.trim().toUpperCase();
    const genderDisplay = (g && g.charAt(0)) || '';

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
          .invoice-container { width: 210mm; min-height: 297mm; margin: 0; padding: 8mm; border: none; position: relative; }
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

          /* Page footer positioned at bottom */
          .page-footer { position: absolute; bottom: 8mm; left: 8mm; right: 8mm; }

              /* Tri-signature footer */
              .footer-row.tri { display: flex; justify-content: space-between; gap: 10px; }
              .footer-row.tri .sign-col { width: 33.33%; text-align: center; }
              .footer-row.tri .signature-line { width: 90%; margin: 6px auto 0; height: 12px; border-bottom: 1px solid #000; }
              .signature-label { font-weight: bold; font-size: 12px; }
              .barcode-box svg { width: 100%; max-width: 160px; height: 44px; }
              .qr-barcode-container { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; gap: 10px; }
              .qr-code-box { flex: 0 0 auto; }
              .qr-code-box canvas, .qr-code-box img { width: 80px !important; height: 80px !important; }
              .barcode-box { flex: 1; text-align: right; }

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

        <div class="invoice-container">
          <div class="hospital-header">
            <div class="logo-section">
              ${this.logoBase64 || this.defaultLabConfig.getLabLogo(this.labSettings?.logoDataUrl) ? `<img src="${this.logoBase64 || this.defaultLabConfig.getLabLogo(this.labSettings?.logoDataUrl)}" alt="Lab Logo" class="gov-logo" style="background: white; padding: 5px; border-radius: 5px;">` : '<div class="gov-logo" style="background: #f0f0f0; display: flex; align-items: center; justify-content: center; font-size: 12px;">LOGO</div>'}
            </div>
            <div class="hospital-info">
              <h1 class="hospital-name">${this.defaultLabConfig.getLabName(this.invoiceData.labInfo?.name)}</h1>
              <p class="hospital-address">${this.defaultLabConfig.getLabAddress(this.invoiceData.labInfo?.address)}</p>
            </div>
            <div class="logo-section" style="text-align:right">
              ${this.labSettings?.sideLogoDataUrl ? `<img src="${this.labSettings?.sideLogoDataUrl}" alt="Side Logo" class="gov-logo" style="height:80px; width:auto; object-fit:contain;">` : ''}
            </div>
          </div>
          <div class="receipt-head">
              <h2 class="receipt-title">Hospital Cash Receipt</h2>
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
                    <div class="qr-barcode-container">
                      <div class="qr-code-box" id="rcptQRCode"></div>
                      <div class="barcode-box">
                        <svg id="rcptBarcode"></svg>
                      </div>
                    </div>

                    <div class="receipt-row">
                      <div><span class="label">Reg. No./Doc Ref. No.:</span> <span class="value">${(this.invoiceData as any)?.patient?.registrationNumber || this.pathologyForm.get('registrationNumber')?.value || ''}${docRefDisplay ? (' / ' + docRefDisplay) : ''}</span></div>
                      <div></div>
                    </div>
                    <div class="receipt-row">
                      <div><span class="label">Name:</span> <span class="value">${this.invoiceData.patient?.name || ''}</span></div>
                      <div><span class="label">Department:</span> <span class="value">${this.invoiceData.department?.name || this.invoiceData.doctor?.specialization || ''}</span></div>
                    </div>
                    <div class="receipt-row">
                      <div><span class="label">Address:</span> <span class="value">${this.getPatientAddressForPrint()}</span></div>
                      <div><span class="label">Doctor:</span> <span class="value">${this.invoiceData.doctor?.name || ''}${this.invoiceData.doctor?.roomNumber ? ' (' + this.invoiceData.doctor.roomNumber + ')' : ''}</span></div>
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
          <div class="page-footer">
            <div class="footer-row tri">
              <div class="sign-col">
                <span class="signature-label">Technician</span>
                <div class="signature-line"></div>
              </div>
              <div class="sign-col">
                <span class="signature-label">Pathologist 1</span>
                <div class="signature-line"></div>
              </div>
              <div class="sign-col">
                <span class="signature-label">Pathologist 2</span>
                <div class="signature-line"></div>
              </div>
            </div>
          </div>



        </div>
      </body>
      </html>
    `;
  }

  setTestParameters(parameters: TestParameter[]): void {
    const parametersArray = this.testParametersArray;

    // Add new parameters without clearing existing ones
    parameters.forEach(param => {
      // Check if parameter already exists
      const existingParam = parametersArray.controls.find(control =>
        control.get('parameterName')?.value === param.parameterName
      );


      if (!existingParam) {
        parametersArray.push(this.fb.group({
          parameterName: [param.parameterName, Validators.required],
          normalRange: [param.normalRange],
          unit: [param.unit],
          isRequired: [param.isRequired],
          value: ['', param.isRequired ? Validators.required : null],
          status: ['Normal']
        }));
      }
    });
  }

  clearTestParameters(): void {
    const parametersArray = this.testParametersArray;
    parametersArray.clear();
  }

  addTestParameter(): void {
    const parametersArray = this.testParametersArray;
    parametersArray.push(this.fb.group({
      parameterName: ['', Validators.required],
      normalRange: [''],
      unit: [''],
      isRequired: [false],
      value: [''],
      status: ['Normal']
    }));
  }

  removeTestParameter(index: number): void {
    this.testParametersArray.removeAt(index);
  }

  onSubmit(): void {
    if (this.pathologyForm.invalid) {
      this.pathologyForm.markAllAsTouched();
      this.alertService.showWarning('Form Incomplete', 'Please fill all required fields.');
      return;
    }

    if (this.addedTests.length === 0) {
      this.alertService.showWarning('Tests Required', 'Please add at least one test before submitting.');
      return;
    }

    this.isSubmitting = true;

    const formData = {
      collectionDate: this.pathologyForm.get('collectionDate')?.value,
      patient: this.pathologyForm.get('patient')?.value,
      doctor: this.pathologyForm.get('doctor')?.value,
      mode: this.pathologyForm.get('mode')?.value,
      serviceCategory: this.pathologyForm.get('serviceCategory')?.value,
      doctorRefNo: this.pathologyForm.get('doctorRefNo')?.value,
      tests: this.addedTests,
      totalCost: this.totalCost,
      status: 'Pending',
      isPaid: true, // Assuming payment is made during submission
      createdAt: new Date().toISOString()
    };

    console.log('Submitting pathology test:', formData);

    // Simulate successful submission
    setTimeout(() => {
      this.isSubmitting = false;
      this.alertService.showSuccess('Pathology Test Saved Successfully!', `Patient: ${this.selectedPatient?.firstName} ${this.selectedPatient?.lastName}\nTests: ${this.addedTests.length}\nTotal Amount: ₹${this.totalCost}\n\nInvoice has been generated.`);

      // Notify OPD Registration about pathology booking completion
      if (this.selectedPatient?._id) {
        console.log('🧪 Notifying pathology booking completion for patient:', this.selectedPatient._id);

        // Set localStorage flag for pathology booking completion
        localStorage.setItem('pathologyBooked', JSON.stringify({
          patientId: this.selectedPatient._id,
          patientName: `${this.selectedPatient.firstName} ${this.selectedPatient.lastName}`,
          testsCount: this.addedTests.length,
          totalCost: this.totalCost,
          timestamp: new Date().toISOString()
        }));

        // Send window message for real-time updates
        window.postMessage({
          type: 'PATHOLOGY_BOOKED',
          patientId: this.selectedPatient._id,
          patientName: `${this.selectedPatient.firstName} ${this.selectedPatient.lastName}`,
          testsCount: this.addedTests.length,
          totalCost: this.totalCost,
          timestamp: new Date().toISOString()
        }, '*');

        console.log('✅ Pathology booking notification sent');
      }

      // 🚨 FIX: Navigate to test-report page with receipt number
      const receiptNumber = this.pathologyForm.get('registrationNumber')?.value;
      if (receiptNumber) {
        console.log('🔄 Navigating to test-report page with receipt:', receiptNumber);
        this.router.navigate(['/pathology/test-report'], {
          queryParams: { receiptNo: receiptNumber }
        });
      } else {
        // Reset form if no receipt number
        this.resetForm();
      }
    }, 1000);
  }

  onCancel(): void {
    // Always cancel without navigation; just clear the form/session state
    this.resetForm();
    this.isEditMode = false;
    this.editingInvoiceId = undefined;
    this.originalReceiptNumber = undefined;
    this.paymentCompleted = false;
    this.showPatientPaidData = false;
    console.log('🔄 Cancel clicked — form cleared without navigation');

    // Unlock gender for a fresh form
    this.isGenderLocked = false;
    try { this.pathologyForm.get('gender')?.enable({ emitEvent: false }); } catch {}

  }

  resetForm(): void {
    // Reset all form fields to initial state
    this.pathologyForm.reset();
    this.pathologyForm.patchValue({
      registrationNumber: '',
      date: this.today,
      patient: '',
      age: '',
      gender: '',
      contact: '',
      address: '',
      registrationDate: '',
      department: '',
      doctor: '',
      mode: 'OPD',
      doctorRefNo: '',
      serviceCategory: '',
      collectionDate: this.today,
      isPaid: false
    });

    // Unlock gender on full reset
    this.isGenderLocked = false;
    try { this.pathologyForm.get('gender')?.enable({ emitEvent: false }); } catch {}


    // Reset component state
    this.selectedServiceCategory = '';
    this.selectedServiceHead = '';
    this.selectedServiceHeads = [];
    this.searchTerm = '';
    this.availableTests = [];
    this.filteredTests = [];
    this.addedTests = [];

    // Reset patient data
    this.selectedPatient = null;
    this.patientRegistrationData = null;
    this.appointmentData = null;

    // Reset payment entry UI
    this.amountReceived = 0;


    // Reset payment state
    this.paymentCompleted = false;
    this.showPatientPaidData = false;
    this.invoiceData = null;

    // Reset calculations
    this.subtotal = 0;
    this.totalDiscount = 0;
    this.netPayableAmount = 0;
    this.totalCost = 0;

    // Reset department and doctor selections
    this.selectedDepartment = '';

    // Trigger change detection
    this.safeDetectChanges();

    console.log('✅ Form completely reset successfully');
  }

// Helper methods for template
  getPatientDisplayName(patient: Patient): string {
    return `${patient.firstName} ${patient.lastName} (${patient.patientId})`;
  }

  // Extract appointment number from appointment ID (APT000038 → 38)
  getAppointmentNumber(appointmentId: string): string {
    if (!appointmentId) return '';

    // Extract number from APT000038 format
    const match = appointmentId.match(/APT0*(\d+)/);
    return match ? match[1] : appointmentId;
  }

  getDoctorDisplayName(doctor: Doctor): string {
    const firstName = doctor.firstName || doctor.name || 'Unknown';
    const lastName = doctor.lastName || '';
    // Business rule: show only the doctor's name; do not append specialization like "- General"
    return `${firstName} ${lastName}`.trim();
  }

  // Get selected doctor name for invoice
  getSelectedDoctorName(): string {
    const selectedDoctorId = this.pathologyForm.get('doctor')?.value;
    if (selectedDoctorId) {
      const doctor = this.doctors.find(d => d._id === selectedDoctorId);
      if (doctor) {
        const firstName = doctor.firstName || doctor.name || '';
        const lastName = doctor.lastName || '';
        return `${firstName} ${lastName}`.trim();
      }
    }
    // No hard-coded default; keep blank if not selected
    return '';
  }

  // Choose the richer/more informative address between two strings
  private pickRicherAddress(a?: string, b?: string): string {
    const norm = (s?: string) => (s || '').toString().trim();
    const score = (s: string) => {
      if (!s) return 0;
      const parts = s.split(',').map(p => p.trim()).filter(Boolean);
      return parts.length * 100 + s.length;
    };
    const aa = norm(a);
    const bb = norm(b);
    if (score(bb) > score(aa)) return bb;
    return aa || bb;
  }

  // Capitalize first letter of each word helper
  private capitalizeWords(value: string): string {
    if (!value) return '';
    return value.replace(/\b\w/g, (c: string) => c.toUpperCase());
  }

  // Input handlers for Name and Address to auto-capitalize words
  onPatientNameInput(event: any): void {
    const input = event?.target as HTMLInputElement;
    const val = this.capitalizeWords(input?.value || '');
    this.pathologyForm.get('patient')?.setValue(val, { emitEvent: false });
    if (input) input.value = val;
  }

  onAddressInput(event: any): void {
    const input = event?.target as HTMLInputElement;
    const val = this.capitalizeWords(input?.value || '');
    this.pathologyForm.get('address')?.setValue(val, { emitEvent: false });
    if (input) input.value = val;
  }

  // Keep only digits and clamp to 10
  formatContactInput(event: any): void {
    const input = event?.target as HTMLInputElement;
    const digits = (input?.value || '').replace(/\D/g, '').slice(0, 10);
    this.pathologyForm.get('contact')?.setValue(digits, { emitEvent: false });
    if (input) input.value = digits;
  }


  // Get selected department name for invoice
  getSelectedDepartmentName(): string {
    const selectedDeptId = this.pathologyForm.get('department')?.value;
    if (selectedDeptId) {
      const department = this.departments.find(d => d._id === selectedDeptId);
      if (department) {
        return department.name || department.departmentName || 'SHALYA CHIKITSA';
      }
    }
    return 'SHALYA CHIKITSA'; // Default fallback
  }

  // Patient selection handler
  onPatientChange(): void {
    const patientId = this.pathologyForm.get('patient')?.value;
    if (patientId) {
      this.selectedPatient = this.patients.find(p => p._id === patientId) || null;
    } else {
      this.selectedPatient = null;
    }
  }

  // SAFE: Registration number change handler with loop prevention
  onRegistrationNumberChange(): void {
    const regNumber = this.pathologyForm.get('registrationNumber')?.value;
    console.log('🔍 Registration/Appointment ID changed:', regNumber);

    if (regNumber && regNumber.trim() && !this.isSearching) {
      // Clear any existing timeout
      if (this.searchTimeout) {
        clearTimeout(this.searchTimeout);
      }

      // Debounced search to prevent excessive API calls
      this.searchTimeout = setTimeout(() => {
        if (!this.destroyed && !this.isSearching) {
          this.isSearching = true;
          console.log('🔍 Debounced search for appointment/patient with ID:', regNumber.trim());
          this.fetchAppointmentByRegistrationNumber(regNumber.trim());
          setTimeout(() => { if (!this.destroyed) this.isSearching = false; }, 1000);
        }
      }, 500);
    } else if (!regNumber || regNumber.trim().length === 0) {
      this.clearPatientData();
    }
  }

  // Handle Enter key press for immediate fetch
  onEnterPressed(): void {
    const regNumber = this.pathologyForm.get('registrationNumber')?.value;
    if (regNumber && regNumber.trim()) {
      // Clear any pending timeout
      if (this.searchTimeout) {
        clearTimeout(this.searchTimeout);
      }
      // Fetch immediately
      this.fetchAppointmentByRegistrationNumber(regNumber.trim());
    }
  }



  // Fetch appointment data by registration number (appointmentId)
  fetchAppointmentByRegistrationNumber(registrationNumber: string): void {
    console.log('🔍 Fetching appointment with registration number:', registrationNumber);
    this.patientService.getAppointmentByRegistrationNumber(registrationNumber).subscribe({
      next: (response: any) => {
        console.log('📋 Appointment service response:', response);
        if (response && response.success && response.appointment) {
          const appointment = response.appointment;
          this.appointmentData = appointment;

          // Normalize patient and figure out if we should fetch full record
          const pat: any = appointment.patient;
          const maybeId = typeof pat === 'string'
            ? pat
            : (pat?._id || pat?.patientId || (appointment as any)?.patientId || (typeof (appointment as any)?.patient === 'string' ? (appointment as any).patient : ''));

          const isOnlyId = !pat || typeof pat === 'string' || (pat && Object.keys(pat).length <= 2);

          const hasAddress = !!(
            pat && (
              (typeof pat.address === 'string' && pat.address.trim().length > 2) ||
              (typeof pat.address === 'object' && (
                (pat.address?.post || pat.address?.city || pat.address?.state || pat.address?.zipCode || (pat.address as any)?.pincode) ||
                (pat.post || pat.city || pat.state || (pat as any)?.pincode)
              ))
            )
          );

          // Always fetch the latest patient by id when available to ensure full address
          if (maybeId) {
            console.log('ℹ️ Fetching full patient by id for reliable address fields. Flags -> isOnlyId:', isOnlyId, ', hasAddress:', hasAddress, ', id:', maybeId);
            this.patientService.getPatientById(maybeId).subscribe({
              next: (resp: any) => {
                const full = resp?.patient || resp;
                if (full) {
                  this.patientRegistrationData = full;
                  (this.appointmentData as any).patient = full;
                  this.populatePatientDataFromAppointment({ ...appointment, patient: full });
                } else {
                  console.warn('⚠️ Patient not found by id:', maybeId);
                  this.populatePatientDataFromAppointment(appointment); // best-effort
                }
              },
              error: (err: any) => {
                console.error('❌ Error fetching patient by id:', err);
                this.populatePatientDataFromAppointment(appointment); // best-effort
              }
            });
            return; // population will happen after fetch
          }

          // We already have adequate patient object
          this.patientRegistrationData = appointment.patient;
          this.populatePatientDataFromAppointment(appointment);
          console.log('✅ Appointment and patient data populated successfully');
        } else {
          console.log('❌ Appointment not found with registration number:', registrationNumber, ' — trying patient registry fallback');
          this.fetchPatientByRegistrationNumber(registrationNumber);
        }
      },
      error: (error: any) => {
        console.error('❌ Error fetching appointment:', error, ' — trying patient registry fallback');
        this.fetchPatientByRegistrationNumber(registrationNumber);
      }
    });
  }

  // Fetch patient data by registration number (fallback for UHID)
  fetchPatientByRegistrationNumber(registrationNumber: string): void {
    console.log('🔍 Fetching patient with registration number:', registrationNumber);
    this.patientService.getPatientByRegistrationNumber(registrationNumber).subscribe({
      next: (response: any) => {
        console.log('📋 Patient service response:', response);
        if (response && response.success && response.patient) {
          this.patientRegistrationData = response.patient;
          this.populatePatientData(response.patient);
          console.log('✅ Patient data populated successfully');
        } else {
          console.log('❌ Patient not found with registration number:', registrationNumber);
          this.clearPatientData();
        }
      },
      error: (error: any) => {
        console.error('❌ Error fetching patient:', error);
        this.clearPatientData();
      }
    });
  }

  // Populate form with patient data
  populatePatientData(patient: any): void {
    console.log('📝 Populating form with patient data:', patient);

    // Lock gender when prefilling from patient object
    this.isGenderLocked = true;
    try { this.pathologyForm.get('gender')?.disable({ emitEvent: false }); } catch {}


    // Convert gender to match form options
    let formGender = '';
    if (patient.gender) {
      const gender = patient.gender.toUpperCase();
      if (gender === 'MALE' || gender === 'M') formGender = 'MALE';
      else if (gender === 'FEMALE' || gender === 'F') formGender = 'FEMALE';
      else formGender = 'OTHER';
    }

    const formData = {
      patient: `${patient.firstName} ${patient.lastName}`,
      contact: patient.contact || (patient as any).phone,
      ...(() => { const p = this.parseAgeValue(patient.age, (patient as any)?.ageIn); return { age: p.num, gender: formGender, ageIn: p.ageIn }; })(),
      address: this.formatPatientAddress(patient.address, patient),
      registrationDate: patient.registrationDate ? (() => { const d=new Date(patient.registrationDate); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; })() : ''
    };

    console.log('📝 Form data to patch:', formData);
    console.log('🚻 Gender mapping:', patient.gender, '->', formGender);
    this.pathologyForm.patchValue(formData);

    // Set selectedPatient for table display
    this.selectedPatient = patient;
    console.log('✅ Selected patient set:', this.selectedPatient);

    // Trigger change detection
    this.safeDetectChanges();
  }


  // Clear patient data
  // Populate patient data from appointment
  populatePatientDataFromAppointment(appointment: any): void {
    console.log('📋 Populating patient data from appointment:', appointment);

    const patient = appointment.patient;
    if (patient) {
      // Convert gender to match form options
      let formGender = '';
      if (patient.gender) {
        const gender = patient.gender.toUpperCase();
        if (gender === 'MALE' || gender === 'M') formGender = 'MALE';
        else if (gender === 'FEMALE' || gender === 'F') formGender = 'FEMALE';
        else formGender = 'OTHER';
      }

      // Preserve richer address if already present (from query params)
      const currentAddr = (this.pathologyForm.get('address')?.value || '').toString().trim();
      const patientAddr = this.formatPatientAddress(patient.address, patient) || '';
      const mergedAddr = this.pickRicherAddress(currentAddr, patientAddr) || patientAddr || currentAddr;

      this.pathologyForm.patchValue({
        patient: `${patient.firstName} ${patient.lastName}`,
        contact: patient.contact || (patient as any).phone || '',
        ...(() => { const p = this.parseAgeValue(patient.age, (patient as any)?.ageIn); return { age: p.num || '', ageIn: p.ageIn, gender: formGender, address: mergedAddr }; })()
      });

      // Update selectedPatient object for table display
      this.selectedPatient = {
        _id: patient._id || patient.patientId,
        patientId: patient.patientId || patient._id,
        firstName: patient.firstName,
        lastName: patient.lastName,
        age: patient.age,
        ageIn: (patient as any)?.ageIn,
        gender: patient.gender,
        contact: patient.contact
      } as any;

      console.log('✅ Selected patient updated:', this.selectedPatient);

      // Also populate appointment specific data
      this.pathologyForm.patchValue({
        registrationDate: appointment.appointmentDate ? (() => { const d=new Date(appointment.appointmentDate); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; })() : ''
      });

      // Lock gender after populating from appointment
      this.isGenderLocked = true;
      try { this.pathologyForm.get('gender')?.disable({ emitEvent: false }); } catch {}


      // Set department and doctor if available
      if (appointment.department) {
        console.log('🏥 Setting department from appointment:', appointment.department);
        this.selectedDepartment = appointment.department._id;
        this.pathologyForm.patchValue({
          department: appointment.department._id
        });

        // Load doctors for this department
        this.onDepartmentChange();
      } else {
        console.log('⚠️ No department found in appointment');

      }

      if (appointment.doctor) {
        console.log('👨‍⚕️ Setting doctor from appointment:', appointment.doctor);
        this.pathologyForm.patchValue({
          doctor: appointment.doctor._id
        });
      } else {
        console.log('⚠️ No doctor found in appointment');
      }

      // Set selectedPatient for table display
      this.selectedPatient = patient;
      console.log('✅ Selected patient set from appointment:', this.selectedPatient);

      console.log('✅ Patient data populated from appointment');
    }
  }

  clearPatientData(): void {
    console.log('🧹 Clearing patient data');
    this.patientRegistrationData = null;
    this.appointmentData = null;
    this.selectedPatient = null;
    this.selectedDepartment = '';

    // Clear all patient and appointment related fields
    this.pathologyForm.patchValue({
      patient: '',
      contact: '',
      age: '',
      gender: '',
      address: '',
      registrationDate: '',
      department: '',
      doctor: ''
    });

    // Reset filtered doctors to full list (show all doctors)
    this.filteredDoctors = this.doctors.slice();


    // Unlock gender when patient data is fully cleared
    this.isGenderLocked = false;
    try { this.pathologyForm.get('gender')?.enable({ emitEvent: false }); } catch {}

    console.log('✅ All patient data cleared including department and doctor');
    this.safeDetectChanges();
  }

  onDepartmentChange(): void {
    const selectedDeptId = this.pathologyForm.get('department')?.value;
    console.log('🏥 Department changed to:', selectedDeptId);
    // Show all doctors irrespective of department selection
    this.selectedDepartment = selectedDeptId;
    this.filteredDoctors = this.doctors.slice();
    // Do not reset doctor selection here
  }

  onDoctorChange(): void {
    const selectedDoctorId = this.pathologyForm.get('doctor')?.value;
    console.log('👨‍⚕️ Doctor changed to:', selectedDoctorId);
    // Do NOT auto-select department based on doctor; keep them independent
    this.filteredDoctors = this.doctors.slice();
  }

  // Check if test is already added
  isTestAdded(test: TestInfo): boolean {
    return this.addedTests.some(addedTest => addedTest.testName === test.testName);
  }

  // Toggle test selection
  toggleTest(test: TestInfo): void {
    if (this.isTestAdded(test)) {
      this.removeTest(test);
    } else {
      this.addedTests.push({ ...test, sessionAdded: true });
      this.updateTotalCost();
      this.pathologyForm.get('cost')?.setValue(this.totalCost);
    }
  }


  // Cast AbstractControl to FormGroup for template usage
  asFormGroup(control: import("@angular/forms").AbstractControl): FormGroup {
    return control as FormGroup;
  }

  // ✅ FIX: Format patient address to handle object/string cases
  // Accept optional fallback object to merge top-level fields like post/city
  formatPatientAddress(address: any, fallback?: any): string {
    console.log('🏠 PATHOLOGY ADDRESS FORMAT: Input address:', address, 'Type:', typeof address, 'fallback:', fallback);

    if (!address && !fallback) return '';

    const parts: string[] = [];

    // Helper to push unique, trimmed values (accept string/number and ignore objects)
    const pushPart = (v?: any) => {
      if (v === null || v === undefined) return;
      const s = String(v).trim();
      if (!s || s === '[object Object]') return;
      const exists = parts.some(p => p.toLowerCase() === s.toLowerCase());
      if (!exists) parts.push(s);
    };

    // If address is a string, parse comma-separated parts
    if (typeof address === 'string') {
      const raw = address.trim();
      if (raw.includes(',')) {
        raw.split(',').map(p => p.trim()).filter(Boolean).forEach(p => pushPart(p));
      } else {
        pushPart(raw);
      }
    }

    // If address is object, extract common fields
    if (address && typeof address === 'object') {
      pushPart(address.street);
      pushPart(address.area);
      pushPart(address.post);
      pushPart(address.city);
      pushPart(address.state);
      pushPart(address.zipCode);
      pushPart((address as any).pincode);
      pushPart((address as any).pin);
    }

    // Merge top-level fallbacks (e.g., patient.post/city)
    if (fallback && typeof fallback === 'object') {
      pushPart((fallback as any).post);
      pushPart((fallback as any).city);
      pushPart((fallback as any).state);
      pushPart((fallback as any).zipCode);
      pushPart((fallback as any).pincode);

      // Also look into fallback.address {...} if present (patient schema stores nested)
      const faddr = (fallback as any).address;
      if (faddr && typeof faddr === 'object') {
        pushPart(faddr.street);
        pushPart(faddr.area);
        pushPart(faddr.post);
        pushPart(faddr.city);
        pushPart(faddr.state);
        pushPart(faddr.zipCode);
        pushPart((faddr as any).pincode);
        pushPart((faddr as any).pin);
      }
    }

    // If still empty and have something truthy, fallback to toString
    if (parts.length === 0 && address) {
      const fb = String(address);
      if (fb && fb !== '[object Object]') pushPart(fb);
    }

    const result = parts.join(', ');
    console.log('🏠 PATHOLOGY ADDRESS FORMAT: Formatted result:', result);
    return result;
  }

  // Prepare grouped categories for the View modal (category-wise tests + subtotal)
  private buildViewCategories(record: any): Array<{name: string; tests: any[]; subtotal: number}> {
    if (!record) return [];
    const tests = Array.isArray(record.tests) ? record.tests : (Array.isArray(record.testDetails) ? record.testDetails : []);
    const groups: {[k: string]: any[]} = {};
    tests.forEach((t: any) => {
      const cat = (t?.category || record?.department?.name || 'PATHOLOGY').toString().toUpperCase();
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(t);
    });
    return Object.keys(groups).map(name => ({
      name,
      tests: groups[name],
      subtotal: groups[name].reduce((sum: number, x: any) => sum + (Number(x?.netAmount ?? x?.amount ?? x?.cost ?? 0)), 0)
    }));
  }

  // View modal handlers for Today's Invoices table
  viewInvoice(patient: any): void {
    console.log('👁️ View invoice clicked:', patient);
    // Attach grouped view categories for modal rendering
    (patient as any).__viewCategories = this.buildViewCategories(patient);
    this.selectedViewRecord = patient;
    this.showViewModal = true;
  }

  // ----- Edit Audit Modal state -----
  showEditAuditModal: boolean = false;
  selectedAuditRecord: any = null;

  // Open audit modal from Today's Invoices table
  openEditAudit(record: any): void {
    try {
      // Attach normalized history for safe rendering
      (record as any).__editHistory = this.getEditHistory(record);
    } catch {}
    this.selectedAuditRecord = record;
    this.showEditAuditModal = true;
    this.safeDetectChanges();
  }

  closeEditAudit(): void {
    this.showEditAuditModal = false;
    this.selectedAuditRecord = null;
    this.safeDetectChanges();
  }

  // Inline audit (below row) toggle and state
  toggleInlineAudit(row: any): void {
    if (!row) { return; }
    row.__inlineAuditOpen = !row.__inlineAuditOpen;
    try { (row as any).__editHistory = this.getEditHistory(row); } catch {}
    this.safeDetectChanges();
  }

  // ----- Edit history helpers (simplified, aligned with Edit Record view) -----
  private getEditHistory(record: any): any[] {
    const hist = Array.isArray(record?.editHistory) ? record.editHistory : [];
    return hist;
  }

  getLastEditedAtSimple(record: any): Date | null {
    const hist = this.getEditHistory(record);
    const last = hist.length ? hist[hist.length - 1] : null;
    const at = last?.at || last?.editedAt || record?.lastEditedAt || record?.updatedAt;
    return at ? new Date(at) : null;
  }

  getLastEditedBySimple(record: any): string | null {
    const hist = this.getEditHistory(record);
    const last = hist.length ? hist[hist.length - 1] : null;
    return (last?.by || last?.editedBy || record?.lastEditedBy) || null;
  }

  entryPrevTests(entry: any): any[] {
    const ch = entry?.changes || {};
    if (Array.isArray((ch as any).testsBefore)) return (ch as any).testsBefore;
    if ((ch as any).tests && Array.isArray((ch as any).tests.before)) return (ch as any).tests.before;
    if (Array.isArray((ch as any).tests)) {
      const before = (ch as any).tests.map((t: any) => t?.before).filter((x: any) => !!x);
      if (before.length) return before;
    }
    if (Array.isArray((entry as any).testsBefore)) return (entry as any).testsBefore;
    return [];
  }

  entryAfterTests(entry: any): any[] {
    const ch = entry?.changes || {};
    if (Array.isArray((ch as any).testsAfter)) return (ch as any).testsAfter;
    if ((ch as any).tests && Array.isArray((ch as any).tests.after)) return (ch as any).tests.after;
    if (Array.isArray((ch as any).tests)) {
      const after = (ch as any).tests.map((t: any) => t?.after).filter((x: any) => !!x);
      if (after.length) return after;
    }
    if (Array.isArray((entry as any).testsAfter)) return (entry as any).testsAfter;
    return [];
  }

  sumTests(tests: any[]): number {
    return (tests || []).reduce((s: number, t: any) => s + Number(t?.netAmount ?? t?.amount ?? t?.cost ?? 0), 0);
  }

  entryPrevAmount(entry: any, record?: any): number | null {
    const ch = entry?.changes || {};
    if ((ch as any)?.totalAmount?.before !== undefined) return Number((ch as any).totalAmount.before);
    if ((ch as any)?.payment?.totalAmount?.before !== undefined) return Number((ch as any).payment.totalAmount.before);
    if ((ch as any)?.amount?.before !== undefined) return Number((ch as any).amount.before);
    const prevTests = this.entryPrevTests(entry);
    if (prevTests.length) return this.sumTests(prevTests);
    if (record?.previous?.totalAmount !== undefined) return Number(record.previous.totalAmount);
    return null;
  }

  entryAfterAmount(entry: any, record?: any): number | null {
    const ch = entry?.changes || {};
    if ((ch as any)?.totalAmount?.after !== undefined) return Number((ch as any).totalAmount.after);
    if ((ch as any)?.payment?.totalAmount?.after !== undefined) return Number((ch as any).payment.totalAmount.after);
    if ((ch as any)?.amount?.after !== undefined) return Number((ch as any).amount.after);
    const afterTests = this.entryAfterTests(entry);
    if (afterTests.length) return this.sumTests(afterTests);
    if (record?.totalAmount !== undefined) return Number(record.totalAmount);
    return null;
  }

  getEntryDelta(entry: any, record?: any): number {
    const prev = Number(this.entryPrevAmount(entry, record) ?? 0);
    const curr = Number(this.entryAfterAmount(entry, record) ?? 0);
    return curr - prev;
  }

  testKey(t: any): string {
    const nameKey = (t?.name || t?.testName || '').toString().trim().toLowerCase();
    const catKey = (t?.category || t?.dept || '').toString().trim().toLowerCase();
    return (catKey ? catKey + ':' : '') + nameKey;
  }

  getEntryAddedTests(entry: any): any[] {
    const before = this.entryPrevTests(entry) || [];
    const after = this.entryAfterTests(entry) || [];
    const beforeSet = new Set(before.map((t: any) => this.testKey(t)));
    return after.filter((t: any) => {
      const key = this.testKey(t);
      return key && !beforeSet.has(key);
    });
  }

  getEntryRemovedTests(entry: any): any[] {
    const before = this.entryPrevTests(entry) || [];
    const after = this.entryAfterTests(entry) || [];
    const afterSet = new Set(after.map((t: any) => this.testKey(t)));
    return before.filter((t: any) => {
      const key = this.testKey(t);
      return key && !afterSet.has(key);
    });
  }

  getAddedTotalForEntry(entry: any): number {
    return this.getEntryAddedTests(entry).reduce((s: number, t: any) => s + Number(t?.netAmount ?? t?.amount ?? t?.cost ?? 0), 0);
  }
  getRemovedTotalForEntry(entry: any): number {
    return this.getEntryRemovedTests(entry).reduce((s: number, t: any) => s + Number(t?.netAmount ?? t?.amount ?? t?.cost ?? 0), 0);
  }

  // Utilities used in template
  formatCurrencyNumber(n: any): string { return Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
  absValue(n: number): number { return Math.abs(Number(n || 0)); }


  // Overall last delta for header chip (based on last history entry)
  getEditDeltaSimple(record: any): number {
    const hist = this.getEditHistory(record);
    if (!hist.length) return 0;
    const last = hist[hist.length - 1];
    return this.getEntryDelta(last, record);
  }


  // ===== Helpers copied from Edit Record for exact visual/data parity =====
  private lastEditEntry(record: any): any | null {
    const hist = record?.editHistory;
    if (Array.isArray(hist) && hist.length) return hist[hist.length - 1] || null;
    return null;
  }

  getPatientName(record: any): string {
    const p = record?.patient || record?.patientDetails || {};
    return (
      p.name || record?.patientName || `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'Patient'
    );
  }

  getRegistrationNumber(record: any, _index?: number): string {
    const p = record?.patient || record?.patientDetails || {};
    return (
      p.registrationNumber || record?.registrationNumber || p.patientId || record?.patientId || ''
    );
  }

  getPatientAge(record: any): string {
    const p = record?.patient || record?.patientDetails || {};
    const raw = (((p as any).age ?? (record as any).age ?? '') + '').toString();
    if (!raw) return '';

    // First check if age already has unit format like "7 D"
    const m = raw.match(/^\s*(\d+)\s*([YMD])\s*$/i);
    if (m) return `${m[1]} ${m[2].toUpperCase()}`;

    // Fallback: if only number is present, get unit from ageIn field
    const n = parseInt(raw, 10);
    if (isNaN(n)) return raw;

    const ageIn = ((((p as any).ageIn ?? (record as any).ageIn) || '') + '').toString().toLowerCase();
    let unit = 'Y'; // default to Years

    if (ageIn.startsWith('day') || ageIn.startsWith('d')) {
      unit = 'D';
    } else if (ageIn.startsWith('month') || ageIn.startsWith('m')) {
      unit = 'M';
    } else if (ageIn.startsWith('year') || ageIn.startsWith('y')) {
      unit = 'Y';
    }

    return `${n} ${unit}`;
  }

  getPatientGender(record: any): string {
    const p = record?.patient || record?.patientDetails || {};
    const gender = (p.gender || record?.gender || '').toString().toUpperCase();
    return (gender && gender.charAt(0)) || '';
  }

  getPatientPhone(record: any): string {
    const p = record?.patient || record?.patientDetails || {};
    return p.phone || record?.contact || record?.phone || '';
  }

  getAmount(record: any): number {
    // Try multiple possible data structures
    if (record?.payment?.totalAmount != null) return Number(record.payment.totalAmount);
    if (record?.totalAmount != null) return Number(record.totalAmount);
    if (record?.amount != null) return Number(record.amount);
    const tests = (record?.tests || record?.testDetails || []) as any[];
    if (Array.isArray(tests) && tests.length) {
      return tests.reduce((sum: number, t: any) => sum + Number(t?.netAmount ?? t?.amount ?? t?.cost ?? 0), 0);
    }
    return 0;
  }

  getPreviousTests(record: any): any[] {
    const last = this.lastEditEntry(record);
    if (!last) return [];
    const ch = (last as any).changes || {};
    if (Array.isArray((ch as any).testsBefore)) return (ch as any).testsBefore;
    if ((ch as any).tests && Array.isArray((ch as any).tests.before)) return (ch as any).tests.before;
    if (Array.isArray((ch as any).before)) return (ch as any).before;
    if (Array.isArray(record?.previous?.tests)) return record.previous.tests;
    return [];
  }

  getAfterTests(record: any): any[] {
    const last = this.lastEditEntry(record);
    const ch = (last as any)?.changes || {};
    if (Array.isArray((ch as any).testsAfter)) return (ch as any).testsAfter;
    if ((ch as any).tests && Array.isArray((ch as any).tests.after)) return (ch as any).tests.after;
    if (Array.isArray((ch as any).tests)) return (ch as any).tests;
    if (Array.isArray(record?.tests)) return record.tests;
    if (Array.isArray(record?.testDetails)) return record.testDetails;
    return [];
  }

  getPreviousAmount(record: any): number | null {
    const last = this.lastEditEntry(record);
    const ch = (last as any)?.changes || {};
    // Prefer explicit amounts in history
    if ((ch as any)?.totalAmount?.before !== undefined) return Number((ch as any).totalAmount.before);
    if ((ch as any)?.payment?.totalAmount?.before !== undefined) return Number((ch as any).payment.totalAmount.before);
    if ((ch as any)?.amount?.before !== undefined) return Number((ch as any).amount.before);
    if (record?.previous?.totalAmount !== undefined) return Number(record.previous.totalAmount);
    // Fallback: sum previous tests
    const prevTests = this.getPreviousTests(record);
    if (Array.isArray(prevTests) && prevTests.length) {
      return prevTests.reduce((s: number, t: any) => s + Number(t?.netAmount ?? t?.amount ?? t?.cost ?? 0), 0);
    }
    return null;
  }

  getEditDelta(record: any): number {
    const prev = Number(this.getPreviousAmount(record) ?? 0);
    const curr = Number(this.getAmount(record) ?? 0);
    return curr - prev;
  }

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

  getAddedTotal(record: any): number {
    const tests = this.getAddedTests(record) || [];
    return tests.reduce((sum: number, t: any) => sum + Number(t?.netAmount ?? t?.amount ?? t?.cost ?? 0), 0);
  }

  getRemovedTotal(record: any): number {
    const tests = this.getRemovedTests(record) || [];
    return tests.reduce((sum: number, t: any) => sum + Number(t?.netAmount ?? t?.amount ?? t?.cost ?? 0), 0);
  }



  getLastEditedAt(record: any): Date | null {
    const last = this.lastEditEntry(record);
    const at = (last as any)?.at || record?.lastEditedAt || record?.updatedAt;
    return at ? new Date(at) : null;
  }

  getLastEditedBy(record: any): string | null {
    const last = this.lastEditEntry(record);
    return ((last as any)?.by || record?.lastEditedBy || null);
  }


  ngOnDestroy(): void {
    try { this.routerSub?.unsubscribe?.(); } catch {}
    try { this.patientUpdateSub?.unsubscribe?.(); } catch {}
    this.routerSub = undefined;
    this.patientUpdateSub = undefined;
    this.destroyed = true;
  }

  closeViewModal(): void {
    this.showViewModal = false;
    this.selectedViewRecord = null;
  }

}

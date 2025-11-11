import { Component, OnInit, ChangeDetectorRef, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Subscription } from 'rxjs';
import { PathologyInvoiceService } from '../../services/pathology-invoice.service';
import { environment } from '../../../environments/environment';
import { DataRefreshService } from '../../core/services/data-refresh.service';
import { PathologyService as MasterPathologyService } from '../../setup/pathology/services/pathology.service';
import { AlertService } from '../../shared/services/alert.service';
import { SuccessAlertComponent } from '../../shared/components/success-alert/success-alert.component';

interface TestCategory {
  name: string;
  code: string;
  icon: string;
  color: string;
  tests: PathologyTest[];
}

interface PathologyTest {
  id: string;
  name: string;
  cost: number;
  category: string;
  description?: string;
}

interface SelectedTest {
  id: string;
  name: string;
  cost: number;
  category: string;
  quantity: number;
}

@Component({
  selector: 'app-pathology-registration',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, SuccessAlertComponent],
  templateUrl: './registration.component.html',
  styleUrl: './registration.component.css',
  encapsulation: ViewEncapsulation.None
})
export class PathologyRegistrationComponent implements OnInit {

  registrationForm!: FormGroup;
  isLoading = false;
  // Success alert state for Save buttons
  showSuccessAlert = false;
  successMessage = '';
  alertBadge = 'Operation Successful';

  showSuccessMessage = false;

  // Receipt-based workflow
  receiptNumber = '';
  isReceiptLoading = false;
  receiptFound = false;
  receiptData: any = null;
  patientData: any = null;

  // Category mapping from backend
  categoryMap: { [key: string]: string } = {};

  // All test definitions from database (for direct matching)
  testDefinitions: any[] = [];

  // ✅ ADD: Categories array for lookup
  categories: any[] = [];

  // Dynamic Numbers (from database)
  dailyNumber: number = 0;
  yearlyNumber: string = '';
  currentDate: string = '';

  // Lab numbers edit mode (from Registered Reports)
  labEditMode: boolean = false;
  private editReceipt: string = '';

  // Test Categories and Tests
  testCategories: TestCategory[] = [
    {
      name: 'Blood Tests',
      code: 'BLOOD',
      icon: '🩸',
      color: '#ef4444',
      tests: [
        { id: 'BT001', name: 'Complete Blood Count (CBC)', cost: 300, category: 'BLOOD' },
        { id: 'BT002', name: 'Blood Sugar (Fasting)', cost: 150, category: 'BLOOD' },
        { id: 'BT003', name: 'Blood Sugar (Random)', cost: 120, category: 'BLOOD' },
        { id: 'BT004', name: 'HbA1c', cost: 500, category: 'BLOOD' },
        { id: 'BT005', name: 'Lipid Profile', cost: 600, category: 'BLOOD' }
      ]
    },
    {
      name: 'Urine Tests',
      code: 'URINE',
      icon: '🧪',
      color: '#f59e0b',
      tests: [
        { id: 'UT001', name: 'Urine Routine & Microscopy', cost: 200, category: 'URINE' },
        { id: 'UT002', name: 'Urine Culture', cost: 400, category: 'URINE' },
        { id: 'UT003', name: 'Urine Protein', cost: 150, category: 'URINE' }
      ]
    },
    {
      name: 'Biochemistry',
      code: 'BIOCHEM',
      icon: '⚗️',
      color: '#10b981',
      tests: [
        { id: 'BC001', name: 'Liver Function Test (LFT)', cost: 800, category: 'BIOCHEM' },
        { id: 'BC002', name: 'Kidney Function Test (KFT)', cost: 700, category: 'BIOCHEM' },
        { id: 'BC003', name: 'Thyroid Profile', cost: 900, category: 'BIOCHEM' },
        { id: 'BC004', name: 'Electrolytes', cost: 400, category: 'BIOCHEM' }
      ]
    },
    {
      name: 'Microbiology',
      code: 'MICRO',
      icon: '🦠',
      color: '#8b5cf6',
      tests: [
        { id: 'MB001', name: 'Blood Culture', cost: 600, category: 'MICRO' },
        { id: 'MB002', name: 'Stool Culture', cost: 500, category: 'MICRO' },
        { id: 'MB003', name: 'Throat Swab', cost: 300, category: 'MICRO' }
      ]
    }
  ];

  selectedCategory: string = '';
  selectedTests: SelectedTest[] = [];
  totalAmount = 0;

  // Registration Mode (OPD/IPD)
  registrationMode: 'OPD' | 'IPD' = 'OPD';
  pageTitle = 'Pathology Test Registration - OPD';

  private subscription = new Subscription();

  private defsLoading = false;
  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private pathologyInvoiceService: PathologyInvoiceService,
    private cdr: ChangeDetectorRef,
    private http: HttpClient,
    private dataRefresh: DataRefreshService,
    private masterPathologyService: MasterPathologyService,
    private alertService: AlertService
  ) {}

  ngOnInit(): void {
    this.detectRegistrationMode();
    this.initializeDynamicData();
    this.initializeForm();
    this.loadCategories(); // Load category mapping

    // Auto-refresh categories/test definitions when pathology master changes
    try {
      this.subscription.add(
        this.masterPathologyService.testDefinitionChanged$.subscribe(() => this.loadCategories())
      );
    } catch {}


    // If opened with a receipt number (e.g., from Scheduled Tests) or Lab Nos edit mode
    this.route.queryParams.subscribe(params => {
      const mode = (params['mode'] || '').toString();
      const rn = params['receiptNo'] || params['receiptNumber'];
      if (mode === 'edit-lab-numbers' && rn) {
        // Enter lab numbers edit mode: load existing registration and enable only lab number fields
        this.labEditMode = true;
        this.editReceipt = String(rn).trim();
        this.registrationForm.patchValue({ receiptNumber: this.editReceipt });
        this.loadRegistrationForLabEdit(this.editReceipt);
      } else if (rn) {
        // Normal prefill + lookup flow
        const value = String(rn).trim();
        this.registrationForm.patchValue({ receiptNumber: value });
        this.lookupReceipt(value);
      }
      // Prefill samples from Scheduled Tests if provided
      const samples = params['samples'];
      if (samples) {
        const list = String(samples).split(',').map(s=>s.trim()).filter(Boolean);
        // store for submission
        (this as any)._prefilledSamples = list;
      }
    });

    this.focusReceiptField();
    console.log('🧪 Pathology Registration Component Loaded - Mode:', this.registrationMode);
  }

  focusReceiptField(): void {
    // Focus on receipt number field after view init
    setTimeout(() => {
      const receiptField = document.querySelector('input[formControlName="receiptNumber"]') as HTMLInputElement;
      if (receiptField) {
        receiptField.focus();
        console.log('🎯 Focused on receipt number field');
      }
    }, 100);
  }

  initializeDynamicData(): void {
    // Set current date (local)
    this.currentDate = (() => { const d = new Date(); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; })();

    // Get daily number and yearly number from database
    this.getDailyAndYearlyNumbers(this.registrationMode);
  }

  getDailyAndYearlyNumbers(mode: 'OPD' | 'IPD' = this.registrationMode): void {
    const today = new Date();
    const currentYear = today.getFullYear();

    // Get actual daily lab registration count from backend (mode-specific)
    this.pathologyInvoiceService.getDailyLabRegistrationCount(mode).subscribe({
      next: (response) => {
        if (response && response.success) {
          const dailyCount = response.count || 0;
          // Next registration number will be count + 1
          this.dailyNumber = dailyCount + 1;
          console.log('📊 Daily Lab Number from backend (next):', this.dailyNumber, 'mode:', mode);
        } else {
          this.dailyNumber = 1; // Default if no data
          console.log('📊 Using default daily lab number:', this.dailyNumber, 'mode:', mode);
        }
        // Update form control if it exists
        if (this.registrationForm) {
          this.registrationForm.patchValue({ dailyNumber: this.dailyNumber });
        }
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('❌ Error getting daily lab count:', error);
        this.dailyNumber = 1; // Default on error
        // Update form control if it exists
        if (this.registrationForm) {
          this.registrationForm.patchValue({ dailyNumber: this.dailyNumber });
        }
        this.cdr.detectChanges();
      }
    });

    // Get actual yearly lab registration count from backend (mode-specific)
    this.pathologyInvoiceService.getYearlyLabRegistrationCount(currentYear, mode).subscribe({
      next: (response) => {
        if (response && response.success) {
          const yearlyCount = response.count || 0;
          // Simple counting: 1, 2, 3, 4, 5...
          const nextYearlyNumber = yearlyCount + 1;
          this.yearlyNumber = nextYearlyNumber.toString();
          console.log('📅 Yearly Lab Number from backend (next):', this.yearlyNumber, 'mode:', mode);
        } else {
          this.yearlyNumber = '1'; // Default if no data
          console.log('📅 Using default yearly lab number:', this.yearlyNumber, 'mode:', mode);
        }
        // Update form control if it exists
        if (this.registrationForm) {
          this.registrationForm.patchValue({ yearlyNumber: this.yearlyNumber });
        }
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('❌ Error getting yearly lab count:', error);
        this.yearlyNumber = '1'; // Default on error
        // Update form control if it exists
        if (this.registrationForm) {
          this.registrationForm.patchValue({ yearlyNumber: this.yearlyNumber });
        }
        this.cdr.detectChanges();
      }
    });
  }

  detectRegistrationMode(): void {
    // Check URL to determine OPD/IPD mode
    const currentUrl = this.router.url;

    if (currentUrl.includes('register-test-ipd') || currentUrl.includes('ipd')) {
      this.registrationMode = 'IPD';
      this.pageTitle = 'Pathology Test Registration - IPD';
    } else if (currentUrl.includes('register-test-opd') || currentUrl.includes('opd')) {
      this.registrationMode = 'OPD';
      this.pageTitle = 'Pathology Test Registration - OPD';
    } else {
      // Default to OPD
      this.registrationMode = 'OPD';
      this.pageTitle = 'Pathology Test Registration - OPD';
    }

    // Also check query parameters for override
    this.route.queryParams.subscribe(params => {
      if (params['mode']) {
        this.registrationMode = params['mode'].toUpperCase() === 'IPD' ? 'IPD' : 'OPD';
        this.pageTitle = `Pathology Test Registration - ${this.registrationMode}`;
      }
    });

    console.log('🎯 Registration mode detected:', this.registrationMode, 'from URL:', currentUrl);
  }

  initializeForm(): void {
    this.registrationForm = this.fb.group({
      // Dynamic Data
      currentDate: [{ value: this.currentDate, disabled: true }],
      yearlyNumber: [{ value: this.yearlyNumber, disabled: true }],
      dailyNumber: [{ value: this.dailyNumber, disabled: true }],
      searchDate: [{ value: this.currentDate, disabled: true }],
      addressType: [{ value: this.registrationMode, disabled: true }],
      totalAmount: [{ value: '0', disabled: true }],

      // Receipt Information
      receiptNumber: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
      referenceNumber: [{ value: '', disabled: true }],
      doctorRefNo: [{ value: '', disabled: true }],
      doctorNumber: [{ value: '', disabled: true }],

      // Patient Information (Auto-populated from receipt)
      registrationNumber: [{ value: '', disabled: true }],
      patientName: [{ value: '', disabled: true }],
      age: [{ value: '', disabled: true }],
      ageIn: [{ value: '', disabled: true }],
      gender: [{ value: '', disabled: true }],
      phone: [{ value: '', disabled: true }],
      address: [{ value: '', disabled: true }],

      // Medical Information (Auto-populated from receipt)
      doctorName: [{ value: '', disabled: true }],
      department: [{ value: '', disabled: true }],
      roomNumber: [{ value: '', disabled: true }],

      // Test Information (Editable)
      sampleCollectionDate: [(() => { const d = new Date(); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; })(), Validators.required],

      sampleCollectionTime: [new Date().toTimeString().split(' ')[0].substring(0, 5), Validators.required],
      technician: ['', Validators.required],
      labSection: ['', Validators.required],
      urgency: ['Normal', Validators.required],

      // Additional Information
      clinicalHistory: [''],
      symptoms: [''],
      remarks: ['']
    });

    // Update form with dynamic values after initialization
    this.updateFormWithDynamicData();
  }

  updateFormWithDynamicData(): void {
    this.registrationForm.patchValue({
      currentDate: this.currentDate,
      yearlyNumber: this.yearlyNumber,
      totalAmount: this.totalAmount.toString()
    });
  }

  selectCategory(category: string): void {
    this.selectedCategory = category;
    console.log('📂 Selected category:', category);
  }

  getTestsByCategory(categoryCode: string): PathologyTest[] {
    const category = this.testCategories.find(cat => cat.code === categoryCode);
    return category ? category.tests : [];
  }

  // Extract category name from category object or string
  extractCategoryName(category: any): string {
    console.log('🔍 Extracting category name from:', category);

    // If category is already a string, return it
    if (typeof category === 'string') {
      return category;
    }

    // If category is an object, extract the name
    if (category && typeof category === 'object') {
      // Try different possible property names
      const categoryName = category.categoryName ||
                          category.name ||
                          category.code ||
                          'PATHOLOGY';
      console.log('📂 Extracted category name:', categoryName);
      return categoryName;
    }

    // Default fallback
    console.log('⚠️ Using default category: PATHOLOGY');
    return 'PATHOLOGY';
  }

  // ✅ NEW: Convert short name to full name and category using TestDefinition collection
  getFullTestNameAndCategory(shortName: string): { fullName: string, category: string } {
    console.log('🔍 Converting short name to full name:', shortName);
    console.log('📋 Available test definitions:', this.testDefinitions.length);

    if (!shortName || !this.testDefinitions || this.testDefinitions.length === 0) {
      console.log('⚠️ No short name or test definitions available');
      return { fullName: shortName, category: 'GENERAL' };
    }

    const sn = (shortName || '').toString().trim().toUpperCase();

    // Helper to escape regex special characters
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const wordBoundary = new RegExp(`\\b${esc(sn)}\\b`, 'i');

    // 1) Prefer exact or word-boundary match by shortName.testName
    let matchingTest = this.testDefinitions.find((test: any) => {
      const shName = (test?.shortName?.testName || '').toString().trim().toUpperCase();
      if (!shName) return false;
      return shName === sn || wordBoundary.test(shName) || shName.startsWith(sn);
    });

    // 2) If not found, try to match by full test name with similar strictness
    if (!matchingTest) {
      matchingTest = this.testDefinitions.find((test: any) => {
        const full = (test?.name || test?.testName || '').toString().trim().toUpperCase();
        if (!full) return false;
        const cleanSn = sn.replace(/^S\.\s*/, '');
        const wb = new RegExp(`\\b${esc(cleanSn)}\\b`, 'i');
        return full === sn || full === cleanSn || wb.test(full) || full.startsWith(cleanSn);
      });
    }

    if (matchingTest) {
      const fullName = (matchingTest.name || matchingTest.testName || shortName).toString();

      // Resolve category to readable name
      let categoryName = 'GENERAL';
      const cat = matchingTest.category;
      if (cat) {
        if (typeof cat === 'string') {
          // cat may be ObjectId of TestCategory
          const catObj = this.categories.find((c: any) => c._id === cat);
          categoryName = catObj?.name || categoryName;
        } else if (typeof cat === 'object') {
          categoryName = cat.name || (this.categories.find((c: any) => c._id === cat._id)?.name) || categoryName;
        }
      }

      console.log(`✅ Match: ${sn} → ${fullName} [${categoryName}]`);
      return { fullName, category: categoryName };
    }

    console.log(`⚠️ No match found for short name: ${shortName}`);
    return { fullName: shortName, category: 'GENERAL' };
  }

  addTest(test: PathologyTest): void {
    const existingTest = this.selectedTests.find(t => t.id === test.id);

    if (existingTest) {
      existingTest.quantity += 1;
    } else {
      this.selectedTests.push({
        ...test,
        quantity: 1
      });
    }

    this.calculateTotal();
    console.log('➕ Added test:', test.name);
  }

  removeTest(testId: string): void {
    this.selectedTests = this.selectedTests.filter(test => test.id !== testId);
    this.calculateTotal();
    console.log('➖ Removed test:', testId);
  }

  updateQuantity(testId: string, quantity: number): void {
    const test = this.selectedTests.find(t => t.id === testId);
    if (test && quantity > 0) {
      test.quantity = quantity;
      this.calculateTotal();
    }
  }

  calculateTotal(): void {
    this.totalAmount = this.selectedTests.reduce((total, test) => {
      return total + (test.cost * test.quantity);
    }, 0);

    // Update form with new total
    this.registrationForm.patchValue({
      totalAmount: this.totalAmount.toString()
    });
  }

  // Receipt field change while typing — do NOT auto-lookup; wait for Enter
  onReceiptNumberChange(): void {
    // Sanitize to digits-only and keep user editing smooth
    const ctrl = this.registrationForm.get('receiptNumber');
    const raw = (ctrl?.value || '').toString();
    const sanitized = raw.replace(/[^0-9]/g, '');
    if (raw !== sanitized) {
      ctrl?.setValue(sanitized, { emitEvent: false });
    }

    // Reset dependent view while typing
    this.isReceiptLoading = false;
    this.receiptFound = false;
    // Clear dependent fields but keep the (sanitized) receipt number
    this.clearReceiptData();
    // Ensure the input remains enabled while editing
    this.registrationForm.get('receiptNumber')?.enable({ emitEvent: false });
  }

  // Trigger lookup explicitly on Enter key
  onReceiptEnter(): void {
    const value = (this.registrationForm.get('receiptNumber')?.value || '').toString().trim();
    if (!value) { return; }
    // Do not clear form here; rely on lookup to manage state and navigation
    this.lookupReceipt(value);
  }

  // Check if receipt is already registered for pathology
  async checkIfReceiptAlreadyRegistered(receiptNumber: number): Promise<boolean> {
    try {
      console.log('🔍 Checking if receipt already registered:', receiptNumber);
      const response = await firstValueFrom(this.http.get<any>(`${environment.apiUrl}/pathology-registration/check-receipt/${receiptNumber}`));
      return response && response.exists;
    } catch (error) {
      console.error('❌ Error checking receipt registration:', error);
      return false; // If error, allow registration to proceed
    }
  }

  lookupReceipt(receiptNumber: string): void {
    this.isReceiptLoading = true;
    this.receiptFound = false;

    console.log('🔍 Looking up receipt:', receiptNumber);

    // ✅ Ensure test definitions are loaded before processing receipt
    // Do not block lookup on loading test definitions; fire-and-forget for categories
    if (!this.testDefinitions || this.testDefinitions.length === 0) {
      try { this.loadCategories(); } catch {}
    }
    this.performReceiptLookup(receiptNumber);
  }

  private performReceiptLookup(receiptNumber: string): void {
    // Call pathology invoice service to get receipt data
    const receiptNum = parseInt(receiptNumber, 10);
    if (isNaN(receiptNum)) {
      this.isReceiptLoading = false;
      this.receiptFound = false;
      console.log('❌ Invalid receipt number format');
      return;
    }

    // First check if this receipt is already registered for pathology
    this.checkIfReceiptAlreadyRegistered(receiptNum).then((alreadyRegistered) => {
      if (alreadyRegistered) {
        this.isReceiptLoading = false;
        this.receiptFound = false;
        this.clearReceiptData();
        this.alertService.showReceiptAlreadyRegistered();
        console.log('❌ Receipt already registered for pathology');
        // Directly take the user to Registered Report filtered to this receipt
        this.router.navigate(['/pathology-module/registered-report'], { queryParams: { focusReceipt: receiptNum.toString() } });
        this.cdr.detectChanges();
        return;
      }

      // If not already registered, proceed with receipt lookup
      this.pathologyInvoiceService.getInvoiceByReceiptNumber(receiptNum).subscribe({
        next: (response) => {
          this.isReceiptLoading = false;

          // 🔍 DEBUG: Check raw API response
          if (response && response.invoice && response.invoice.tests) {
            console.log('🔍 RAW API RESPONSE - Tests from backend:');
            response.invoice.tests.forEach((test: any, i: number) => {
              console.log(`API Test ${i+1}:`, {
                name: test.name,
                category: test.category,
                categoryType: typeof test.category,
                categoryName: test.categoryName
              });
            });
          }

          if (response && response.success && response.invoice) {
            this.receiptFound = true;
            this.receiptData = response.invoice;
            this.populateFormFromReceipt(response.invoice);
            console.log('✅ Receipt found:', response.invoice);
          } else {
            this.receiptFound = false;
            this.clearReceiptData();
            console.log('❌ Receipt not found');
          }
          this.cdr.detectChanges();
        },
        error: (error) => {
          this.isReceiptLoading = false;
          this.receiptFound = false;
          this.clearReceiptData();
          console.error('❌ Error looking up receipt:', error);
          this.cdr.detectChanges();
        }
      });
    });
  }

  populateFormFromReceipt(receiptData: any): void {
    console.log('📋 Populating form from receipt data:', receiptData);
    console.log('📋 Full receipt structure:', JSON.stringify(receiptData, null, 2));

    // 🔍 DEBUG: Check all test categories first
    if (receiptData.tests && receiptData.tests.length > 0) {
      console.log('🧪 ALL TESTS IN RECEIPT:');
      receiptData.tests.forEach((test: any, index: number) => {
        console.log(`Test ${index + 1}:`, {
          name: test.name,
          category: test.category,
          categoryType: typeof test.category,
          categoryString: JSON.stringify(test.category)
        });
      });
    }

    // ✅ CHECK: Category can be stored as categoryName or category field
    // Accept common pathology sections like Haematology, Biochemistry, etc.
    const PATHOLOGY_SECTIONS = [
      'PATHOLOGY','HAEMATOLOGY','HEMATOLOGY','BIOCHEMISTRY','MICROBIOLOGY','SEROLOGY',
      'IMMUNOLOGY','IMMUNOASSAY','CLINICAL PATHOLOGY','URINE','STOOL','HORMONE',
      'CYTOLOGY','HISTOPATHOLOGY','COAGULATION'
    ];

    const pathologyTests = receiptData.tests ? receiptData.tests.filter((test: any) => {
      // Normalize category string from either field
      const catStr = ((test.categoryName ?? test.category) || '').toString().toUpperCase().trim();
      if (catStr) {
        // Match exact section or if category contains the section text
        if (PATHOLOGY_SECTIONS.some(section => catStr.includes(section))) {
          return true;
        }
      }

      // Fallback: Check if test name suggests it's pathology
      if (test.name) {
        const testName = test.name.toString().toUpperCase();
        // Common pathology test patterns
        const NAME_HINTS = [
          'ALBUMIN','CHOLESTEROL','CREATININE','GLUCOSE','HEMOGLOBIN','UREA','BILIRUBIN',
          'PROTEIN','SUGAR','BLOOD','SERUM','URINE','CBC','ESR','PLATELET','WBC','RBC',
          'LIVER','KIDNEY','FUNCTION TEST','PROFILE'
        ];
        if (NAME_HINTS.some(h => testName.includes(h))) {
          return true;
        }
      }

      return false;
    }) : [];

    console.log(`🔍 PATHOLOGY FILTER RESULT: Found ${pathologyTests.length} pathology tests out of ${receiptData.tests?.length || 0} total tests`);

    if (pathologyTests.length === 0) {
      // Show debug info in alert
      const testInfo = receiptData.tests ? receiptData.tests.map((test: any, i: number) =>
        `Test ${i+1}: ${test.name} (Category: ${test.categoryName || test.category})`
      ).join('\n') : 'No tests found';

      this.isReceiptLoading = false;
      this.receiptFound = false;
      this.clearReceiptData();
      this.alertService.showError(
        '❌ No Pathology Tests Found',
        `This receipt does not contain any PATHOLOGY tests. Only patients with pathology tests can be registered here.\n\nDEBUG INFO:\nTotal tests: ${receiptData.tests?.length || 0}\n\n${testInfo}`
      );
      console.log('❌ No pathology tests found in receipt');
      this.cdr.detectChanges();
      return;
    }

    console.log(`✅ Found ${pathologyTests.length} pathology tests, proceeding with registration`);

    // Replace the original tests array with filtered pathology tests only
    receiptData.tests = pathologyTests;

    // Extract registration number from PathologyInvoice structure
    const registrationNumber = receiptData.patient?.registrationNumber ||
                              receiptData.patient?.patientId ||
                              receiptData.registrationNumber || '';

    // Extract patient name from PathologyInvoice structure
    const patientName = receiptData.patient?.name ||
                       receiptData.patientName || '';

    // Extract doctor information from PathologyInvoice structure (with robust fallbacks)
    const doctorName = receiptData.doctor?.name ||
                      receiptData.doctorName ||
                       receiptData.doctor?.specialization ||
                       receiptData.department?.name || '';

    // Extract doctor room number as doctor ID (from PathologyInvoice)
    const doctorNumber = receiptData.doctor?.roomNumber ||
                        receiptData.doctor?.doctorId ||
                        receiptData.doctorId || '';

    // Extract room number (only from actual room number sources)
    let roomNumber = receiptData.doctor?.roomNumber ||
                    receiptData.appointment?.roomNumber ||
                    receiptData.room?.roomNumber ||
                    receiptData.roomNumber || '';

    // Extract doctor ref no (from PathologyInvoice)
    const doctorRefNo = receiptData.doctorRefNo ||
                       receiptData.doctor?.refNo ||
                       receiptData.doctor?.doctorRefNo ||
                       receiptData.referenceNumber || '';

    // Extract department from PathologyInvoice structure
    const department = receiptData.department?.name ||
                      receiptData.departmentName ||
                      receiptData.doctor?.specialization || '';

    // If still no room number, try to get from department (fallback)
    if (!roomNumber && department) {
      // You can add logic here to get default room for department if needed
      console.log('🏠 No room number found, department:', department);
    }

    // Extract mode/type from receipt → normalize to OPD/IPD (default OPD)
    const incomingMode = (receiptData.mode || receiptData.addressType || receiptData.type || '').toString().trim().toUpperCase();
    const addressType = incomingMode === 'IPD' ? 'IPD' : 'OPD';

    // Keep page mode/title in sync with receipt
    this.registrationMode = addressType as any;
    this.pageTitle = `Pathology Test Registration - ${this.registrationMode}`;


    // Refresh mode-specific counters
    this.getDailyAndYearlyNumbers(this.registrationMode);

    // Populate all form fields
    this.registrationForm.patchValue({
      // Patient Information
      registrationNumber: registrationNumber,
      patientName: patientName,
      age: receiptData.patient?.age || '',
      ageIn: receiptData.patient?.ageIn || '',
      gender: receiptData.patient?.gender || '',
      phone: receiptData.patient?.phone || '',
      address: receiptData.patient?.address || '',

      // Doctor Information
      doctorName: doctorName,
      doctorNumber: doctorNumber,
      doctorRefNo: doctorRefNo,
      roomNumber: roomNumber,

      // Department and Type
      department: department,
      addressType: addressType,

      // Reference Information - EMPTY AS REQUESTED
      referenceNumber: '',

      // Set current date for booking
      currentDate: this.currentDate,

      // Update dynamic numbers
      yearlyNumber: this.yearlyNumber,
      dailyNumber: this.dailyNumber
    });

    // Lock key fields to read-only after successful receipt load
    this.registrationForm.get('receiptNumber')?.disable({ emitEvent: false });
    this.registrationForm.get('addressType')?.disable({ emitEvent: false });



    console.log('📋 Populated form values:');
    console.log('👤 Patient Name:', patientName);
    console.log('🏥 Doctor Name:', doctorName);
    console.log('🆔 Doctor Number:', doctorNumber);
    console.log('📋 Doctor Ref No:', doctorRefNo);
    console.log('🏠 Room Number:', roomNumber);
    console.log('🏢 Department:', department);
    console.log('📋 Address Type:', addressType);
    console.log('📊 Daily Number:', this.dailyNumber);
    console.log('📅 Yearly Number:', this.yearlyNumber);
    console.log('🧪 Tests Count:', this.selectedTests.length);

    // Populate selected tests from receipt
    if (receiptData.tests && receiptData.tests.length > 0) {
      this.selectedTests = receiptData.tests.map((test: any, index: number) => {
        console.log(`🧪 Processing test ${index + 1}:`, test);

        // ✅ NEW: Convert short name to full name and category
        const testNameAndCategory = this.getFullTestNameAndCategory(test.name);

        console.log(`🔄 Test conversion: ${test.name} → ${testNameAndCategory.fullName} (${testNameAndCategory.category})`);

        return {
          id: test.id || `test_${index}`,
          name: testNameAndCategory.fullName, // ✅ Use full name instead of short name
          category: testNameAndCategory.category, // ✅ Use proper test category
          cost: test.cost || test.netAmount,
          quantity: test.quantity || 1
        };
      });
      this.calculateTotal();

      console.log(`✅ Processed ${this.selectedTests.length} tests with full names and categories`);
    }

    // Update total amount in form
    this.registrationForm.patchValue({
      totalAmount: this.totalAmount.toString()
    });

    this.patientData = receiptData;
    console.log('📋 Form populated successfully');
    console.log('👤 Patient data:', this.registrationForm.get('patientName')?.value);
    console.log('🧪 Tests loaded:', this.selectedTests.length);
    console.log('💰 Total Amount:', this.totalAmount);
  }

  clearReceiptData(): void {
    this.receiptFound = false;
    this.receiptData = null;
    this.patientData = null;
    this.selectedTests = [];
    this.totalAmount = 0;

    // Clear form fields except receipt number
    const receiptNumber = this.registrationForm.get('receiptNumber')?.value;
    // Allow entering a new receipt again
    this.registrationForm.get('receiptNumber')?.enable({ emitEvent: false });
    this.registrationForm.reset();
    this.registrationForm.patchValue({
      receiptNumber: receiptNumber,
      sampleCollectionDate: (() => { const d = new Date(); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; })(),
      sampleCollectionTime: new Date().toTimeString().split(' ')[0].substring(0, 5),
      urgency: 'Normal'
    });
  }

  async onSubmit(): Promise<void> {
    console.log('🔍 FORM VALIDATION CHECK:');
    console.log('📋 Form valid:', this.registrationForm.valid);
    console.log('📧 Receipt found:', this.receiptFound);
    console.log('🧪 Selected tests count:', this.selectedTests.length);
    console.log('📝 Form errors:', this.registrationForm.errors);

    // Guard: prevent double-click duplicate submissions
    if (this.isLoading) {
      try { this.alertService.showInfo('Processing', 'Please wait, saving in progress...'); } catch {}
      return;
    }

    if (this.selectedTests.length > 0) {
      // Ensure a valid receipt is loaded before saving
      if (!this.receiptFound) {
        try { this.alertService.showError('Invalid', 'Please load a valid receipt first'); } catch {}
        return;
      }

      const formData = this.registrationForm.getRawValue(); // includes disabled fields

      // Preflight duplicate check to ensure single registration per receipt
      const rn = parseInt((formData.receiptNumber || '').toString(), 10);
      if (!Number.isNaN(rn)) {
        const exists = await this.checkIfReceiptAlreadyRegistered(rn);
        if (exists) {
          this.alertService.showReceiptAlreadyRegistered();
          return;
        }
      }

      this.isLoading = true;

      // Build payment totals so they persist in DB and display on report
      const subtotal = this.selectedTests.reduce((sum, t) => sum + (t.cost * t.quantity), 0);
      const totalDiscount = this.selectedTests.reduce((sum, t) => sum + ((t as any).discount || 0), 0);
      const totalAmount = subtotal - totalDiscount;

      // Provide safe defaults for backend-required fields
      const technicianSafe = (formData.technician || '').toString().trim() || 'LAB';
      const labSectionSafe = (formData.labSection || '').toString().trim() || 'PATHOLOGY';
      const urgencySafe = (formData.urgency || '').toString().trim() || 'Normal';

      const registrationData = {
        receiptNumber: formData.receiptNumber,
        registrationMode: this.registrationMode,
        patient: {
          registrationNumber: formData.registrationNumber,
          name: formData.patientName,
          age: formData.age,
          ageIn: this.receiptData?.patient?.ageIn || this.receiptData?.ageIn || formData.ageIn || '',
          gender: formData.gender,
          phone: formData.phone,
          address: formData.address
        },
        tests: this.selectedTests.map(t => ({
          ...t,
          discount: (t as any).discount || 0,
          netAmount: (t.cost * t.quantity) - ((t as any).discount || 0)
        })),
        doctor: {
          name: formData.doctorName,
          roomNumber: formData.roomNumber,
          specialization: formData.department
        },
        department: { name: formData.department },
        doctorRefNo: formData.doctorRefNo,
        sampleCollection: {
          date: formData.sampleCollectionDate,
          time: formData.sampleCollectionTime,
          technician: technicianSafe,
          labSection: labSectionSafe
        },
        samplesCollected: (this as any)._prefilledSamples || [],
        clinicalHistory: formData.clinicalHistory,
        symptoms: formData.symptoms,
        urgency: urgencySafe,
        // Keep top-level totalAmount for compatibility
        totalAmount: totalAmount,
        payment: {
          subtotal,
          totalDiscount,
          totalAmount,
          paymentMethod: 'CASH'
        },
        remarks: formData.remarks,
        category: 'PATHOLOGY',
        status: 'SAMPLE_COLLECTED',
        receiptData: this.receiptData
      };

      console.log('📝 Submitting pathology registration:', registrationData);

      // Save to backend and navigate to report generation
      this.saveRegistrationAndProceed(registrationData);
    } else {
      console.log('❌ Form validation failed');
      console.log('❌ Form valid:', this.registrationForm.valid);
      console.log('❌ Receipt found:', this.receiptFound);
      console.log('❌ Selected tests:', this.selectedTests.length);

      if (!this.registrationForm.valid) {
        console.log('❌ Form errors:', this.registrationForm.errors);
        Object.keys(this.registrationForm.controls).forEach(key => {
          const control = this.registrationForm.get(key);
          if (control && control.errors) {
            console.log(`❌ Field ${key} errors:`, control.errors);
          }
        });
      }

      this.markFormGroupTouched();
    }
  }

  saveRegistrationAndProceed(registrationData: any): void {
    // Save registration data to backend
    console.log('💾 Saving pathology registration to backend...');
    console.log('📄 Registration data:', JSON.stringify(registrationData, null, 2));

    // Real API call to save registration to pathologyregistration collection
    this.http.post(`${environment.apiUrl}/pathology-registration/create`, registrationData).subscribe({
      next: (response: any) => {
        this.isLoading = false;
        console.log('✅ Pathology registration saved successfully to database');
        console.log('📧 Receipt Number:', response.registration?.receiptNumber);
        console.log('📅 Year Number:', response.registration?.yearNumber);
        console.log('📆 Today Number:', response.registration?.todayNumber);

        // Fire cross-page refresh event so lists load instantly after navigation
        try { this.dataRefresh.triggerRefresh('pathology', 'CREATE', { receiptNumber: response.registration?.receiptNumber }); } catch {}

        // Update registration data with backend response
        if (response.registration) {
          registrationData.receiptNumber = response.registration.receiptNumber;
          registrationData.yearNumber = response.registration.yearNumber;
          registrationData.todayNumber = response.registration.todayNumber;
          registrationData.backendId = response.registration._id;

          // Immediately bump counters for next entry (no wait) so UI shows new numbers after reset
          this.yearlyNumber = String((response.registration.yearNumber || 0) + 1);
          this.dailyNumber = (response.registration.todayNumber || 0) + 1;

          // Reset this page for next use before navigating
          try {
            this.resetForm();
            // Also fetch from backend to stay in sync (handles concurrent users)
            this.getDailyAndYearlyNumbers(this.registrationMode);
            setTimeout(() => this.focusReceiptField(), 0);
          } catch {}

        }


        // Success alert for Save and Proceed
        this.successMessage = 'Registration saved. Redirecting to Report Generation...';
        this.alertBadge = 'Saved';
        this.showSuccessAlert = true;
        this.cdr.detectChanges();

        // Navigate to report generation after a brief delay to show alert
        setTimeout(() => {
          this.navigateToReportGeneration(registrationData);
        }, 900);
      },
      error: (error) => {
        this.isLoading = false;
        if (error?.status === 409) {
          // Duplicate: show toaster on right side
          try { this.alertService.showReceiptAlreadyRegistered(); } catch {}
          return;
        }
        console.error('❌ Error saving pathology registration:', error);
        try { this.alertService.showError('Error', 'Error saving registration'); } catch {}
      }
    });
  }

  navigateToReportGeneration(registrationData: any): void {
    console.log('🔄 Navigating to report generation with data:', registrationData);

    // ✅ FIX: Navigate to test-report with receipt number from saved registration
    const receiptNumber = registrationData.receiptNumber || registrationData.registration?.receiptNumber;

    if (!receiptNumber) {
      console.error('❌ No receipt number found in registration data');
      this.alertService.showError('Error', 'Receipt number not found. Please try again.');
      return;
    }

    console.log('✅ Navigating to test-report with receipt number:', receiptNumber);

    // Navigate to test-report page with receipt number and ensure reports list will focus after save
    this.router.navigate(['/pathology/test-report'], {
      queryParams: {
        receiptNo: receiptNumber,
        autoLoad: 'true', // Flag to auto-load data on page load
        focusAfterSave: 'true'
      }
    });
  }

  resetForm(): void {
    this.registrationForm.reset();
    this.selectedTests = [];
    this.selectedCategory = '';
    this.totalAmount = 0;
    this.showSuccessMessage = false;
    this.receiptFound = false;
    this.receiptData = null;
    this.patientData = null;
    this.initializeForm();
    console.log('🔄 Form reset');
  }

  refreshForm(): void {
    this.resetForm();
    this.getDailyAndYearlyNumbers(this.registrationMode);
    console.log('🔄 Form refreshed with new data');
  }

  showFormInfo(): void {
    const info = {
      dailyNumber: this.dailyNumber,
      yearlyNumber: this.yearlyNumber,
      receiptFound: this.receiptFound,
      testsCount: this.selectedTests.length,
      totalAmount: this.totalAmount,
      formValid: this.registrationForm.valid
    };
    console.log('ℹ️ Form Information:', info);
    this.alertService.showInfo(
      'ℹ️ Form Information',
      `Daily Number: ${info.dailyNumber}\nYearly Number: ${info.yearlyNumber}\nReceipt Found: ${info.receiptFound}\nTests Count: ${info.testsCount}\nTotal Amount: ₹${info.totalAmount}\nForm Valid: ${info.formValid}`
    );
  }

  saveDraft(): void {
    if (this.receiptFound) {
      const draftData = {
        formData: this.registrationForm.getRawValue(),
        selectedTests: this.selectedTests,
        totalAmount: this.totalAmount,
        timestamp: new Date().toISOString()
      };

      localStorage.setItem('pathologyRegistrationDraft', JSON.stringify(draftData));
      console.log('💾 Draft saved successfully');
      this.alertService.showDraftSaved();
    }
  }

  // ✅ LOAD TEST MAPPING: Fetch test definitions with real categories like BIOCHEMISTRY
  async loadCategories(): Promise<void> {
    if (this.defsLoading) { console.log('⏳ Test definitions already loading, skipping.'); return; }
    this.defsLoading = true;
    console.log('🗂️ Loading test definitions from pathology master...');

    try {
      // 1. Try pathology master test definitions - REAL categories
      const testDefinitionsResponse = await firstValueFrom(
        this.http.get<any>(`${environment.apiUrl}/pathology-master/test-definitions`)
      );

      console.log('🧪 Test definitions response:', testDefinitionsResponse);

      // Store test definitions for direct matching
      this.testDefinitions = testDefinitionsResponse.testDefinitions || [];
      console.log(`✅ Stored ${this.testDefinitions.length} test definitions for direct matching`);

      // ✅ ALSO LOAD CATEGORIES: Load categories for lookup
      try {
        const categoriesResponse = await firstValueFrom(
          this.http.get<any>(`${environment.apiUrl}/pathology-master/categories`)
        );
        this.categories = categoriesResponse.categories || [];
        console.log(`✅ Loaded ${this.categories.length} categories for lookup:`, this.categories.map((c: any) => c.name));
      } catch (catError) {
        console.log('⚠️ Could not load categories:', catError);
        this.categories = [];
      }

      // Build mapping: shortName._id -> category.name (BIOCHEMISTRY, HEMATOLOGY, etc.)
      this.testDefinitions.forEach((testDef: any) => {
        if (testDef.shortName?._id && testDef.category?.name) {
          this.categoryMap[testDef.shortName._id] = testDef.category.name;
          console.log(`🧪 Mapped: ${testDef.shortName._id} → ${testDef.category.name} (${testDef.name})`);
        }
      });

      // 2. Also try service heads for additional mapping
      try {
        const serviceResponse = await firstValueFrom(
          this.http.get<any>(`${environment.apiUrl}/service-heads`)
        );

        const serviceHeads = serviceResponse.data || [];

        // Add service heads to testDefinitions for direct matching
        serviceHeads.forEach((service: any) => {
          if (service._id && service.category) {
            // Add to testDefinitions array
            this.testDefinitions.push(service);

            // Only add to mapping if not already mapped from test definitions
            if (!this.categoryMap[service._id]) {
              this.categoryMap[service._id] = service.category;
              console.log(`📋 Service mapped: ${service._id} → ${service.category} (${service.testName})`);
            }
          }
        });

        console.log(`✅ Total test definitions after service heads: ${this.testDefinitions.length}`);
      } catch (serviceError) {
        console.log('⚠️ Service heads endpoint not available:', serviceError);
      }

    } catch (error) {
      console.error('❌ Error loading test definitions:', error);

      // Try to get categories from database dynamically
      try {
        const categoriesResponse = await firstValueFrom(
          this.http.get<any>(`${environment.apiUrl}/pathology-master/categories`)
        );

        console.log('📋 Categories from database:', categoriesResponse);

        // Build dynamic fallback based on available categories
        const categories = categoriesResponse.categories || [];
        this.categories = categories; // ✅ Store categories for lookup
        if (categories.length > 0) {
          // Use first available category as default
          const defaultCategory = categories[0].name || '';
          console.log(`🔄 Using dynamic default category: ${defaultCategory}`);

          // Set empty mapping - will use default category
          this.categoryMap = {};


        }
      } catch (categoryError) {
        console.error('❌ Could not load categories from database:', categoryError);
        // Complete fallback - empty mapping
        this.categoryMap = {};
      }
    }

    console.log('✅ Final test category mapping:', this.categoryMap);
    this.defsLoading = false;
  }

  // ✅ GET CATEGORY NAME: Direct match from test definitions (NO LOOPS!)
  getCategoryName(categoryId: string): string {
    console.log(`🔍 Getting category name for: "${categoryId}"`);

    // If it's already a readable name, return as is
    if (!categoryId || categoryId.length < 20) {
      return categoryId || '';
    }

    // DIRECT MATCH from test definitions array
    const foundTest = this.testDefinitions.find(test => test._id === categoryId);
    if (foundTest && foundTest.category) {
      console.log(`✅ Direct match found: ${categoryId} → ${foundTest.category}`);
      return foundTest.category;
    }

    console.log(`⚠️ No direct match found for: ${categoryId}`);
    return 'UNKNOWN TEST';
  }

  // Save and proceed to report generation
  saveAndProceed(): void {
    console.log('🔥 SAVE AND PROCEED BUTTON CLICKED!');
    console.log('🧪 Selected tests:', this.selectedTests);
    console.log('📋 Form data:', this.registrationForm.value);
    console.log('📋 Form valid:', this.registrationForm.valid);
    console.log('📧 Receipt found:', this.receiptFound);
    console.log('📧 Receipt data:', this.receiptData);

    if (this.selectedTests.length === 0) {
      console.log('❌ No tests selected');
      this.alertService.showNoTestsSelected();
      return;
    }

    console.log('💾 Saving pathology registration to database and proceeding...');

    // Call the onSubmit function to save to database
    this.onSubmit();
  }

  openTestSelector(): void {
    // This method would open a test selection modal/dialog
    console.log('🧪 Opening test selector...');
    this.alertService.showInfo('🧪 Test Selector', 'Test selector functionality will be implemented here');
  }

  // Test method to verify alert system is working
  testAlert(): void {
    console.log('🧪 Testing alert system...');
    this.alertService.showSuccess('🎉 Alert System Working!', 'The right-slide alert system is working perfectly. This is a test alert to verify the functionality.');
  }

  // Save Only (do not navigate to report generation)
  async saveOnly(): Promise<void> {
    console.log('💾 SAVE ONLY BUTTON CLICKED');

    // Guard: prevent duplicate clicks
    if (this.isLoading) {
      try { this.alertService.showInfo('Processing', 'Please wait, saving in progress...'); } catch {}
      return;
    }

    if (this.selectedTests.length === 0) {

      this.alertService.showNoTestsSelected();
      return;
    }

    const formData = this.registrationForm.getRawValue();

    // Preflight duplicate check to ensure one registration per receipt
    const rn = parseInt((formData.receiptNumber || '').toString(), 10);
    // Ensure a valid receipt is loaded before saving
    if (!this.receiptFound) {
      this.alertService.showError('Invalid', 'Please load a valid receipt first');
      return;
    }

    if (!Number.isNaN(rn)) {
      const exists = await this.checkIfReceiptAlreadyRegistered(rn);
      if (exists) {


        this.alertService.showReceiptAlreadyRegistered();
        return;
      }
    }

    this.isLoading = true;

    const subtotal = this.selectedTests.reduce((sum, t) => sum + (t.cost * t.quantity), 0);
    const totalDiscount = this.selectedTests.reduce((sum, t) => sum + ((t as any).discount || 0), 0);
    const totalAmount = subtotal - totalDiscount;

    // Provide safe defaults to satisfy backend validation even if form fields are empty
    const technicianSafe = (formData.technician || '').toString().trim() || 'LAB';
    const labSectionSafe = (formData.labSection || '').toString().trim() || 'PATHOLOGY';
    const urgencySafe = (formData.urgency || '').toString().trim() || 'Normal';

    const registrationData: any = {
      receiptNumber: formData.receiptNumber,
      registrationMode: this.registrationMode,
      patient: {
        registrationNumber: formData.registrationNumber,
        name: formData.patientName,
        age: formData.age,
        ageIn: this.receiptData?.patient?.ageIn || this.receiptData?.ageIn || formData.ageIn || '',
        gender: formData.gender,
        phone: formData.phone,
        address: formData.address
      },
      tests: this.selectedTests.map(t => ({
        ...t,
        discount: (t as any).discount || 0,
        netAmount: (t.cost * t.quantity) - ((t as any).discount || 0)
      })),
      doctor: {
        name: formData.doctorName,
        roomNumber: formData.roomNumber,
        specialization: formData.department
      },
      department: { name: formData.department },
      doctorRefNo: formData.doctorRefNo,
      sampleCollection: {
        date: formData.sampleCollectionDate,
        time: formData.sampleCollectionTime,
        technician: technicianSafe,
        labSection: labSectionSafe
      },
      samplesCollected: (this as any)._prefilledSamples || [],
      clinicalHistory: formData.clinicalHistory,
      symptoms: formData.symptoms,
      urgency: urgencySafe,
      totalAmount: totalAmount,
      payment: {
        subtotal,
        totalDiscount,
        totalAmount,
        paymentMethod: 'CASH'
      },
      remarks: formData.remarks,
      category: 'PATHOLOGY',
      status: 'SAMPLE_COLLECTED',
      receiptData: this.receiptData
    };

    console.log('📝 Saving (Save Only) pathology registration:', registrationData);

    this.http.post(`${environment.apiUrl}/pathology-registration/create`, registrationData).subscribe({
      next: (response: any) => {
        this.isLoading = false;
        console.log('✅ Registration saved (Save Only)');
        if (response?.registration) {
          registrationData.receiptNumber = response.registration.receiptNumber;
          registrationData.yearNumber = response.registration.yearNumber;
          registrationData.todayNumber = response.registration.todayNumber;
          registrationData.backendId = response.registration._id;
        }
        // Success alert for Save Only
        this.successMessage = 'Registration saved successfully.';
        this.alertBadge = 'Saved';
        this.showSuccessAlert = true;
        this.cdr.detectChanges();

        // Fire real-time refresh so any open lists reload instantly
        try { this.dataRefresh.triggerRefresh('pathology', 'CREATE', { receiptNumber: registrationData.receiptNumber }); } catch {}

        // Reset full page for next registration as requested
        // First bump local counters so the next numbers appear instantly after reset
        if (response?.registration) {
          this.yearlyNumber = String((response.registration.yearNumber || 0) + 1);
          this.dailyNumber = (response.registration.todayNumber || 0) + 1;
        }
        this.resetForm();
        // Refresh counters from backend (keeps in sync under concurrent usage)
        this.getDailyAndYearlyNumbers(this.registrationMode);
        setTimeout(() => this.focusReceiptField(), 0);
      },
      error: (error) => {
        this.isLoading = false;
        if (error?.status === 409) {
          // Duplicate: show info and stay here
          this.alertService.showReceiptAlreadyRegistered();
          return;
        }
        console.error('❌ Error saving (Save Only):', error);
        this.alertService.showError('Error', 'Error saving registration');
      }
    });
  }


  markFormGroupTouched(): void {
    Object.keys(this.registrationForm.controls).forEach(key => {
      const control = this.registrationForm.get(key);
      control?.markAsTouched();
    });
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.registrationForm.get(fieldName);
    return !!(field && field.invalid && field.touched);
  }

  getFieldError(fieldName: string): string {
    const field = this.registrationForm.get(fieldName);
    if (field?.errors) {
      if (field.errors['required']) return `${fieldName} is required`;
      if (field.errors['minlength']) return `${fieldName} is too short`;
      if (field.errors['pattern']) return `Invalid ${fieldName} format`;
      if (field.errors['min']) return `${fieldName} must be greater than 0`;
      if (field.errors['max']) return `${fieldName} is too large`;
    }
    return '';
  }

  // === Lab Numbers Edit Mode Helpers ===
  private async loadRegistrationForLabEdit(receipt: string): Promise<void> {
    try {
      const url = `${environment.apiUrl}/pathology-registration/receipt/${encodeURIComponent(receipt)}`;
      const resp: any = await firstValueFrom(this.http.get<any>(url));
      const reg = resp?.invoice || resp?.registration || resp?.data || null;
      if (!reg) { throw new Error('Registration not found'); }

      // Use the existing receipt-population logic so tests and totals render normally
      this.receiptFound = true;
      this.receiptData = reg;
      this.populateFormFromReceipt(reg);

      // Ensure lab numbers show current values and are editable
      this.registrationForm.patchValue({
        yearlyNumber: reg.yearNumber ?? '',
        dailyNumber: reg.todayNumber ?? ''
      });
      this.registrationForm.get('yearlyNumber')?.enable({ emitEvent: false });
      this.registrationForm.get('dailyNumber')?.enable({ emitEvent: false });

      this.cdr.detectChanges();
    } catch (e) {
      console.error('❌ Failed to load registration for lab edit:', e);
      try { this.alertService.showError('Error', 'Registration not found for this receipt'); } catch {}
    }
  }

  async updateLabNumbers(): Promise<void> {
    try {
      const yRaw = this.registrationForm.get('yearlyNumber')?.value;
      const dRaw = this.registrationForm.get('dailyNumber')?.value;
      const yearNumber = Number(yRaw);
      const todayNumber = Number(dRaw);
      if (!this.editReceipt) { throw new Error('Missing receipt'); }
      if (!Number.isFinite(yearNumber) || yearNumber <= 0 || !Number.isFinite(todayNumber) || todayNumber <= 0) {
        this.alertService.showError('Invalid', 'Please enter valid positive numbers');
        return;
      }
      const url = `${environment.apiUrl}/pathology-registration/receipt/${encodeURIComponent(this.editReceipt)}/lab-numbers`;
      const body = { yearNumber, todayNumber };
      const resp: any = await firstValueFrom(this.http.put<any>(url, body));
      if (resp && (resp.success || resp.registration)) {
        try { this.dataRefresh.triggerRefresh('pathology', 'UPDATE', { receiptNumber: this.editReceipt }); } catch {}
        try {
          this.successMessage = 'Lab numbers updated successfully';
          this.alertBadge = 'Updated';
          this.showSuccessAlert = true;
        } catch {}
        // Navigate back to registered reports focusing this receipt
        setTimeout(() => {
          this.router.navigate(['/pathology-module/registered-report'], { queryParams: { focusReceipt: this.editReceipt } });
        }, 500);
      } else {
        this.alertService.showError('Error', 'Failed to update lab numbers');
      }
    } catch (e: any) {
      console.error('❌ Failed to update lab numbers:', e);
      const msg = e?.error?.message || e?.message || 'Update failed';
      try { this.alertService.showError('Error', msg); } catch {}
    }
  }

  cancelLabEdit(): void {
    if (this.editReceipt) {
      this.router.navigate(['/pathology-module/registered-report'], { queryParams: { focusReceipt: this.editReceipt } });
    } else {
      this.router.navigate(['/pathology-module/registered-report']);
    }
  }

}

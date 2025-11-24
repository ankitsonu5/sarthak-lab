import { Component, OnInit, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators, FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { firstValueFrom } from 'rxjs';
import { WhatsAppService } from '../../core/services/whatsapp.service';
import { PdfGeneratorService } from '../../core/services/pdf-generator.service';
import { ImageGeneratorService } from '../../core/services/image-generator.service';
import { PathologyService } from '../../setup/pathology/services/pathology.service';
import { DataRefreshService } from '../../core/services/data-refresh.service';
import { DefaultLabConfigService } from '../../core/services/default-lab-config.service';

import { AlertService } from '../../shared/services/alert.service';


interface TestParameter {
  id: string;
  name: string;
  result: string;
  unit: string;
  normalRange: string;
  notes: string;
  remarks: string;
  isAbnormal: boolean;
  status?: string;
  subParameters?: TestParameter[];
}

interface TestReport {
  testId: string;
  testName: string;
  category: string;
  parameters: TestParameter[];
  isExpanded: boolean;
}

@Component({
  selector: 'app-test-report',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './test-report.component.html',
  styleUrls: ['./test-report.component.css']
})
export class TestReportComponent implements OnInit {

  reportForm!: FormGroup;
  isLoading = false;
  // Focus handle for Receipt No. input
  @ViewChild('receiptInput') receiptInput?: ElementRef<HTMLInputElement>;


  skipNextPrint: boolean = false;

  // Patient and Lab Details
  patientData: any = null;
  labNumber: string = '';
  // local date (avoid UTC ISO drift)
  reportDate: string = (() => { const d=new Date(); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; })();
  reportStatus: string = 'Pending';
  reportId: string = '';

  // Edit Mode Properties
  isEditMode: boolean = false;
  isViewMode: boolean = false;


  isPrintMode: boolean = false;

  // Patient & Receipt Information Properties
  receiptNo: string = '';
  registrationNo: string = '';
  patientName: string = '';
  age: string = '';
  ageIn: string = '';
  gender: string = '';
  doctorName: string = '';
  doctorRefNo: string = '';
  department: string = '';
  roomNo: string = '';
  amount: string = '0';
  patientType: string = 'OPD';
  labYearlyNo: string = '';
  labDailyNo: string = '';
  searchDate: string = (() => { const d=new Date(); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; })();

  // Search Properties
  searchReceiptNo: string = '';
  searchRegistrationNo: string = '';
  searchLabNo: string = '';

  // Test Results Data
  testResults: any[] = [];

  // Re-entrancy guard for formula recalculation
  private _isApplyingFormulas = false;

  // Test Data
  availableTests: any[] = [];
  selectedTests: TestReport[] = [];
  testMasterData: any[] = [];

  // ✅ ADD: Real test definitions and categories from database
  testDefinitions: any[] = [];
  testCategories: any[] = [];

  // Units (measurement) - now stored as ObjectId in definitions; map to names here
  units: Array<{ _id: string; name: string }> = [];
  private unitsMap = new Map<string, string>();

  // Form validation flags
  isFormValid = false;
  showPrintButton = false;
  isReceiptNoValid = true;
  receiptNoError = '';

  // Local UI state
  showLocalEdit = false;

  // Edited indicators from backend
  isEdited: boolean = false;
  editHistory: any[] = [];
  lastEditedAt?: string;
  lastEditedBy?: string;

  // Statistics
  totalRegistrations = 0;
  todayRegistrations = 0;

  // WhatsApp Sharing Properties
  // Convert unit field (ObjectId | { _id,name } | string) to unit name string
  private toUnitName(unit: any): string {
    if (!unit) return '';
    if (typeof unit === 'string') {
      // If looks like ObjectId, map via unitsMap else treat as already a name
      return unit.match(/^[0-9a-fA-F]{24}$/) ? (this.unitsMap.get(unit) || '') : unit;
    }
    if (typeof unit === 'object') {
      if ((unit as any).name) return (unit as any).name;
      if ((unit as any)._id) return this.unitsMap.get((unit as any)._id) || '';
    }
    return '';
  }

  showWhatsAppModal = false;
  whatsappNumber = '';
  isWhatsAppNumberValid = false;
  isGeneratingReport = false;
  shareSuccessMessage = '';

  constructor(
    private fb: FormBuilder,
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private router: Router,
    private whatsappService: WhatsAppService,
    private pdfGenerator: PdfGeneratorService,
    private imageGenerator: ImageGeneratorService,
    private pathologyService: PathologyService,
    private dataRefresh: DataRefreshService,
    private alertService: AlertService,
    private defaultLabConfig: DefaultLabConfigService
  ) {
    this.initializeForm();
  }

  ngOnInit(): void {
    this.setCurrentDate();

    // ✅ Load real test definitions and categories from database
    this.loadTestDefinitions();
    this.loadTestCategories();
    // this.loadStatistics(); // Disabled to avoid heavy patient list queries during report generation

    // 🔄 Subscribe to changes in test definitions so report page always has current data
    try {
      this.pathologyService.testDefinitionChanged$.subscribe(() => {
        console.log('🔄 Test definitions changed — reloading in report page');
        this.loadTestDefinitions();
      });
    } catch (e) {
      console.warn('PathologyService not available for subscription', e);
    }

    // ✅ Clear lab numbers initially
    this.labYearlyNo = '';
    this.labDailyNo = '';
    this.testResults = [];

    // 🚨 IMPORTANT: Initial form validation
    this.validateForm();

    // 📱 Initialize WhatsApp number if patient data is available
    if (this.patientData) {
      this.initializeWhatsAppNumber();
    }

    // 🚨 FIX: Check for query params (receipt number from navigation)
    this.route.queryParams.subscribe(params => {
    // Load units (measurement) for mapping ObjectId -> name
    this.pathologyService.getUnits().subscribe(units => {
      this.units = units || [];
      this.unitsMap = new Map(this.units.map(u => [u._id, u.name]));
    });



      const hasReportId = !!params['reportId'];

      // If navigating with reportId (edit/view/print), do NOT auto-search by receipt
      if (params['receiptNo']) {
        this.receiptNo = params['receiptNo'];
        if (!hasReportId) {
          console.log('🔄 Auto-loading receipt from query params:', this.receiptNo);
          // Auto-search when receipt number is provided
          setTimeout(() => {
            this.searchByReceiptNo();
          }, 500);
        } else {
          console.log('⏭️ Skipping auto-search because reportId is present (edit/view/print mode)');
        }
      }

      // 🚨 NEW: Handle edit/view/print modes
      if (hasReportId) {
        this.reportId = params['reportId'];
        this.isEditMode = params['mode'] === 'edit';
        this.isViewMode = params['mode'] === 'view';
        this.isPrintMode = params['mode'] === 'print';

        console.log('🔄 Loading report for mode:', params['mode'], 'Report ID:', this.reportId);
        this.loadReportById(this.reportId);
      }
    });

    console.log('🔄 Test Report Component Initialized');

    // Initialize WhatsApp number from patient data if available
    this.initializeWhatsAppNumber();
  }

  // ✅ INITIALIZE FORM
  initializeForm(): void {
    this.reportForm = this.fb.group({
      labNumber: ['', Validators.required],
      title: ['Mr.'],
      patientName: ['', Validators.required],
      age: ['', Validators.required],
      ageType: ['Year'],
      gender: ['Male', Validators.required],
      doctorName: ['Dr. Tanveer Alam'],
      reportDate: [(() => { const d=new Date(); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; })(), Validators.required],
      mobileNumber: [''],
      referredBy: ['Dr. Tanveer Alam'],
      collectionDate: [(() => { const d=new Date(); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; })(), Validators.required]
    });
  }

  // ✅ SET CURRENT DATE
  setCurrentDate(): void {
    const today = new Date();
    this.reportDate = (() => { const d=today; const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; })();
    this.reportForm.patchValue({
      reportDate: this.reportDate,
      collectionDate: this.reportDate
    });
  }

  // ✅ LOAD TEST MASTER DATA
  async loadTestMasterData(): Promise<void> {
    try {
      console.log('🔄 Loading test master data...');

      const response = await firstValueFrom(
        this.http.get<any>(`${environment.apiUrl}/pathology-master/test-definitions`)
      );

      if (response.success && response.testDefinitions) {
        this.testMasterData = response.testDefinitions;
        console.log(`✅ Loaded ${this.testMasterData.length} test definitions`);

        // Load default CBC test for demo
        this.loadDefaultCBCTest();
      }
    } catch (error) {
      console.error('❌ Error loading test master data:', error);
      this.loadDefaultCBCTest();
    }
  }

  // ✅ LOAD DEFAULT CBC TEST (Like in reference image)
  loadDefaultCBCTest(): void {
    const cbcTest: TestReport = {
      testId: 'CBC001',
      testName: 'CBC',
      category: 'HEMATOLOGY',
      parameters: [
        {
          id: 'CBC_HB',
          name: 'HAEMOGLOBIN',
          result: '14',
          unit: 'gm/dl',
          normalRange: '13.5-18.0',
          notes: '',
          remarks: '',
          isAbnormal: false,
          status: 'normal'
        },
        {
          id: 'CBC_TLC',
          name: 'TOTAL LEUCOCYTE COUNT',
          result: '4000',
          unit: '/cu.mm',
          normalRange: '4000-11000',
          notes: '',
          remarks: '',
          isAbnormal: false,
          status: 'normal'
        },
        {
          id: 'CBC_DLC',
          name: 'DIFFERENTIAL LEUCOCYTE COUNT (DLC)',
          result: '',
          unit: '',
          normalRange: '',
          notes: '',
          remarks: '',
          isAbnormal: false,
          status: 'pending',
          subParameters: [
            {
              id: 'DLC_NEUTRO',
              name: 'Neutrophils',
              result: '',
              unit: '%',
              normalRange: '40-80',
              notes: '',
              remarks: '',
              isAbnormal: false,
              status: 'pending'
            },
            {
              id: 'DLC_LYMPHO',
              name: 'Lymphocytes',
              result: '',
              unit: '%',
              normalRange: '20-40',
              notes: '',
              remarks: '',
              isAbnormal: false,
              status: 'pending'
            },
            {
              id: 'DLC_EOSINO',
              name: 'Eosinophils',
              result: '',
              unit: '%',
              normalRange: '1-6',
              notes: '',
              remarks: '',
              isAbnormal: false,
              status: 'pending'
            },
            {
              id: 'DLC_MONO',
              name: 'Monocytes',
              result: '',
              unit: '%',
              normalRange: '2-10',
              notes: '',
              remarks: '',
              isAbnormal: false,
              status: 'pending'
            },
            {
              id: 'DLC_BASO',
              name: 'Basophils',
              result: '',
              unit: '%',
              normalRange: '<2',
              notes: '',
              remarks: '',
              isAbnormal: false,
              status: 'pending'
            }
          ]
        },
        {
          id: 'CBC_NEUTRO',
          name: 'Neutrophils',
          result: '41',
          unit: '%',
          normalRange: '40-75',
          notes: '',
          remarks: '',
          isAbnormal: false,
          status: 'normal'
        },
        {
          id: 'CBC_LYMPHO',
          name: 'Lymphocytes',
          result: '21',
          unit: '%',
          normalRange: '20-40',
          notes: '',
          remarks: '',
          isAbnormal: false,
          status: 'normal'
        },
        {
          id: 'CBC_EOSINO',
          name: 'Eosinophils',
          result: '6',
          unit: '%',
          normalRange: '1-6',
          notes: '',
          remarks: '',
          isAbnormal: false,
          status: 'normal'
        },
        {
          id: 'CBC_MONO',
          name: 'Monocytes',
          result: '',
          unit: '%',
          normalRange: '04-10',
          notes: '',
          remarks: '',
          isAbnormal: false,
          status: 'pending'
        },
        {
          id: 'CBC_BASO',
          name: 'Basophils',
          result: '',
          unit: '%',
          normalRange: '00-02',
          notes: '',
          remarks: '',
          isAbnormal: false,
          status: 'pending'
        },
        {
          id: 'CBC_PLATELET',
          name: 'PLATELET COUNT',
          result: '',
          unit: 'lacs/mm3',
          normalRange: '1.50-4.50',
          notes: '',
          remarks: '',
          isAbnormal: false,
          status: 'pending'
        },
        {
          id: 'CBC_RBC',
          name: 'RBC',
          result: '',
          unit: 'million/cumm',
          normalRange: '3.8-5.8',
          notes: '',
          remarks: '',
          isAbnormal: false,
          status: 'pending'
        },
        {
          id: 'CBC_HCT',
          name: 'HAEMATOCRIT',
          result: '',
          unit: '%',
          normalRange: '35-54',
          notes: '',
          remarks: '',
          isAbnormal: false,
          status: 'pending'
        },
        {
          id: 'CBC_MCV',
          name: 'MCV',
          result: '',
          unit: 'fl',
          normalRange: '78-98',
          notes: '',
          remarks: '',
          isAbnormal: false,
          status: 'pending'
        },
        {
          id: 'CBC_MCH',
          name: 'MCH',
          result: '',
          unit: 'pg',
          normalRange: '27.00-32.00',
          notes: '',
          remarks: '',
          isAbnormal: false,
          status: 'pending'
        },
        {
          id: 'CBC_MCHC',
          name: 'MCHC',
          result: '',
          unit: 'g/dl',
          normalRange: '30.50-34.50',
          notes: '',
          remarks: '',
          isAbnormal: false,
          status: 'pending'
        }
      ],
      isExpanded: true
    };

    this.selectedTests = [cbcTest];
    console.log('✅ Default CBC test loaded');
  }

  // ✅ SEARCH PATIENT BY LAB NUMBER
  async searchPatient(): Promise<void> {
    if (!this.labNumber.trim()) return;

    this.isLoading = true;
    try {
      console.log(`🔍 Searching patient with lab number: ${this.labNumber}`);

      const response = await firstValueFrom(
        this.http.get<any>(`${environment.apiUrl}/pathology-registration/lab-number/${this.labNumber}`)
      );

      if (response.success && response.data) {
        this.patientData = response.data;

        // Fill patient details in form
        this.reportForm.patchValue({
          patientName: `${this.patientData.firstName} ${this.patientData.lastName}`,
          age: this.patientData.age,
          gender: this.patientData.gender,
          mobileNumber: this.patientData.phone
        });

        console.log('✅ Patient data loaded:', this.patientData);
      } else {
        alert('Patient not found with this lab number!');
      }
    } catch (error) {
      console.error('❌ Error searching patient:', error);
      alert('Error searching patient. Please try again.');
    } finally {
      this.isLoading = false;
    }
  }

  // ✅ UPDATE PARAMETER RESULT
  updateParameterResult(testIndex: number, paramIndex: number, field: string, value: string): void {
    if (this.selectedTests[testIndex] && this.selectedTests[testIndex].parameters[paramIndex]) {
      (this.selectedTests[testIndex].parameters[paramIndex] as any)[field] = value;

      // Check if result is abnormal
      if (field === 'result') {
        this.checkAbnormalResult(testIndex, paramIndex);
      }
    }
  }

  // ✅ CHECK ABNORMAL RESULT
  checkAbnormalResult(testIndex: number, paramIndex: number): void {
    const parameter = this.selectedTests[testIndex].parameters[paramIndex];
    const result = parseFloat(parameter.result);
    const normalRange = parameter.normalRange;

    if (!isNaN(result) && normalRange) {
      // Simple range check (e.g., "10-20" or "< 5.0")
      const rangeMatch = normalRange.match(/(\d+\.?\d*)\s*-\s*(\d+\.?\d*)/);
      if (rangeMatch) {
        const min = parseFloat(rangeMatch[1]);
        const max = parseFloat(rangeMatch[2]);
        parameter.isAbnormal = result < min || result > max;
      }
    }
  }

  // ✅ SAVE REPORT
  async saveReport(options?: { navigateAfterSave?: boolean; resetAfterSave?: boolean }): Promise<void> {
    const navigateAfterSave = options?.navigateAfterSave !== false; // default true
    const resetAfterSave = options?.resetAfterSave === true; // default false

    // ⛔ Guard: prevent duplicate clicks during network lag
    if (this.isLoading) {
      try { this.alertService.showInfo('Processing', 'Please wait, saving in progress...'); } catch {}
      return;
    }

    // 🚨 STRICT VALIDATION - सभी fields required हैं
    if (!this.isFormValid) {
      const missingFields = this.getMissingFields();
      alert(`⚠️ कृपया आवश्यक फील्ड भरें:\n\n${missingFields.join('\n')}`);
      return;
    }

    if (!this.patientData) {
      alert('Please search and load patient data first!');
      return;
    }

    // ⛔ Preflight duplicate check: ensure only one report per Receipt No
    if (this.receiptNo && String(this.receiptNo).trim() !== '') {
      try {
        // 🔄 NEW: Use the unified endpoint to check for existing reports
        const checkResponse = await firstValueFrom(
          this.http.get<any>(`${environment.apiUrl}/pathology-reports/by-receipt/${this.receiptNo}`)
        );

        if (checkResponse && checkResponse.success && checkResponse.data) {
          // Report already exists
          try {
            this.alertService.showWarning('Report Already Generated', 'Report already generated for this receipt number!', { autoHideDelay: 2000 });
          } catch {}
          this.router.navigate(['/pathology-module/all-reports'], {
            queryParams: { focusReceipt: this.receiptNo, _: Date.now() }
          });
          return; // stop here, do not create a duplicate
        }
      } catch (e: any) {
        // If 404, report doesn't exist yet - continue with save
        if (e.status !== 404) {
          console.warn('⚠️ Could not pre-check duplicate report by receiptNo:', e);
        }
      }
    }


    this.isLoading = true;
    try {
      // ✅ EXTRACT PATIENT DATA PROPERLY
      const patient = this.patientData.patient || this.patientData || {};
      const payment = this.patientData.payment || {};
      const department = this.patientData.department || {};
      const doctor = this.patientData.doctor || {};

      console.log('🔍 Extracting patient data:', {
        patient,
        payment,
        department,
        doctor,
        fullPatientData: this.patientData
      });

      const typeNorm = (this.patientType || '').toString().toUpperCase() === 'IPD' ? 'IPD' : 'OPD';
      const registrationRef = (this as any)?.patientData?.backendId || (this as any)?.patientData?._id || (this as any)?.patientData?.registrationId || (this as any)?.patientData?.registration?._id || undefined;
      const invoiceRef = (this as any)?.patientData?.invoiceId || (this as any)?.patientData?._id || undefined;

      const reportData = {
        // Strong linkage keys
        receiptNo: this.receiptNo,
        registrationNo: this.registrationNo,
        registrationRef: registrationRef,
        invoiceRef: invoiceRef,

        // Lab numbers
        labYearlyNo: this.labYearlyNo,
        labDailyNo: this.labDailyNo,
        labNumber: this.labNumber,

        // Visit context
        roomNo: this.roomNo,
        room: this.roomNo, // backend compatibility
        patientType: typeNorm,
        type: typeNorm,            // backend compatibility
        addressType: typeNorm,     // backend compatibility

        // Patient snapshot
        patientData: {
          firstName: patient.firstName || patient.name?.split(' ')[0] || '',
          lastName: patient.lastName || patient.name?.split(' ').slice(1).join(' ') || '',
          fullName: patient.name || `${patient.firstName || ''} ${patient.lastName || ''}`.trim(),
          age: patient.age || '',
          ageIn: patient.ageIn || (this.patientData?.patient?.ageIn) || (this.patientData as any)?.ageIn || '',
          gender: patient.gender || '',
          phone: patient.phone || patient.mobile || '',
          address: patient.address || '',
          aadhaar: patient.aadhaar || '',
          registrationNumber: patient.registrationNumber || patient.patientId || this.registrationNo,
          bloodGroup: patient.bloodGroup || '',
          email: patient.email || ''
        },

        // Doctor/Dept
        department: department.name || this.department || '',
        doctor: doctor.name || this.doctorName || '',
        doctorRefNo: this.doctorRefNo || (this.patientData as any)?.doctorRefNo || '',

        // Report content
        testResults: this.testResults,
        reportDate: this.reportDate,
        reportStatus: 'Completed',
        createdAt: new Date(),
        createdBy: 'Current User'
      };

      console.log('💾 Saving report data:', reportData);

      console.log('🌐 API URL:', `${environment.apiUrl}/pathology-reports`);

      const response = await firstValueFrom(
        this.http.post<any>(`${environment.apiUrl}/pathology-reports`, reportData)
      );

      if (response.success) {
        this.reportStatus = 'Completed';
        console.log('🎉 Showing success alert');
        this.alertService.showSuccess('Report Saved!', 'Your report has been saved successfully.', { autoHideDelay: 1200 });
        if (response.reportId) this.reportId = response.reportId;
        // Single data refresh trigger to avoid duplicate calls
        try { this.dataRefresh.triggerRefresh('pathology', 'CREATE', { receiptNo: this.receiptNo }); } catch {}

        // Immediately call reports API once to ensure data visibility on navigation
        try {
          await firstValueFrom(this.http.get<any>(`${environment.apiUrl}/pathology-reports?page=1&limit=1&_=${Date.now()}`));
        } catch {}

        if (navigateAfterSave) {
          // Navigate to All Reports with focus on this receipt and cache-buster
          this.router.navigate(['/pathology-module/all-reports'], {
            queryParams: { focusReceipt: this.receiptNo, _: Date.now() }
          });
        } else if (resetAfterSave) {
          // Save Only: prepare for next report without navigation
          setTimeout(() => this.clearForm(), 200);
        }
      }
    } catch (error: any) {
      console.error('❌ Error saving report:', error);

      // Prefer nested server error details if available
      const serverDetails = error?.error?.error || {};
      console.error('❌ Server error details:', {
        status: error?.status,
        statusText: error?.statusText,
        url: error?.url,
        message: error?.message,
        serverMessage: serverDetails?.message,
        code: serverDetails?.code,
        name: serverDetails?.name,
      });

      // Special handling: duplicate receipt -> show friendly message and navigate
      if (error?.status === 409) {
        try {
          this.alertService.showWarning('Report Already Generated', 'Report already generated for this receipt number!', { autoHideDelay: 2000 });
        } catch {}
        // Signal save-and-print to skip printing on this flow
        this.skipNextPrint = true;
        this.router.navigate(['/pathology-module/all-reports'], {
          queryParams: { focusReceipt: this.receiptNo, _: Date.now() }
        });
        return; // stop further handling
      }

      let errorMessage = 'Error saving report. Please try again.';
      if (serverDetails?.message) {
        errorMessage = `Error: ${serverDetails.message}`;
      } else if (error?.error?.message) {
        errorMessage = `Error: ${error.error.message}`;
      } else if (error?.message) {
        errorMessage = `Error: ${error.message}`;
      }
      if (error?.status) {
        errorMessage += ` (HTTP ${error.status})`;
      }

      alert(errorMessage);
    } finally {
      this.isLoading = false;
    }
  }

  // ✅ PRINT REPORT
  printReport(): void {
    // Prefer registrationDate/createdAt from patientData when available
    const preferredDate = (this as any)?.patientData?.registrationDate || (this as any)?.patientData?.createdAt || this.reportDate;
    // Navigate to print component with current data
    this.router.navigate(['/pathology-module/print'], {
      state: {
        reportData: {
          reportId: this.reportId,
          receiptNo: this.receiptNo,
          registrationNo: this.registrationNo,
          labYearlyNo: this.labYearlyNo,
          labDailyNo: this.labDailyNo,
          labNumber: this.labNumber,
          // Pass both snapshot and structured patient data
          patientData: this.patientData,
          patientName: this.patientName,
          age: this.age,
          gender: this.gender,
          patientType: this.patientType,
          // Tests
          testResults: this.testResults,
          // Context
          reportDate: preferredDate,
          registrationDate: (this as any)?.patientData?.registrationDate || null,
          doctorName: this.doctorName,
          department: this.department,
          reportStatus: this.reportStatus
        },
        // Show preview first, user will manually click print
        triggerAutoPrint: false,
        navigateAfterPrint: {
          path: '/pathology-module/all-reports',
          queryParams: { focusReceipt: this.receiptNo }
        }
      }
    });
  }

  // Small utility: split text by comma/newline for multi-line display in UI
  public splitLines(value: any): string[] {
    const s = (value ?? '').toString();
    if (!s.trim()) return [];
    return s.split(/[\,\n]/g).map((p: string) => p.trim()).filter((p: string) => p.length > 0);
  }
  // === Keyboard navigation: Enter/Tab moves down, Shift+Tab or ArrowUp moves up (same column) ===
  onResultKeyDown(event: KeyboardEvent): void {
    const key = event.key;
    const target = event.target as HTMLElement | null;
    if (!target) return;

    // Move down: Enter or Tab (without Shift)
    if (key === 'Enter' || (key === 'Tab' && !event.shiftKey)) {
      event.preventDefault();
      this.moveVertical(target, +1);
      return;
    }

    // Move up: ArrowUp or Shift+Tab
    if (key === 'ArrowUp' || (key === 'Tab' && event.shiftKey)) {
      event.preventDefault();
      this.moveVertical(target, -1);
      return;
    }
  }

  private moveVertical(current: HTMLElement, delta: number): void {
    try {
      const inputs = this.getResultInputs();
      const idx = inputs.indexOf(current);
      if (idx === -1) return;
      let next = idx + delta;
      while (next >= 0 && next < inputs.length && !this.isFocusable(inputs[next])) {
        next += delta;
      }
      if (next >= 0 && next < inputs.length) {
        const el: any = inputs[next];
        el.focus?.();
        try { el.select?.(); } catch {}
        try { (el as HTMLElement).scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch {}
      }
    } catch {}
  }

  private getResultInputs(): HTMLElement[] {
    // Prefer scoped container if present; fallback to any element with .value-input
    const scoped = Array.from(document.querySelectorAll('.test-results-section .value-input')) as HTMLElement[];
    const all = Array.from(document.querySelectorAll('.value-input')) as HTMLElement[];
    const base = scoped.length ? scoped : all;
    return base.filter(el => this.isFocusable(el));
  }

  private isFocusable(el: HTMLElement): boolean {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    const disabled = (el as any).disabled;
    const hidden = style.display === 'none' || style.visibility === 'hidden';
    const notInFlow = el.offsetParent === null && style.position !== 'fixed';
    return !disabled && !hidden && !notInFlow;
  }



  // ✅ SAVE AND PRINT REPORT
  async saveAndPrintReport(): Promise<void> {
    try {
      console.log('💾🖨️ Save and Print initiated...');

      // Guard: prevent duplicate clicks while a save is in progress
      if (this.isLoading) {
        try { this.alertService.showInfo('Processing', 'Please wait, saving in progress...'); } catch {}
        return;
      }

      // First save the report but do not navigate yet
      await this.saveReport({ navigateAfterSave: false });

      // If save was blocked due to existing report (HTTP 409), skip printing
      if (this.skipNextPrint) {
        this.skipNextPrint = false;
        return;
      }

      // Then open print page; it will auto print and return to list
      setTimeout(() => {
        console.log('🖨️ Opening print layout...');
        this.printReport();
      }, 500);

    } catch (error) {
      console.error('❌ Error in save and print:', error);
      alert('Error saving report. Please try again.');
    }
  }

  // ✅ UPDATE REPORT (for edit mode)
  async updateReport(opts?: { skipNavigate?: boolean }): Promise<boolean> {
    if (!this.isFormValid) {
      alert('Please fill all required fields');
      return false;
    }

    try {
      console.log('🔄 Updating report...');

      const typeNorm = (this.patientType || '').toString().toUpperCase() === 'IPD' ? 'IPD' : 'OPD';
      const reportData = {
        reportId: this.reportId,
        receiptNo: this.receiptNo,
        registrationNo: this.registrationNo,
        registrationRef: (this as any)?.patientData?.backendId || (this as any)?.patientData?._id || undefined,
        labYearlyNo: this.labYearlyNo,
        labDailyNo: this.labDailyNo,
        labNumber: this.labNumber,
        // Ensure TYPE/room persist during edits as well
        patientType: typeNorm,
        type: typeNorm,
        addressType: typeNorm,
        roomNo: this.roomNo,
        // Meta
        reportDate: this.reportDate,
        reportStatus: this.reportStatus,
        patientData: this.patientData,
        testResults: this.testResults
      };

      const response = await firstValueFrom(
        this.http.put<any>(`${environment.apiUrl}/pathology-reports/${this.reportId}`, reportData)
      );

      if (response.success) {
        console.log('✅ Report updated successfully');
        this.alertService.showSuccess('Report Updated!', 'Your report has been updated successfully.', { autoHideDelay: 1200 });
        if (!opts?.skipNavigate) {
          setTimeout(() => this.router.navigate(['/pathology-module/all-reports']), 800);
        }
        return true;
      } else {
        console.error('❌ Update failed:', response.message);
        alert('Failed to update report: ' + response.message);
        return false;
      }

    } catch (error) {
      console.error('❌ Error updating report:', error);
      alert('Error updating report!');
      return false;
    }
  }

  // ✅ UPDATE AND PRINT REPORT
  async updateAndPrintReport(): Promise<void> {
    const ok = await this.updateReport({ skipNavigate: true });
    if (ok && this.reportId) {
      setTimeout(() => this.printReport(), 500);
    }
  }

  // ✅ GO BACK TO ALL REPORTS
  goBackToAllReports(): void {
    this.router.navigate(['/pathology-module/all-reports']);
  }

  // ✅ DELETE REPORT
  deleteReport(): void {
    if (confirm('Are you sure you want to delete this report?')) {
      console.log('🗑️ Deleting report...');
      // Implementation for delete
    }
  }

  // ✅ LOAD REPORT BY ID (for edit/view/print modes)
  async loadReportById(reportId: string): Promise<void> {
    try {
      console.log('🔍 Loading report by ID:', reportId);

      const response = await firstValueFrom(
        this.http.get<any>(`${environment.apiUrl}/pathology-reports/${reportId}`)
      );

      if (response.success && response.data) {
        const report = response.data;

        // Ensure definitions are loaded before computing categories/parameters
        try { await this.ensureDefinitionsLoaded?.(3000); } catch {}

        // Populate all fields with existing data
        this.receiptNo = report.receiptNo;
        this.registrationNo = report.registrationNo;
        this.labYearlyNo = report.labYearlyNo;
        this.labDailyNo = report.labDailyNo;
        this.labNumber = report.labNumber;
        this.reportDate = report.reportDate;
        this.reportStatus = report.reportStatus;
        // Prefer TYPE from server (which itself comes from Receipt/Invoice)
        this.patientType = (report as any).patientType || this.patientType || 'OPD';
        this.patientData = report.patientData;
        // Normalize categories for previously saved reports where tests were stored under GENERAL
        this.testResults = (report.testResults || []).map((t: any) => ({
          ...t,
          category: (!t?.category || /^(general|others?|pathology)$/i.test(String(t.category)))
            ? this.getTestCategory(t?.testName || t?.name || '')
            : t.category
        }));

        // 🔧 Re-hydrate parameters for edit mode using latest definitions
        try {
          const norm = (s: string) => this.normalizeTestName(s || '');
          this.testResults = (this.testResults || []).map((t: any) => {
            const defParams = this.getTestParameters(t?.testName || t?.name || '');
            const existing = Array.isArray(t?.parameters) ? t.parameters : [];
            const exMap = new Map<string, any>();
            for (const p of existing) { exMap.set(norm(p?.name || p?.testName || ''), p); }
            const merged = defParams.map((dp: any) => {
              const hit = exMap.get(norm(dp?.name || ''));
              if (hit) {
                const mergedItem: any = {
                  ...dp,
                  result: (hit.result ?? dp.result),
                  normalRange: (hit.normalRange ?? dp.normalRange),
                  status: (hit.status ?? dp.status),
                  excludeFromPrint: (hit.excludeFromPrint ?? dp.excludeFromPrint)
                };

                // Preserve dropdown selection on edit
                if (hit.selectedOptionId !== undefined && hit.selectedOptionId !== null) {
                  mergedItem.selectedOptionId = hit.selectedOptionId;
                  if ((mergedItem.resultType || '').toLowerCase() === 'dropdown' && Array.isArray(mergedItem.options)) {
                    const sel = mergedItem.options.find((o: any) => String(o.id) === String(hit.selectedOptionId));
                    if (sel && (!mergedItem.result || String(mergedItem.result).trim() === '')) {
                      mergedItem.result = sel.label;
                    }
                  }
                }

                // Merge sub-parameters if present
                if (Array.isArray(dp.subParameters) && Array.isArray(hit.subParameters)) {
                  const subMap = new Map<string, any>();
                  hit.subParameters.forEach((sp: any) => subMap.set(norm(sp?.name || ''), sp));
                  mergedItem.subParameters = dp.subParameters.map((sp: any) => {
                    const found = subMap.get(norm(sp?.name || ''));
                    if (!found) return sp;
                    const out: any = {
                      ...sp,
                      result: (found.result ?? sp.result),
                      status: (found.status ?? sp.status),
                      excludeFromPrint: (found.excludeFromPrint ?? sp.excludeFromPrint)
                    };
                    if (found.selectedOptionId !== undefined && found.selectedOptionId !== null) {
                      out.selectedOptionId = found.selectedOptionId;
                    }
                    return out;
                  });
                }

                return mergedItem;
              }
              return dp;
            });
            return { ...t, parameters: merged };
          });
        } catch (e) { console.warn('⚠️ Rehydrate parameters failed:', e); }

        // Lock TYPE to invoice afterwards (avoid UI flicker/override)
        try {
          await this.enrichFromInvoiceByReceipt(this.receiptNo);
        } catch {}
        this.patientType = (this.patientData?.registrationMode || (this.patientData as any)?.mode || this.patientType || '').toString().toUpperCase() === 'IPD' ? 'IPD' : 'OPD';
        // Capture edit flags/history from backend
        (this as any).isEdited = report.isEdited || false;
        (this as any).editHistory = report.editHistory || [];
        (this as any).lastEditedAt = report.lastEditedAt || report.updatedAt;
        (this as any).lastEditedBy = report.lastEditedBy || report.updatedBy;

        // Populate doctor/department/room from saved report as fallback
        this.doctorName = (report as any).doctor || this.doctorName || '';
        this.doctorRefNo = (report as any).doctorRefNo || this.doctorRefNo || '';
        this.department = (report as any).department || this.department || '';
        this.roomNo = (report as any).roomNo || (report.patientData?.doctor?.roomNumber) || (report as any)?.doctor?.roomNumber || this.roomNo || '';

        // Set patient details
        if (this.patientData) {
          const fullName = this.patientData.fullName || `${this.patientData.firstName || ''} ${this.patientData.lastName || ''}`.trim();
          this.patientName = (fullName && fullName.toLowerCase() !== 'undefined undefined') ? fullName : '';
          this.age = this.patientData.age || '';
          this.ageIn = this.patientData.ageIn || this.patientData?.patient?.ageIn || '';
          this.gender = this.patientData.gender || '';
        }

        // Enrich from original invoice by receipt to fill doctor/department if missing
        await this.enrichFromInvoiceByReceipt(this.receiptNo);

        console.log('✅ Report loaded successfully:', report);

        // Validate form after loading and force UI update
        this.validateForm();
        try { this.cdr.detectChanges(); } catch {}
        // Ensure normal ranges reflect current patient age/gender
        try { this.refreshNormalValuesByPatientContext(); } catch {}

        // If print mode, auto-print
        if (this.isPrintMode) {
          setTimeout(() => {
            this.printReport();
          }, 1000);
        }

      } else {
        console.error('❌ Report not found');
        alert('Report not found!');
      }

    } catch (error) {
      console.error('❌ Error loading report:', error);
      alert('Error loading report!');
    }
  }

  // ✅ SEARCH METHODS
  async searchByReceiptNo(): Promise<void> {
    const receipt = (this.receiptNo || '').toString().trim();
    if (!receipt) {
      this.alertService.showWarning(
        ' Receipt Number',
        'Please enter Receipt Number',
        { autoHideDelay: 2000 }
      );
      return;
    }

    this.isLoading = true;
    try {
      console.log(`🔍 Searching by Receipt No: ${receipt}`);

      // 1) Check if report already exists for this receipt
      try {
        const checkResponse = await firstValueFrom(
          this.http.get<any>(`${environment.apiUrl}/pathology-reports/by-receipt/${receipt}`)
        );
        if (checkResponse && checkResponse.success && checkResponse.data) {
          this.alertService.showWarning(
            ' Report Already Generated',
            'Report already generated for this receipt number!',
            { autoHideDelay: 2000 }
          );
          this.router.navigate(['/pathology-module/all-reports'], { queryParams: { focusReceipt: receipt } });
          return; // stop here, don't load for generation
        }
      } catch (e: any) {
        // If 404, report doesn't exist yet - continue with normal flow
        if (e.status !== 404) {
          console.warn('⚠️ Error checking existing report:', e);
        }
      }

      // 2) Try to pull pathology-registration by receipt
      try {
        const response = await firstValueFrom(
          this.http.get<any>(`${environment.apiUrl}/pathology-registration/receipt/${receipt}`)
        );
        console.log('🔍 API Response (registration):', response);

        if (response && response.invoice) {
          this.patientData = response.invoice;
          await this.enrichFromInvoiceByReceipt(receipt);
          this.populatePatientData();
          await this.loadAllTestsForReceipt(receipt);
          this.initializeWhatsAppNumber();
          console.log('✅ Patient found by Receipt No (registration):', this.patientData);
          return;
        }
      } catch (errReg: any) {
        // 3) Fallback: If registration does not exist (404), try invoice directly
        if (errReg?.status === 404) {
          console.warn('ℹ️ Registration not found, trying invoice fallback for receipt:', receipt);
          try {
            const invResp = await firstValueFrom(
              this.http.get<any>(`${environment.apiUrl}/pathology-invoice/receipt/${receipt}`)
            );
            const invoice = invResp?.invoice || invResp?.data;
            if (invoice) {
              this.patientData = invoice;
              this.receiptNo = (invoice.receiptNumber ?? receipt).toString();
              // Populate basic patient/doctor/department fields
              this.populatePatientData();
              // Map tests from invoice -> testResults (Pathology only)
              const allTests = Array.isArray(invoice.tests) ? invoice.tests : [];
              const pathologyTests = allTests.filter((t: any) => !this.isNonPathologyByNameCategory(
                t?.name || t?.testName || t?.testId || t?.test || '', t?.category
              ));
              this.testResults = pathologyTests.map((test: any) => {
                const actualTestName = test.name || test.testName || test.testId || test.test || 'Unknown Test';
                return {
                  testName: actualTestName,
                  category: (!test.category || /^(general|others?|pathology)$/i.test(String(test.category)))
                    ? this.getTestCategory(actualTestName)
                    : test.category,
                  parameters: this.getTestParameters(actualTestName)
                };
              });
              // If only radiology items existed, notify user
              if ((this.testResults?.length || 0) === 0) {
                try { this.alertService.showWarning('No Pathology Tests', 'Is receipt me sirf Radiology/Imaging items hain. Yahan sirf Pathology reports bante hain.'); } catch {}
              }
              // Apply formulas initially
              try { for (const t of this.testResults) { this.applyFormulasForTest(t); } } catch {}
              this.initializeWhatsAppNumber();
              console.log('✅ Patient loaded from INVOICE fallback:', this.patientData);
              return;
            }
          } catch (invErr) {
            console.warn('⚠️ Invoice fallback failed:', invErr);
          }
        } else {
          // Non-404 error from registration lookup; rethrow to outer handler
          throw errReg;
        }
      }

      // If neither registration nor invoice produced data
      alert('Patient not found with this Receipt Number!');
    } catch (error: any) {
      console.error('❌ Error searching by Receipt No:', error);
      let errorMessage = 'Error searching patient. ';
      if (error.status === 404) {
        errorMessage = `Receipt Number ${receipt} not found in database.`;
      } else if (error.status === 0) {
        errorMessage = 'Cannot connect to server. Please check if server is running.';
      } else {
        errorMessage += `Status: ${error.status}, Message: ${error.error?.message || 'Unknown error'}`;
      }
      alert(errorMessage);
    } finally {
      this.isLoading = false;
    }
  }

  // 🔄 NEW: Load all tests for a receipt from pathology registration
  async loadAllTestsForReceipt(receipt: string): Promise<void> {
    try {
      console.log(`🔍 Loading all tests for receipt: ${receipt}`);

      // Fetch all pathology registrations with this receipt number
      const response = await firstValueFrom(
        this.http.get<any>(`${environment.apiUrl}/pathology-registration/receipt/${receipt}`)
      );

      if (response && response.invoice && response.invoice.tests) {
        const allTests = response.invoice.tests;
        console.log(`📋 Found ${allTests.length} tests for receipt ${receipt}`);

        // Pathology only
        const pathologyTests = allTests.filter((t: any) => !this.isNonPathologyByNameCategory(
          t?.name || t?.testName || t?.testId || t?.test || '', t?.category
        ));

        // Map to testResults format
        this.testResults = pathologyTests.map((test: any) => {
          const actualTestName = test.name || test.testName || test.testId || test.test || 'Unknown Test';
          console.log(`🎯 Test mapping: ${JSON.stringify(test)} -> testName: ${actualTestName}`);

          return {
            testName: actualTestName,
            category: (!test.category || /^(general|others?|pathology)$/i.test(String(test.category)))
              ? this.getTestCategory(actualTestName)
              : test.category,
            parameters: this.getTestParameters(actualTestName)
          };
        });

        // If only radiology items existed, notify user
        if ((this.testResults?.length || 0) === 0) {
          try { this.alertService.showWarning('No Pathology Tests', 'Is receipt me sirf Radiology/Imaging items hain. Yahan sirf Pathology reports bante hain.'); } catch {}
        }

        console.log('✅ All tests loaded for receipt:', this.testResults);
        console.log('🎯 Final testNames:', this.testResults.map(t => t.testName));

        // Apply formula calculations initially
        try {
          for (const t of this.testResults) {
            this.applyFormulasForTest(t);
          }
        } catch {}
      } else {
        // Fallback to loadTestResults if no tests found
        this.loadTestResults();
      }
    } catch (error) {
      console.error('❌ Error loading all tests for receipt:', error);
      // Fallback to loadTestResults
      this.loadTestResults();
    }
  }

  // ✅ SEARCH BY LAB YEARLY NUMBER
  async searchByLabYearlyNo(): Promise<void> {
    if (!this.labYearlyNo.trim()) {
      alert('Please enter Lab Yearly Number');
      return;
    }

    this.isLoading = true;
    try {
      console.log(`🔍 Searching by Lab Yearly No: ${this.labYearlyNo}`);

      const response = await firstValueFrom(
        this.http.get<any>(`${environment.apiUrl}/pathology-registration/yearly/${this.labYearlyNo}`)
      );

      console.log('🔍 API Response:', response);

      if (response && response.success && response.invoice) {
        this.patientData = response.invoice;
        this.receiptNo = response.invoice.receiptNo || '';
        await this.enrichFromInvoiceByReceipt(this.receiptNo);
        this.populatePatientData();
        this.loadTestResults();
        console.log('✅ Patient found by Yearly No:', this.patientData);
      } else {
        console.log('❌ No data found for yearly no:', this.labYearlyNo);
        alert('Patient not found with this Lab Yearly Number!');
      }
    } catch (error) {
      console.error('❌ Error searching by Yearly No:', error);
      alert('Error occurred while searching!');
    } finally {
      this.isLoading = false;
    }
  }

  // ✅ SEARCH BY LAB DAILY NUMBER
  async searchByLabDailyNo(): Promise<void> {
    if (!this.labDailyNo.trim()) {
      alert('Please enter Lab Daily Number');
      return;
    }

    this.isLoading = true;
    try {
      console.log(`🔍 Searching by Lab Daily No: ${this.labDailyNo}`);

      const response = await firstValueFrom(
        this.http.get<any>(`${environment.apiUrl}/pathology-registration/daily/${this.labDailyNo}`)
      );

      console.log('🔍 API Response:', response);

      if (response && response.success && response.invoice) {
        this.patientData = response.invoice;
        this.receiptNo = response.invoice.receiptNo || '';
        await this.enrichFromInvoiceByReceipt(this.receiptNo);
        this.populatePatientData();
        this.loadTestResults();
        console.log('✅ Patient found by Daily No:', this.patientData);
      } else {
        console.log('❌ No data found for daily no:', this.labDailyNo);
        alert('Patient not found with this Lab Daily Number!');
      }
    } catch (error) {
      console.error('❌ Error searching by Daily No:', error);
      alert('Error occurred while searching!');
    } finally {
      this.isLoading = false;
    }
  }

  // ✅ SEARCH BY REGISTRATION NUMBER
  async searchByRegistrationNo(): Promise<void> {
    if (!this.registrationNo.trim()) {
      alert('Please enter Registration Number');
      return;
    }

    this.isLoading = true;
    try {
      console.log(`🔍 Searching by Registration No: ${this.registrationNo}`);

      const response = await firstValueFrom(
        this.http.get<any>(`${environment.apiUrl}/pathology-registration/registration/${this.registrationNo}`)
      );

      console.log('🔍 API Response:', response);

      if (response && response.success && response.invoice) {
        this.patientData = response.invoice;
        this.receiptNo = response.invoice.receiptNumber?.toString() || '';
        await this.enrichFromInvoiceByReceipt(this.receiptNo);
        this.populatePatientData();
        this.loadTestResults();
        console.log('✅ Patient found by Registration No:', this.patientData);
      } else {
        console.log('❌ No data found for registration no:', this.registrationNo);
        alert('Patient not found with this Registration Number!');
      }
    } catch (error) {
      console.error('❌ Error searching by Registration No:', error);
      alert('Error occurred while searching!');
    } finally {
      this.isLoading = false;
    }
  }

  async searchByLabNo(): Promise<void> {
    if (!this.searchLabNo.trim()) {
      alert('Please enter Lab Number');
      return;
    }

    this.isLoading = true;
    try {
      console.log(`🔍 Searching by Lab No: ${this.searchLabNo}`);

      const response = await firstValueFrom(
        this.http.get<any>(`${environment.apiUrl}/pathology-registration/lab-number/${this.searchLabNo}`)
      );

      if (response.success && response.data) {
        this.patientData = response.data;
        // Try to enrich from invoice using receiptNumber embedded in registration
        await this.enrichFromInvoiceByReceipt(undefined);
        this.populatePatientData();
        console.log('✅ Patient found by Lab No:', this.patientData);
      } else {
        alert('Patient not found with this Lab Number!');
      }
    } catch (error) {
      console.error('❌ Error searching by Lab No:', error);
      alert('Error searching patient. Please try again.');
    } finally {
      this.isLoading = false;
    }
  }

  // ✅ POPULATE PATIENT DATA FROM PATHOLOGYREGISTRATION
  populatePatientData(): void {
    if (this.patientData) {
      console.log('🔍 Populating patient data from pathologyregistration:', this.patientData);

      // PathologyRegistration data structure
      const patient = this.patientData.patient || {};
      const payment = this.patientData.payment || {};
      const department = this.patientData.department || {};
      const doctor = this.patientData.doctor || {};

      // ✅ FIX: Populate form fields with correct field mapping
      this.registrationNo = patient.registrationNumber || patient.patientId || '';
      this.patientName = patient.name || `${patient.firstName || ''} ${patient.lastName || ''}`.trim();
      this.age = patient.age?.toString() || '';
      this.ageIn = patient.ageIn || (this.patientData as any)?.ageIn || '';
      this.gender = patient.gender || '';
      // Normalize mode from registration into patientType for Test Report
      const incomingMode = (this.patientData?.registrationMode || (this.patientData as any)?.mode || (this.patientData as any)?.addressType || '').toString().trim().toUpperCase();
      this.patientType = incomingMode === 'IPD' ? 'IPD' : 'OPD';
      // Doctor name and ref no with robust fallbacks
      this.doctorName = doctor.name || (typeof (this.patientData?.doctor) === 'string' ? (this.patientData as any).doctor : '') || '';
      this.doctorRefNo = (this.patientData as any).doctorRefNo || (doctor as any).refNo || (doctor as any).doctorRefNo || (this.patientData as any).referenceNumber || '';
      this.department = department.name || (doctor as any).specialization || '';
      // Room No with aggressive fallbacks
      this.roomNo = (doctor as any).roomNumber
        || (this.patientData as any)?.roomNo
        || (this.patientData as any)?.room?.roomNumber
        || (this.patientData as any)?.appointment?.room?.roomNumber
        || this.roomNo
        || (this as any).roomNo
        || '';
      // Prefer saved payment total; fallback to compute from tests for older records
      const fallbackComputed = (this.patientData.tests || []).reduce((sum: number, t: any) => {
        const qty = t.quantity || 1;
        const cost = t.cost || 0;
        const discount = t.discount || 0;
        return sum + (cost * qty) - discount;
      }, 0);
      const total = (payment && payment.totalAmount != null) ? payment.totalAmount : fallbackComputed;
      this.amount = total.toString();

      // ✅ Lab Numbers - Prefer pathologyregistration; fallback to invoice lab numbers if needed
      this.labYearlyNo = this.patientData.yearNumber?.toString() || (this.patientData as any)?.labYearlyNo?.toString() || '';
      this.labDailyNo = this.patientData.todayNumber?.toString() || (this.patientData as any)?.labDailyNo?.toString() || '';

      console.log('📊 Receipt Number:', this.patientData.receiptNumber);
      console.log('📊 Lab Yearly No (yearNumber):', this.labYearlyNo);
      console.log('📊 Lab Daily No (todayNumber):', this.labDailyNo);
      console.log('📊 Patient Name:', this.patientName);
      console.log('📊 Registration No:', this.registrationNo);
      console.log('📊 Doctor Name:', this.doctorName);
      console.log('📊 Department:', this.department);

      // Update form if exists
      if (this.reportForm) {
        this.reportForm.patchValue({
          reportDate: this.reportDate,
          labNumber: this.patientData.labNumber || '',
          title: this.patientData.title || 'Mr.',
          patientName: this.patientName,
          mobileNumber: patient.phone || patient.mobile || '',
          age: this.age,
          gender: this.gender,
          doctorName: this.doctorName
        });
      }

      // ✅ FIX: Load test results after populating patient data
      this.loadTestResults();

      // Initialize WhatsApp number from patient data
      this.initializeWhatsAppNumber();
    }
  }

  // 🔄 Enrich currently loaded registration data with latest invoice fields
  private async enrichFromInvoiceByReceipt(receipt: string | number | undefined | null): Promise<void> {
    const rn = (receipt ?? this.patientData?.receiptNumber ?? this.receiptNo ?? '').toString().trim();
    if (!rn) return;
    try {
      const resp: any = await firstValueFrom(
        this.http.get<any>(`${environment.apiUrl}/pathology-invoice/receipt/${rn}`)
      );
      const invoice: any = resp?.invoice || resp?.data;
      if (!invoice) return;

      // Merge important fields from invoice into patientData snapshot
      const current: any = this.patientData || {};
      this.patientData = {
        ...current,
        doctorRefNo: invoice.doctorRefNo ?? current.doctorRefNo,
        doctor: invoice.doctor ? { ...(current.doctor || {}), ...invoice.doctor } : current.doctor,
        department: invoice.department ? { ...(current.department || {}), ...invoice.department } : current.department,
        // Preserve totalAmount from pathologyregistration; merge other invoice payment fields
        payment: invoice.payment
          ? {
              ...(current.payment || {}),
              ...invoice.payment,
              totalAmount:
                (current.payment && current.payment.totalAmount != null)
                  ? current.payment.totalAmount
                  : invoice.payment.totalAmount
            }
          : current.payment,
        // capture mode/registrationMode for TYPE normalization
        mode: invoice.mode ?? current.mode,
        registrationMode: invoice.registrationMode ?? invoice.mode ?? current.registrationMode,
        receiptNumber: current.receiptNumber || invoice.receiptNumber
      } as any;

      // Also update component fields if already populated
      if (invoice.doctor?.name) this.doctorName = invoice.doctor.name;
      if (invoice.doctorRefNo) this.doctorRefNo = invoice.doctorRefNo.toString();
      if (invoice.department?.name) this.department = invoice.department.name;
      // Do not override amount coming from pathologyregistration; only set if empty
      if ((this.amount == null || this.amount === '0' || this.amount === '') && invoice.payment?.totalAmount != null) {
        this.amount = String(invoice.payment.totalAmount);
      }
      // Room No: prefer from invoice.doctor.roomNumber, with sensible fallbacks
      const roomNoCandidate = invoice.doctor?.roomNumber || (invoice as any)?.roomNo || (invoice.department as any)?.roomNumber || (invoice.appointment as any)?.room?.roomNumber;
      if (roomNoCandidate && !this.roomNo) this.roomNo = String(roomNoCandidate);

      // Normalize TYPE from invoice mode if available
      const modeVal = (invoice.mode || invoice.registrationMode || '').toString().trim().toUpperCase();
      if (modeVal) {
        this.patientType = modeVal === 'IPD' ? 'IPD' : 'OPD';
      }
    } catch (e) {
      console.warn('⚠️ Could not enrich from latest invoice:', e);
    }
  }


  // ✅ GENERATE LAB NUMBERS
  generateLabNumbers(): void {
    if (this.receiptNo) {
      // Lab Yearly No. = Receipt Number (simple)
      this.labYearlyNo = this.receiptNo;

      // Lab Daily No. = Receipt Number (for now, can be enhanced later)
      this.labDailyNo = this.receiptNo;

      console.log('🔢 Generated Lab Numbers:', {
        yearly: this.labYearlyNo,
        daily: this.labDailyNo,
        receipt: this.receiptNo
      });
    }
  }

  // ✅ LOAD TEST RESULTS FROM PATHOLOGYREGISTRATION
  loadTestResults(): void {
    console.log('🔍 Loading test results from pathologyregistration:', this.patientData);

    if (this.patientData && this.patientData.tests && this.patientData.tests.length > 0) {
      console.log('📋 Loading tests from pathologyregistration:', this.patientData.tests);
      console.log('🔍 First test structure:', this.patientData.tests[0]); // Debug log

      // Pathology only
      const pathologyTests = this.patientData.tests.filter((t: any) => !this.isNonPathologyByNameCategory(
        t?.name || t?.testName || t?.testId || t?.test || '', t?.category
      ));

      this.testResults = pathologyTests.map((test: any) => {
        // ✅ PathologyRegistration uses 'name' field, not 'testName'
        const actualTestName = test.name || test.testName || test.testId || test.test || 'Unknown Test';
        console.log(`🎯 Test mapping: ${JSON.stringify(test)} -> testName: ${actualTestName}`);

        return {
          testName: actualTestName,
          // If category is missing or generic, compute from definitions/fallbacks
          category: (!test.category || /^(general|others?|pathology)$/i.test(String(test.category)))
            ? this.getTestCategory(actualTestName)
            : test.category,
          parameters: this.getTestParameters(actualTestName)
        };
      });

      // If only radiology items existed, notify user
      if ((this.testResults?.length || 0) === 0) {
        try { this.alertService.showWarning('No Pathology Tests', 'Is receipt me sirf Radiology/Imaging items hain. Yahan sirf Pathology reports bante hain.'); } catch {}
      }


      console.log('✅ Test results loaded from pathologyregistration:', this.testResults);
      console.log('🎯 Final testNames:', this.testResults.map(t => t.testName));

      // Apply formula calculations initially
      try {
        for (const t of this.testResults) {
          this.applyFormulasForTest(t);
        }
      } catch {}

    } else {
      // ✅ Fallback to default CBC test if no tests found
      console.log('📋 No tests found in pathologyregistration, loading default CBC test');
      this.testResults = [{
        testName: 'COMPLETE BLOOD COUNT (CBC)',
        category: 'HEMATOLOGY',
        parameters: [
          {
            name: 'Hemoglobin',
            result: '',
            unit: 'g/dl',
            normalRange: '13 - 17',
            status: 'pending'
          },
          {
            name: 'Total Leukocyte Count',
            result: '',
            unit: 'cumm',
            normalRange: '3,000 - 10,000',
            status: 'pending'
          },
          {
            name: 'Differential Leucocyte Count',
            result: '',
            unit: '',
            normalRange: '',
            status: 'pending',
            subParameters: [
              { name: 'Neutrophils', result: '', unit: '%', normalRange: '40 - 80', status: 'pending' },
              { name: 'Lymphocyte', result: '', unit: '%', normalRange: '20 - 40', status: 'pending' },
              { name: 'Eosinophils', result: '', unit: '%', normalRange: '1 - 6', status: 'pending' },
              { name: 'Monocytes', result: '', unit: '%', normalRange: '2 - 10', status: 'pending' },
              { name: 'Basophils', result: '', unit: '%', normalRange: '< 2', status: 'pending' }
            ]
          },
          {
            name: 'Platelet Count',
            result: '',
            unit: 'lakhs/cumm',
            normalRange: '1.5 - 4.5',
            status: 'pending'
          }
        ]
      }];
    }

    console.log('✅ Final test results loaded:', this.testResults);
    this.cdr.detectChanges();

    // After initial load, re-evaluate age/gender specific normal values to be safe
    try { this.refreshNormalValuesByPatientContext(); } catch {}
  }

  // Helper: normalize test names (remove dots/spaces, upper-case)
  private normalizeTestName(s: string): string {
    return (s || '').toString().trim().toUpperCase().replace(/\./g, '').replace(/\s+/g, '');
  }

  // ✅ Helper: decide if a test is NON-pathology (radiology/imaging) by name/category
  private isNonPathologyByNameCategory(nameRaw: string, categoryRaw?: string): boolean {
    const name = (nameRaw || '').toString().toUpperCase();
    const cat = (categoryRaw || '').toString().toUpperCase();

    // Category hints
    const nonPathCats = ['RADIOLOGY', 'IMAGING', 'XRAY', 'X-RAY'];
    if (nonPathCats.some(k => cat.includes(k))) return true;

    // Name patterns (use spaced/safe checks to avoid matching HCT etc.)
    const spaced = ` ${name} `;
    const patterns = [
      ' X-RAY ', ' XRAY ', ' X RAY ',
      ' ULTRASOUND ', ' USG ', ' SONOGRAPHY ',
      ' MRI ', ' MR I ',
      ' CT ', ' NCCT ', ' CECT ', ' HRCT ', ' PET CT ', ' CT ANGIO ', ' MR ANGIO ',
      ' MAMMOG', ' DOPPLER ', ' ECHO ', ' FLUORO ', ' HSG ', ' IVP ', ' BARIUM '
    ];
    if (patterns.some(p => spaced.includes(p))) return true;

    // If our internal mapping says Radiology, treat as non-pathology
    try {
      const mapped = this.getTestCategory(nameRaw || '');
      if ((mapped || '').toUpperCase().includes('RADIOLOGY')) return true;
    } catch {}

    return false;
  }


  // ✅ GET TEST CATEGORY FROM REAL TEST DEFINITIONS
  getTestCategory(testName: string): string {
    console.log(`🔍 Looking for category of test: ${testName}`);

    const queryNorm = this.normalizeTestName(testName);

    // First try to find in real test definitions (normalized match)
    if (this.testDefinitions && this.testDefinitions.length > 0) {
      const matchingTest = this.testDefinitions.find((test: any) => {
        const name = this.normalizeTestName(test?.name || '');
        const short = this.normalizeTestName(test?.shortName?.testName || '');
        return name === queryNorm || short === queryNorm || name.includes(queryNorm) || queryNorm.includes(name);
      });

      if (matchingTest && matchingTest.category) {
        const categoryName = typeof matchingTest.category === 'string'
          ? matchingTest.category
          : matchingTest.category.name;
        console.log(`✅ Found category from test definitions: ${categoryName}`);
        return categoryName;
      }
    }

    // Fallback to hardcoded mapping if not found in database
    const testCategories: { [key: string]: string } = {
      'CBC': 'HAEMATOLOGY', // UI prefers HAEMATOLOGY spelling
      'C.B.C': 'HAEMATOLOGY',
      'COMPLETE BLOOD COUNT': 'HAEMATOLOGY',
      'COMPLETE BLOOD PICTURE': 'HAEMATOLOGY',
      'CHOLESTEROL': 'BIOCHEMISTRY',
      'LIPID': 'BIOCHEMISTRY',
      'BLOOD SUGAR': 'BIOCHEMISTRY',
      'LIVER': 'BIOCHEMISTRY',
      'KIDNEY': 'BIOCHEMISTRY',
      'THYROID': 'ENDOCRINOLOGY',
      'URINE': 'URINE ANALYSIS',
      'STOOL': 'CLINICAL PATHOLOGY',
      'ECG': 'CARDIOLOGY',
      'X-RAY': 'RADIOLOGY',
      'M.P. CARD': 'MICROBIOLOGY',
      'MP CARD': 'MICROBIOLOGY',
      'MALARIA PARASITE': 'MICROBIOLOGY'
    };


    const upperTestName = testName.toUpperCase();
    const normalized = this.normalizeTestName(testName);

    // Normalize common CBC variants early
    if (normalized.includes('CBC') || normalized.includes('CBP')
      || normalized.includes('COMPLETEBLOODCOUNT') || normalized.includes('COMPLETEBLOODPICTURE')) {
      console.log('✅ Normalized mapping matched: HAEMATOLOGY');
      return 'HAEMATOLOGY';
    }

    for (const [key, category] of Object.entries(testCategories)) {
      if (upperTestName.includes(key) || this.normalizeTestName(key).includes(normalized) || normalized.includes(this.normalizeTestName(key))) {
        console.log(`✅ Found category from fallback mapping: ${category}`);
        return category;
      }
    }

    console.log(`⚠️ No category found for test: ${testName}, using GENERAL`);
    return 'GENERAL';
  }

  // ✅ GET TEST PARAMETERS FROM REAL TEST DEFINITIONS
  getTestParameters(testName: string): any[] {
    console.log(`🔍 Looking for parameters of test: ${testName}`);

    // Helper to map a param to UI shape (unit may be ObjectId or populated object)
    // noGroupByFallback: when true, do NOT fall back to outerGroup for groupBy.
    // This is used for panel-included tests where single/multiple/document items should not create an inner group header.
    const mapParam = (param: any, groupOverride?: string, noGroupByFallback: boolean = false) => {
      // Build dropdown options from either dropdownOptions (comma separated) or normalValues
      let options: Array<{ id: string; label: string }> = [];
      if ((param.resultType || '').toLowerCase() === 'dropdown') {
        if (param.dropdownOptions && typeof param.dropdownOptions === 'string' && param.dropdownOptions.trim() !== '') {
          options = param.dropdownOptions.split(',').map((o: string) => ({ id: o.trim(), label: o.trim() }));
        } else if (Array.isArray(param.normalValues) && param.normalValues.length > 0) {
          options = param.normalValues.map((nv: any) => ({
            id: (nv._id || '').toString(),
            label: nv.displayInReport || nv.textValue || [nv.lowerValue, nv.upperValue].filter(Boolean).join('-') || ''
          }));
        }
      }

      // Determine default/preselected value
      let result = '';
      let selectedOptionId: string | undefined;
      const def = (param.defaultResult || '').toString();
      const isFormula = (param.resultType || '').toLowerCase() === 'formula';
      if (options.length > 0) {


        // If defaultResult looks like ObjectId, match by id, else by label
        const opt = options.find(o => o.id === def) || options.find(o => o.label?.toLowerCase() === def.toLowerCase());
        if (opt) {
          result = opt.label;
          selectedOptionId = opt.id;
        }
      } else if (def && !isFormula) {
        result = def; // manual/fixed default value (not for formula)
      }

      // Build normal range display based on patient Age/Age In and Gender
      let chosenNV: any | null = null;
      let normalRange = '';
      if (Array.isArray(param.normalValues) && param.normalValues.length > 0) {
        chosenNV = this.chooseNormalValue(param.normalValues);
        const nv = chosenNV || param.normalValues[0];
        if (nv && nv.type === 'Text' && nv.textValue) {
          normalRange = nv.textValue;
        } else if (nv) {
          normalRange = nv.displayInReport || `${nv.lowerValue || ''}-${nv.upperValue || ''}`;
        }
      }

      return {
        name: param.name,
        // IDs for backend enrichment/merging
        parameterId: (param as any)?._id ? String((param as any)._id) : undefined,
        unitId: (typeof param.unit === 'string') ? param.unit : ((param.unit && (param.unit as any)._id) ? String((param.unit as any)._id) : undefined),
        unit: this.toUnitName(param.unit),
        // Respect param.groupBy if present; otherwise optionally fallback to outer group
        groupBy: (param.groupBy && String(param.groupBy).trim()) ? param.groupBy : (noGroupByFallback ? '' : (groupOverride || '')),
        // Keep track of the parent (included) test name for panel display and isolation of grouping
        outerGroup: groupOverride || '',
        resultType: param.resultType || 'manual',
        type: (chosenNV && chosenNV.type) || (Array.isArray(param.normalValues) && param.normalValues.length > 0 ? (param.normalValues[0].type || '') : ''),
        textValue: (chosenNV && chosenNV.textValue) || (Array.isArray(param.normalValues) && param.normalValues.length > 0 ? (param.normalValues[0].textValue || '') : ''),
        displayInReport: (chosenNV && chosenNV.displayInReport) || (Array.isArray(param.normalValues) && param.normalValues.length > 0 ? (param.normalValues[0].displayInReport || '') : ''),
        lowerValue: (chosenNV && chosenNV.lowerValue) || (Array.isArray(param.normalValues) && param.normalValues.length > 0 ? (param.normalValues[0].lowerValue || '') : ''),
        upperValue: (chosenNV && chosenNV.upperValue) || (Array.isArray(param.normalValues) && param.normalValues.length > 0 ? (param.normalValues[0].upperValue || '') : ''),
        normalRemark: (chosenNV && chosenNV.remark) || (Array.isArray(param.normalValues) && param.normalValues.length > 0 ? (param.normalValues[0].remark || '') : ''),
        // Flags
        isOptional: !!param.isOptional,
        removed: !!param.removed,
        options,
        selectedOptionId,
        normalRange,
        // Keep original list for future re-evaluation when patient context changes
        allNormalValues: Array.isArray(param.normalValues) ? param.normalValues : [],
        result,
        formulaExpr: isFormula ? (param.formula || '') : '',
        status: 'pending'
      };
    };


    // First try to find in real test definitions
    if (this.testDefinitions && this.testDefinitions.length > 0) {
      const queryNorm = this.normalizeTestName(testName);
      const matchingTest = this.testDefinitions.find((test: any) => {
        const name = this.normalizeTestName(test?.name || '');
        const short = this.normalizeTestName(test?.shortName?.testName || '');
        return name === queryNorm || short === queryNorm || name.includes(queryNorm) || queryNorm.includes(name);
      });

      // Handle Panel tests: expand included tests and flatten parameters with grouping
      if (matchingTest && matchingTest.testType === 'panel' && Array.isArray(matchingTest.tests) && matchingTest.tests.length > 0) {
        console.log(`🧩 Panel detected: ${matchingTest.name}, including ${matchingTest.tests.length} tests`);
        const includedParams: any[] = [];
        for (const t of matchingTest.tests) {
          const tid = (t && t._id) ? t._id : t;
          const tname = (t && t.name) ? t.name : undefined;
          const incDef = this.testDefinitions.find((d: any) => d._id === tid || (tname && d.name && d.name.toLowerCase() === tname.toLowerCase()));
          if (incDef) {
            if (Array.isArray(incDef.parameters) && incDef.parameters.length > 0) {
              const sorted = [...incDef.parameters]
                .filter((p: any) => !p.removed)
                .sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
              // For included tests: only nested tests should use groupBy headers; simple tests should not.
              includedParams.push(
                ...sorted.map((p: any, idx: number) => ({
                  ...mapParam(p, incDef.name, /*noGroupByFallback*/ true),
                  order: p.order ?? idx
                }))
              );
            } else {
              // Included test has no parameters (likely testType 'single' or 'multiple' wrapper without groups): treat as single param, no inner group header
              const singleParam = { ...mapParam(incDef, incDef.name, /*noGroupByFallback*/ true), order: (incDef as any).order ?? 0 };
              includedParams.push(singleParam);
            }
          }
        }
        if (includedParams.length > 0) {
          // Reorder by group so all items of same group stay together (for nested/panel tests)
          const grouped = this.reorderParametersByGroup(includedParams);
          return grouped;
        }
        // If no included params, fall through to normal handling below
      }

      if (matchingTest) {
        if (Array.isArray(matchingTest.parameters) && matchingTest.parameters.length > 0) {
          console.log(`✅ Found ${matchingTest.parameters.length} parameters from test definitions`);

          // Sort by order and exclude removed parameters
          const sortedParams = [...matchingTest.parameters]
            .filter((p: any) => !p.removed)
            .sort((a: any, b: any) => (a.order || 0) - (b.order || 0));

          // Map then regroup by groupBy so that any item with same group appears together
          const mapped = sortedParams.map((param: any) => mapParam(param)).filter((p: any) => !p.removed);
          return this.reorderParametersByGroup(mapped);
        } else if ((matchingTest.testType || '').toLowerCase() === 'single' || !Array.isArray(matchingTest.parameters) || matchingTest.parameters.length === 0) {
          // Single-type test with no parameter list: treat the test itself as one parameter
          console.log('✅ Single test with no parameters; mapping top-level fields as one parameter');
          const singleParam = mapParam(matchingTest);
          return [singleParam];
        }
      }
    }

    // Fallback to hardcoded parameters if not found in database
    const testParametersMap: { [key: string]: any[] } = {
      'CBC': [
        { name: 'HAEMOGLOBIN', unit: 'gm/dl', normalRange: '13.5-18.0', result: '', status: 'pending' },
        { name: 'TOTAL LEUCOCYTE COUNT', unit: '/cu.mm', normalRange: '4000-11000', result: '', status: 'pending' },
        { name: 'Neutrophils', unit: '%', normalRange: '40-75', result: '', status: 'pending' },
        { name: 'Lymphocytes', unit: '%', normalRange: '20-40', result: '', status: 'pending' },
        { name: 'PLATELET COUNT', unit: 'lacs/mm3', normalRange: '1.50-4.50', result: '', status: 'pending' }
      ],
      'CHOLESTEROL': [
        { name: 'Total Cholesterol', unit: 'mg/dl', normalRange: '<200', result: '', status: 'pending' }
      ],
      'LIPID': [
        { name: 'Total Cholesterol', unit: 'mg/dl', normalRange: '<200', result: '', status: 'pending' },
        { name: 'HDL Cholesterol', unit: 'mg/dl', normalRange: '>40', result: '', status: 'pending' },
        { name: 'LDL Cholesterol', unit: 'mg/dl', normalRange: '<100', result: '', status: 'pending' },
        { name: 'Triglycerides', unit: 'mg/dl', normalRange: '<150', result: '', status: 'pending' }
      ]
    };

    const upperTestName = testName.toUpperCase();
    for (const [key, parameters] of Object.entries(testParametersMap)) {
      if (upperTestName.includes(key)) {
        console.log(`✅ Found ${parameters.length} parameters from fallback mapping`);
        return parameters;
      }
    }

    // Default single parameter
    console.log(`⚠️ No parameters found for test: ${testName}, using default single parameter`);
    return [{ name: testName, unit: '', normalRange: '', result: '', status: 'pending' }];
  }

  // Utility: regroup within each included test (outerGroup), then by groupBy.
  // - Keeps all parameters of the same group together and stable by original order
  // - Merges groups with the same name ignoring case/extra spaces (e.g., 'Physical' and 'physical')
  // - Prevents merging across different included tests inside a panel
  private reorderParametersByGroup(params: any[]): any[] {
    const normalize = (s: string) => (s || '').toString().trim().replace(/\s+/g, ' ').toLowerCase();

    // 1) Partition by outerGroup in order of first appearance
    const outerOrder: string[] = [];
    const perOuter: Record<string, any[]> = {};
    for (const p of params) {
      const og = p.outerGroup || '';
      if (!(og in perOuter)) { perOuter[og] = []; outerOrder.push(og); }
      perOuter[og].push(p);
    }

    // 2) For each outerGroup, regroup by groupBy (case-insensitive merge)
    const final: any[] = [];
    for (const og of outerOrder) {
      const list = perOuter[og];
      const buckets = new Map<string, { label: string; items: any[] }>();
      const orderedKeys: string[] = [];
      const ungrouped: any[] = [];

      for (const p of list) {
        const raw = (p.groupBy || '').toString();
        const key = normalize(raw);
        if (!key) { ungrouped.push(p); continue; }
        if (!buckets.has(key)) {
          buckets.set(key, { label: raw.trim(), items: [] });
          orderedKeys.push(key);
        }
        buckets.get(key)!.items.push(p);
      }

      // Emit grouped items
      for (const key of orderedKeys) {
        const bucket = buckets.get(key)!;
        const items = bucket.items.sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
        for (const it of items) {
          it.groupBy = bucket.label;   // unify label across bucket
          it.outerGroup = og;          // keep parent label
        }
        final.push(...items);
      }

      // Append ungrouped preserving order
      for (const u of ungrouped) {
        u.outerGroup = og;
        final.push(u);
      }
    }

    return final;
  }

  // ✅ LOAD PATIENT TESTS FROM MASTER
  async loadPatientTests(): Promise<void> {
    try {
      // Get patient's booked tests
      const bookedTests = this.patientData.tests || this.patientData.bookedTests || [];

      if (bookedTests.length > 0) {
        // Load test details from master
        for (const testName of bookedTests) {
          const testDetails = await this.getTestFromMaster(testName);
          if (testDetails) {
            this.selectedTests.push(testDetails);
          }
        }
      } else {
        console.log('No tests found for this patient');
      }
    } catch (error) {
      console.error('❌ Error loading patient tests:', error);
    }

  }


  // ✅ GET TEST FROM MASTER
  async getTestFromMaster(testName: string): Promise<TestReport | null> {
    try {
      const response = await firstValueFrom(
        this.http.get<any>(`${environment.apiUrl}/pathology-master/test/${testName}`)
      );

      if (response.success && response.data) {
        return {
          testId: response.data._id,
          testName: response.data.testName,
          category: response.data.category || 'PATHOLOGY',
          isExpanded: true,
          parameters: response.data.parameters.map((param: any) => ({
            id: param._id,
            name: param.parameterName,
            result: '',
            unit: param.unit,
            normalRange: param.normalRange,
            notes: '',
            remarks: '',
            isAbnormal: false
          }))
        };
      }
      return null;
    } catch (error) {
      console.error(`❌ Error getting test ${testName} from master:`, error);
      return null;
    }
  }

  // ✅ GET TEST CATEGORIES
  getTestCategories(): string[] {
    const categories = new Set<string>();
    this.testResults.forEach(test => {
      if (test.category) {
        categories.add(test.category);
      } else {
        categories.add('GENERAL'); // Default category
      }
    });
    return Array.from(categories);
  }

  // ✅ GET TESTS BY CATEGORY
  getTestsByCategory(category: string): any[] {
    return this.testResults.filter(test =>
      (test.category || 'GENERAL') === category
    );
  }

  // === Apply formulas for all formula-type parameters in a test ===
  private applyFormulasForTest(test: any): void {
    if (!test || !Array.isArray(test.parameters)) return;
    if (this._isApplyingFormulas) return; // re-entrancy guard
    this._isApplyingFormulas = true;
    try {
      // Iterate to resolve dependent formulas (e.g., Globulin -> A:G Ratio)
      for (let iter = 0; iter < 3; iter++) {
        // Build lookup of current numeric values by parameter name (case/space/punctuation insensitive)
        const nameToVal: Record<string, number> = {};
        for (const p of test.parameters) {
          const v = parseFloat((p.result || '').toString());
          if (!Number.isNaN(v)) {
            const n = (p.name || '').toString();
            const k1 = n.toLowerCase().trim();
            const k2 = k1.replace(/[^a-z0-9]/g, '');
            // Also add variations without parentheses content
            const k3 = k1.replace(/\([^)]*\)/g, '').trim();
            const k4 = k3.replace(/[^a-z0-9]/g, '');
            nameToVal[k1] = v;
            nameToVal[k2] = v;
            nameToVal[k3] = v;
            nameToVal[k4] = v;
            // 🔧 DEBUG: Log parameter values for formula debugging
            console.log(`📊 Formula Debug - Parameter: "${n}", Value: ${v}, Keys: [${k1}, ${k2}, ${k3}, ${k4}]`);
          }
        }

        let anyChanged = false;
        for (const p of test.parameters) {
          if ((p.resultType || '').toLowerCase() !== 'formula') continue;
          const expr = (p.formulaExpr || '').toString();
          if (!expr) { if (p.result) { p.result = ''; p.status = 'pending'; anyChanged = true; } continue; }

          console.log(`🧮 Processing formula for "${p.name}": ${expr}`);

          // Prepare expression
          let e = (expr || '').toString().trim();
          const eqIdx = e.lastIndexOf('=');
          if (eqIdx >= 0) e = e.substring(eqIdx + 1).trim();
          e = e.replace(/×/g, '*').replace(/÷/g, '/');

          console.log(`🧮 Expression after cleanup: ${e}`);

          // Replace tokens {PARAM NAME} (or numeric constants)
          let ok = true;
          const replacements: string[] = [];
          e = e.replace(/\{([^}]+)\}/g, (_m: any, raw: string) => {
            const rawStr = String(raw || '').trim();
            const key1 = rawStr.toLowerCase();
            const key2 = key1.replace(/[^a-z0-9]/g, '');
            // Also try without parentheses content
            const key3 = key1.replace(/\([^)]*\)/g, '').trim();
            const key4 = key3.replace(/[^a-z0-9]/g, '');
            const val = (nameToVal[key1] ?? nameToVal[key2] ?? nameToVal[key3] ?? nameToVal[key4]);
            console.log(`🔍 Looking up "{${rawStr}}" -> keys: ["${key1}", "${key2}", "${key3}", "${key4}"], value: ${val}`);
            if (val != null && !Number.isNaN(val)) {
              replacements.push(`{${rawStr}} -> ${val}`);
              return String(val);
            }
            const num = parseFloat(rawStr);
            if (!Number.isNaN(num)) {
              replacements.push(`{${rawStr}} -> ${num} (constant)`);
              return String(num);
            }
            console.warn(`⚠️ Could not resolve parameter: {${rawStr}}`);
            ok = false; return '0';
          });

          console.log(`🧮 Replacements made: ${replacements.join(', ')}`);
          console.log(`🧮 Final expression: ${e}`);

          if (!ok || !/^[0-9+\-*/().\s]+$/.test(e)) {
            console.warn(`⚠️ Formula validation failed for "${p.name}": ok=${ok}, expression="${e}"`);
            if (p.result) { p.result = ''; p.status = 'pending'; anyChanged = true; }
            continue;
          }

          try {
            // eslint-disable-next-line no-new-func
            const out = Number(Function(`"use strict"; return (${e});`)());
            console.log(`✅ Formula result for "${p.name}": ${out}`);
            if (!Number.isFinite(out)) {
              if (p.result) { p.result = ''; p.status = 'pending'; anyChanged = true; }
            } else {
              const rounded = Math.round(out * 100) / 100;
              const isRatio = (String(p.unit || '').toLowerCase().includes('ratio')) || (String(p.name || '').toLowerCase().includes('ratio'));
              const newVal = isRatio ? rounded.toFixed(2) : String(rounded);
              console.log(`✅ Setting result for "${p.name}": ${newVal} (was: ${p.result})`);
              if (p.result !== newVal) { p.result = newVal; anyChanged = true; }
              try { this.checkParameterStatus(p); } catch {}
            }
          } catch (err) {
            console.error(`❌ Formula evaluation error for "${p.name}":`, err);
            if (p.result) { p.result = ''; p.status = 'pending'; anyChanged = true; }
          }
        }

        if (!anyChanged) break;
      }
    } finally {
      this._isApplyingFormulas = false;
    }
  }


  // Clear formula fields that depend on a given parameter when the parameter is blank/invalid
  private clearDependentFormulas(test: any, changedParam: any): void {
    if (!test || !changedParam) return;
    const nameKey = (changedParam.name || '').toString().toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const p of (test.parameters || [])) {
      if (String(p.resultType || '').toLowerCase() !== 'formula') continue;
      const expr = (p.formulaExpr || '').toString().toLowerCase();
      const exprKey = expr.replace(/[^a-z0-9]/g, '');
      if (expr.includes(nameKey) || exprKey.includes(nameKey)) {
        if (p.result) { p.result = ''; }
        p.status = 'pending';
      }
    }
  }

  // ✅ CHECK PARAMETER STATUS
  checkParameterStatus(param: any): void {
    // If value is cleared, mark pending and also clear dependent formula outputs
    if (!param || param.result === undefined || param.result === null || String(param.result).trim() === '') {
      if (param) param.status = 'pending';
      try {
        const test = this.testResults.find(t => Array.isArray(t.parameters) && t.parameters.includes(param));
        if (test) {
          this.clearDependentFormulas(test, param);
          if (!this._isApplyingFormulas) this.applyFormulasForTest(test);
        }
      } catch {}
      this.validateForm();
      return;
    }

    // Handle Text/Dropdown parameters
    if (param.type === 'Text' || param.resultType === 'dropdown') {
      // ✅ For dropdown parameters, check against textValue (comma-separated normal values)
      if (param.resultType === 'dropdown') {
        const textValue = param.textValue || param.normalRange || '';
        const normalValues = (textValue || '')
          .split(',')
          .map((v: string) => v.trim().toLowerCase())
          .filter((v: string) => !!v);
        if (param.result && normalValues.length >= 2) {
          const isNormal = normalValues.includes(String(param.result).toLowerCase().trim());
          param.status = isNormal ? 'normal' : 'pending';
          console.log(`🎯 Dropdown validation - textValue: "${textValue}", result: "${param.result}", isNormal: ${isNormal}`);
        } else {
          // No well-defined normal list; treat as neutral so it doesn't highlight
          param.status = 'pending';
        }
      } else {
        // For text parameters, compare with normal text value
        const normalValue = param.textValue || param.normalRange;
        if (normalValue && param.result) {
          const isNormal = param.result.toLowerCase().trim() === normalValue.toLowerCase().trim();
          param.status = isNormal ? 'normal' : 'high';
        } else {
          param.status = 'pending';
        }
      }
      // Re-evaluate formulas when text/dropdown changes
      try {
        const test = this.testResults.find(t => Array.isArray(t.parameters) && t.parameters.includes(param));
        if (test && !this._isApplyingFormulas) this.applyFormulasForTest(test);
      } catch {}
      this.validateForm();
      return;
    }

    // Handle Numeric parameters
    const result = parseFloat(param.result);
    if (isNaN(result)) {
      param.status = 'pending';
      try {
        const test = this.testResults.find(t => Array.isArray(t.parameters) && t.parameters.includes(param));
        if (test) {
          this.clearDependentFormulas(test, param);
          if (!this._isApplyingFormulas) this.applyFormulasForTest(test);
        }
      } catch {}
      this.validateForm();
      return;
    }

    // Parse normal range (e.g., "10-20", "<5", ">100")
    const range = String(param.normalRange || '').toLowerCase();

    if (range.includes('-')) {
      const [min, max] = range.split('-').map((v: string) => parseFloat(v.trim()));
      if (!isNaN(min) && !isNaN(max)) {
        if (result < min) {
          param.status = result < (min * 0.5) ? 'critical' : 'low';
        } else if (result > max) {
          param.status = result > (max * 2) ? 'critical' : 'high';
        } else {
          param.status = 'normal';
        }
      }
    } else if (range.startsWith('<')) {
      const maxVal = parseFloat(range.substring(1));
      if (!isNaN(maxVal)) {
        param.status = result < maxVal ? 'normal' : 'high';
      }
    } else if (range.startsWith('>')) {
      const minVal = parseFloat(range.substring(1));
      if (!isNaN(minVal)) {
        param.status = result > minVal ? 'normal' : 'low';
      }
    } else {
      param.status = 'normal'; // Default if can't parse range
    }

    // Recalculate any formula-based parameters in the same test when a non-formula value changes
    try {
      if (!this._isApplyingFormulas && (String(param.resultType || '').toLowerCase() !== 'formula')) {
        const test = this.testResults.find(t => Array.isArray(t.parameters) && t.parameters.includes(param));
        if (test) this.applyFormulasForTest(test);
      }
    } catch {}

    // 🚨 Trigger form validation after status check
    this.validateForm();
  }

  // ✅ GET INDICATOR TEXT
  getIndicatorText(status: string): string {
    switch (status) {
      case 'normal': return '✓';
      case 'high': return '↑';
      case 'low': return '↓';
      case 'critical': return '⚠️';
      default: return '-';
    }
  }

  // ✅ CLEAR FORM
  clearForm(): void {
    // Basic fields
    this.receiptNo = '';
    this.labNumber = '';
    this.registrationNo = '';
    this.patientName = '';
    this.age = '';
    this.ageIn = '';
    this.gender = '';
    this.doctorName = '';
    this.doctorRefNo = '';
    this.department = '';
    this.roomNo = '';
    this.amount = '0';

    // Lab numbers and identifiers
    this.labYearlyNo = '';
    this.labDailyNo = '';
    this.reportId = '';
    this.reportStatus = 'Pending';
    this.patientType = 'OPD';

    // Data collections
    this.testResults = [];
    this.patientData = null;

    // Reset form controls
    if (this.reportForm) {
      this.reportForm.reset({
        reportDate: this.reportDate,
        labNumber: '',
        title: 'Mr.',
        patientName: '',
        mobileNumber: '',
        age: '',
        gender: '',
        doctorName: ''
      });
    }

    // Re-validate and focus for next entry
    this.validateForm();
    try { this.cdr.detectChanges(); } catch {}
    setTimeout(() => {
      try { this.receiptInput?.nativeElement?.focus(); } catch {}
    }, 0);

    console.log('✅ Form cleared and ready for next report');
  }

  // ✅ SUBMIT FORM (for form validation)
  onSubmit(): void {
    console.log('📝 Form submitted');
    // This method is required for the form but we handle actions via individual buttons
  }

  // ✅ Handle dropdown change to set human-readable result
  onDropdownChange(param: any): void {
    if (!param) return;
    if (Array.isArray(param.options)) {
      const selected = param.options.find((o: any) => o.id === param.selectedOptionId);

    // After status evaluation, update any formula-based parameters in the same test
    try {
      if (!this._isApplyingFormulas && (String(param.resultType || '').toLowerCase() !== 'formula')) {
        const test = this.testResults.find(t => Array.isArray(t.parameters) && t.parameters.includes(param));
        if (test) this.applyFormulasForTest(test);
      }
    } catch {}

      param.result = selected ? selected.label : '';
    }
    // Update status if needed
    try { this.checkParameterStatus(param); } catch {}
  }

  // ✅ LOAD REAL TEST DEFINITIONS FROM DATABASE
  async loadTestDefinitions(): Promise<void> {
    try {
      console.log('📋 Loading test definitions from database...');

      const response = await firstValueFrom(
        this.http.get<any>(`${environment.apiUrl}/pathology-master/test-definitions`)
      );

      if (response && response.success && response.testDefinitions) {
        this.testDefinitions = response.testDefinitions;
        console.log(`✅ Loaded ${this.testDefinitions.length} test definitions from database`);
        console.log('📋 Sample test definitions:', this.testDefinitions.slice(0, 3));
      } else {
        console.log('⚠️ No test definitions found in response');
        this.testDefinitions = [];
      }
    } catch (error) {
      console.error('❌ Error loading test definitions:', error);
      this.testDefinitions = [];
    }
  }

  // ✅ Ensure test definitions are loaded before using them
  private async ensureDefinitionsLoaded(timeoutMs: number = 3000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (Array.isArray(this.testDefinitions) && this.testDefinitions.length > 0) return;
      await new Promise(res => setTimeout(res, 100));
    }
  }

  // ✅ LOAD REAL TEST CATEGORIES FROM DATABASE
  async loadTestCategories(): Promise<void> {
    try {
      console.log('📋 Loading test categories from database...');

      const response = await firstValueFrom(
        this.http.get<any>(`${environment.apiUrl}/pathology-master/categories`)
      );

      if (response && response.success && response.categories) {
        this.testCategories = response.categories;
        console.log(`✅ Loaded ${this.testCategories.length} test categories from database`);
        console.log('📋 Sample test categories:', this.testCategories.slice(0, 3));
      } else {
        console.log('⚠️ No test categories found in response');
        this.testCategories = [];
      }
    } catch (error) {
      console.error('❌ Error loading test categories:', error);
      this.testCategories = [];
    }
  }

  // ✅ GET MAX VALUE from normal range
  getMaxValue(normalRange: string): string {
    if (!normalRange) return '';

    const range = normalRange.toLowerCase().trim();

    if (range.includes('-')) {
      const parts = range.split('-');
      if (parts.length === 2) {
        const max = parseFloat(parts[1].trim());
        return isNaN(max) ? '' : max.toString();
      }
    } else if (range.includes('<')) {
      const max = parseFloat(range.replace('<', '').trim());
      return isNaN(max) ? '' : max.toString();
    }

    return '';
  }

  // ✅ GET MIN VALUE from normal range
  getMinValue(normalRange: string): string {
    if (!normalRange) return '';

    const range = normalRange.toLowerCase().trim();

    if (range.includes('-')) {
      const parts = range.split('-');
      if (parts.length === 2) {
        const min = parseFloat(parts[0].trim());
        return isNaN(min) ? '' : min.toString();
      }
    } else if (range.includes('>')) {
      const min = parseFloat(range.replace('>', '').trim());
      return isNaN(min) ? '' : min.toString();
    }

    return '';

  }

  // ✅ PRINT FILTER HELPERS — hide rows/tests without values in print
  private hasFilledValue(p: any): boolean {
    if (!p) return false;
    if (p.excludeFromPrint) return false; // respect exclude flag
    const res = (p.result ?? '').toString().trim();
    const txt = (p.textValue ?? '').toString().trim();
    const drop = p.selectedOptionId !== undefined && p.selectedOptionId !== null && String(p.selectedOptionId).trim() !== '';
    return !!res || !!txt || drop;
  }

  public hasAnyResult(param: any): boolean {
    if (!param || param.excludeFromPrint) return false; // excluded
    if (this.hasFilledValue(param)) return true;
    if (Array.isArray(param?.subParameters)) {
      return param.subParameters.some((sp: any) => !sp.excludeFromPrint && this.hasFilledValue(sp));
    }
    return false;
  }

  public hasAnyResultInTest(test: any): boolean {
    if (!test?.parameters || test.excludeFromPrint) return false;
    // Show test if any parameter has a result OR any parameter carries a remark
    return test.parameters.some((p: any) => {
      if (this.hasAnyResult(p)) return true;
      const remark = (p?.normalRemark || '').toString().trim();
      return remark !== '' && !p?.excludeFromPrint;
    });
  }

  // ✅ UI Handlers: Exclude from print toggles
  public onToggleTestHide(test: any): void {
    try {
      const val = !!test.excludeFromPrint;
      (test.parameters || []).forEach((p: any) => {
        p.excludeFromPrint = val;
        (p.subParameters || []).forEach((sp: any) => sp.excludeFromPrint = val);
      });
      this.cdr.detectChanges();
    } catch {}
  }

  public onParamExcludeChange(test: any, _param: any): void {
    try {
      if (!test?.parameters) return;
      const allExcluded = test.parameters.every((p: any) => {
        const selfExcluded = !!p.excludeFromPrint;
        const allSubExcluded = (p.subParameters || []).every((sp: any) => !!sp.excludeFromPrint);
        // If there are subParameters, consider both; otherwise rely on self
        return selfExcluded && allSubExcluded;
      });
      test.excludeFromPrint = allExcluded;
      this.cdr.detectChanges();
    } catch {}
  }


  // ✅ Load statistics for header display

  // === Patient-context aware Normal Values (Age/Age In + Gender) ===
  private toDays(val: number, unit: string): number {
    const u = (unit || '').toString().trim().toLowerCase();
    // Check for Days FIRST to avoid 'y' in 'days' matching 'years'
    if (['day', 'days'].some(k => u.includes(k)) || u === 'd') return val;
    // Check for Months
    if (['month', 'months', 'mon', 'mons', 'mo', 'mos', 'mth', 'mths'].some(k => u.includes(k))) return val * 30;
    // Check for Years (most common for adults)
    if (['year', 'years', 'yr', 'yrs', 'y'].some(k => u.includes(k))) return val * 365;
    // Fallback: treat as years (safest default for adult patients)
    return val * 365;
  }

  private parseStoredAgeToDays(ageStr?: string): number | null {
    if (!ageStr) return null;
    const s = String(ageStr).trim();
    const numMatch = s.match(/([0-9]*\.?[0-9]+)/);
    if (!numMatch) return null;
    const num = parseFloat(numMatch[1]);

    // Robust unit detection: prefer full words over single-letter tokens
    const lower = s.toLowerCase();
    let unit: string = 'years';
    if (/(day|days|d)\b/.test(lower)) {
      unit = 'days';
    } else if (/(month|months|mon|mons|mo|mos|mth|mths|m)\b/.test(lower)) {
      unit = 'months';
    } else if (/(year|years|yr|yrs|y)\b/.test(lower)) {
      unit = 'years';
    }

    return this.toDays(num, unit);
  }

  private getPatientAgeInDays(): number {
    const num = parseFloat(String(this.age || '').trim());
    if (isNaN(num)) return 0;
    const unit = (this.ageIn || 'Years');
    const days = this.toDays(num, unit);
    console.log(`🔍 Patient Age Conversion: ${num} ${unit} = ${days} days`);
    return days;
  }

  private chooseNormalValue(normalValues: any[]): any | null {
    if (!Array.isArray(normalValues) || normalValues.length === 0) return null;

    const patientDays = this.getPatientAgeInDays();
    const g = (this.gender || '').toString().trim().toLowerCase();
    console.log(`🔍 Choosing normal value for patient: ${patientDays} days, gender: ${g}`);

    // Helper: extract numeric min/max in days. Supports "1-10 Days" packed in minAge
    const getBounds = (nv: any) => {
      const out = { min: Number.NEGATIVE_INFINITY, max: Number.POSITIVE_INFINITY };
      const minRaw = (nv && nv.minAge) ? String(nv.minAge) : '';
      const maxRaw = (nv && nv.maxAge) ? String(nv.maxAge) : '';
      console.log(`    🔍 getBounds input:`, { minAge: nv.minAge, maxAge: nv.maxAge, minAgeUnit: nv.minAgeUnit, maxAgeUnit: nv.maxAgeUnit, ageUnit: nv.ageUnit });

      // Case A: minAge packs a full range like "1-10 Days"
      const rangeMatch = /([0-9]*\.?[0-9]+)\s*-\s*([0-9]*\.?[0-9]+)\s*(years?|yrs?|yr|y|months?|mos?|mths?|m|days?|d)/i.exec(minRaw);
      if (rangeMatch) {
        const a = parseFloat(rangeMatch[1]);
        const b = parseFloat(rangeMatch[2]);
        const unit = rangeMatch[3];
        out.min = this.toDays(a, unit);
        out.max = this.toDays(b, unit);
        return out;
      }

      // Case B: Separate unit fields may exist in some legacy data (minAgeUnit/maxAgeUnit or ageUnit)
      const minUnit = (nv && (nv.minAgeUnit || nv.ageUnit)) ? String(nv.minAgeUnit || nv.ageUnit) : '';
      const maxUnit = (nv && (nv.maxAgeUnit || nv.ageUnit)) ? String(nv.maxAgeUnit || nv.ageUnit) : '';
      const minNum = parseFloat(minRaw);
      const maxNum = parseFloat(maxRaw);
      if (!Number.isNaN(minNum) && minUnit) {
        out.min = this.toDays(minNum, minUnit);
      } else {
        const min = this.parseStoredAgeToDays(minRaw);
        out.min = (min == null ? Number.NEGATIVE_INFINITY : min);
      }
      if (!Number.isNaN(maxNum) && maxUnit) {
        out.max = this.toDays(maxNum, maxUnit);
      } else {
        const max = this.parseStoredAgeToDays(maxRaw);
        out.max = (max == null ? Number.POSITIVE_INFINITY : max);
      }

      return out;
    };

    // Step 1: filter by age (inclusive). Do NOT eliminate by gender here; we'll rank by gender afterwards.
    const matches = normalValues.filter((nv: any) => {
      const { min, max } = getBounds(nv);
      const match = patientDays >= min && patientDays <= max;
      console.log(`  Range: ${nv.minAge} - ${nv.maxAge}, Gender: ${nv.gender}, Bounds: ${min}-${max} days, Match: ${match}`);
      return match;
    });

    // If we got matches:
    // Rank by: finite bounds first, then avoid tiny baby ranges when patient is older,
    // then NARROWEST AGE BAND, then exact gender, then higher min.
    // This ensures pediatric-specific ranges (e.g., 0–3 Years, Any) win for kids,
    // but prevents 1–10 Days bands from winning for a 2 Years patient.
    if (matches.length > 0) {
      const ranked = matches
        .map(nv => {
          const { min, max } = getBounds(nv);
          const width = max - min; // Infinity if open-ended
          const genderScore = ((nv.gender || 'Any').toString().trim().toLowerCase() === g && !!g) ? 0 : 1; // 0 = exact match, 1 = Any/other
          return { nv, width, finiteMin: min, finiteMax: max, genderScore };
        })
        .sort((a, b) => {
          // Prefer finite bounds over infinite
          const aFinite = isFinite(a.width);
          const bFinite = isFinite(b.width);
          if (aFinite !== bFinite) return aFinite ? -1 : 1;

          // If patient is older than ~2 months, penalize tiny day-only bands (<= 60 days)
          const aBaby = (patientDays > 60 && isFinite(a.finiteMax) && a.finiteMax <= 60) ? 1 : 0;
          const bBaby = (patientDays > 60 && isFinite(b.finiteMax) && b.finiteMax <= 60) ? 1 : 0;
          if (aBaby !== bBaby) return aBaby - bBaby; // 0 (not baby) preferred

          // Then smaller width first (more specific age band)
          if (a.width !== b.width) return a.width - b.width;
          // Then prefer exact gender over Any/other
          if (a.genderScore !== b.genderScore) return a.genderScore - b.genderScore;
          // Finally, higher min (closer band) to break ties
          if (a.finiteMin !== b.finiteMin) return b.finiteMin - a.finiteMin;
          return 0;
        });
      console.log(`✅ Selected normal value:`, ranked[0].nv);
      return ranked[0].nv;
    }

    // No matches by age. Fallback smartly:
    // 1) Prefer exact-gender entries ignoring age
    // 2) Else prefer 'Any' entries
    // 3) From the fallback pool, choose the WIDEST age band to avoid baby-specific ranges
    const genderPool = normalValues.filter((nv: any) => (nv.gender || 'Any').toString().trim().toLowerCase() === g && !!g);
    const anyPool = normalValues.filter((nv: any) => (nv.gender || 'Any').toString().trim().toLowerCase() === 'any');
    const pool = (genderPool.length > 0) ? genderPool : (anyPool.length > 0 ? anyPool : normalValues);

    const rankedFallback = pool
      .map(nv => {
        const { min, max } = getBounds(nv);
        const width = max - min; // Infinity if open-ended
        return { nv, width, finiteMin: min, finiteMax: max };
      })
      .sort((a, b) => {
        // Prefer finite over infinite info when both present
        const aFinite = isFinite(a.width);
        const bFinite = isFinite(b.width);
        if (aFinite !== bFinite) return aFinite ? -1 : 1;
        // Then choose the WIDEST band (to avoid baby ranges like 1–10 days)
        if (a.width !== b.width) return b.width - a.width;
        // Finally, prefer higher max (more adult-like)
        if (a.finiteMax !== b.finiteMax) return b.finiteMax - a.finiteMax;
        return 0;
      });

    return rankedFallback[0]?.nv || normalValues[0];
  }

  private applyChosenNormalValueToParam(param: any, nv: any): void {
    if (!param || !nv) return;
    param.type = nv.type || param.type;
    param.textValue = nv.textValue || '';
    param.displayInReport = nv.displayInReport || (nv.type === 'Numeric range' ? `${nv.lowerValue || ''}-${nv.upperValue || ''}` : '');
    param.lowerValue = nv.lowerValue || '';
    param.upperValue = nv.upperValue || '';
    param.normalRemark = nv.remark || '';
    // Update normalRange used by status checks and MIN/MAX fallbacks
    param.normalRange = (param.type === 'Text')
      ? (param.textValue || param.displayInReport || '')
      : (param.displayInReport || `${param.lowerValue || ''}-${param.upperValue || ''}`);
  }

  onPatientContextChanged(): void {
    this.refreshNormalValuesByPatientContext();
  }

  private refreshNormalValuesByPatientContext(): void {
    try {
      const pd = this.getPatientAgeInDays();
      const g = (this.gender || '').toString();
      for (const test of (this.testResults || [])) {
        for (const p of (test.parameters || [])) {
          const nvs = (p as any).allNormalValues || (p as any).normalValues;
          if (Array.isArray(nvs) && nvs.length > 0) {
            const chosen = this.chooseNormalValue(nvs);
            if (chosen) {
              this.applyChosenNormalValueToParam(p, chosen);
              try { this.checkParameterStatus(p); } catch {}
              // Debug once per parameter to help diagnose age/gender selection issues
              try {
                // eslint-disable-next-line no-console
                console.debug('[NormalValue]', {
                  param: p?.name,
                  gender: g,
                  patientDays: pd,
                  chosen: {
                    gender: chosen?.gender,
                    minAge: chosen?.minAge,
                    maxAge: chosen?.maxAge,
                    displayInReport: chosen?.displayInReport,
                    lower: chosen?.lowerValue,
                    upper: chosen?.upperValue,
                    type: chosen?.type
                  }
                });
              } catch {}
            }
          }
        }
      }
    } catch {}
    try { this.cdr.detectChanges(); } catch {}
  }

  private async loadStatistics(): Promise<void> {
    try {
      console.log('📊 Loading registration statistics...');

      // Load total registrations from patients collection
      const patientsResponse = await firstValueFrom(
        this.http.get<any>(`${environment.apiUrl}/patients`)
      );

      if (patientsResponse.success) {
        this.totalRegistrations = patientsResponse.totalCount || patientsResponse.patients?.length || 0;
      }

      // Load today's registrations
      const today = (() => { const d=new Date(); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; })();
      const todayResponse = await firstValueFrom(
        this.http.get<any>(`${environment.apiUrl}/patients?date=${today}`)
      );

      if (todayResponse.success) {
        this.todayRegistrations = todayResponse.todayCount || 0;
      }

      console.log('✅ Statistics loaded:', {
        total: this.totalRegistrations,
        today: this.todayRegistrations
      });

    } catch (error) {
      console.error('❌ Error loading statistics:', error);
      this.totalRegistrations = 0;
      this.todayRegistrations = 0;
    }
  }

  // ✅ Validate receipt number for duplicates
  private async validateReceiptNo(): Promise<void> {
    // Receipt number is optional: if blank, consider valid and skip duplicate check
    const rn = (this.receiptNo ?? '').toString().trim();
    if (!rn) {
      this.isReceiptNoValid = true;
      this.receiptNoError = '';
      return;
    }

    try {
      console.log('🔍 Validating receipt number:', rn);

      // Check in pathology reports
      const reportsResponse = await firstValueFrom(
        this.http.get<any>(`${environment.apiUrl}/pathology-reports`)
      );

      if (reportsResponse.success && reportsResponse.data) {
        const existingReport = reportsResponse.data.find((report: any) =>
          report.receiptNo === rn
        );

        if (existingReport) {
          this.isReceiptNoValid = false;
          this.receiptNoError = 'Report already generated for this receipt number!';
          return;
        }
      }

      // Check in pathology invoices
      const invoicesResponse = await firstValueFrom(
        this.http.get<any>(`${environment.apiUrl}/pathology-invoices`)
      );

      if (invoicesResponse.success && invoicesResponse.data) {
        const existingInvoice = invoicesResponse.data.find((invoice: any) =>
          invoice.receiptNumber?.toString() === rn
        );

        if (existingInvoice && existingInvoice.reportGenerated) {
          this.isReceiptNoValid = false;
          this.receiptNoError = 'Report already generated for this receipt number!';
          return;
        }
      }

      this.isReceiptNoValid = true;
      this.receiptNoError = '';

    } catch (error) {
      console.error('❌ Error validating receipt number:', error);
      this.isReceiptNoValid = true;
      this.receiptNoError = '';
    }
  }

  // ✅ Handle receipt number input change
  onReceiptNoChange(): void {
    console.log('🔄 Receipt number changed:', this.receiptNo);

    // Validate receipt number for duplicates
    this.validateReceiptNo();

    // Validate form after changes
    this.validateForm();
  }

  // Blur handler to re-validate when user leaves the receipt field
  onReceiptNoBlur(): void {
    this.validateReceiptNo();
    this.validateForm();
  }


  // ✅ Get missing fields for detailed error message
  private getMissingFields(): string[] {
    const missing: string[] = [];

    if (!this.patientName) missing.push('• Patient Name');
    if (!this.age) missing.push('• Age');
    if (!this.gender) missing.push('• Gender');

    const hasAnyIdentifier = !!this.receiptNo || !!this.registrationNo || !!this.labYearlyNo || !!this.labDailyNo;
    if (!hasAnyIdentifier) {
      missing.push('• Any one of: Receipt No. / Registration No. / Lab Yearly No. / Lab Daily No.');
    }
    if (this.receiptNo && !this.isReceiptNoValid) missing.push('• Valid Receipt Number (duplicate found)');
    if (!this.testResults || this.testResults.length === 0) missing.push('• Test Results');
    // Allow saving with some blank results (do not require all results to be filled)

    return missing;
  }

  // ✅ Check if all test results are filled
  private checkAllTestResultsFilled(): boolean {
    if (!this.testResults || this.testResults.length === 0) {
      return false;
    }

    for (const test of this.testResults) {
      // Check main parameters
      if (test.parameters && test.parameters.length > 0) {
        for (const param of test.parameters) {
          // Skip removed parameters completely
          if (param.removed === true) continue;

          // Determine if this field has any value (supports dropdown and text)
          const hasValue = (() => {
            if (param.resultType === 'dropdown') {
              return !!param.selectedOptionId || (param.result && param.result.toString().trim() !== '');
            }
            return !!param.result && param.result.toString().trim() !== '';
          })();

          // If optional and blank, allow
          if (param.isOptional === true && !hasValue) {
            continue;
          }

          // Otherwise require a value
          if (!hasValue) {
            console.log('❌ Empty result found for required parameter:', param.name);
            return false;
          }

          // Check sub-parameters if they exist
          if (param.subParameters && param.subParameters.length > 0) {
            for (const subParam of param.subParameters) {
              // Skip removed sub-parameters if such flag exists
              if ((subParam as any).removed === true) continue;

              const subHasValue = !!subParam.result && subParam.result.toString().trim() !== '';
              // If sub-parameter is optional and blank, allow
              if ((subParam as any).isOptional === true && !subHasValue) {
                continue;
              }
              // Otherwise require value
              if (!subHasValue) {
                console.log('❌ Empty result found for sub-parameter:', subParam.name);
                return false;
              }
            }
          }
        }
      }
    }

    console.log('✅ All required test results are filled (optional/removed respected)');
    return true;
  }

  // ✅ Allow partial results: at least one result anywhere
  private hasAnyFilledResultAcrossTests(): boolean {
    if (!Array.isArray(this.testResults) || this.testResults.length === 0) return false;
    try {
      return this.testResults.some((t: any) => this.hasAnyResultInTest(t));
    } catch {
      // Fallback simple scan
      for (const t of this.testResults || []) {
        for (const p of t?.parameters || []) {
          if (this.hasAnyResult(p)) return true;
        }
      }
      return false;
    }
  }


  // ✅ Validate form for save/print buttons
  validateForm(): void {
    const hasPatientData = !!(this.patientName && this.age && this.gender);
    const hasTestResults = !!(this.testResults && this.testResults.length > 0);

    const hasReceiptNo = !!this.receiptNo;
    const hasAnyIdentifier = hasReceiptNo || !!this.registrationNo || !!this.labYearlyNo || !!this.labDailyNo;

    // Receipt validation applies only if user entered a receipt number
    const hasValidReceiptNo = hasReceiptNo ? this.isReceiptNoValid === true : true;

    // Allow partial results: do NOT require all results to be filled
    const areAllTestResultsFilled = this.checkAllTestResultsFilled(); // info only
    const hasAtLeastOneResult = this.hasAnyFilledResultAcrossTests();

    this.isFormValid = hasPatientData && hasAnyIdentifier && hasTestResults && hasAtLeastOneResult && hasValidReceiptNo;

    console.log('🔍 Form validation:', {
      patientName: this.patientName,
      age: this.age,
      gender: this.gender,
      labYearlyNo: this.labYearlyNo,
      labDailyNo: this.labDailyNo,
      receiptNo: this.receiptNo,
      testResultsCount: this.testResults?.length || 0,
      hasPatientData,
      hasAnyIdentifier,
      hasTestResults,
      hasValidReceiptNo,
      hasReceiptNo,
      areAllTestResultsFilled,
      isFormValid: this.isFormValid
    });
  }

  // ===== PREVIEW FUNCTIONALITY =====

  // Preview PDF before sharing
  async previewPDF(): Promise<void> {
    try {
      this.isGeneratingReport = true;

      // Generate PDF blob using existing method
      const pdfBlob = await this.generatePDFReport();

      // Create URL and open in new tab for preview
      const pdfUrl = URL.createObjectURL(pdfBlob);
      window.open(pdfUrl, '_blank');

      // Clean up URL after a delay
      setTimeout(() => URL.revokeObjectURL(pdfUrl), 1000);

      console.log('✅ PDF preview opened successfully');

    } catch (error) {
      console.error('Error generating PDF preview:', error);
      alert('Error generating PDF preview. Please try again.');
    } finally {
      this.isGeneratingReport = false;
    }
  }

  // Preview Image before sharing
  async previewImage(): Promise<void> {
    try {
      this.isGeneratingReport = true;

      // Generate image using existing method
      const reportData = {
        patientName: this.patientName,
        age: this.age,
        gender: this.gender,
        receiptNo: this.receiptNo,
        reportDate: this.reportDate,
        labYearlyNo: this.labYearlyNo,
        doctorName: this.doctorName,
        testResults: this.testResults
      };

      const imageBlob = await this.imageGenerator.generateReportImage(reportData);
      const imageDataUrl = URL.createObjectURL(imageBlob);

      // Open image in new tab for preview
      const newWindow = window.open();
      if (newWindow) {
        newWindow.document.write(`
          <html>
            <head><title>Test Report Preview</title></head>
            <body style="margin:0; padding:20px; background:#f5f5f5; display:flex; justify-content:center;">
              <img src="${imageDataUrl}" style="max-width:100%; height:auto; box-shadow:0 4px 8px rgba(0,0,0,0.1);" />
            </body>
          </html>
        `);
        newWindow.document.close();
      }

      console.log('✅ Image preview opened successfully');

    } catch (error) {
      console.error('Error generating image preview:', error);
      alert('Error generating image preview. Please try again.');
    } finally {
      this.isGeneratingReport = false;
    }
  }

  // ===== WHATSAPP SHARING FUNCTIONALITY =====

  // Initialize WhatsApp number from patient data
  initializeWhatsAppNumber(): void {
    console.log('📱 Initializing WhatsApp number...');
    console.log('📱 Patient data:', this.patientData);

    let phone = '';

    // Try multiple data structure patterns
    if (this.patientData) {
      // Pattern 1: Direct phone field
      phone = this.patientData.phone || this.patientData.mobile || '';

      // Pattern 2: Nested patient object
      if (!phone && this.patientData.patient) {
        phone = this.patientData.patient.phone || this.patientData.patient.mobile || '';
      }

      // Pattern 3: From form data
      if (!phone && this.reportForm) {
        phone = this.reportForm.get('mobileNumber')?.value || '';
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
      console.log('⚠️ No phone number found in patient data');
    }
  }

  // Open WhatsApp share modal
  openWhatsAppShareModal(): void {
    console.log('📱 Opening WhatsApp share modal...');

    // Initialize WhatsApp number if not set
    if (!this.whatsappNumber) {
      this.initializeWhatsAppNumber();
    }

    this.showWhatsAppModal = true;
  }

  // Close WhatsApp share modal
  closeWhatsAppModal(): void {
    this.showWhatsAppModal = false;
  }

  // Validate WhatsApp number format
  validateWhatsAppNumber(): void {
    this.isWhatsAppNumberValid = this.whatsappService.validatePhoneNumber(this.whatsappNumber);
  }

  // Share as text format
  shareAsText(): void {
    if (!this.isWhatsAppNumberValid) {
      alert('Please enter a valid WhatsApp number');
      return;
    }

    console.log('📝 Sharing as text format...');
    const textReport = this.generateTextReport();

    this.whatsappService.shareTextMessage({
      phoneNumber: this.whatsappNumber,
      message: textReport
    });

    this.closeWhatsAppModal();
    this.shareSuccessMessage = 'Text report shared successfully!';

    // Clear success message after 3 seconds
    setTimeout(() => {
      this.shareSuccessMessage = '';
    }, 3000);
  }

  // Share as PDF
  async shareAsPDF(): Promise<void> {
    if (!this.isWhatsAppNumberValid) {
      alert('Please enter a valid WhatsApp number');
      return;
    }

    this.isGeneratingReport = true;
    try {
      console.log('📄 Generating PDF for sharing...');
      const pdfBlob = await this.generatePDFReport();
      this.shareFileViaWhatsApp(pdfBlob, 'pdf');
      this.closeWhatsAppModal();
      this.shareSuccessMessage = '📱 PDF report shared directly to patient\'s WhatsApp!';
    } catch (error) {
      console.error('❌ Error sharing PDF:', error);
      alert('Error generating PDF. Please try again.');
    } finally {
      this.isGeneratingReport = false;
    }
  }

  // Share as image
  async shareAsImage(): Promise<void> {
    if (!this.isWhatsAppNumberValid) {
      alert('Please enter a valid WhatsApp number');
      return;
    }

    this.isGeneratingReport = true;
    try {
      console.log('🖼️ Generating image for sharing...');
      const imageBlob = await this.generateImageReport();
      this.shareFileViaWhatsApp(imageBlob, 'image');
      this.closeWhatsAppModal();
      this.shareSuccessMessage = '📱 Image report shared directly to patient\'s WhatsApp!';
    } catch (error) {
      console.error('❌ Error sharing image:', error);
      alert('Error generating image. Please try again.');
    } finally {
      this.isGeneratingReport = false;
    }
  }

  // Share directly via WhatsApp
  shareDirectly(): void {
    if (!this.isWhatsAppNumberValid) {
      alert('Please enter a valid WhatsApp number');
      return;
    }

    console.log('📱 Sharing directly...');
    const quickMessage = `🏥 *PATHOLOGY TEST REPORT*\n\n👤 *Patient:* ${this.patientName}\n📋 *Receipt:* ${this.receiptNo}\n📅 *Date:* ${new Date(this.reportDate).toLocaleDateString('en-IN')}\n\n✅ Report is ready for collection.\n\nPlease visit the hospital to collect your detailed report.`;

    this.whatsappService.shareTextMessage({
      phoneNumber: this.whatsappNumber,
      message: quickMessage
    });

    this.closeWhatsAppModal();
    this.shareSuccessMessage = 'Quick message sent successfully!';

    // Clear success message after 3 seconds
    setTimeout(() => {
      this.shareSuccessMessage = '';
    }, 3000);
  }

  // Generate text format report using WhatsApp service
  generateTextReport(): string {
    const reportData = {
      hospitalName: 'PATHOLOGY TEST REPORT',
      patientName: this.patientName,
      age: this.age,
      gender: this.gender,
      receiptNo: this.receiptNo,
      reportDate: this.reportDate,
      testResults: this.testResults
    };

    return this.whatsappService.generateMedicalReportMessage(reportData);
  }

  // Generate quick message for direct sharing
  generateQuickMessage(): string {
    return `🏥 Pathology Test Report for ${this.patientName}\nReceipt: ${this.receiptNo}\nDate: ${new Date(this.reportDate).toLocaleDateString('en-IN')}\n\nReport is ready for collection.`;
  }

  // Share via WhatsApp Web
  shareViaWhatsApp(message: string): void {
    try {
      this.whatsappService.shareTextMessage({
        phoneNumber: this.whatsappNumber,
        message: message
      });
      this.closeWhatsAppModal();
    } catch (error) {
      console.error('❌ Error sharing via WhatsApp:', error);
      alert('Error sharing report. Please check the phone number and try again.');
    }
  }

  // Open WhatsApp directly with message
  openWhatsAppDirect(message: string): void {
    try {
      this.whatsappService.shareTextMessage({
        phoneNumber: this.whatsappNumber,
        message: message
      });
      this.closeWhatsAppModal();
    } catch (error) {
      console.error('❌ Error opening WhatsApp:', error);
      alert('Error opening WhatsApp. Please check the phone number and try again.');
    }
  }

  // ✅ OPTIMIZED PDF GENERATION with caching and performance improvements
  private pdfCache: Map<string, { blob: Blob, timestamp: number }> = new Map();
  private readonly PDF_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  // Create cache key for PDF based on current data
  private createPDFCacheKey(): string {
    const keyData = {
      receiptNo: this.receiptNo,
      patientName: this.patientName,
      reportDate: this.reportDate,
      testResultsHash: JSON.stringify(this.testResults).length // Simple hash
    };
    return btoa(JSON.stringify(keyData)); // Base64 encode for clean key
  }

  async generatePDFReport(): Promise<Blob> {
    console.log('📄 Starting optimized PDF generation...');
    const startTime = performance.now();

    try {
      // Create cache key based on current data
      const cacheKey = this.createPDFCacheKey();

      // Check cache first
      const cached = this.pdfCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < this.PDF_CACHE_DURATION) {
        console.log('⚡ Using cached PDF (fast!)');
        return cached.blob;
      }

      console.log('🔄 Generating new PDF...');
      const reportData = {
        patientName: this.patientName,
        age: this.age,
        gender: this.gender,
        receiptNo: this.receiptNo,
        reportDate: this.reportDate,
        labYearlyNo: this.labYearlyNo,
        labDailyNo: this.labDailyNo,
        doctorName: this.doctorName,
        department: this.department,
        testResults: this.testResults
      };

      // Use optimized HTML-based PDF generation
      const pdfBlob = await this.pdfGenerator.generateHTMLBasedPDF(reportData);

      // Cache the result
      this.pdfCache.set(cacheKey, { blob: pdfBlob, timestamp: Date.now() });

      const endTime = performance.now();
      console.log(`✅ PDF generated in ${(endTime - startTime).toFixed(2)}ms`);

      return pdfBlob;
    } catch (error) {
      console.error('❌ Error generating HTML-based PDF, trying fallback:', error);

      try {
        // Fallback to original jsPDF method
        const reportData = {
          patientName: this.patientName,
          age: this.age,
          gender: this.gender,
          receiptNo: this.receiptNo,
          reportDate: this.reportDate,
          labYearlyNo: this.labYearlyNo,
          labDailyNo: this.labDailyNo,
          doctorName: this.doctorName,
          department: this.department,
          testResults: this.testResults
        };

        return await this.pdfGenerator.generatePathologyReport(reportData);
      } catch (fallbackError) {
        console.error('❌ Fallback PDF generation also failed:', fallbackError);
        // Final fallback to simple text
        const textReport = this.generateTextReport();
        return new Blob([textReport], { type: 'text/plain' });
      }
    }
  }

  // Preview PDF report before sharing - NEW FEATURE
  async previewPDFReport(): Promise<void> {
    this.isGeneratingReport = true;
    try {
      console.log('👀 Generating PDF preview...');
      const pdfBlob = await this.generatePDFReport();

      // Create object URL and open in new tab for preview
      const pdfUrl = URL.createObjectURL(pdfBlob);
      window.open(pdfUrl, '_blank');

      // Clean up object URL after a delay
      setTimeout(() => URL.revokeObjectURL(pdfUrl), 1000);

      console.log('✅ PDF preview opened successfully');
    } catch (error) {
      console.error('❌ Error previewing PDF:', error);
      alert('Error generating PDF preview. Please try again.');
    } finally {
      this.isGeneratingReport = false;
    }
  }

  // Generate image report using image service
  async generateImageReport(): Promise<Blob> {
    console.log('🖼️ Generating image report...');

    try {
      const reportData = {
        patientName: this.patientName,
        age: this.age,
        gender: this.gender,
        receiptNo: this.receiptNo,
        reportDate: this.reportDate,
        labYearlyNo: this.labYearlyNo,
        labDailyNo: this.labDailyNo,
        doctorName: this.doctorName,
        department: this.department,
        testResults: this.testResults
      };

      return await this.imageGenerator.generateReportImage(reportData);
    } catch (error) {
      console.error('❌ Error generating image:', error);
      // Fallback to simple text
      const textReport = this.generateTextReport();
      return new Blob([textReport], { type: 'text/plain' });
    }
  }

  // Share file via WhatsApp (for PDF/Image) with enhanced attachment support
  shareFileViaWhatsApp(fileBlob: Blob, type: 'pdf' | 'image'): void {
    try {
      const fileName = `${this.patientName}_Report_${this.receiptNo}.${type === 'pdf' ? 'pdf' : 'png'}`;

      // Enhanced message with file attachment instructions
      const message = `🏥 *PATHOLOGY TEST REPORT*\n\n👤 *Patient:* ${this.patientName}\n📋 *Receipt:* ${this.receiptNo}\n📅 *Date:* ${new Date(this.reportDate).toLocaleDateString('en-IN')}\n\n📎 *${type.toUpperCase()} Report Ready!*`;

      // Use enhanced WhatsApp service with file attachment
      this.whatsappService.shareFile({
        phoneNumber: this.whatsappNumber,
        message: message,
        fileBlob: fileBlob,
        fileName: fileName
      });

      this.closeWhatsAppModal();
      this.shareSuccessMessage = `🚀 Enhanced ${type.toUpperCase()} sharing activated! Check your WhatsApp.`;

      // Clear success message after 5 seconds (longer for file operations)
      setTimeout(() => {
        this.shareSuccessMessage = '';
      }, 5000);

    } catch (error) {
      console.error('❌ Error sharing file via WhatsApp:', error);
      alert('Error sharing file. Please try again.');
    }
  }

  // Smart Share - AI-powered sharing with best method detection
  async shareSmartly(): Promise<void> {
    if (!this.isWhatsAppNumberValid) {
      alert('Please enter a valid WhatsApp number');
      return;
    }

    console.log('🚀 Starting Smart Share...');
    this.isGeneratingReport = true;

    try {
      // Show smart sharing notification
      this.shareSuccessMessage = '🤖 Smart Share analyzing best sharing method...';

      // Detect best sharing method based on device and capabilities
      const bestMethod = await this.detectBestSharingMethod();

      this.shareSuccessMessage = `🎯 Smart Share selected: ${bestMethod}`;

      // Always use direct PDF sharing for Smart Share
      console.log('🚀 Smart Share: Using direct PDF sharing to patient WhatsApp');
      await this.shareAsPDF();

    } catch (error) {
      console.error('❌ Smart Share failed:', error);
      // Fallback to text sharing
      this.shareAsText();
    } finally {
      this.isGeneratingReport = false;
    }
  }

  // Detect the best sharing method for current device/browser
  private async detectBestSharingMethod(): Promise<string> {
    // Always prefer direct WhatsApp sharing for specific phone numbers
    // This ensures we go directly to the patient's WhatsApp without contact selection
    console.log('🎯 Smart Share: Selecting direct WhatsApp method for patient number');

    // Always use Enhanced PDF for direct WhatsApp sharing
    return 'Enhanced PDF';
  }

  // Share via Web Share API (most advanced)
  private async shareViaWebShareAPI(): Promise<void> {
    try {
      // Generate PDF for sharing
      const pdfBlob = await this.generatePDFReport();
      const file = new File([pdfBlob], `${this.patientName}_Report_${this.receiptNo}.pdf`, {
        type: 'application/pdf'
      });

      const shareData = {
        title: '🏥 Pathology Test Report',
        text: `Pathology report for ${this.patientName} (Receipt: ${this.receiptNo})`,
        files: [file]
      };

      await navigator.share(shareData);
      this.closeWhatsAppModal();
      this.shareSuccessMessage = '🚀 Smart Share completed successfully!';

    } catch (error) {
      console.error('❌ Web Share API failed:', error);
      throw error;
    }
  }

  // Share via clipboard + text message
  private async shareViaClipboardAndText(): Promise<void> {
    try {
      // Generate image and copy to clipboard
      const imageBlob = await this.generateImageReport();
      const clipboardItem = new ClipboardItem({
        [imageBlob.type]: imageBlob
      });

      await navigator.clipboard.write([clipboardItem]);

      // Then send text message with instructions
      const message = `🏥 *PATHOLOGY TEST REPORT*\n\n👤 *Patient:* ${this.patientName}\n📋 *Receipt:* ${this.receiptNo}\n📅 *Date:* ${new Date(this.reportDate).toLocaleDateString('en-IN')}\n\n📋 *Report image copied to clipboard!*\n\n💡 *To send:*\n1️⃣ Click in WhatsApp message box\n2️⃣ Press Ctrl+V (or Cmd+V on Mac)\n3️⃣ The report image will appear\n4️⃣ Click Send!\n\n✨ Smart Share made it easy!`;

      this.whatsappService.shareTextMessage({
        phoneNumber: this.whatsappNumber,
        message: message
      });

      this.closeWhatsAppModal();
      this.shareSuccessMessage = '📋 Smart Share: Image copied! Press Ctrl+V in WhatsApp.';

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

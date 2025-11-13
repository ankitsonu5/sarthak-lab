import { Component, OnInit, Input, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { LabSettingsService, LabSettings } from '../../setup/lab-setup/lab-settings.service';

interface TestParameter {
  name: string;
  value: string;
  unit: string;
  normalRange: string;
  status: 'Normal' | 'High' | 'Low' | 'Abnormal';
}

interface DisplayRow {
  kind: 'group' | 'param' | 'remark';
  name: string;
  value?: string;
  unit?: string;
  normalRange?: string;
  status?: string | null;
  level?: number; // for nested indentation if needed
  remarkText?: string; // for remark rows
}

interface TestResult {
  testName: string;
  category: string;
  parameters: TestParameter[]; // legacy flat parameters (keep for backward compatibility)
  displayRows?: DisplayRow[];  // new structured rows including groups
}

interface PatientData {
  firstName: string;
  lastName: string;
  fullName: string;
  patientName?: string;
  age: string;
  gender: string;
  phone: string;
  address: string;
  aadhaar: string;
  ageIn?: string;     // optional: 'Y' | 'M' | 'D'
  ageUnit?: string;   // optional alias
}

@Component({
  selector: 'app-pathology-print',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './pathology-print.component.html',
  styleUrls: ['./pathology-print.component.css']
})
export class PathologyPrintComponent implements OnInit {

  @Input() reportData: any = null;
  @Input() patientData: PatientData | null = null;
  @Input() testResults: TestResult[] = [];
  @Input() reportDate: string = '';
  @Input() labNumber: string = '';
  @Input() receiptNo: string = '';
  @Input() doctorName: string = '';
  @Input() department: string = '';
  @Input() labYearlyNo: string = '';
  @Input() labDailyNo: string = '';
  @Input() registrationNo: string = '';

  // Preferenced date from pathologyregistration (registrationDate)
  public pathologyRegDate: string = '';

  // Category grouping for category-wise print
  preferredCategoryOrder: string[] = ['BIOCHEMISTRY','HEMATOLOGY','SEROLOGY','URINE ANALYSIS','URINE','MICROBIOLOGY','STOOL','IMMUNOLOGY','HORMONE','OTHERS'];
  categoryGroups: Array<{ norm: string; category: string; tests: TestResult[] }> = [];

  // Inject global print CSS so @page/html/body rules apply
  private ensureGlobalPrintRules(): void {
    const id = 'global-pathology-print-rules';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.media = 'print';
    style.textContent = `
      @page { size: A4 landscape; margin: 8mm; }
      html, body { width: 297mm; height: 210mm; margin: 0 !important; padding: 0 !important; }
    `;
    document.head.appendChild(style);
  }



  // Form data properties
  patientName: string = 'Quis';
  age: string = '7';
  gender: string = 'Male';
  patientType: string = 'OPD';
  labSettings: LabSettings | null = null;


  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private labService: LabSettingsService
  ) { }


  // Fetch complete report data from server using registration number
  private async fetchReportDataFromServer(regNo: string): Promise<void> {
    try {
      const base = environment.apiUrl;
      console.log('🔍 [QR SCAN] Fetching report data for registration number:', regNo);

      // Use the new endpoint that fetches report by registration number
      const resp = await firstValueFrom(
        this.http.get<any>(`${base}/pathology-reports/by-registration/${regNo}`)
      );

      const reportData: any = resp?.data;

      if (!reportData) {
        console.error('❌ [QR SCAN] No report data found for registration number:', regNo);
        alert('No report found for this registration number!');
        return;
      }

      console.log('✅ [QR SCAN] Report data fetched successfully:', reportData);

      // Map the response to component properties
      this.registrationNo = regNo;
      this.receiptNo = reportData.receiptNo || '';
      this.labYearlyNo = reportData.labYearlyNo || '';
      this.labDailyNo = reportData.labDailyNo || '';
      this.reportDate = reportData.reportDate || new Date().toLocaleDateString('en-GB');
      this.pathologyRegDate = reportData.registrationDate || reportData.createdAt || '';
      this.doctorName = reportData.referredBy || reportData.doctorName || '';
      this.department = reportData.department || '';

      // Patient data
      const patient = reportData.patientData || {};
      this.patientData = {
        firstName: patient.firstName || '',
        lastName: patient.lastName || '',
        fullName: patient.fullName || `${patient.firstName || ''} ${patient.lastName || ''}`.trim(),
        age: patient.age || reportData.age || '',
        gender: patient.gender || reportData.gender || '',
        phone: patient.phone || '',
        address: patient.address || '',
        aadhaar: patient.aadhaar || ''
      };

      this.patientName = this.patientData.fullName;
      this.age = this.patientData.age;
      this.gender = this.patientData.gender;
      this.patientType = reportData.patientType || 'OPD';

      // Test results - map from report structure
      this.testResults = (reportData.testResults || []).map((t: any) => {
        return {
          testName: t.testName,
          category: t.category,
          parameters: Array.isArray(t.parameters) ? t.parameters : [],
          displayRows: t.displayRows || []
        };
      });

      // Build category groups
      this.buildCategoryGroups();

      // Trigger change detection
      this.cdr.detectChanges();

      // Generate QR code after data is loaded
      setTimeout(() => {
        this.generateBarcodeAndQR();
      }, 500);

    } catch (err: any) {
      console.error('❌ [QR SCAN] Error fetching report data:', err);
      alert(`Error loading report: ${err?.error?.message || err?.message || 'Unknown error'}`);
    }
  }

  // Fetch registrationDate from server if we didn't receive it via router state
  private async ensureRegistrationDateFromServer(): Promise<void> {
    try {
      const base = environment.apiUrl;
      let resp: any = null;

      if (this.receiptNo) {
        resp = await firstValueFrom(this.http.get<any>(`${base}/pathology-registration/receipt/${this.receiptNo}`));
      } else if (this.labYearlyNo) {
        resp = await firstValueFrom(this.http.get<any>(`${base}/pathology-registration/yearly/${this.labYearlyNo}`));
      } else if (this.labDailyNo) {
        resp = await firstValueFrom(this.http.get<any>(`${base}/pathology-registration/daily/${this.labDailyNo}`));
      } else if (this.registrationNo) {
        resp = await firstValueFrom(this.http.get<any>(`${base}/pathology-registration/registration/${this.registrationNo}`));
      }

      const inv: any = resp?.invoice || resp?.data || resp;
      const regDate: any = inv?.registrationDate || inv?.pathologyRegistration?.registrationDate || inv?.createdAt;
      if (regDate && !this.pathologyRegDate) {
        this.pathologyRegDate = regDate;
        try { this.cdr.detectChanges(); } catch {}
      }
    } catch (err) {
      console.warn('\u26a0\ufe0f Could not resolve registrationDate from server:', err);
    }
  }

  ngOnInit(): void {
    // Ensure global print rules exist for consistent sizing
    this.ensureGlobalPrintRules();
    // Clear any stale pagination markers from previous navigations
    setTimeout(() => this.clearPaginationMarks(), 0);

    // Load Lab Settings (cache + refresh)
    try {
      const cached = localStorage.getItem('labSettings');
      if (cached) this.labSettings = JSON.parse(cached);
    } catch {}
    try {
      this.labService.getMyLab().subscribe({
        next: (res) => { this.labSettings = res.lab || this.labSettings; try { this.cdr.detectChanges(); } catch {} },
        error: () => {}
      });
    } catch {}

    // Check for query parameter (regNo) - used when QR code is scanned
    this.route.queryParams.subscribe(params => {
      const regNo = params['regNo'];
      if (regNo) {
        console.log('📱 QR Code scanned! Loading report for registration number:', regNo);
        this.fetchReportDataFromServer(regNo);
        return; // Skip router state processing
      }
    });

    // Check if data is passed from router state
    const navigation = this.router.getCurrentNavigation();
    const state = navigation?.extras?.state || history.state;

    const triggerAutoPrint: boolean = !!(state && (state as any).triggerAutoPrint);
    const navigateAfterPrint: { path?: string; queryParams?: any } | null = (state && (state as any).navigateAfterPrint) ? (state as any).navigateAfterPrint : null;


    if (state && state.reportData) {
      console.log('📄 Received report data for printing:', state.reportData);

      // Use data from router state
      const reportData = state.reportData;
      this.patientData = reportData.patientData || null;
      this.testResults = (reportData.testResults && Array.isArray(reportData.testResults)) ? reportData.testResults : [];
      // Respect exclude flags coming from edit page
      this.testResults = (this.testResults || []).filter((t: any) => !t?.excludeFromPrint);
      this.reportDate = reportData.reportDate || new Date().toLocaleDateString('en-GB');
      this.labNumber = reportData.labNumber || '';
      this.labYearlyNo = reportData.labYearlyNo || '';
      this.labDailyNo = reportData.labDailyNo || '';
      this.receiptNo = reportData.receiptNo || '';
      this.registrationNo = reportData.registrationNo || '';
      this.doctorName = reportData.doctorName || '';
      this.department = reportData.department || '';

      // Take registration date strictly from pathologyregistration when available
      this.pathologyRegDate = (reportData?.registrationDate
        || (reportData as any)?.pathologyRegistration?.registrationDate
        || (this.patientData as any)?.registrationDate
        || (this.patientData as any)?.createdAt
        || '') as string;
      // Trigger change detection to ensure preview updates immediately
      if (this.pathologyRegDate) {
        try { this.cdr.detectChanges(); } catch {}
      }

      // If registration date not provided in state, resolve from server using available keys
      if (!this.pathologyRegDate) {
        this.ensureRegistrationDateFromServer();
      }


      // Map form data properties from Test Report form and patient snapshot
      const pd = this.patientData || {} as any;
      const nameFromPatient = pd.fullName || [pd.firstName, pd.lastName].filter(Boolean).join(' ');
      this.patientName = reportData.patientName || nameFromPatient || '';
      this.age = reportData.age || pd.age || '';
      this.gender = reportData.gender || pd.gender || '';
      const rawType = (reportData.patientType || reportData.type || reportData.addressType || pd?.mode || pd?.registrationMode || '').toString().trim().toUpperCase();
      this.patientType = rawType === 'IPD' ? 'IPD' : 'OPD';

      // Build structured rows preserving group sections (e.g., Physical, Chemical, Microscopy)
      // Also honor groupBy and outerGroup coming from Test Report (panel/included tests)
      this.testResults = (this.testResults || []).map((t: any) => {
        let rows: DisplayRow[] = [];

        const params = Array.isArray(t.parameters) ? t.parameters.filter((p: any) => !p?.excludeFromPrint) : [];
        const hasGroupMeta = params.some((p: any) => !!(p && (p.groupBy || p.outerGroup)));

        if (hasGroupMeta) {
          // 1) Partition by outerGroup in order of first appearance
          const normalize = (s: any) => (s || '').toString().trim();
          const outerOrder: string[] = [];
          const perOuter: Record<string, any[]> = {};
          params.forEach((p: any, idx: number) => {
            const og = normalize(p.outerGroup);
            if (!(og in perOuter)) { perOuter[og] = []; outerOrder.push(og); }
            perOuter[og].push({ ...p, __idx: idx });
          });

          // 2) Emit rows per outer group, then by groupBy within it
          outerOrder.forEach((og) => {
            const list = perOuter[og];
            const baseLevel = og ? 0 : -1; // if og present, show as level 0 group
            if (og) rows.push({ kind: 'group', name: og, level: Math.max(baseLevel, 0) });

            // Group by groupBy label preserving first appearance
            const buckets = new Map<string, { label: string; items: any[] }>();
            const orderedKeys: string[] = [];
            const ungrouped: any[] = [];
            list.forEach((p: any) => {
              const raw = normalize(p.groupBy);
              if (!raw) { ungrouped.push(p); return; }
              const key = raw.toLowerCase();
              if (!buckets.has(key)) { buckets.set(key, { label: raw.trim(), items: [] }); orderedKeys.push(key); }
              buckets.get(key)!.items.push(p);
            });

            // Emit each group except when item is from simple included tests (noGroupByFallback flag used upstream)
            orderedKeys.forEach((key) => {
              const bucket = buckets.get(key)!;
              if (bucket.label && bucket.label.toString().trim()) {
                rows.push({ kind: 'group', name: bucket.label, level: og ? 1 : 0 });
              }
              const items = bucket.items.sort((a: any, b: any) => (a.order ?? a.__idx ?? 0) - (b.order ?? b.__idx ?? 0));
              items.forEach((p: any) => {
                const value = p.value ?? p.result ?? '';
                const rawStatus = (p.status || '').toString();
                const derivedStatus = this.deriveStatus(value, p.normalRange || p.referenceRange || '');
                const finalStatus = rawStatus || derivedStatus || '';
                rows.push({
                  kind: 'param',
                  name: p.name || '',
                  value,
                  unit: p.unit || '',
                  normalRange: p.normalRange || p.referenceRange || p.textValue || '',
                  status: finalStatus,
                  level: og ? 2 : 1
                });
              });
            });

            // Emit ungrouped items
            ungrouped.sort((a: any, b: any) => (a.order ?? a.__idx ?? 0) - (b.order ?? b.__idx ?? 0))
              .forEach((p: any) => {
                const value = p.value ?? p.result ?? '';
                const rawStatus = (p.status || '').toString();
                const derivedStatus = this.deriveStatus(value, p.normalRange || p.referenceRange || '');
                const finalStatus = rawStatus || derivedStatus || '';
                rows.push({
                  kind: 'param',
                  name: p.name || '',
                  value,
                  unit: p.unit || '',
                  normalRange: p.normalRange || p.referenceRange || p.textValue || '',
                  status: finalStatus,
                  level: og ? 1 : 0
                });
                // Inject remark row if present for this parameter
                const remark = (p?.normalRemark || '').toString().trim();
                if (remark) {
                  rows.push({ kind: 'remark', name: p.name || '', remarkText: remark, level: og ? 1 : 0 });
                }
              });
          });
        } else {
          // Fallback: walk nested tree (parameters/subParameters) and synthesize groups when needed
          const walkRows: DisplayRow[] = [];
          const pushItem = (node: any, level: number = 0) => {
            if (!node) return;
            if (node.excludeFromPrint) return; // skip excluded nodes
            const hasChildren = Array.isArray(node.parameters) || Array.isArray(node.subParameters);
            const isGroup = hasChildren && !('value' in node) && !('result' in node);

            if (isGroup) {
              walkRows.push({ kind: 'group', name: node.name || node.groupName || '', level });
            } else {
              const value = node.value ?? node.result ?? '';
              const rawStatus = (node.status || '').toString();
              const derivedStatus = this.deriveStatus(value, node.normalRange || node.referenceRange || '');
              const finalStatus = rawStatus || derivedStatus || '';
              walkRows.push({
                kind: 'param',
                name: node.name || node.parameterName || '',
                value,
                unit: node.unit || '',
                normalRange: node.normalRange || node.referenceRange || node.textValue || '',
                status: finalStatus,
                level
              });
              // Inject remark row under this parameter if present
              const remark = (node?.normalRemark || '').toString().trim();
              if (remark) {
                walkRows.push({ kind: 'remark', name: node.name || node.parameterName || '', remarkText: remark, level });
              }
            }
            const children = [ ...(node.parameters || []), ...(node.subParameters || []) ]
              .filter((c: any) => !c?.excludeFromPrint);
            children.forEach(child => pushItem(child, level + (isGroup ? 1 : 0)));
          };

          const roots = [ ...(t.parameters || []), ...(t.subParameters || []) ];
          roots.forEach(n => pushItem(n, 0));

          rows = walkRows;

          // If no explicit groups present, synthesize groups for common panels (e.g., Urine R/M)
          const hasGroups = rows.some(r => r.kind === 'group');
          const testName = (t.testName || t.name || '').toString().toUpperCase();
          const categoryName = (t.category || '').toString().toUpperCase();
          if (!hasGroups && (testName.includes('URINE') || categoryName.includes('URINE'))) {
            const norm = (s: any) => (s || '').toString().trim().toUpperCase();
            const allParams = rows.filter(r => r.kind === 'param');
            const byName = new Map(allParams.map(p => [norm(p.name), p]));

            const physicalOrder = ['COLOR', 'APPEARANCE', 'SPECIFIC GRAVITY'];
            const chemicalOrder = ['PH', 'PROTEIN', 'GLUCOSE', 'KETONE', 'BILE SALTS', 'BILE PIGMENTS', 'UROBILINOGEN', 'NITRITE', 'LEUKOCYTE ESTERASE'];
            const microscopyOrder = ['RBC', 'PUS CELLS', 'EPITHELIAL CELLS', 'CASTS', 'CRYSTALS', 'BACTERIA', 'YEAST', 'OTHERS'];

            const grouped: DisplayRow[] = [];
            const pushGroup = (title: string, order: string[]) => {
              const picked = order.map(o => byName.get(norm(o))).filter(Boolean) as DisplayRow[];
              if (picked.length > 0) {
                grouped.push({ kind: 'group', name: title, level: 0 });
                picked.forEach(p => grouped.push({ ...p, level: 1 }));
              }
            };

            pushGroup('PHYSICAL', physicalOrder);
            pushGroup('CHEMICAL', chemicalOrder);
            pushGroup('MICROSCOPY', microscopyOrder);

            // Add any remaining params not covered by mapping
            const covered = new Set(grouped.filter(x => x.kind === 'param').map(x => norm(x.name)));
            const leftovers = allParams.filter(p => !covered.has(norm(p.name)));
            if (leftovers.length) {
              grouped.push({ kind: 'group', name: 'OTHER', level: 0 });
              leftovers.forEach(p => grouped.push({ ...p, level: 1 }));
            }

            rows = grouped;
          }
        }

        // Fallback flat parameters for compatibility
        const flatParams = rows.filter(r => r.kind === 'param').map(r => ({
          name: r.name,
          value: r.value || '',
          unit: r.unit || '',
          normalRange: r.normalRange || '',
          status: (r.status || '') as any
        }));

        return {
          testName: t.testName || t.name || '',
          category: t.category || '',
          parameters: flatParams,
          displayRows: rows
        } as TestResult;
      });

      console.log('🔍 Patient Data:', this.patientData);
      console.log('🔍 Form Data:', {
        patientName: this.patientName,
        age: this.age,
        gender: this.gender,
        patientType: this.patientType,
        labYearlyNo: this.labYearlyNo,
        labDailyNo: this.labDailyNo,
        registrationNo: this.registrationNo
      });

    } else {
      console.log('📄 No report data received, using default data');


      if (!this.reportDate) {
        this.reportDate = new Date().toLocaleDateString('en-GB');
      }
      if (!this.labNumber) {
        this.labNumber = '363635';
      }
      if (!this.receiptNo) {
        this.receiptNo = '50';
      }
      if (!this.registrationNo) {
        this.registrationNo = '78';
      }
      if (!this.labYearlyNo) {
        this.labYearlyNo = '';
      }
      if (!this.labDailyNo) {
        this.labDailyNo = '';
      }
      if (!this.doctorName) {
        this.doctorName = 'DR DEEPIKA GUPTA';
      }
      if (!this.department) {
        this.department = 'PATHOLOGY';
      }

      // Default fallback for print preview when no data passed
      if (!this.pathologyRegDate) {
        this.pathologyRegDate = this.reportDate;
      }
    }

	    // Build groups after inputs are normalized
	    this.buildCategoryGroups();

    // Generate barcode and QR code automatically on component load
    setTimeout(() => {
      this.generateBarcodeAndQR();
    }, 500);

    // Auto print and navigate back if requested via router state
    if (triggerAutoPrint) {
      const doNavigate = () => {
        if (navigateAfterPrint && navigateAfterPrint.path) {
          // Return to list WITHOUT carrying filters (e.g., focusReceipt) so full table shows
          this.router.navigate([navigateAfterPrint.path]);
        } else {
          this.router.navigate(['/pathology-module/all-reports']);
        }
      };

      const onAfterPrint = () => {
        window.removeEventListener('afterprint', onAfterPrint as any);
        doNavigate();
      };

      // Wait for fonts and header logo image before printing to avoid intermittent missing logo
      const waitForAssets = async () => {
        try {
          // Wait for fonts (where supported)
          const anyDoc: any = document as any;
          if (anyDoc?.fonts?.ready) {
            await anyDoc.fonts.ready;
          }
        } catch {}

        // Wait for the header logo image in DOM if present
        await new Promise<void>((resolve) => {
          try {
            const imgEl = document.querySelector('.govt-logo') as HTMLImageElement | null;
            if (imgEl && imgEl.complete && imgEl.naturalWidth > 0) {
              resolve();
              return;
            }
            const done = () => resolve();
            if (imgEl) {
              imgEl.addEventListener('load', done, { once: true });
              imgEl.addEventListener('error', done, { once: true });
              // Fallback timeout
              setTimeout(done, 800);
            } else {
              // As a fallback, preload the logo explicitly
              const preload = new Image();
              preload.onload = () => resolve();
              preload.onerror = () => resolve();
              preload.src = 'assets/images/myupgov.png';
              setTimeout(resolve, 800);
            }
          } catch {
            resolve();
          }
        });

        // Give the layout a tick
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      };

      window.addEventListener('afterprint', onAfterPrint as any);

      (async () => {
        await waitForAssets();
        // Prepare pagination to avoid splitting any row
        this.preparePagination();
        window.print();
      })();
    }
  }

  // Generate QR code automatically when component loads (in header)
  private generateBarcodeAndQR(): void {
    const anyWin: any = window as any;

    // Check if QR code should be shown (default: false, only show if explicitly enabled)
    if (this.labSettings?.printLayout?.showQr !== true) {
      console.log('ℹ️ QR code disabled in lab settings');
      return;
    }

    // Build URL for QR code that opens the report directly
    const regNo = this.registrationNo || this.receiptNo || this.labYearlyNo || this.labDailyNo || '';

    if (!regNo) {
      console.warn('⚠️ No registration number available for QR code generation');
      return;
    }

    // Create URL that will open the report in print view
    // Use current host and port to generate the URL
    const currentUrl = window.location.origin; // e.g., http://localhost:4201
    const reportUrl = `${currentUrl}/pathology-module/print?regNo=${encodeURIComponent(regNo)}`;

    const qrValue = reportUrl;

    console.log('🔢 Generating QR code with report URL:', qrValue);

    // Generate QR Code in header
    const generateQR = () => {
      try {
        const qrContainer = document.getElementById('headerQRCode');
        if (qrContainer && anyWin.QRCode) {
          qrContainer.innerHTML = ''; // Clear existing
          new anyWin.QRCode(qrContainer, {
            text: qrValue,
            width: 80,
            height: 80,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: anyWin.QRCode?.CorrectLevel?.H || 2
          });
          console.log('✅ QR Code generated successfully in header');
        }
      } catch (err) {
        console.warn('⚠️ QR code generation failed:', err);
      }
    };

    // Load QR Code library if not loaded
    const loadQRCode = () => {
      return new Promise<void>((resolve) => {
        if (anyWin.QRCode) {
          resolve();
          return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js';
        script.onload = () => {
          console.log('✅ QRCode library loaded');
          resolve();
        };
        script.onerror = () => {
          console.warn('⚠️ Failed to load QRCode library');
          resolve();
        };
        document.head.appendChild(script);
      });
    };

    // Load library and generate QR code
    loadQRCode().then(() => {
      setTimeout(() => {
        generateQR();
      }, 100);
    });
  }

  // Compute page-breaks so that no table row is split across pages
  private preparePagination(): void {
    try {
      this.clearPaginationMarks();

      const mmToPx = (mm: number) => mm * 3.7795275591; // 96dpi
      const pageHeightPx = mmToPx(297); // A4 height (portrait)
      const footerPx = mmToPx(32); // more reserved for footer/signature area
      const safetyPx = mmToPx(10);  // bigger guard so nothing ever touches footer

      const theadEl = document.querySelector('table.report-table thead') as HTMLElement | null;
      const firstPageHeaderBlock = document.querySelector('.report-header-block') as HTMLElement | null;
      const theadHeight = theadEl ? Math.ceil(theadEl.getBoundingClientRect().height) : 0;
      const firstHeaderExtra = firstPageHeaderBlock ? Math.ceil(firstPageHeaderBlock.getBoundingClientRect().height) : 0;

      // available body space per page
      const bodyPerPagePx = Math.max(100, pageHeightPx - theadHeight - footerPx - safetyPx);
      const firstPageBodyPx = Math.max(100, pageHeightPx - firstHeaderExtra - theadHeight - footerPx - safetyPx);

      const rows = Array.from(document.querySelectorAll('table.report-table tbody tr')) as HTMLElement[];
      let remaining = firstPageBodyPx;

      const nextHeight = (idx: number) => {
        const r = rows[idx + 1] as HTMLElement | undefined;
        return r ? Math.ceil(r.getBoundingClientRect().height) : 0;


      };

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row.offsetParent) continue; // skip not-in-flow
        const h = Math.ceil(row.getBoundingClientRect().height) || 0;
        if (h <= 0) continue;

        // Avoid orphan headers at page bottom: if this is a category/testname header,
        // ensure at least one following row fits with it; otherwise, move header to next page
        const isHeader = row.classList.contains('category-row') || row.classList.contains('testname-row') || row.classList.contains('group-row');
        const required = isHeader ? h + nextHeight(i) : h;

        if (required > remaining) {
          row.classList.add('page-break-before');
          remaining = bodyPerPagePx - h; // placed at new page; consume its own height
        } else {
          remaining -= h;
        }
      }
    } catch (e) {
      console.warn('preparePagination skipped due to error', e);
    }
  }

  private clearPaginationMarks(): void {
    document.querySelectorAll('tr.page-break-before').forEach(el => el.classList.remove('page-break-before'));
  }

  // ---- Category grouping helpers ----
  private normalizeCategory(input: any): string {
    const s = (input ?? '').toString().trim();
    return s ? s.toUpperCase() : 'OTHERS';
  }
  private toTitleCase(input: any): string {
    const s = (input ?? '').toString();
    if (!s.trim()) return 'Others';
    return s.split(' ').map((w: string) => w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : '').join(' ').trim();
  }
  private buildCategoryGroups(): void {
    try {
      const filtered = (this.testResults || []).filter(t => this.hasAnyValueInTest(t));
      const map = new Map<string, { norm: string; category: string; tests: TestResult[] }>();
      for (const t of filtered) {
        const norm = this.normalizeCategory((t as any).category);
        const display = this.toTitleCase((t as any).category);
        if (!map.has(norm)) map.set(norm, { norm, category: display, tests: [] });
        map.get(norm)!.tests.push(t);
      }
      const arr = Array.from(map.values());
      const pref = this.preferredCategoryOrder;
      arr.sort((a, b) => {
        const ai = pref.indexOf(a.norm);
        const bi = pref.indexOf(b.norm);
        const aa = ai === -1 ? Number.MAX_SAFE_INTEGER : ai;
        const bb = bi === -1 ? Number.MAX_SAFE_INTEGER : bi;
        if (aa !== bb) return aa - bb;
        return a.category.localeCompare(b.category);
      });
      this.categoryGroups = arr;
    } catch {
      this.categoryGroups = [];
    }
  }

  // Print function: keep the full page so component styles apply in print
  printReport(): void {
    const anyDoc: any = document as any;
    const anyWin: any = window as any;

    const barcodeVal = this.registrationNo || (this as any).reportData?.registrationNo || (this as any).patientData?.regNo || '';

    const doPrint = () => {
      // Run pagination logic just before printing
      this.preparePagination();
      window.print();

      // Navigate back after print (if navigation info was provided)
      const navigation = this.router.getCurrentNavigation();
      const state = navigation?.extras?.state || history.state;
      const navigateAfterPrint = (state && (state as any).navigateAfterPrint) ? (state as any).navigateAfterPrint : null;

      const onAfterPrint = () => {
        window.removeEventListener('afterprint', onAfterPrint as any);
        if (navigateAfterPrint && navigateAfterPrint.path) {
          this.router.navigate([navigateAfterPrint.path]);
        } else {
          this.router.navigate(['/pathology-module/all-reports']);
        }
      };
      window.addEventListener('afterprint', onAfterPrint as any);
    };

    const ensureAssetsThenPrint = () => {
      const imgEl = document.querySelector('.govt-logo') as HTMLImageElement | null;
      const waitPromises: Promise<any>[] = [];
      if (anyDoc?.fonts?.ready) waitPromises.push(anyDoc.fonts.ready);
      if (imgEl && !(imgEl.complete && imgEl.naturalWidth > 0)) {
        waitPromises.push(new Promise(res => {
          const done = () => res(null);
          imgEl.addEventListener('load', done, { once: true });
          imgEl.addEventListener('error', done, { once: true });
          setTimeout(done, 800);
        }));
      }
      if (waitPromises.length) {
        Promise.all(waitPromises).then(() => setTimeout(doPrint, 0));
      } else {
        doPrint();
      }
    };

    // Load QRCode library first
    const loadQRCode = () => {
      return new Promise<void>((resolve) => {
        if ((anyWin as any).QRCode) {
          resolve();
          return;
        }
        const qrScript = document.createElement('script');
        qrScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
        qrScript.onload = () => resolve();
        qrScript.onerror = () => resolve(); // Continue even if QR fails
        document.head.appendChild(qrScript);
      });
    };

    const renderQRCode = () => {
      try {
        // Generate QR code in header (right side)
        const qrContainer = document.getElementById('headerQRCode');
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

    // Load QR code and print
    loadQRCode().then(() => {
      renderQRCode();
      setTimeout(() => {
        ensureAssetsThenPrint();
      }, 100);
    }).catch(() => {
      // If QR code fails, still print
      ensureAssetsThenPrint();
    });
  }

  // Get status class for highlighting (value cell)
  getStatusClass(status: string): string {
    const s = this.normalizeStatus(status);
    switch (s) {
      case 'High':
        return 'high-value';
      case 'Low':
        return 'low-value';
      case 'Abnormal':
        return 'abnormal-value';
      case 'Normal':
        return 'normal-value';
      default:
        return '';
    }
  }

  // Row-level class when any non-normal status should darken the whole row
  getRowStatusClass(status: string): string {
    const s = this.normalizeStatus(status);
    switch (s) {
      case 'High':
      case 'Low':
      case 'Abnormal':
        return 'row-abnormal';
      default:
        return '';
    }
  }

  // Normalize different status casings/aliases coming from editor (e.g., 'high', 'critical')
  private normalizeStatus(status: string | null | undefined): string {
    const s = (status || '').toString().trim().toLowerCase();
    if (!s) return '';
    if (s === 'normal' || s === 'n') return 'Normal';
    if (s === 'high' || s === 'h') return 'High';
    if (s === 'low' || s === 'l') return 'Low';
    if (['abnormal','abn','ab','critical','crit','c'].includes(s)) return 'Abnormal';
    return '';
  }

  // Derive a status from value and normal range if not explicitly provided
  private deriveStatus(value: any, normalRange: string): string {
    if (value === null || value === undefined) return '';
    const valStr = String(value).trim();
    if (valStr === '') return '';
    const range = (normalRange || '').toString().trim().toLowerCase();

    // Try numeric comparison
    const vNum = parseFloat(valStr);
    if (!isNaN(vNum)) {
      if (range.includes('-')) {
        const parts = range.split('-');
        const min = parseFloat(parts[0].trim());
        const max = parseFloat(parts[1].trim());
        if (!isNaN(min) && !isNaN(max)) {
          if (vNum < min) return 'Low';
          if (vNum > max) return 'High';
          return 'Normal';
        }
      } else if (range.startsWith('<')) {
        const max = parseFloat(range.slice(1).trim());
        if (!isNaN(max)) return vNum < max ? 'Normal' : 'High';
      } else if (range.startsWith('>')) {
        const min = parseFloat(range.slice(1).trim());
        if (!isNaN(min)) return vNum > min ? 'Normal' : 'Low';
      }
    }

    // Text/dropdown normal values (comma-separated)
    if (range) {
      const normals = range.split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
      if (normals.length) {
        return normals.includes(valStr.toLowerCase()) ? 'Normal' : 'Abnormal';
      }
    }
    return '';
  }

  // Format patient name with proper case (guards against undefined/null tokens)
  formatName(name: string): string {
    if (!name) return '';
    const parts = String(name)
      .split(' ')
      .map(p => p && p.trim())
      .filter(p => p && p.toLowerCase() !== 'undefined' && p.toLowerCase() !== 'null');
    return parts
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  // Format Age with unit like '12 Y', '6 M', '10 D'
  formatAgeWithUnit(age: any, unit: any): string {
    const raw = (age ?? '').toString().trim();
    if (!raw) return '';

    // If already in form '12 Y' or '12Y' just normalize to include a space
    const already = raw.match(/^(\d+(?:\.\d+)?)\s*([YyMmDd])$/);
    if (already) {
      return `${already[1]} ${already[2].toUpperCase()}`;
    }

    // Determine unit
    let u = (unit ?? '').toString().trim().toUpperCase();
    if (u.startsWith('Y')) u = 'Y';
    else if (u.startsWith('M')) u = 'M';
    else if (u.startsWith('D')) u = 'D';
    else u = 'Y'; // default years if unspecified

    // Extract numeric part
    const num = raw.replace(/[^0-9.]/g, '');
    return num ? `${num} ${u}` : `${raw} ${u}`;
  }

  // Normalize gender to full word
  formatGender(input: any): string {
    const s = (input ?? '').toString().trim();
    if (!s) return '';
    const u = s.toUpperCase();
    if (u === 'M' || u === 'MALE') return 'Male';
    if (u === 'F' || u === 'FEMALE') return 'Female';
    if (u === 'O' || u === 'OTHER' || u === 'OTHERS') return 'Other';
    // Title-case fallback
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }

  // Format any incoming date string to dd/mm/yyyy and keep it timezone safe
  formatReportDate(input: any): string {
    if (!input) return '';
    const pad = (n: number) => (n < 10 ? '0' + n : String(n));
    const s = String(input).trim();

    const toDMY = (d: number, m: number, y: number) => `${pad(d)}/${pad(m)}/${y}`;

    // Try common delimited formats first to avoid timezone shifts
    const trySplit = (sep: string) => {
      if (!s.includes(sep)) return '';
      const parts = s.split(sep).map(p => p.trim());
      if (parts.length !== 3) return '';
      // YYYY-MM-DD or YYYY/MM/DD
      if (parts[0].length === 4) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const d = parseInt(parts[2], 10);
        if (y && m && d) return toDMY(d, m, y);
      }
      // DD-MM-YYYY or DD/MM/YYYY
      if (parts[2].length === 4) {
        const d = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const y = parseInt(parts[2], 10);
        if (y && m && d) return toDMY(d, m, y);
      }
      return '';
    };

    const splitDash = trySplit('-');
    if (splitDash) return splitDash;
    const splitSlash = trySplit('/');
    if (splitSlash) return splitSlash;

    // ISO-like strings: pick date part to avoid timezone shifts
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
    if (iso) {
      const y = parseInt(iso[1], 10);
      const m = parseInt(iso[2], 10);
      const d = parseInt(iso[3], 10);
      if (y && m && d) return toDMY(d, m, y);
    }
    // Fallback to Date parsing (last resort)
    const dt = new Date(s);
    if (!isNaN(dt.getTime())) {
      return toDMY(dt.getDate(), dt.getMonth() + 1, dt.getFullYear());
    }

    // As-is if nothing worked
    return s;
  }

  // Show only parameters that have a filled value (non-empty after trim)
  public hasRowValue(row: { value?: any } | null | undefined): boolean {
    if (!row) return false;
    const v = (row.value ?? '').toString().trim();
    return v !== '';
  }

  // Treat comma or newline as line breaks for normalRange display in print
  public splitRange(range: any): string[] {
    const s = (range ?? '').toString();
    if (!s.trim()) return [];
    const tokens = s
      .split(/[,\n]/g)
      .map((p: string) => p.trim())
      .filter((p: string) => p.length > 0)
      // Suppress placeholder dashes like '-', '–', '—'
      .filter((p: string) => !(p === '-' || p === '–' || p === '—'));
    return tokens;
  }

  // Check if a remark row belongs to the given parameter row (scans forward until next sibling)
  public hasAttachedRemark(rows: Array<{ kind: string; level?: number; remarkText?: any }>, paramIndex: number, paramLevel: number = 0): boolean {
    if (!rows?.length || paramIndex < 0 || paramIndex >= rows.length) return false;
    const baseLevel = paramLevel ?? 0;
    for (let j = paramIndex + 1; j < rows.length; j++) {
      const r: any = rows[j];
      // stop when we reach next param or a group at same/lesser level
      if (r?.kind === 'param') break;
      if (r?.kind === 'group' && (r.level ?? 0) <= baseLevel) break;
      if (r?.kind === 'remark' && !!(r.remarkText ?? '').toString().trim()) return true;
    }
    return false;
  }

  // Decide if a parameter row should be printed
  // Rule: Print if it has a RESULT OR if it has an attached REMARK (even if result empty)
  public paramShouldPrint(rows: Array<{ kind: string; level?: number }>, index: number, row: any): boolean {
    return this.hasRowValue(row) || this.hasAttachedRemark(rows as any, index, row?.level ?? 0);
  }

  // Show a test block if it contains at least one parameter with a RESULT (non-empty) OR any remark row
  public hasAnyValueInTest(test: { displayRows?: Array<{ kind: string; value?: any; normalRange?: any; remarkText?: any }> } | null | undefined): boolean {
    const rows = (test?.displayRows || []) as Array<{ kind: string; value?: any; normalRange?: any; remarkText?: any }>;
    return rows.some(r =>
      (r && r.kind === 'param' && this.hasRowValue(r)) ||
      (r && r.kind === 'remark' && !!(r.remarkText ?? '').toString().trim())
    );
  }

  // For a given group row index, check if there exists at least one parameter
  // within that group's scope that has a non-empty RESULT or any remark row.
  // This prevents printing empty group headings.
  public hasGroupAnyValue(rows: Array<{ kind: string; level?: number; value?: any }> = [], groupIndex: number): boolean {
    if (!rows.length || groupIndex < 0 || groupIndex >= rows.length) return false;
    const group = rows[groupIndex];
    if (!group || group.kind !== 'group') return false;
    const baseLevel = group.level ?? 0;
    for (let j = groupIndex + 1; j < rows.length; j++) {
      const r = rows[j];
      if (r.kind === 'group' && (r.level ?? 0) <= baseLevel) break; // next sibling or parent group reached
      if ((r.kind === 'param' && this.hasRowValue(r)) || (r.kind === 'remark' && !!(r as any).remarkText?.toString().trim())) return true; // found a result or remark inside group
    }
    return false;
  }


}

import { Component, OnInit, OnDestroy, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Subscription } from 'rxjs';
import { DataRefreshService } from '../../core/services/data-refresh.service';
import { environment } from '../../../environments/environment';
import { LabSettingsService, LabSettings } from '../../setup/lab-setup/lab-settings.service';
import { DefaultLabConfigService } from '../../core/services/default-lab-config.service';

interface PathologyReport {
  _id: string;
  reportId: string;
  receiptNo: string;
  registrationNo: string;
  labYearlyNo: string;
  labDailyNo: string;
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
  reportStatus: string;
  createdAt: string;
  testResults: any[];
  type?: string; // OPD or IPD
}

@Component({
  selector: 'app-reports-records',
  templateUrl: './reports-records.component.html',
  styleUrls: ['./reports-records.component.css'],
  standalone: false
})
export class ReportsRecordsComponent implements OnInit, OnDestroy {
  @ViewChild('recordsTable') recordsTable!: ElementRef;
  // Data
  allReports: PathologyReport[] = [];
  allOpdRecords: any[] = [];
  filteredData: any[] = [];
  totalRecords = 0;
  isLoading = false;

  // Filter Properties
  fromDate = '';
  toDate = '';
  receiptNoFilter = '';
  recordTypeFilter = '';
  categoryFilter = '';

  // Category options and lookup maps
  categories: Array<{ _id: string; name: string; categoryId?: string }> = [];
  private testCategoryById: Record<string, string> = {};
  private testCategoryByName: Record<string, string> = {};

  // Legacy properties (keeping for compatibility)
  showReportForm = false;
  reportType = 'all';
  selectedDate = new Date().toISOString().split('T')[0];
  selectedMonth = new Date().toISOString().slice(0, 7);
  selectedYear = new Date().getFullYear().toString();
  reportData: any[] = [];
  reportStats = {
    totalReports: 0,
    totalPatients: 0,
    totalTests: 0,
    dateRange: ''
  };

  // Pagination (50 per page as requested)
  pageSize = 50;
  currentPage = 1;
  get totalPages(): number { return Math.max(1, Math.ceil(this.filteredData.length / this.pageSize)); }
  get pagedData(): any[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredData.slice(start, start + this.pageSize);
  }

  prevPage() { if (this.currentPage > 1) this.currentPage--; }
  nextPage() { if (this.currentPage < this.totalPages) this.currentPage++; }

  // Age with unit for display (Year/Month/Day)
  getAgeWithUnit(record: any): string {
    if (!record) return '';
    const existing = (record?.patientData?.age || record?.patient?.age || record?.age || '').toString().trim();
    if (/^\d+\s*[YMD]$/i.test(existing)) return existing.toUpperCase();

    const age = existing.replace(/[^0-9]/g, '');
    const rawUnit = (record?.patientData?.ageIn || record?.patient?.ageIn || record?.ageIn || '')
      .toString()
      .trim()
      .toUpperCase();

    const unit = rawUnit === 'Y' || rawUnit.startsWith('YEAR') ? 'Year'
      : (rawUnit === 'M' || rawUnit.startsWith('MON')) ? 'Month'
      : (rawUnit === 'D' || rawUnit.startsWith('DAY')) ? 'Day'
      : '';

    return age ? `${age}${unit ? ' ' + unit : ''}` : existing;
  }

  private subscription = new Subscription();

  // Lab settings for dynamic logo
  labSettings: LabSettings | null = null;

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private dataRefresh: DataRefreshService,
    private labService: LabSettingsService,
    public defaultLabConfig: DefaultLabConfigService
  ) {}

  ngOnInit(): void {
    this.loadLabSettings();
    this.loadAllData();

    // Auto-refresh on relevant events with debounce to prevent multiple rapid calls
    this.subscription.add(
      this.dataRefresh.onEntityRefresh('pathology').subscribe(() => {
        // Debounce multiple rapid refresh calls
        clearTimeout(this.refreshTimeout);
        this.refreshTimeout = setTimeout(() => {
          this.loadAllData();
        }, 500); // 500ms debounce
      })
    );
  }

  private loadLabSettings(): void {
    // Load from cache first
    try {
      const cached = localStorage.getItem('labSettings');
      if (cached) {
        this.labSettings = JSON.parse(cached);
      }
    } catch {}

    // Then fetch fresh data
    this.labService.getMyLab().subscribe({
      next: (res) => {
        this.labSettings = res.lab || this.labSettings;
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  private refreshTimeout: any;

  ngOnDestroy(): void {
    // Clear timeout to prevent memory leaks
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
    }
    // Unsubscribe from all subscriptions
    this.subscription.unsubscribe();
  }

  async loadAllData(): Promise<void> {
    this.isLoading = true;
    try {
      // Load reports and test definitions (for Category filter)
      await Promise.all([
        this.loadPathologyReports(),
        this.loadTestDefinitionsForFilter()
      ]);

      this.combineAndFilterData();
      this.cdr.detectChanges();


    } catch (err) {
      console.error('Error loading data:', err);
      alert('Error loading records');
    } finally {
      this.isLoading = false;
    }
  }

  async loadPathologyReports(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.http.get<any>(`${environment.apiUrl}/pathology-reports`)
      );

      if (response.success) {
        // Set initial reports
        this.allReports = response.data.map((report: any) => ({
          ...report,
          type: report.type || '' // will fill from registration
        }));

        // Enrich with correct OPD/IPD from pathology-registration using yearly/daily no
        await Promise.all(
          this.allReports.map(async (r, idx) => {
            try {
              const mode = await this.fetchRegistrationMode(r.labYearlyNo, r.labDailyNo);
              this.allReports[idx].type = mode || 'OPD';
            } catch {
              this.allReports[idx].type = this.allReports[idx].type || 'OPD';
            }
          })
        );
      }
    } catch (err) {
      console.error('Error loading pathology reports:', err);
      this.allReports = [];
    }
  }

  private async fetchRegistrationMode(labYearlyNo?: any, labDailyNo?: any): Promise<string> {
    try {
      if (labYearlyNo) {


        const res = await firstValueFrom(this.http.get<any>(`${environment.apiUrl}/pathology-registration/yearly/${labYearlyNo}`));
        return (res?.invoice?.registrationMode || '').toUpperCase();
      }
      if (labDailyNo) {
        const res = await firstValueFrom(this.http.get<any>(`${environment.apiUrl}/pathology-registration/daily/${labDailyNo}`));
        return (res?.invoice?.registrationMode || '').toUpperCase();
      }
      return '';
    } catch {
      return '';
    }
  }

  async loadOpdRecords(): Promise<void> {
    try {
      // Load OPD appointments/registrations
      const response = await firstValueFrom(
        this.http.get<any>(`${environment.apiUrl}/appointments`)
      );

      if (response.success || response.appointments) {
        const appointments = response.appointments || response.data || [];
        this.allOpdRecords = appointments.map((appointment: any) => ({
          _id: appointment._id,
          receiptNo: appointment.appointmentId || appointment._id,
          registrationNo: appointment.registrationNo || appointment.patientId,
          labYearlyNo: '',
          labDailyNo: '',
          patientData: {
            firstName: appointment.patientName?.split(' ')[0] || appointment.firstName || '',
            lastName: appointment.patientName?.split(' ').slice(1).join(' ') || appointment.lastName || '',
            fullName: appointment.patientName || `${appointment.firstName || ''} ${appointment.lastName || ''}`.trim(),
            age: appointment.age?.toString() || '',
            gender: appointment.gender || '',
            phone: appointment.phone || appointment.contact || ''
          },
          department: appointment.department?.name || appointment.departmentName || '',
          doctor: appointment.doctor?.name || appointment.doctorName || '',
          reportDate: appointment.appointmentDate || appointment.createdAt,
          reportStatus: 'Completed',
          createdAt: appointment.createdAt,
          testResults: [],
          type: 'OPD'
        }));
      }
    } catch (err) {


      console.error('Error loading OPD records:', err);
      this.allOpdRecords = [];
    }
  }

  combineAndFilterData(): void {
    // Use only pathology reports; do not include OPD appointment rows
    const combinedData = [
      ...this.allReports
    ];

    // Sort by date (newest first)
    combinedData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    this.totalRecords = combinedData.length;
    this.filteredData = combinedData;
    this.applyFilters();
  }

  applyFilters(): void {
    let filtered = [...this.allReports];

    // Date range filter
    if (this.fromDate) {
      filtered = filtered.filter(record => {
        const recordDate = new Date(record.reportDate || record.createdAt);
        return recordDate >= new Date(this.fromDate);
      });
    }

    if (this.toDate) {
      filtered = filtered.filter(record => {
        const recordDate = new Date(record.reportDate || record.createdAt);
        return recordDate <= new Date(this.toDate + 'T23:59:59');
      });
    }



    // Receipt number filter
    if (this.receiptNoFilter) {
      filtered = filtered.filter(record =>
        record.receiptNo?.toLowerCase().includes(this.receiptNoFilter.toLowerCase())
      );
    }

    // Type filter
    if (this.recordTypeFilter) {
      filtered = filtered.filter(record => record.type === this.recordTypeFilter);
    }

    // Category filter (by test category)
    if (this.categoryFilter) {
      filtered = filtered.filter(record => {
        const tests = Array.isArray(record.testResults) ? record.testResults : [];
        return tests.some((t: any) => {
          const id = t?.testId || t?._id || t?.testDefinitionId || t?.id;
          const nameKey = String(t?.testName || t?.name || '').toLowerCase().trim();
          const catId = (id && this.testCategoryById[id]) || (nameKey && this.testCategoryByName[nameKey]);
          return catId === this.categoryFilter;
        });
      });
    }

    // Sort by date (newest first)
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    this.filteredData = filtered;
    this.cdr.detectChanges();
  }

  clearFilters(): void {
    this.fromDate = '';
    this.toDate = '';
    this.receiptNoFilter = '';
    this.recordTypeFilter = '';
    this.categoryFilter = '';
    this.applyFilters();
  }

  refreshData(): void {
    this.loadAllData();
  }

  getTestNamesShort(testResults: any[]): string {
    if (!testResults || !Array.isArray(testResults)) return '';
    const names = testResults.map((t: any) => t?.testName || t?.name || '').filter(Boolean);
    const joined = names.join(', ');
    return joined.length > 120 ? joined.slice(0, 117) + '…' : joined;
  }
  @ViewChild('pdfHeader', { static: false }) pdfHeaderRef!: ElementRef;

  @ViewChild('printSection', { static: false }) printSectionRef!: ElementRef;


  printReport(): void {
    // Ensure logo and fonts are ready to avoid intermittent missing logo
    const anyDoc: any = document as any;
    const promises: Promise<any>[] = [];
    if (anyDoc?.fonts?.ready) promises.push(anyDoc.fonts.ready);

    const imgEl = document.querySelector('.govt-logo') as HTMLImageElement | null;
    if (imgEl && !(imgEl.complete && imgEl.naturalWidth > 0)) {
      promises.push(new Promise((res) => {
        const done = () => res(null);


        imgEl.addEventListener('load', done, { once: true });
        imgEl.addEventListener('error', done, { once: true });
        setTimeout(done, 800);
      }));
    }

    if (promises.length) {
      Promise.all(promises).then(() => setTimeout(() => window.print(), 0));
    } else {
      window.print();
    }
  }

  // Keep same pattern as Daily Cash Summary
  private decideOrientation(): 'portrait' | 'landscape' {
    // Fixed landscape to fit all columns clearly
    return 'landscape';
  }

  private determineFontSize(): 9 | 10 | 11 {
    // If there are many rows or long test names, use smaller font
    const maxLen = Math.max(
      0,
      ...this.filteredData.map(r => (this.getTestNamesShort(r?.testResults || '') || '').length)
    );
    if (maxLen > 140) return 9;
    if (maxLen > 100) return 10;
    return 11;
  }

  async generateReportPDF(): Promise<void> {
    try {
      if (!this.filteredData || this.filteredData.length === 0) {
        alert('No data to generate PDF');
        return;
      }

      // Use html2pdf to export exactly what is on screen (header + table + signature)
      if (!(window as any).html2pdf) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
          script.onload = () => resolve();
          script.onerror = () => reject('Failed to load html2pdf');
          document.body.appendChild(script);
        });
      }
      const html2pdf = (window as any).html2pdf;

      const container = document.querySelector('.reports-records-container') as HTMLElement | null;
      if (!container) return;

      // Mark for PDF export styles (hide filters/buttons/pagination, enforce tight table)
      container.classList.add('pdf-export');
      const tableEl = container.querySelector('table') as HTMLElement | null;
      const prev = tableEl ? { w: tableEl.style.width, mw: tableEl.style.minWidth, fs: getComputedStyle(tableEl).fontSize } : null;
      if (tableEl) {
        tableEl.style.width = '100%';
        tableEl.style.minWidth = '100%';
        (tableEl.style as any).fontSize = `${this.determineFontSize()}px`;
      }

      const orientation = this.decideOrientation();
      const opt = {
        margin: [6, 4, 6, 4],
        filename: `Reports-Records-${new Date().toISOString().slice(0,10)}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation },
        pagebreak: { mode: ['css', 'legacy'], avoid: ['tr','td'] }
      } as any;

      await html2pdf().from(container).set(opt).save();

      // cleanup
      container.classList.remove('pdf-export');
      if (tableEl && prev) {
        tableEl.style.width = prev.w || '';
        tableEl.style.minWidth = prev.mw || '';
        (tableEl.style as any).fontSize = prev.fs || '';
      }
    } catch (error) {
      console.error('❌ Error generating PDF:', error);
      alert('Error generating PDF');
    }
  }


  // Load test definitions to build Category options and lookup
  private async loadTestDefinitionsForFilter(): Promise<void> {
    try {
      const res = await firstValueFrom(this.http.get<any>(`${environment.apiUrl}/pathology-master/test-definitions`));
      const defs = res?.testDefinitions || [];

      // Build category options (unique)
      const catMap = new Map<string, { _id: string; name: string; categoryId?: string }>();
      this.testCategoryById = {};
      this.testCategoryByName = {};

      for (const d of defs) {
        const catObj = d?.category || null;
        const catId: string = (typeof catObj === 'object' && catObj?._id) ? catObj._id : (typeof d?.category === 'string' ? d.category : '');
        const catName: string = (typeof catObj === 'object' && (catObj?.name || catObj?.categoryName)) || '';

        if (catId) {
          if (!catMap.has(catId)) catMap.set(catId, { _id: catId, name: catName || catId, categoryId: catObj?.categoryId });
        }

        const defId: string = d?._id || d?.testId || '';
        const defNameKey = String(d?.name || d?.testName || '').toLowerCase().trim();
        if (defId && catId) this.testCategoryById[defId] = catId;
        if (defNameKey && catId) this.testCategoryByName[defNameKey] = catId;
      }

      this.categories = Array.from(catMap.values()).sort((a,b) => (a.name||'').localeCompare(b.name||''));
    } catch (e) {
      console.error('Error loading test definitions for Category filter:', e);
      this.categories = [];
      this.testCategoryById = {};
      this.testCategoryByName = {};
    }
  }

}

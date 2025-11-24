import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { CategoryHeadService, CategoryHead } from '../../setup/category-heads/services/category-head.service';
import { DefaultLabConfigService } from '../../core/services/default-lab-config.service';
import { LabSettingsService, LabSettings } from '../../setup/lab-setup/lab-settings.service';

interface PivotRow {
  receiptNumber: number;
  receiptDate: string;
  amountsByCategory: { [categoryName: string]: number };
  total: number;
}

@Component({
  selector: 'app-daily-cash-summary',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './daily-cash-summary.component.html',
  styleUrls: ['./daily-cash-summary.component.css']
})
export class DailyCashSummaryComponent implements OnInit {
  // Filters
  todayDate = '';
  fromDate = '';
  toDate = '';
  selectedMonth: string = 'all';
  selectedYear: string = '';

  // Data
  categories: CategoryHead[] = [];
  rows: PivotRow[] = [];

  // Totals per category
  columnTotals: { [categoryName: string]: number } = {};
  grandTotal = 0;

  isLoading = false;
  labSettings: LabSettings | null = null;

  constructor(
    private http: HttpClient,
    private categoryHeadService: CategoryHeadService,
    private cdr: ChangeDetectorRef,
    public defaultLabConfig: DefaultLabConfigService,
    private labService: LabSettingsService
  ) {
    const today = new Date();
    this.todayDate = this.formatDateForInput(today);
    this.fromDate = this.formatDateForInput(today);
    this.toDate = this.formatDateForInput(today);
    this.selectedYear = String(today.getFullYear());
  }

  ngOnInit(): void {
    // Load lab settings
    try {
      const cached = localStorage.getItem('labSettings');
      if (cached) this.labSettings = JSON.parse(cached);
    } catch {}
    this.labService.getMyLab().subscribe({
      next: (res) => {
        this.labSettings = res.lab || this.labSettings;
        this.cdr.detectChanges();
      },
      error: () => {}
    });

    this.generateReport();
  }

  formatDateForInput(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  onMonthFilterChange(): void {
    if (this.selectedMonth !== 'all') {
      const y = parseInt(this.selectedYear, 10);
      const m = parseInt(this.selectedMonth, 10);
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0);
      this.fromDate = this.formatDateForInput(start);
      this.toDate = this.formatDateForInput(end);
    }
  }

  private parseDateOnly(dt: any): Date | null {
    if (!dt) return null;
    const d = new Date(dt);
    if (isNaN(d.getTime())) return null;
    return d;
  }

  getReportTitle(): string {
    return this.selectedMonth === 'all' ? 'Daily Cash Summary' : 'Monthly Cash Summary';
  }

  getFormattedRangeText(): string {
    if (this.selectedMonth !== 'all') {
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const m = parseInt(this.selectedMonth, 10);
      return `${monthNames[m - 1]} ${this.selectedYear}`;
    }
    if (this.fromDate && this.toDate) {
      const f = new Date(this.fromDate).toLocaleDateString('en-GB');
      const t = new Date(this.toDate).toLocaleDateString('en-GB');
      return `${f} to ${t}`;
    }
    return new Date(this.todayDate).toLocaleDateString('en-GB');
  }

  generateReport(): void {
    this.isLoading = true;
    this.rows = [];
    this.columnTotals = {};
    this.grandTotal = 0;

    // 1) Load categories first
    this.categoryHeadService.getCategoryHeads(100, true).subscribe({
      next: (cats) => {
        // Keep only active or all, sorted by name
        this.categories = (cats || []).slice().sort((a, b) => (a.categoryName || '').localeCompare(b.categoryName || ''));

        // 2) Fetch invoices list (limit high for day)
        const url = `${environment.apiUrl}/pathology-invoice/list?limit=10000000`;
        this.http.get<any>(url).subscribe({
          next: (resp) => {
            const invoices: any[] = resp?.invoices || [];

            // Build date range
            let start: Date | null = null;
            let end: Date | null = null;
            if (this.selectedMonth !== 'all') {
              const y = parseInt(this.selectedYear, 10);
              const m = parseInt(this.selectedMonth, 10);
              start = new Date(y, m - 1, 1);
              start.setHours(0, 0, 0, 0);
              end = new Date(y, m, 0);
              end.setHours(23, 59, 59, 999);
            } else if (this.fromDate || this.toDate) {
              if (this.fromDate) { start = new Date(this.fromDate); start.setHours(0,0,0,0); }
              if (this.toDate) { end = new Date(this.toDate); end.setHours(23,59,59,999); }
            } else {
              const t = new Date();
              start = new Date(t); start.setHours(0,0,0,0);
              end = new Date(t); end.setHours(23,59,59,999);
            }

            const inRange = (d: Date | null) => {
              if (!d) return false;
              if (start && d < start) return false;
              if (end && d > end) return false;
              return true;
            };

            // Include invoices whose ORIGINAL date (min of payment/booking/created) OR any adjustment falls in range; exclude CANCELLED/unpaid
            const filtered = invoices.filter(inv => {
              const origDatesArr = [inv?.payment?.paymentDate, inv?.bookingDate, inv?.createdAt]
                .map(dt => this.parseDateOnly(dt))
                .filter(Boolean) as Date[];
              const originalDate = origDatesArr.length ? new Date(Math.min(...origDatesArr.map(d => d.getTime()))) : null;
              const inPeriodOriginal = inRange(originalDate);
              const hasAdjustmentInPeriod = Array.isArray(inv?.payment?.adjustments)
                ? inv.payment.adjustments.some((a: any) => inRange(this.parseDateOnly(a?.at)))
                : false;
              const notCancelled = String(inv?.status || '').toUpperCase() !== 'CANCELLED';
              const isPaid = String(inv?.payment?.paymentStatus || 'PAID').toUpperCase() === 'PAID';
              return (inPeriodOriginal || hasAdjustmentInPeriod) && notCancelled && isPaid;
            });

            // Build pivot per receipt
            const rowsMap = new Map<number, PivotRow>();

            for (const inv of filtered) {
              // Precompute original date and any adjustments within selected range
              const origDatesArr2 = [inv?.payment?.paymentDate, inv?.bookingDate, inv?.createdAt]
                .map(dt => this.parseDateOnly(dt))
                .filter(Boolean) as Date[];
              const originalDate = origDatesArr2.length ? new Date(Math.min(...origDatesArr2.map(d => d.getTime()))) : null;
              const isOriginalInRange = originalDate ? inRange(originalDate) : false;

              const rangeAdjustments = Array.isArray(inv?.payment?.adjustments)
                ? inv.payment.adjustments.filter((a: any) => inRange(this.parseDateOnly(a?.at)))
                : [];
              const netDelta = rangeAdjustments.reduce((sum: number, a: any) => sum + Number(a?.delta || 0), 0);

              // Decide the date to display in the row
              let displayDate: Date | null = null;
              if (isOriginalInRange) {
                displayDate = originalDate;
              } else if (rangeAdjustments.length) {
                const adjDates = rangeAdjustments
                  .map((a: any) => this.parseDateOnly(a?.at))
                  .filter(Boolean) as Date[];
                if (adjDates.length) {
                  displayDate = new Date(Math.min(...adjDates.map(d => d.getTime())));
                }
              }

              const rno: number = Number(inv.receiptNumber || inv.invoiceNumber || 0);
              if (!rno) continue;

              const displayDateToUse: Date | null = (displayDate || originalDate || this.parseDateOnly(inv?.payment?.paymentDate) || this.parseDateOnly(inv?.createdAt));

              if (!rowsMap.has(rno)) {
                rowsMap.set(rno, {
                  receiptNumber: rno,
                  receiptDate: displayDateToUse ? displayDateToUse.toLocaleDateString('en-GB') : '',
                  amountsByCategory: {},
                  total: 0
                });
              }
              const row = rowsMap.get(rno)!;

              // Build current category totals from tests
              const tests: any[] = Array.isArray(inv.tests) ? inv.tests : (Array.isArray(inv.selectedTests) ? inv.selectedTests : []);
              const currentByCat: { [k: string]: number } = {};
              let currentTotal = 0;
              for (const t of tests) {
                const cat = String(t.category || t.categoryName || '').trim().toUpperCase();
                if (!cat) continue;
                const amount = Number(t.netAmount ?? t.amount ?? t.cost ?? 0) || 0;
                if (!currentByCat[cat]) currentByCat[cat] = 0;
                currentByCat[cat] += amount;
                currentTotal += amount;
              }

              // Decide contribution for the selected range
              if (isOriginalInRange) {
                // Count full invoice amounts for the day of original payment
                for (const cat of Object.keys(currentByCat)) {
                  const amt = currentByCat[cat];
                  if (!row.amountsByCategory[cat]) row.amountsByCategory[cat] = 0;
                  row.amountsByCategory[cat] += amt;
                  if (!this.columnTotals[cat]) this.columnTotals[cat] = 0;
                  this.columnTotals[cat] += amt;
                  row.total += amt;
                  this.grandTotal += amt;
                }
              } else if (Math.abs(netDelta) > 0) {
                // Allocate entire net delta to a single department
                // Rule: if one category present -> that one; if many -> pick dominant (max amount);
                // if none present (e.g., all tests removed) -> fallback to 'PATHOLOGY'
                const cats = Object.keys(currentByCat);
                let targetCat = 'PATHOLOGY';
                if (cats.length === 1) {
                  targetCat = cats[0];
                } else if (cats.length > 1) {
                  let maxAmt = -Infinity;
                  for (const c of cats) {
                    const amt = Number(currentByCat[c] || 0);
                    if (amt > maxAmt) { maxAmt = amt; targetCat = c; }
                  }
                }
                // Apply integer delta for clean display
                const deltaInt = Math.round(netDelta);
                if (!row.amountsByCategory[targetCat]) row.amountsByCategory[targetCat] = 0;
                row.amountsByCategory[targetCat] += deltaInt;
                if (!this.columnTotals[targetCat]) this.columnTotals[targetCat] = 0;
                this.columnTotals[targetCat] += deltaInt;
                row.total += deltaInt;
                this.grandTotal += deltaInt;
              }
            }

            // Finalize rows sorted by receiptNumber desc (latest first as per user pref)
            this.rows = Array.from(rowsMap.values()).sort((a, b) => b.receiptNumber - a.receiptNumber);

            this.isLoading = false;
            this.cdr.detectChanges();

	            // 🔄 Try to reconcile with backend totals, but only override if backend looks valid
	            try {
	              const todayISO = new Date(new Date().getTime() - new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
	              const params: any = {};
	              if (this.selectedMonth !== 'all') {
	                params.filterType = 'month';
	                params.month = this.selectedMonth;
	                params.year = this.selectedYear;
	              } else if (this.fromDate || this.toDate) {
	                params.filterType = 'range';
	                if (this.fromDate) params.fromDate = this.fromDate;
	                if (this.toDate) params.toDate = this.toDate;
	              } else {
	                params.filterType = 'range';
	                params.fromDate = todayISO;
	                params.toDate = todayISO;
	              }
	              this.http.get<any>(`${environment.apiUrl}/reports/daily-cash`, { params })
	                .subscribe({
	                  next: (data) => {
	                    // Build backend totals map
	                    const backendTotals: { [k: string]: number } = {};
	                    const cats = Array.isArray(data?.categories) ? data.categories : [];
	                    for (const c of cats) {
	                      const name = String(c?.name || c?._id || '').trim().toUpperCase();
	                      if (!name) continue;
	                      backendTotals[name] = Number(c?.totalAmount || 0);
	                    }

	                    const backendGrand = Number(data?.totalAmount ?? 0);

	                    // Only override if backend actually has any non-zero OR our pivot is all zero
	                    const backendAnyNonZero = backendGrand !== 0 || Object.values(backendTotals).some(v => Number(v) !== 0);
	                    const pivotAnyNonZero = this.grandTotal !== 0 || Object.values(this.columnTotals).some(v => Number(v) !== 0);

		                    // Preserve refund-aware pivot totals: skip backend override when pivot already has any non-zero values
		                    if (this.grandTotal !== 0 || Object.values(this.columnTotals).some(v => Number(v) !== 0)) {
		                      // Pivot has data (possibly with refunds). Do not override with backend aggregate.
		                      return;
		                    }

	                    if (backendAnyNonZero || !pivotAnyNonZero) {
	                      this.grandTotal = backendGrand;
	                      this.columnTotals = backendTotals;
	                      this.cdr.detectChanges();
	                    } // else keep pivot totals (handles refund-only days correctly)
	                  },
	                  error: (e) => console.warn('⚠️ Failed to reconcile totals from backend', e)
	                });
	            } catch (e) {
	              console.warn('⚠️ Reconcile totals error', e);
	            }

          },
          error: (err) => {
            console.error('Error loading invoices:', err);
            this.isLoading = false;
            this.cdr.detectChanges();
            alert('Error loading invoices.');
          }
        });
      },
      error: (err) => {
        console.error('Error loading category heads:', err);
        this.isLoading = false;
        this.cdr.detectChanges();
        alert('Error loading categories.');
      }
    });
  }

  // Decide orientation based on number of categories to keep one page like Monthly OPD
  private setPrintClass(cls: 'portrait' | 'landscape') {
    document.documentElement.classList.remove('portrait','landscape');
    document.documentElement.classList.add(cls);
  }

  private decideOrientation(): 'portrait' | 'landscape' {
    const count = this.categories?.length || 0;
    return count > 7 ? 'landscape' : 'portrait';
  }

  private determineFontSize(): 8 | 9 | 10 | 11 | 12 {
    const count = this.categories?.length || 0;
    if (count > 16) return 8;
    if (count > 12) return 9;
    if (count > 9) return 10;
    return 11;
  }

  printAuto(): void {
    // hide filters temporarily
    const searchSection = document.querySelector('.search-section') as HTMLElement | null;
    const pageTitle = document.querySelector('.page-title') as HTMLElement | null;
    if (searchSection) searchSection.style.display = 'none';
    if (pageTitle) pageTitle.style.display = 'none';

    const mode = this.decideOrientation();
    this.setPrintClass(mode);

    // Inject temporary @page rule and tighten table
    const style = document.createElement('style');
    style.setAttribute('media','print');
    style.textContent = `@page { size: A4 ${mode}; margin: 8mm; }`;
    document.head.appendChild(style);

    const container = document.getElementById('daily-cash-summary-pdf');
    const tableEl = container?.querySelector('table') as HTMLElement | null;
    const prev = tableEl ? { w: tableEl.style.width, mw: tableEl.style.minWidth, fs: getComputedStyle(tableEl).fontSize } : null;
    if (tableEl) {
      tableEl.style.width = '100%';
      tableEl.style.minWidth = '100%';
      (tableEl.style as any).fontSize = `${this.determineFontSize()}px`;
    }

    const cleanup = () => {
      try { document.head.removeChild(style); } catch {}
      if (tableEl && prev) {
        tableEl.style.width = prev.w || '';
        tableEl.style.minWidth = prev.mw || '';
        (tableEl.style as any).fontSize = prev.fs || '';
      }
      if (searchSection) searchSection.style.display = '';
      if (pageTitle) pageTitle.style.display = '';
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);

    window.print();
  }

  async downloadPdf(): Promise<void> {
    const target = document.getElementById('daily-cash-summary-pdf');
    if (!target) return;

    // Load html2pdf at runtime if not present
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

    const orientation = this.decideOrientation();
    const opt = {
      margin: [6,4,6,4],
      filename: `Daily-Cash-Summary-${this.getFormattedRangeText()}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation },
      pagebreak: { mode: ['css','legacy'] }
    } as any;

    // Mark container and tighten table to fit one page
    target.classList.add('pdf-export');
    const tableEl = target.querySelector('table') as HTMLElement | null;
    const prev = tableEl ? { w: tableEl.style.width, mw: tableEl.style.minWidth, fs: getComputedStyle(tableEl).fontSize } : null;
    if (tableEl) {
      tableEl.style.width = '100%';
      tableEl.style.minWidth = '100%';
      (tableEl.style as any).fontSize = `${this.determineFontSize()}px`;
    }

    await html2pdf().from(target).set(opt).save();

    // cleanup
    target.classList.remove('pdf-export');
    if (tableEl && prev) {
      tableEl.style.width = prev.w || '';
      tableEl.style.minWidth = prev.mw || '';
      (tableEl.style as any).fontSize = prev.fs || '';
    }
  }
}


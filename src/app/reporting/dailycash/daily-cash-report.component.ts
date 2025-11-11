import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface DailyCashData {
  date: string;
  totalAmount: number;
  categories: {
    _id: string;
    name: string;
    totalAmount: number;
  }[];
}

@Component({
  selector: 'app-daily-cash-report',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './daily-cash-report.component.html',
  styleUrl: './daily-cash-report.component.css'
})
export class DailyCashReportComponent implements OnInit {
  reportData: DailyCashData | null = null;
  todayDate: string = '';
  fromDate: string = '';
  toDate: string = '';
  selectedMonth: string = 'all';
  selectedYear: string = '';
  isLoading = false;

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef
  ) {
    // Set default values
    const today = new Date();
    this.todayDate = this.formatDateForInput(today);
    this.fromDate = this.formatDateForInput(today);
    this.toDate = this.formatDateForInput(today);
    this.selectedMonth = 'all'; // Default to show all data
    this.selectedYear = today.getFullYear().toString();
  }

  private formatDateForInput(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private parseDateOnly(dt: any): Date | null {
    if (!dt) return null;
    const d = new Date(dt);
    return isNaN(d.getTime()) ? null : d;
  }


  ngOnInit(): void {
    this.generateReport();
  }

  onMonthFilterChange(): void {
    // When month filter changes, update from/to dates accordingly
    if (this.selectedMonth !== 'all') {
      const year = parseInt(this.selectedYear);
      const month = parseInt(this.selectedMonth);

      // Set from date to 1st of selected month
      const fromDate = new Date(year, month - 1, 1);
      this.fromDate = this.formatDateForInput(fromDate);

      // Set to date to last day of selected month
      const toDate = new Date(year, month, 0);
      this.toDate = this.formatDateForInput(toDate);
    }
  }

  generateReport(): void {
    this.isLoading = true;

    let params: any = {};

    // Set parameters based on filter selection
    if (this.selectedMonth === 'all') {
      // All data - use from/to dates if provided
      if (this.fromDate) params.fromDate = this.fromDate;
      if (this.toDate) params.toDate = this.toDate;
      params.filterType = 'range';
    } else {
      // Specific month selected
      params.month = this.selectedMonth;
      params.year = this.selectedYear;
      params.filterType = 'month';
    }

    console.log('📅 Sending params:', params);

    this.http.get<DailyCashData>(`${environment.apiUrl}/reports/daily-cash`, { params })
      .subscribe({
        next: (data) => {
          console.log('✅ Daily Cash Report Response:', data);
          console.log('📊 Categories:', data.categories);
          console.log('💰 Total Amount:', data.totalAmount);
          this.reportData = data;
          this.isLoading = false;
          this.cdr.detectChanges();

          // Reconcile with client-side pivot if backend shows all zeros (e.g., refund-only day)
          this.reconcileWithPivotSafely();
        },

        error: (error) => {
          console.error('❌ Error loading daily cash report:', error);
          this.isLoading = false;
          this.cdr.detectChanges();
          alert('Error loading report: ' + (error.error?.message || error.message));
        }
      });
    }

  private reconcileWithPivotSafely(): void {
    try {
      const url = `${environment.apiUrl}/pathology-invoice/list?limit=10000000`;
      // Build date range
      let start: Date | null = null;
      let end: Date | null = null;
      if (this.selectedMonth !== 'all') {
        const y = parseInt(this.selectedYear, 10);
        const m = parseInt(this.selectedMonth, 10);
        start = new Date(y, m - 1, 1); start.setHours(0,0,0,0);
        end = new Date(y, m, 0); end.setHours(23,59,59,999);
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

      this.http.get<any>(url).subscribe({
        next: (resp) => {
          const invoices: any[] = resp?.invoices || [];

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

          const totals: { [k: string]: number } = {};
          let grand = 0;

          for (const inv of filtered) {
            const origDatesArr2 = [inv?.payment?.paymentDate, inv?.bookingDate, inv?.createdAt]
              .map(dt => this.parseDateOnly(dt))
              .filter(Boolean) as Date[];
            const originalDate = origDatesArr2.length ? new Date(Math.min(...origDatesArr2.map(d => d.getTime()))) : null;
            const isOriginalInRange = originalDate ? inRange(originalDate) : false;

            const rangeAdjustments = Array.isArray(inv?.payment?.adjustments)
              ? inv.payment.adjustments.filter((a: any) => inRange(this.parseDateOnly(a?.at)))
              : [];
            const netDelta = rangeAdjustments.reduce((sum: number, a: any) => sum + Number(a?.delta || 0), 0);

            const tests: any[] = Array.isArray(inv.tests) ? inv.tests : (Array.isArray(inv.selectedTests) ? inv.selectedTests : []);
            const currentByCat: { [k: string]: number } = {};
            for (const t of tests) {
              const cat = String(t.category || t.categoryName || '').trim().toUpperCase();
              if (!cat) continue;
              const amount = Number(t.netAmount ?? t.amount ?? t.cost ?? 0) || 0;
              currentByCat[cat] = (currentByCat[cat] || 0) + amount;
            }

            if (isOriginalInRange) {
              for (const cat of Object.keys(currentByCat)) {
                const amt = currentByCat[cat];
                totals[cat] = (totals[cat] || 0) + amt;
                grand += amt;
              }
            } else if (Math.abs(netDelta) > 0) {
              const cats = Object.keys(currentByCat);
              let targetCat = 'PATHOLOGY';
              if (cats.length === 1) targetCat = cats[0];
              else if (cats.length > 1) {
                let maxAmt = -Infinity;
                for (const c of cats) {
                  const amt = Number(currentByCat[c] || 0);
                  if (amt > maxAmt) { maxAmt = amt; targetCat = c; }
                }
              }
              const deltaInt = Math.round(netDelta);
              totals[targetCat] = (totals[targetCat] || 0) + deltaInt;
              grand += deltaInt;
            }
          }

          const backendAnyNonZero = !!(this.reportData && (
            Number(this.reportData.totalAmount || 0) !== 0 ||
            (Array.isArray(this.reportData.categories) && this.reportData.categories.some(c => Number(c?.totalAmount || 0) !== 0))
          ));
          const pivotAnyNonZero = grand !== 0 || Object.values(totals).some(v => Number(v) !== 0);

          // Prefer refund-aware client pivot when it has any data; fallback to backend only when pivot is empty
          if (pivotAnyNonZero && this.reportData) {
            const mapUpper = (s: string) => String(s || '').trim().toUpperCase();
            const updatedCats = (this.reportData.categories || []).map(c => ({
              ...c,
              totalAmount: Number(totals[mapUpper(c.name)] || 0)
            }));
            this.reportData = {
              ...this.reportData,
              categories: updatedCats,
              totalAmount: grand
            };
            this.cdr.detectChanges();
          }
        },
        error: (e) => {
          console.warn('⚠️ Pivot reconciliation failed', e);
        }
      });
    } catch (e) {
      console.warn('⚠️ Pivot reconciliation error', e);
    }
  }




  private decideOrientation(): 'portrait' | 'landscape' {
    // Only two columns, but header + spacing: landscape gives more width and larger font
    return 'landscape';
  }

  printReport(): void {
    if (!this.reportData) {
      alert('No report data available to print. Please generate a report first.');
      return;
    }

    // Force page size/orientation via @page
    const mode = this.decideOrientation();
    const style = document.createElement('style');
    style.setAttribute('media','print');
    style.textContent = `@page { size: A4 ${mode}; margin: 8mm; }`;
    document.head.appendChild(style);

    // Tighten table to ensure single page fit
    const container = document.querySelector('.report-content') as HTMLElement | null;
    const tableEl = container?.querySelector('table') as HTMLElement | null;
    const prev = tableEl ? { w: tableEl.style.width, mw: (tableEl.style as any).minWidth, fs: getComputedStyle(tableEl).fontSize } : null;
    if (tableEl) {
      tableEl.style.width = '100%';
      (tableEl.style as any).minWidth = '0';
      (tableEl.style as any).fontSize = '12px';
    }

    const cleanup = () => {
      try { document.head.removeChild(style); } catch {}
      if (tableEl && prev) {
        tableEl.style.width = prev.w || '';
        (tableEl.style as any).minWidth = prev.mw || '';
        (tableEl.style as any).fontSize = prev.fs || '';
      }
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);

    // Trigger print
    window.print();
  }

  downloadReport(): void {
    if (!this.reportData) {
      alert('No report data available to download. Please generate a report first.');
      return;
    }

    // Get the report content element
    const reportContent = document.querySelector('.report-content') as HTMLElement;

    if (!reportContent) {
      alert('Report content not found');
      return;
    }

    html2canvas(reportContent, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff'
    }).then(canvas => {
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');

      const imgWidth = 210; // A4 width in mm
      const pageHeight = 295; // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;

      let position = 0;

      // Add first page
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      // Add additional pages if needed
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      // Download the PDF
      const fileName = `daily-cash-report-${this.getFormattedDate()}.pdf`;
      pdf.save(fileName);
    }).catch(error => {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF. Please try again.');
    });
  }

  getFormattedDate(): string {
    if (this.reportData?.date) {
      return this.reportData.date;
    }
    return this.todayDate ? new Date(this.todayDate).toLocaleDateString('en-GB') : '';
  }

  // Dynamic title based on filter selection
  getReportTitle(): string {
    return this.selectedMonth === 'all' ? 'Daily Cash Report' : 'Monthly Cash Report';
  }

  refreshReport(): void {
    this.generateReport();
  }
}

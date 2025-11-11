import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface CentralOpdRow {
  regNo: string;
  // yearlyNo is intentionally kept in the model for future use, but HIDDEN in UI/Print
  yearlyNo?: number;
  monthlyNo?: number;
  dailyNo?: number;
  patientName: string;
  gender: string;
  age: string | number;
  ageIn?: string;
  address: any;
  department: string;
  roomNo: string;
  date: string; // YYYY-MM-DD
}

@Component({
  selector: 'app-central-opd-registration',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './central-opd-registration.component.html',
  styleUrls: ['./central-opd-registration.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CentralOpdRegistrationComponent implements OnInit {
  // Make Math available to the template
  Math = Math;

  // Safe address display helper (supports various shapes: string or object with street/line fields)
  formatAddress(a: any): string {
    if (!a) return '';
    if (typeof a === 'string') return a.trim();
    try {
      const {
        address, Address, line1, line2, street, locality, mohalla, area, landmark,
        village, city, town, tehsil, block, ward, district, dist, state, pincode, pin, post, po
      } = a || {};
      const parts = [
        address || Address, line1, line2, street, locality || mohalla || area || landmark,
        village, city || town, tehsil || block || ward, dist || district, state, pincode || pin, post || po
      ].filter((v: any) => v && String(v).trim().length > 0);
      return parts.join(', ');
    } catch {
      return '';
    }
  }

  // Filters / header controls
  startDate: string = '';
  endDate: string = '';
  monthFilter: string = 'All';
  genderFilter: string = 'All'; // All | Male | Female | Other
  idSourceFilter: string = 'All'; // All | Aadhaar | Contact | Both | None (UI uses All/Aadhaar/Contact)

  // Data + UI state
  loading = false;
  rows: CentralOpdRow[] = [];
  total = 0;
  stats: { male: number; female: number; other: number; aadhaar: number; contact: number } = { male: 0, female: 0, other: 0, aadhaar: 0, contact: 0 };

  // Client-side pagination (server-side backed)
  pageSize = 100;
  currentPage = 1;
  private requestToken = 0;

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  // Today reference for templates
  now: Date = new Date();

  // Labels for header: month and date range
  get monthLabel(): string {
    if (this.startDate && this.endDate && this.startDate.slice(0,7) === this.endDate.slice(0,7)) {
      // Same month
      const d = new Date(this.startDate + 'T00:00:00');
      return d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
    }
    // Different months: show short range months
    const fmt = (s: string) => {
      if (!s) return '';
      const d = new Date(s + 'T00:00:00');
      return d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
    };
    return `${fmt(this.startDate)} - ${fmt(this.endDate)}`.trim();
  }

  get dateRangeLabel(): string {
    const fmt = (s: string) => {
      if (!s) return '';
      const d = new Date(s + 'T00:00:00');
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth()+1).padStart(2, '0');
      const yy = d.getFullYear();
      return `${dd}-${mm}-${yy}`;
    };
    return `${fmt(this.startDate)} to ${fmt(this.endDate)}`;
  }

  ngOnInit(): void {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const isoToday = `${y}-${m}-${d}`;
    const firstOfMonth = `${y}-${m}-01`;
    // Default to current month range: 1st -> today
    this.startDate = firstOfMonth;
    this.endDate = isoToday;
    this.fetch();
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total / this.pageSize));
  }

  goToPage(p: number): void {
    const clamped = Math.min(this.totalPages, Math.max(1, p));
    if (clamped !== this.currentPage) {
      this.fetch(clamped);
    }
  }
  next(): void { this.goToPage(this.currentPage + 1); }
  prev(): void { this.goToPage(this.currentPage - 1); }

  // Efficient DOM rendering
  trackByRow(index: number, r: CentralOpdRow): string {
    return (r?.regNo && r.regNo.length > 0) ? r.regNo : `${r.patientName}|${r.date}|${r.roomNo}`;
  }

  private buildParams(): HttpParams {
    let params = new HttpParams().set('start', this.startDate).set('end', this.endDate);
    // Month quick filter adjusts range
    if (this.monthFilter && this.monthFilter !== 'All') {
      const baseYear = (this.startDate || new Date().toISOString().slice(0,10)).split('-')[0];
      const monthMap: Record<string, string> = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
      const mm = monthMap[this.monthFilter];
      if (mm) {
        const start = `${baseYear}-${mm}-01`;
        const lastDay = new Date(parseInt(baseYear, 10), parseInt(mm, 10), 0).getDate();
        const end = `${baseYear}-${mm}-${String(lastDay).padStart(2, '0')}`;
        params = params.set('start', start).set('end', end);
      }
    }
    // Add gender/source filters
    const g = (this.genderFilter || '').toLowerCase();
    if (g === 'male' || g === 'female' || g === 'other') params = params.set('gender', g);
    const s = (this.idSourceFilter || '').toLowerCase();
    if (['aadhaar','aadhar','contact','both','none'].includes(s)) {
      // normalize aadhar->aadhaar
      params = params.set('source', s === 'aadhar' ? 'aadhaar' : s);
    }
    return params;
  }

  onMonthFilterChange(val: string): void {
    if (!val || val === 'All') { return; }
    const monthMap: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
    const idx = monthMap[val];
    const refDate = this.startDate ? new Date(this.startDate) : new Date();
    const y = refDate.getFullYear();
    const start = new Date(y, idx, 1);
    const end = new Date(y, idx + 1, 0); // last day of month
    const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    this.startDate = toISO(start);
    this.endDate = toISO(end);
    this.cdr.detectChanges();
    this.fetch(1);
  }
  onFiltersChanged(): void { this.fetch(1); }


  fetch(page: number = 1): void {
    this.loading = true;
    this.currentPage = page;
    const token = ++this.requestToken; // guard against stale responses
    let params = this.buildParams();
    params = params.set('page', String(page)).set('limit', String(this.pageSize));
    this.http
      .get<{ success: boolean; records: CentralOpdRow[]; total: number; page: number; pageSize: number; stats?: { male: number; female: number; other: number; aadhaar: number; contact: number } }>(`${environment.apiUrl}/reports/central-opd-registration`, { params })
      .subscribe({
        next: (res) => {
          if (token !== this.requestToken) return; // ignore stale response
          this.rows = res?.records || [];
          this.total = res?.total ?? 0;
          this.currentPage = res?.page || page;
          this.stats = res?.stats || { male: 0, female: 0, other: 0, aadhaar: 0, contact: 0 };
          this.loading = false;
          this.cdr.detectChanges();
        },
        error: () => {
          if (token !== this.requestToken) return; // ignore stale error
          this.rows = [];
          this.total = 0;
          this.stats = { male: 0, female: 0, other: 0, aadhaar: 0, contact: 0 };
          this.loading = false;
          this.cdr.detectChanges();
        }
      });
  }

  onSearch(): void { this.fetch(1); }

  // Print the full filtered result, with page breaks after every 100 rows
  onPrint(): void {
    const printSection = document.getElementById('central-opd-print-root');
    if (!printSection) { window.print(); return; }
    const html = printSection.innerHTML;
    const w = window.open('', '_blank');
    if (!w) { window.print(); return; }
    w.document.open();
    // ensure logo works in new window
    const logoUrl = `${location.origin}/assets/images/myupgov.png`;
    const adjustedHtml = html.replace(/\.\/assets\/images\/myupgov\.png/g, logoUrl);
    w.document.write(`<!doctype html><html><head><title>Central OPD Registration</title>
      <style>
        @page { size: A4 portrait; margin: 4mm 6mm 6mm 6mm; }
        @media print {
          .page-break { page-break-after: always; height:0; border:none; }
          .no-print { display: none; }
          thead { display: table-header-group; }
          tfoot { display: table-row-group; }
        }
        body { font-family: Arial, sans-serif; margin: 0; padding:0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .print-page { width: 100%; }
        .print-header { display: grid; grid-template-columns: 90px 1fr; align-items: center; gap: 12px; margin-bottom: 4mm; }
        .print-logo img { height: 64px; }
        .print-title .hn { font-size: 18px; font-weight: 700; text-align: center; }
        .print-title .hl { font-size: 14px; text-align: center; margin-top: 2px; }
        .print-title .hr { font-size: 13px; text-align: center; margin-top: 4px; font-weight: 600; }
        table { width: 100%; border-collapse: collapse; font-size: 10.5px; table-layout: fixed; }
        th, td { border: 1px solid #e5e7eb; padding: 3px 5px; text-align: left; line-height: 1.1; word-break: break-word; }
        thead th { background: #f3f4f6; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        /* Print column widths (9 columns in print  Yearly hidden) */
        /* Reg, M., D., Patient, Address, Age, Gender, Dept., R. No. */
        thead th:nth-child(1), tbody td:nth-child(1) { width: 8%; }
        thead th:nth-child(2), tbody td:nth-child(2) { width: 6%; }
        thead th:nth-child(3), tbody td:nth-child(3) { width: 6%; }
        thead th:nth-child(4), tbody td:nth-child(4) { width: 6%; }
        thead th:nth-child(5), tbody td:nth-child(5) { width: 20%; }
        thead th:nth-child(6), tbody td:nth-child(6) { width: 20%; }
        thead th:nth-child(7), tbody td:nth-child(7) { width: 6%; }
        thead th:nth-child(8), tbody td:nth-child(8) { width: 7%; }
        thead th:nth-child(9), tbody td:nth-child(9) { width: 14%; }
        thead th:nth-child(10), tbody td:nth-child(10) { width: 7%; }
        /* Footer using table tfoot so it doesn't overlap content */
        tfoot td { border: none; padding-top: 3mm; font-size: 11px; text-align: right; }
        tfoot td::after { content: "Page " counter(page) " of " counter(pages); }
      </style>
    </head><body>${adjustedHtml}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
    // w.close(); // let user choose printer/PDF
  }

  // Download: robust PDF with repeated headers using jsPDF + autoTable; falls back to html2pdf
  async onDownload(): Promise<void> {
    const fname = `Central-OPD-Registration-${this.startDate}_to_${this.endDate}.pdf`;

    // Small margins as requested (even smaller top/left/right)
    const m = { top: 4, left: 6, bottom: 6, right: 6 };

    // Try jsPDF + autoTable first for reliable repeating headers
    try {
      if (!((window as any).jspdf?.jsPDF || (window as any).jsPDF)) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
          s.onload = () => resolve();
          s.onerror = () => reject();
          document.body.appendChild(s);
        });
      }
      if (!((window as any).jspdfAutotable || (window as any).autoTable)) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js';
          s.onload = () => resolve();
          s.onerror = () => reject();
          document.body.appendChild(s);
        });
      }
      const jsPDFCtor = (window as any).jspdf?.jsPDF || (window as any).jsPDF;
      const doc = new jsPDFCtor({ unit: 'mm', format: 'a4', orientation: 'portrait' });

      const pageWidth = doc.internal.pageSize.getWidth();
      const usableWidth = pageWidth - m.left - m.right;

      // First-page header image captured from on-screen header to match print exactly (Hindi + layout)
      if (!(window as any).html2canvas) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
          s.onload = () => resolve();
          s.onerror = () => reject();
          document.body.appendChild(s);
        });
      }
      const headerEl = document.querySelector('.report-header') as HTMLElement | null;
      let startY = m.top + 6; // fallback
      if (headerEl && (window as any).html2canvas) {
        const canvas = await (window as any).html2canvas(headerEl, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
        const imgData = canvas.toDataURL('image/png');
        const imgWmm = usableWidth;
        const imgHmm = (canvas.height / canvas.width) * imgWmm;
        doc.addImage(imgData, 'PNG', m.left, m.top, imgWmm, imgHmm);
        startY = m.top + imgHmm + 2;
      }

      // Columns + widths (percentages from print CSS) — Yearly shown (values blank)
      const pcts = [8,6,6,6,20,20,6,7,14,7];
      const colWidths = pcts.map(p => (usableWidth * p) / 100);

      const head = [[
        'Reg. No.', 'Yearly No.', 'M. No.', 'D. No.', 'Patient Name', 'Address', 'Age', 'Gender', 'Dept.', 'R. No.'
      ]];

      const body = this.rows.map(r => {
        const g = (r.gender || '').toLowerCase().startsWith('f') ? 'Female' : ((r.gender || '').toLowerCase().startsWith('m') ? 'Male' : (r.gender || ''));
        const ageSuf = (r.ageIn || '').toLowerCase().startsWith('y') ? 'Y' : ((r.ageIn || '').toLowerCase().startsWith('m') ? 'M' : ((r.ageIn || '').toLowerCase().startsWith('d') ? 'D' : ''));
        const age = `${r.age ?? ''} ${ageSuf}`.trim();
        const addr = this.formatAddress(r.address);
        return [r.regNo || '-', '', r.monthlyNo ?? '-', r.dailyNo ?? '-', r.patientName || '', addr, age, g, r.department || '', r.roomNo || ''];
      });

      (doc as any).autoTable({
        head,
        body,
        startY,
        styles: { fontSize: 9, cellPadding: 1.2, lineWidth: 0.1 },
        headStyles: { fillColor: [243, 244, 246], textColor: [0,0,0], halign: 'left' },
        margin: { top: m.top, left: m.left, right: m.right, bottom: m.bottom },
        columnStyles: colWidths.reduce((acc, w, i) => { acc[i] = { cellWidth: w }; return acc; }, {} as any),
        didDrawPage: () => {
          // No repeating header; autoTable will repeat thead automatically per page
        }
      });

      const pageCount = (doc as any).getNumberOfPages ? (doc as any).getNumberOfPages() : (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        (doc as any).setPage(i);
        doc.setFontSize(9); doc.setFont('helvetica','normal');
        const pageHeight = (doc as any).internal.pageSize.getHeight ? (doc as any).internal.pageSize.getHeight() : (doc as any).internal.pageSize.height;
        doc.text(`Page ${i} of ${pageCount}`, pageWidth - m.right, pageHeight - 4, { align: 'right' });
      }
      doc.save(fname);
      return;
    } catch (e) {
      console.warn('autoTable route failed, falling back to html2pdf', e);
    }

    // Fallback: html2pdf (no repeated thead in some browsers)
    const target = document.getElementById('central-opd-print-root');
    if (!target) { alert('Nothing to download'); return; }
    target.classList.add('pdf-export');
    try {
      if (!(window as any).html2pdf) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
          script.onload = () => resolve();
          script.onerror = () => reject();
          document.body.appendChild(script);
        });
      }
      const html2pdf = (window as any).html2pdf;
      const opt: any = {
        margin: [4, 6, 6, 6],
        filename: fname,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'], avoid: ['tr','td'] }
      };
      await html2pdf().from(target).set(opt).save();
    } finally {
      target.classList.remove('pdf-export');
    }
  }
}

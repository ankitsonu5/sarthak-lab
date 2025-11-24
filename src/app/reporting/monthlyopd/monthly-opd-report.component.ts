import { Component, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { LabSettingsService, LabSettings } from '../../setup/lab-setup/lab-settings.service';
import { DefaultLabConfigService } from '../../core/services/default-lab-config.service';

interface DepartmentColumn {
  _id: string;
  name: string;
}

interface MonthlyRowCell {
  newPatients: number;
  total: number;
}

interface MonthlyRow {
  month: number; // 1-12
  monthName: string;
  dataByDepartment: { [departmentId: string]: MonthlyRowCell };
  rowTotals: MonthlyRowCell;
}

interface MonthlyOpdReportResponse {
  year: number;
  departments: DepartmentColumn[];
  months: MonthlyRow[];
  grandTotals: {
    byDepartment: { [departmentId: string]: MonthlyRowCell };
    overall: MonthlyRowCell;
  };
}

@Component({
  selector: 'app-monthly-opd-report',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './monthly-opd-report.component.html',
  styleUrl: './monthly-opd-report.component.css'
})
export class MonthlyOpdReportComponent implements OnInit {
  year: number = new Date().getFullYear();
  report: MonthlyOpdReportResponse | null = null;
  isLoading = false;
  labSettings: LabSettings | null = null;

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private labService: LabSettingsService,
    public defaultLabConfig: DefaultLabConfigService
  ) {}

  ngOnInit(): void {
    this.loadLabSettings();
    this.load();
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

  load() {
    this.isLoading = true;
    const params = new HttpParams().set('year', String(this.year));
    this.http.get<MonthlyOpdReportResponse>(`${environment.apiUrl}/reports/monthly-opd`, { params }).subscribe({
      next: (res) => {
        this.report = res;
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error loading monthly OPD report', err);
        this.isLoading = false;
        this.cdr.detectChanges();
        alert('Error loading monthly OPD report: ' + (err.error?.message || err.message));
      }
    });
  }

  setYearFromInput(ev: any) {
    const val = Number(ev?.target?.value);
    if (!isNaN(val)) this.year = val;
  }

  monthLabel(m: number) {
    return new Date(this.year, m - 1, 1).toLocaleString('en-US', { month: 'short' });
  }

  formatDeptName(name: string): string {
    // If name contains '(CASUALTY)', split to 2 lines under the same column header
    // specifically requested: AATYAYIKA (first line) and CASUALTY below it
    if (!name) return '';
    const normalized = name.trim();
    // Look for 'CASUALTY' inside parentheses or after space
    const match = normalized.match(/^(.*?)(\s*\(\s*CASUALTY\s*\))$/i);
    if (match) {
      const first = match[1].trim();
      return `${first}<br><span class="sub">CASUALTY</span>`;
    }
    // Also support names like 'AATYAYIKA CASUALTY'
    const parts = normalized.split(/\s+CASUALTY\s*/i);
    if (parts.length > 1) {
      return `${parts[0]}<br><span class=\"sub\">CASUALTY</span>`;
    }
    return name;
  }

  private setPrintClass(cls: 'portrait' | 'landscape') {
    document.documentElement.classList.remove('portrait','landscape');
    document.documentElement.classList.add(cls);
  }

  // Decide orientation based on number of departments to fit in one page
  private decideOrientation(): 'portrait' | 'landscape' {
    const deptCount = this.report?.departments?.length || 0;
    // Use landscape sooner if many departments
    return deptCount > 7 ? 'landscape' : 'portrait';
  }

  // Decide compact font size based on number of departments
  private determineFontSize(): 8 | 9 | 10 {
    const deptCount = this.report?.departments?.length || 0;
    if (deptCount > 16) return 8;
    if (deptCount > 12) return 9;
    return 10;
  }

  printAuto() {
    const mode = this.decideOrientation();
    this.setPrintClass(mode);

    const fontSize = this.determineFontSize();

    // Inject a temporary print-only @page rule to force orientation
    const style = document.createElement('style');
    style.setAttribute('media', 'print');
    style.textContent = `@page { size: A4 ${mode}; margin: 8mm; }`;
    document.head.appendChild(style);

    // Tighten table CSS just before printing
    const container = document.getElementById('monthly-opd-pdf');
    const tableEl = container?.querySelector('table') as HTMLElement | null;
    const prev = tableEl ? { w: tableEl.style.width, mw: tableEl.style.minWidth, fs: getComputedStyle(tableEl).fontSize } : null;
    if (tableEl) {
      tableEl.style.width = '100%';
      tableEl.style.minWidth = '100%';
      (tableEl.style as any).fontSize = `${fontSize}px`;
    }

    const cleanup = () => {
      try { document.head.removeChild(style); } catch {}
      if (tableEl && prev) {
        tableEl.style.width = prev.w || '';
        tableEl.style.minWidth = prev.mw || '';
        (tableEl.style as any).fontSize = prev.fs || '';
      }
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);

    window.print();
  }

  async downloadPdf() {
    const target = document.getElementById('monthly-opd-pdf');
    if (!target) return;

    // Load html2pdf.js via CDN at runtime (no package install)
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
      margin:       [6, 4, 6, 4], // tighter to fit one page
      filename:     `Monthly-OPD-${this.year}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, logging: false },
      jsPDF:        { unit: 'mm', format: 'a4', orientation },
      pagebreak:    { mode: ['css', 'legacy'] }
    };

    // Mark container for pdf-export styles
    target.classList.add('pdf-export');

    // Compact table for PDF to fit one page and ensure all columns render in single row
    const fontSize = this.determineFontSize();
    const tableEl = target.querySelector('table') as HTMLElement | null;
    const prev = {
      width: tableEl?.style.width,
      minWidth: tableEl?.style.minWidth,
      fontSize: tableEl ? getComputedStyle(tableEl).fontSize : ''
    } as any;
    if (tableEl) {
      tableEl.style.width = '100%';
      tableEl.style.minWidth = '100%';
      (tableEl.style as any).fontSize = `${fontSize}px`;
    }

    await html2pdf().from(target).set(opt).save();

    // cleanup
    target.classList.remove('pdf-export');

    if (tableEl) {
      tableEl.style.width = prev.width || '';
      tableEl.style.minWidth = prev.minWidth || '';
      (tableEl.style as any).fontSize = prev.fontSize || '';
    }
  }
}


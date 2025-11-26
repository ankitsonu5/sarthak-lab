import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PathologyService, TestDefinition } from '../../setup/pathology/services/pathology.service';
import { LabSettingsService, LabSettings } from '../../setup/lab-setup/lab-settings.service';
import { DefaultLabConfigService } from '../../core/services/default-lab-config.service';

interface SummaryRow {
  category: string;
  testName: string;
  patients: number;
  totalAmount: number;
}

@Component({
  selector: 'app-test-summary',
   standalone: false,
  templateUrl: './test-summary.component.html',
  styleUrls: ['./test-summary.component.css']
})
export class TestSummaryComponent implements OnInit {
  isLoading = false;

  // Raw data
  private reports: any[] = [];
  private testDefinitions: TestDefinition[] = [];

  // Derived
  rows: SummaryRow[] = [];
  filtered: SummaryRow[] = [];

  // Simple filters (optional, same feel as reports-records)
  fromDate = '';
  toDate = '';
  categoryFilter = '';
  searchTerm = '';

  // Category options from definitions
  categories: string[] = [];

  // Pagination (30 per page)
  pageSize = 30;
  currentPage = 1;
  get totalPages(): number { return Math.max(1, Math.ceil(this.filtered.length / this.pageSize)); }
  get paged(): SummaryRow[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filtered.slice(start, start + this.pageSize);
  }
  prevPage() { if (this.currentPage > 1) this.currentPage--; }
  nextPage() { if (this.currentPage < this.totalPages) this.currentPage++; }


  // Header/paginator counts based on current page
  get showingFrom(): number {
    return this.filtered.length === 0 ? 0 : ((this.currentPage - 1) * this.pageSize) + 1;
  }
  get showingTo(): number {
    return Math.min(this.filtered.length, this.currentPage * this.pageSize);
  }
  get showingCount(): number {
    return this.paged.length;
  }

  // Lab Settings
  labSettings: LabSettings | null = null;

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private pathologyService: PathologyService,
    private labService: LabSettingsService,
    public defaultLabConfig: DefaultLabConfigService
  ) {}

  async ngOnInit(): Promise<void> {
    this.loadLabSettings();
    await this.loadData();
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

  async refreshData(): Promise<void> {
    await this.loadData();
  }

  printSummary(): void {
    window.print();
  }

  downloadCSV(): void {
    try {
      const header = ['Test Category', 'Test Name', 'No. of Patients', 'Total Amount'];
      const lines = [header.join(',')];
      for (const r of this.filtered) {
        const row = [
          '"' + (r.category || '').replace(/"/g, '""') + '"',
          '"' + (r.testName || '').replace(/"/g, '""') + '"',
          String(r.patients ?? 0),
          String((r.totalAmount ?? 0).toFixed(2))
        ];
        lines.push(row.join(','));
      }
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `test-summary-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('CSV download failed:', err);
    }
  }

  private async loadData(): Promise<void> {
    this.isLoading = true;
    this.cdr.detectChanges();
    try {
      const [reportsResp, defs] = await Promise.all([
        firstValueFrom(this.http.get<any>(`${environment.apiUrl}/pathology-reports?_=${Date.now()}`)),
        firstValueFrom(this.pathologyService.getTestDefinitions(true))
      ]);

      this.reports = reportsResp?.data || reportsResp?.reports || [];
      this.testDefinitions = defs || [];
      this.categories = Array.from(new Set((this.testDefinitions || []).map(td => typeof td.category === 'string' ? td.category : (td.category as any)?.name).filter(Boolean) as string[])).sort();

      this.buildSummary();
      this.applyFilters();
    } catch (e) {
      console.error('Error loading summary data:', e);
      alert('Failed to load data.');
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  private buildSummary(): void {
    const priceMap = new Map<string, number>(); // key: testName lower -> price
    const categoryMap = new Map<string, string>(); // key: testName lower -> category name
    const categoryMapNorm = new Map<string, string>(); // key: normalized name (dots/spaces removed, upper) -> category
    const norm = (s: string) => (s || '').toString().toUpperCase().replace(/\./g, '').replace(/\s+/g, '');

    for (const td of this.testDefinitions) {
      const name = (td.name || (td.shortName as any)?.testName || '').toString();
      if (!name) continue;
      const key = name.toLowerCase();
      const priceRaw = typeof td.shortName === 'object' ? (td.shortName as any).price : undefined;
      const price = typeof priceRaw === 'string' ? parseFloat(priceRaw) : (typeof priceRaw === 'number' ? priceRaw : 0);
      priceMap.set(key, isNaN(price) ? 0 : price);
      const cat = typeof td.category === 'string' ? td.category : (td.category as any)?.name;
      if (cat) {
        categoryMap.set(key, cat);
        categoryMapNorm.set(norm(name), cat);
      }
    }

    const agg = new Map<string, SummaryRow>();

    for (const report of this.reports) {
      const tests = report?.testResults || [];
      for (const t of tests) {
        const testName: string = (t?.testName || t?.name || 'Unknown Test').toString();
        const key = testName.toLowerCase();
        const savedCat = (t?.category || '').toString();
        const computedCat = categoryMapNorm.get(norm(testName)) || categoryMap.get(key) || 'GENERAL';
        const category = savedCat && !/^(general|others?)$/i.test(savedCat) ? savedCat : computedCat;
        const rowKey = `${category}|||${testName}`;
        const price = priceMap.get(key) || 0;

        if (!agg.has(rowKey)) {
          agg.set(rowKey, { category, testName, patients: 0, totalAmount: 0 });
        }
        const row = agg.get(rowKey)!;
        row.patients += 1; // one report counted as one patient for that test
        row.totalAmount += price;
      }
    }

    this.rows = Array.from(agg.values()).sort((a, b) => a.category.localeCompare(b.category) || a.testName.localeCompare(b.testName));
  }

  applyFilters(): void {
    let list = [...this.rows];

    if (this.categoryFilter) list = list.filter(r => r.category === this.categoryFilter);

    if (this.searchTerm) {
      const q = this.searchTerm.toLowerCase().trim();
      if (q) {
        list = list.filter(r => r.testName.toLowerCase().includes(q) || r.category.toLowerCase().includes(q));
      }
    }

    // Date range filter: filter reports first then rebuild via aggregation
    if (this.fromDate || this.toDate) {
      const from = this.fromDate ? new Date(this.fromDate) : undefined;
      const to = this.toDate ? new Date(this.toDate) : undefined;
      const filteredReports = this.reports.filter(r => {
        const d = new Date(r.reportDate || r.createdAt || r.updatedAt || Date.now());
        if (from && d < from) return false;
        if (to) {
          const end = new Date(to);
          end.setHours(23, 59, 59, 999);
          if (d > end) return false;
        }
        return true;
      });

      // Re-aggregate on the fly
      const tmp = new Map<string, SummaryRow>();
      // Precompute price/category maps again
      const priceMap = new Map<string, number>();
      const categoryMap = new Map<string, string>();
      for (const td of this.testDefinitions) {
        const name = (td.name || (td.shortName as any)?.testName || '').toString();
        if (!name) continue;
        const key = name.toLowerCase();
        const priceRaw = typeof td.shortName === 'object' ? (td.shortName as any).price : undefined;
        const price = typeof priceRaw === 'string' ? parseFloat(priceRaw) : (typeof priceRaw === 'number' ? priceRaw : 0);
        priceMap.set(key, isNaN(price) ? 0 : price);
        const cat = typeof td.category === 'string' ? td.category : (td.category as any)?.name;
        if (cat) categoryMap.set(key, cat);
      }
      for (const report of filteredReports) {
        const tests = report?.testResults || [];
        for (const t of tests) {
          const testName: string = (t?.testName || t?.name || 'Unknown Test').toString();
          const key = testName.toLowerCase();
          const category = (t?.category || categoryMap.get(key) || 'GENERAL').toString();
          if (this.categoryFilter && category !== this.categoryFilter) continue;
          if (this.searchTerm) {
            const q = this.searchTerm.toLowerCase().trim();
            if (q && !(testName.toLowerCase().includes(q) || category.toLowerCase().includes(q))) continue;
          }
          const rowKey = `${category}|||${testName}`;
          const price = priceMap.get(key) || 0;
          if (!tmp.has(rowKey)) tmp.set(rowKey, { category, testName, patients: 0, totalAmount: 0 });
          const row = tmp.get(rowKey)!;
          row.patients += 1;
          row.totalAmount += price;
        }
      }
      list = Array.from(tmp.values()).sort((a, b) => a.category.localeCompare(b.category) || a.testName.localeCompare(b.testName));
    }

    this.filtered = list;
    this.currentPage = 1;
  }

  clearFilters(): void {
    this.fromDate = '';
    this.toDate = '';
    this.categoryFilter = '';
    this.searchTerm = '';
    this.applyFilters();
  }

  async generateSummaryPDF(): Promise<void> {
    try {
      if (!this.filtered || this.filtered.length === 0) {
        alert('No data to generate PDF');
        return;
      }
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

      container.classList.add('pdf-export');

      const opt: any = {
        margin: [6, 4, 6, 4],
        filename: `Test-Summary-${new Date().toISOString().slice(0,10)}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'], avoid: ['tr','td'] }
      };

      await html2pdf().from(container).set(opt).save();
      container.classList.remove('pdf-export');
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF');
    }
  }

}


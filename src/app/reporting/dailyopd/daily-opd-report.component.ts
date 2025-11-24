import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { LabSettingsService, LabSettings } from '../../setup/lab-setup/lab-settings.service';
import { DefaultLabConfigService } from '../../core/services/default-lab-config.service';

interface DailyPathologyData {
  date: string;
  totalTests: number;
  totalAmount: number;
  categories: {
    _id: string;
    name: string;
    totalTests: number;
    totalAmount: number;
  }[];
}

@Component({
  selector: 'app-daily-opd-report',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './daily-opd-report.component.html',
  styleUrl: './daily-opd-report.component.css'
})
export class DailyOpdReportComponent implements OnInit {
  reportData: DailyPathologyData | null = null;
  selectedDate: string = '';
  isLoading = false;
  labSettings: LabSettings | null = null;

  // Rows to render in table (categories + final Total row)
  displayRows: Array<{ name: string; totalTests: number; totalAmount: number; isTotal?: boolean }> = [];

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private labService: LabSettingsService,
    public defaultLabConfig: DefaultLabConfigService
  ) {
    // Set default date to today
    const today = new Date();
    this.selectedDate = this.formatDateForInput(today);
  }

  private formatDateForInput(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  ngOnInit(): void {
    this.loadLabSettings();
    this.generateReport();
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

  generateReport(): void {
    if (!this.selectedDate) {
      alert('Please select a date');
      return;
    }

    this.isLoading = true;

    const params = {
      date: this.selectedDate
    };

    this.http.get<DailyPathologyData>(`${environment.apiUrl}/reports/daily-pathology`, { params })
      .subscribe({
        next: (data) => {
          console.log('✅ Daily Pathology Report Response:', data);
          console.log('📊 Categories:', data.categories);
          console.log('📊 Total Tests:', data.totalTests);
          console.log('📊 Total Amount:', data.totalAmount);
          this.reportData = data;

          // Build display rows: categories + Total as the last row
          const rows: Array<{ name: string; totalTests: number; totalAmount: number; isTotal?: boolean }> = [];
          if (data?.categories?.length) {
            for (const c of data.categories) {
              if (c?.name && String(c.name).trim().length) {
                rows.push({ name: c.name, totalTests: c.totalTests || 0, totalAmount: c.totalAmount || 0 });
              }
            }
          }
          rows.push({
            name: 'Total',
            totalTests: data?.totalTests || 0,
            totalAmount: data?.totalAmount || 0,
            isTotal: true
          });
          this.displayRows = rows;

          this.isLoading = false;
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('❌ Error loading daily pathology report:', error);
          this.isLoading = false;
          this.cdr.detectChanges();
          alert('Error loading report: ' + (error.error?.message || error.message));
        }
      });
  }

  printReport(): void {
    if (!this.reportData) {
      alert('No report data available to print. Please generate a report first.');
      return;
    }

    // Add print class to body to trigger print styles
    document.body.classList.add('printing');

    // Edge/Windows PDF driver sometimes ignores CSS landscape. Fallback: rotate content.
    const isEdge = navigator.userAgent.includes('Edg');
    if (isEdge) {
      document.body.classList.add('force-rotate');
    }

    // Inject a global print @page rule to force Landscape (component-scoped @page can be ignored)
    const styleId = 'daily-opd-print-orientation';
    let styleTag = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = styleId;
      styleTag.setAttribute('media', 'print');
      styleTag.textContent = `
        @page { size: A4 landscape; margin: 0; }
        @page { size: landscape; } /* fallback for some drivers */
      `;
      document.head.appendChild(styleTag);
    }

    // Hide non-printable elements
    const searchSection = document.querySelector('.search-section') as HTMLElement;
    const pageTitle = document.querySelector('.page-title') as HTMLElement;
    if (searchSection) searchSection.style.display = 'none';
    if (pageTitle) pageTitle.style.display = 'none';

    // Cleanup after print using afterprint (more reliable than timeout)
    const afterPrint = () => {
      document.body.classList.remove('printing');
      document.body.classList.remove('force-rotate');
      if (searchSection) searchSection.style.display = '';
      if (pageTitle) pageTitle.style.display = '';
      if (styleTag && styleTag.parentNode) {
        styleTag.parentNode.removeChild(styleTag);
      }
      window.removeEventListener('afterprint', afterPrint);
    };
    window.addEventListener('afterprint', afterPrint);

    // Trigger print after a short tick to ensure styles apply
    setTimeout(() => window.print(), 50);
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
      const fileName = `daily-opd-report-${this.getFormattedDate()}.pdf`;
      pdf.save(fileName);
    }).catch(error => {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF. Please try again.');
    });
  }

  getFormattedDate(): string {
    if (!this.selectedDate) {
      return '';
    }

    const date = new Date(this.selectedDate);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  refreshReport(): void {
    this.generateReport();
  }
}

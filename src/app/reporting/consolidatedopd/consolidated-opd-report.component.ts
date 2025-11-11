import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface Department {
  _id: string;
  name: string;
  newPatients: number;
  total: number;
}

interface ConsolidatedReport {
  reportDate: string;
  totalNewPatients: number;
  grandTotal: number;
  departments: Department[];
}

@Component({
  selector: 'app-consolidated-opd-report',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './consolidated-opd-report.component.html',
  styleUrl: './consolidated-opd-report.component.css'
})
export class ConsolidatedOpdReportComponent implements OnInit {
  reportData: ConsolidatedReport | null = null;
  fromDate: string = '';
  toDate: string = '';
  isLoading = false;

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef
  ) {}

  private formatDateForInput(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  ngOnInit(): void {
    // Set default dates: 1st Jan 2025 to today
    const today = new Date();
    this.fromDate = '2025-01-01'; // Fixed start date
    this.toDate = this.formatDateForInput(today);

    // Generate report automatically with default dates
    this.generateReport();
  }

  generateReport(): void {
    if (!this.fromDate || !this.toDate) {
      alert('Please select both from and to dates');
      return;
    }

    this.isLoading = true;

    const params = {
      fromDate: this.fromDate,
      toDate: this.toDate
    };

    this.http.get<ConsolidatedReport>(`${environment.apiUrl}/reports/consolidated-opd`, { params })
      .subscribe({
        next: (data) => {
          console.log('✅ Consolidated OPD Report Response:', data);
          console.log('📊 Departments:', data.departments);
          console.log('📊 Total New Patients:', data.totalNewPatients);
          this.reportData = data;
          this.isLoading = false;
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('❌ Error loading consolidated OPD report:', error);
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

    // Hide non-printable elements
    const searchSection = document.querySelector('.search-section') as HTMLElement;
    const pageTitle = document.querySelector('.page-title') as HTMLElement;

    if (searchSection) searchSection.style.display = 'none';
    if (pageTitle) pageTitle.style.display = 'none';

    // Print the page
    window.print();

    // Restore elements after print
    setTimeout(() => {
      document.body.classList.remove('printing');
      if (searchSection) searchSection.style.display = '';
      if (pageTitle) pageTitle.style.display = '';
    }, 1000);
  }

  downloadReport(): void {
    if (!this.reportData) {
      alert('No report data available to download. Please generate a report first.');
      return;
    }

    // Get the report content element (from logo to table)
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
      const fileName = `consolidated-opd-report-${this.getFormattedDateRange().replace(/\//g, '-')}.pdf`;
      pdf.save(fileName);
    }).catch(error => {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF. Please try again.');
    });
  }

  refreshReport(): void {
    this.generateReport();
  }

  getFormattedDateRange(): string {
    if (!this.fromDate || !this.toDate) {
      return '';
    }

    const formatDate = (dateStr: string): string => {
      const date = new Date(dateStr);
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    };

    const fromFormatted = formatDate(this.fromDate);
    const toFormatted = formatDate(this.toDate);

    if (this.fromDate === this.toDate) {
      return fromFormatted;
    }

    return `${fromFormatted} to ${toFormatted}`;
  }
}

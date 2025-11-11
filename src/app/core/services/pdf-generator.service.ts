import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// Centralized configuration for styling
const CONFIG = {
  page: {
    width: 210, // A4 width in mm
    height: 297, // A4 height in mm
    margin: 15, // Increased for better spacing
    topMargin: 10, // Top margin for subsequent pages
    bottomMargin: 20, // Bottom margin to prevent cutting
  },
  colors: {
    normal: '#ffffffff', // Softer green for normal results
    low: '#ffffffff', // Softer yellow for low results
    high: '#ffdede', // Softer pink for high results
    headerBg: '#ffffffff', // Light gray for headers
    testNameBg: '#fafafa', // Subtle gray for test names
    groupBg: '#e8f0fe', // Light blue for group headers
    text: '#000000ff', // Darker text for better contrast
    category: '#2b5797', // Richer blue for categories
    border: '#333333', // Darker border color
    gradientStart: '#ffffffff', // Gradient for header
    gradientEnd: '#ffffffff',
  },
  fonts: {
    family: 'Helvetica, Arial, sans-serif', // More reliable font stack
    sizes: {
      hospitalName: 24, // Slightly larger for prominence
      location: 18,
      category: 20,
      normal: 14, // Increased for readability
      small: 12,
      bold: 13,
    },
  },
  image: {
    logoPath: 'assets/images/myupgov.png',
    logoWidth: 140, // Adjusted for better proportion
    logoHeight: 140,
    watermarkOpacity: 0.1, // For subtle background watermark
  },
};

// Interfaces for type safety
export interface TestParameter {
  name: string;
  result?: string | number;
  unit?: string;
  normalRange?: string;
  textValue?: string;
  type?: 'Text' | 'Numeric';
  groupBy?: string;
  outerGroup?: string;
  order?: number;
}

export interface TestResult {
  testName: string;
  category?: string;
  parameters: TestParameter[];
}

export interface ReportData {
  patientName: string;
  age: string | number;
  gender: string;
  receiptNo: string;
  registrationNo?: string;
  reportDate: string;
  labYearlyNo: string;
  labDailyNo: string;
  doctorName: string;
  department: string;
  patientType?: string;
  testResults: TestResult[];
}

@Injectable({
  providedIn: 'root',
})
export class PdfGeneratorService {
  constructor() {}

  /**
   * Generate PDF report for pathology test results
   * @param reportData Report data object
   * @returns Promise<Blob> PDF blob
   */
  async generatePathologyReport(reportData: ReportData): Promise<Blob> {
    try {
      return await this.generateHTMLBasedPDF(reportData);
    } catch (error) {
      console.error('HTML-based PDF generation failed:', error);
      throw new Error('Failed to generate PDF report');
    }
  }

  /**
   * Load image as base64
   */
  private async loadImageAsBase64(imagePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context not available'));
          return;
        }
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error(`Failed to load image: ${imagePath}`));
      img.src = imagePath;
    });
  }

  /**
   * Wait for all images in element to load
   */
  private async waitForImages(element: HTMLElement): Promise<void> {
    const images = Array.from(element.querySelectorAll('img'));
    await Promise.all(
      images.map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete) resolve();
            else {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            }
          }),
      ),
    );
  }

  /**
   * Format name for consistent display
   */
  private formatName(name: string): string {
    if (!name) return '';
    return name
      .split(' ')
      .filter((p) => p && p.toLowerCase() !== 'undefined' && p.toLowerCase() !== 'null')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Derive status for a test parameter
   */
  private deriveStatus(value: any, normalRange: string): string {
    if (!value || !normalRange) return '';
    const valStr = String(value).trim();
    const range = normalRange.toString().trim().toLowerCase();
    const vNum = parseFloat(valStr);
    if (!isNaN(vNum)) {
      if (range.includes('-')) {
        const [min, max] = range.split('-').map((p) => parseFloat(p.trim()));
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
    const normals = range.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
    if (normals.length) return normals.includes(valStr.toLowerCase()) ? 'Normal' : 'Abnormal';
    return '';
  }

  /**
   * Get row color based on test result
   */
  private getRowColor(param: TestParameter): string {
    if (!param.result || !param.normalRange) return CONFIG.colors.normal;
    const resultVal = parseFloat(param.result.toString());
    if (isNaN(resultVal)) return CONFIG.colors.normal;

    const rangeStr = param.normalRange.toString().trim();
    let min: number | null = null;
    let max: number | null = null;
    let operator: string | null = null;

    if (rangeStr.includes('-')) {
      const parts = rangeStr.split('-').map((p) => parseFloat(p.trim()));
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        [min, max] = parts;
      }
    } else if (rangeStr.startsWith('>')) {
      operator = '>';
      min = parseFloat(rangeStr.substring(1).trim());
    } else if (rangeStr.startsWith('<')) {
      operator = '<';
      max = parseFloat(rangeStr.substring(1).trim());
    }

    let isNormal = true;
    let isLowAbnormal = false;

    if (min != null && max != null) {
      if (resultVal < min) {
        isNormal = false;
        isLowAbnormal = true;
      } else if (resultVal > max) {
        isNormal = false;
      }
    } else if (operator === '>' && min != null) {
      if (resultVal <= min) {
        isNormal = false;
        isLowAbnormal = true;
      }
    } else if (operator === '<' && max != null) {
      if (resultVal >= max) {
        isNormal = false;
      }
    }

    return isNormal ? CONFIG.colors.normal : isLowAbnormal ? CONFIG.colors.low : CONFIG.colors.high;
  }

  /**
   * Get unique categories from test results
   */
  private getUniqueCategories(testResults: TestResult[]): string[] {
    return Array.from(new Set(testResults.map((test) => test.category || 'GENERAL')));
  }

  /**
   * Build display rows for a test
   */
  private buildDisplayRows(test: TestResult): any[] {
    const rows: any[] = [];
    const params = Array.isArray(test.parameters) ? test.parameters : [];
    const hasGroupMeta = params.some((p) => p.groupBy || p.outerGroup);

    if (hasGroupMeta) {
      const outerOrder: string[] = [];
      const perOuter: Record<string, TestParameter[]> = {};
      params.forEach((p, idx) => {
        const og = (p.outerGroup || '').toString().trim();
        if (!(og in perOuter)) {
          perOuter[og] = [];
          outerOrder.push(og);
        }
        // Preserve original index for stable sorting
        (perOuter[og] as any[]).push({ ...(p as any), __idx: idx });
      });

      outerOrder.forEach((og) => {
        if (og) rows.push({ kind: 'group', name: og, level: 0 });
        const buckets = new Map<string, { label: string; items: TestParameter[] }>();
        const orderedKeys: string[] = [];
        perOuter[og].forEach((p) => {
          const raw = (p.groupBy || '').toString().trim();
          if (!raw) return;
          const key = raw.toLowerCase();
          if (!buckets.has(key)) {
            buckets.set(key, { label: raw, items: [] });
            orderedKeys.push(key);
          }
          buckets.get(key)!.items.push(p);
        });

        orderedKeys.forEach((key) => {
          const bucket = buckets.get(key)!;
          if (bucket.label) rows.push({ kind: 'group', name: bucket.label, level: og ? 1 : 0 });
          bucket.items
            .sort((a: any, b: any) => (a.order ?? a.__idx ?? 0) - (b.order ?? b.__idx ?? 0))
            .forEach((p) => {
              const value = p.result ?? '';
              const status = this.deriveStatus(value, p.normalRange || '');
              rows.push({
                kind: 'param',
                name: p.name || '',
                value,
                unit: p.unit || '',
                normalRange: p.normalRange || p.textValue || '',
                status,
                level: og ? 2 : 1,
              });
            });
        });

        perOuter[og]
          .filter((p) => !(p.groupBy || '').toString().trim())
          .sort((a: any, b: any) => (a.order ?? a.__idx ?? 0) - (b.order ?? b.__idx ?? 0))
          .forEach((p) => {
            const value = p.result ?? '';
            const status = this.deriveStatus(value, p.normalRange || '');
            rows.push({
              kind: 'param',
              name: p.name || '',
              value,
              unit: p.unit || '',
              normalRange: p.normalRange || p.textValue || '',
              status,
              level: og ? 1 : 0,
            });
          });
      });
    } else {
      params.forEach((p) => {
        const value = p.result ?? '';
        const status = this.deriveStatus(value, p.normalRange || '');
        rows.push({
          kind: 'param',
          name: p.name || '',
          value,
          unit: p.unit || '',
          normalRange: p.normalRange || p.textValue || '',
          status,
          level: 0,
        });
      });
    }
    return rows;
  }

  /**
   * Generate HTML for the report
   */
  private async createReportHTML(reportData: ReportData): Promise<HTMLElement> {
    const container = document.createElement('div');
    container.style.cssText = `
      width: 850px;
      padding: 0;
      background: white;
      font-family: ${CONFIG.fonts.family};
      position: absolute;
      left: -9999px;
      top: -9999px;
      box-sizing: border-box;
    `;

    // Load watermark image if available
    let watermarkBase64 = '';
    try {
      watermarkBase64 = await this.loadImageAsBase64(CONFIG.image.logoPath);
    } catch (error) {
      console.warn('Failed to load watermark image:', error);
    }

    const css = `
      .pathology-report-print {
        width: 850px;
        margin: 0 auto;
        padding: ${CONFIG.page.margin}px;
        padding-bottom: ${CONFIG.page.bottomMargin + 10}px;
        background: #fff;
        font-size: ${CONFIG.fonts.sizes.normal}px;
        color: ${CONFIG.colors.text};
        border: 4px double ${CONFIG.colors.border};
        position: relative;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        min-height: calc(100vh - 40px);
        box-sizing: border-box;
      }
      .watermark {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) rotate(-45deg);
        opacity: ${CONFIG.image.watermarkOpacity};
        width: 300px;
        height: auto;
        z-index: -1;
      }
      .header-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 15px;
        background: linear-gradient(to right, ${CONFIG.colors.gradientStart}, ${CONFIG.colors.gradientEnd});
        padding: 10px;
        border-radius: 8px;
      }
      .govt-logo {
        width: ${CONFIG.image.logoWidth}px;
        height: auto;
        object-fit: contain;
        border-radius: 4px;
      }
      .hospital-name {
        margin: 0;
        font-size: ${CONFIG.fonts.sizes.hospitalName}px;
        font-weight: 700;
        color: #000000ff;
        text-shadow: 1px 1px 2px rgba(0,0,0,0.2);
      }
      .hospital-location {
        margin: 5px 0 0;
        font-size: ${CONFIG.fonts.sizes.location}px;
        color: #000000ff;
      }
      .report-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 10px;
      }
      .patient-cell {
        padding: 0;
      }
      .patient-info-section {
        border: 2px solid ${CONFIG.colors.border};
        padding: 12px;
        background: #fafafa;
      }
      .patient-row {
        display: grid;
        grid-template-columns: 1.8fr 1fr 1fr;
        column-gap: 15px;
        margin-bottom: 8px;
        align-items: center;
      }
      .patient-field-medium, .patient-field-small {
        display: flex;
        align-items: center;
        font-size: ${CONFIG.fonts.sizes.small}px;
        word-break: break-word;
      }
      .field-label {
        font-weight: 700;
        margin-right: 8px;
        color: ${CONFIG.colors.text};
        white-space: nowrap;
      }
      .field-value {
        color: ${CONFIG.colors.text};
        overflow-wrap: break-word;
      }
      .columns-header th {
        border: 1px solid ${CONFIG.colors.border};
        border-bottom: 2px solid ${CONFIG.colors.border};
        padding: 9px;
        text-align: left;
        background: ${CONFIG.colors.headerBg};
        font-size: ${CONFIG.fonts.sizes.bold}px;
        font-weight: 700;
      }
      .category-row td {
        border: 1px solid ${CONFIG.colors.border};
        padding: 7px;
        text-align: center;
        font-weight: 700;
        font-size: ${CONFIG.fonts.sizes.category}px;
        color: ${CONFIG.colors.category};
      }
      .testname-row td {
        border: 1px solid ${CONFIG.colors.border};
        padding: 7px;
        font-weight: 700;
        background: ${CONFIG.colors.testNameBg};
        font-size: ${CONFIG.fonts.sizes.bold}px;
      }
      .group-row .group-title {
        border: 1px solid ${CONFIG.colors.border};
        padding: 10px;
        font-weight: 700;
        background: ${CONFIG.colors.groupBg};
        font-size: ${CONFIG.fonts.sizes.normal}px;
      }
      .param-row td {
        border: 1px solid ${CONFIG.colors.border};
        padding: 10px;
        font-size: ${CONFIG.fonts.sizes.normal}px;
        word-break: break-word;
        overflow-wrap: break-word;
      }
      .param-row.row-normal td {
        background: ${CONFIG.colors.normal};
      }
      .param-row.row-low td {
        background: ${CONFIG.colors.low};
      }
      .param-row.row-high td {
        background: ${CONFIG.colors.high};
      }
      .param-row.row-high .test-result {
        font-weight: 700;
      }
      .test-name {
        padding-left: 12px;
      }
      .unit {
        font-weight: 400;
        font-size: ${CONFIG.fonts.sizes.small}px;
      }
      .report-footer {
        margin-top: 25px;
        margin-bottom: 30px;
        padding-top: 15px;
        padding-bottom: 20px;
        border-top: 1px solid ${CONFIG.colors.border};
      }
      .footer-row {
        display: flex;
        justify-content: space-between;
        margin: 20px 0;
      }
      .signature-line {
        border-bottom: 2px solid ${CONFIG.colors.border};
        width: 220px;
        height: 1px;
        margin-top: 5px;
      }
      .signature-label {
        font-weight: 700;
        font-size: ${CONFIG.fonts.sizes.normal}px;
        color: ${CONFIG.colors.text};
      }
      .footer-note {
        text-align: center;
        font-size: ${CONFIG.fonts.sizes.normal}px;
        color: ${CONFIG.colors.text};
        line-height: 1.5;
      }
    `;

    const patientName = this.formatName(reportData.patientName);
    const age = reportData.age || '';
    const gender = reportData.gender || '';
    const patientType = reportData.patientType || '';

    const testsHTML = reportData.testResults
      .map((t) => {
        const rows = this.buildDisplayRows(t);
        const rowsHTML = rows
          .map((row) => {
            if (row.kind === 'group') {
              return `<tr class="group-row"><td colspan="3" class="group-title">${row.name}</td></tr>`;
            }
            const rowClass = row.status.toLowerCase() === 'normal' ? 'row-normal' : row.status.toLowerCase() === 'low' ? 'row-low' : 'row-high';
            const pad = 12 + (row.level || 0) * 15;
            const normStr = ((row.normalRange ?? '').toString().trim());
            const displayNorm = (normStr === '-' || normStr === '\u2013' || normStr === '\u2014') ? '' : normStr;
            return `
              <tr class="param-row ${rowClass}">
                <td class="test-name" style="padding-left:${pad}px;">${row.name}</td>
                <td class="test-result">${row.value}${row.unit ? `<span class=\"unit\"> ${row.unit}</span>` : ''}</td>
                <td class="normal-range">${displayNorm}</td>
              </tr>`;
          })
          .join('');
        return `
          <tr class="category-row"><td colspan="3" class="center-text"><strong>${t.category || 'GENERAL'}</strong></td></tr>
          <tr class="testname-row"><td colspan="3">${t.testName}</td></tr>
          ${rowsHTML}
        `;
      })
      .join('');

    container.innerHTML = `
      <style>${css}</style>
      <div id="pathology-report-print" class="pathology-report-print">
        ${watermarkBase64 ? `<img src="${watermarkBase64}" class="watermark" alt="Watermark">` : ''}
        <div class="report-header-block">
          <table class="header-table" role="presentation">
            <tr>
              <td class="logo-cell" style="width:${CONFIG.image.logoWidth}px; vertical-align:middle">
                <img src="${CONFIG.image.logoPath}" alt="Government Logo" class="govt-logo" loading="eager">
              </td>
              <td class="hospital-info-cell" style="text-align:center">
                <div class="hospital-info">
                  <h1 class="hospital-name">राजकीय आयुर्वेद महाविद्यालय एवं चिकित्सालय</h1>
                  <h2 class="hospital-location">चौकाघाट, वाराणसी-221002</h2>
                </div>
              </td>
            </tr>
          </table>
        </div>
        <table class="report-table">
          <thead>
            <tr class="patient-info-row">
              <th colspan="3" class="patient-cell">
                <div class="patient-info-section">
                  <div class="patient-row first-row">
                    <div class="patient-field-medium"><span class="field-label">Patient Name:</span><span class="field-value">${patientName}</span></div>
                    <div class="patient-field-small"><span class="field-label">Registration No.:</span><span class="field-value">${reportData.registrationNo || ''}</span></div>
                    <div class="patient-field-small"><span class="field-label">Date:</span><span class="field-value">${new Date(reportData.reportDate).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' ' + new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true })}</span></div>
                  </div>
                  <div class="patient-row">
                    <div class="patient-field-medium"><span class="field-label">Referred By:</span><span class="field-value">${reportData.doctorName || ''}</span></div>
                    <div class="patient-field-small"><span class="field-label">Age:</span><span class="field-value">${age}</span></div>
                    <div class="patient-field-small"><span class="field-label">Gender:</span><span class="field-value">${gender}</span></div>
                  </div>
                  <div class="patient-row">
                    <div class="patient-field-medium"><span class="field-label">Lab Sr.No.:</span><span class="field-value">${reportData.labYearlyNo || ''}/${reportData.labDailyNo || ''}</span></div>
                    <div class="patient-field-small"><span class="field-label">IPD/OPD:</span><span class="field-value">${patientType}</span></div>
                    <div class="patient-field-small"></div>
                  </div>
                </div>
              </th>
            </tr>
            <tr class="columns-header">
              <th class="test-column" style="width: 45%;">TEST</th>
              <th class="result-column" style="width: 25%;">RESULT</th>
              <th class="normal-column" style="width: 30%;">NORMAL VALUE</th>
            </tr>
          </thead>
          <tbody>
            ${testsHTML}
          </tbody>
        </table>
      </div>`;

    return container;
  }

  /**
   * Create repeatable header for subsequent pages
   */
  private async createRepeatableHeaderHTML(reportData: ReportData): Promise<HTMLElement> {
    const container = document.createElement('div');
    container.style.cssText = `
        width: 850px;
        margin: 0 auto;
        padding: ${CONFIG.page.margin}px;
        background: #fff;
        font-size: ${CONFIG.fonts.sizes.normal}px;
        color: ${CONFIG.colors.text};
        border: 4px double ${CONFIG.colors.border};
        position: relative;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    `;

    const css = `

    .repeatable-header{
      width: 100%;
        border-collapse: collapse;
        margin-top: 10px;
    }
      .patient-info-section {
        border: 2px solid ${CONFIG.colors.border};
        padding: 12px;
        background: #ffffffff;
      }
      .patient-row {
        display: grid;
        grid-template-columns: 1.8fr 1fr 1fr;
        column-gap: 15px;
        margin-bottom: 8px;
        align-items: center;
      }
      .patient-field-medium, .patient-field-small {
        display: flex;
        align-items: center;
        font-size: ${CONFIG.fonts.sizes.small}px;
        word-break: break-word;
      }
      .field-label {
        font-weight: 700;
        margin-right: 8px;
        color: ${CONFIG.colors.text};
        white-space: nowrap;
      }
      .field-value {
        color: ${CONFIG.colors.text};
        overflow-wrap: break-word;
      }
      .columns-header th {
        border: 1px solid ${CONFIG.colors.border};
        border-bottom: 2px solid ${CONFIG.colors.border};
        padding: 10px;
        text-align: left;
        background: ${CONFIG.colors.headerBg};
        font-size: ${CONFIG.fonts.sizes.bold}px;
        font-weight: 700;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
    `;

    const patientName = this.formatName(reportData.patientName);
    const age = reportData.age || '';
    const gender = reportData.gender || '';
    const patientType = reportData.patientType || '';

    container.innerHTML = `
      <style>${css}</style>
    <table class="report-table">
          <thead>
            <tr class="patient-info-row">
              <th colspan="3" class="patient-cell">
                <div class="patient-info-section">
                  <div class="patient-row first-row">
                    <div class="patient-field-medium"><span class="field-label">Patient Name:</span><span class="field-value">${patientName}</span></div>
                    <div class="patient-field-small"><span class="field-label">Registration No.:</span><span class="field-value">${reportData.registrationNo || ''}</span></div>
                    <div class="patient-field-small"><span class="field-label">Date:</span><span class="field-value">${new Date(reportData.reportDate).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' ' + new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true })}</span></div>
                  </div>
                  <div class="patient-row">
                    <div class="patient-field-medium"><span class="field-label">Referred By:</span><span class="field-value">${reportData.doctorName || ''}</span></div>
                    <div class="patient-field-small"><span class="field-label">Age:</span><span class="field-value">${age}</span></div>
                    <div class="patient-field-small"><span class="field-label">Gender:</span><span class="field-value">${gender}</span></div>
                  </div>
                  <div class="patient-row">
                    <div class="patient-field-medium"><span class="field-label">Lab Sr.No.:</span><span class="field-value">${reportData.labYearlyNo || ''}/${reportData.labDailyNo || ''}</span></div>
                    <div class="patient-field-small"><span class="field-label">IPD/OPD:</span><span class="field-value">${patientType}</span></div>
                    <div class="patient-field-small"></div>
                  </div>
                </div>
              </th>
            </tr>
            <tr class="columns-header">
              <th class="test-column" style="width: 45%;">TEST</th>
              <th class="result-column" style="width: 25%;">RESULT</th>
              <th class="normal-column" style="width: 30%;">NORMAL VALUE</th>
            </tr>
          </thead>
        </table>`;

    return container;
  }

  /**
   * Create repeatable footer for each page
   */
  private async createRepeatableFooterHTML(): Promise<HTMLElement> {
    const container = document.createElement('div');
    container.style.cssText = `
        width: 850px;
        margin: 0 auto;
        padding: ${CONFIG.page.margin}px;
        background: #fff;
        color: ${CONFIG.colors.text};
        border: 4px double ${CONFIG.colors.border};
        position: relative;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    `;

    const css = `
      .report-footer {
        padding-top: 10px;
        border-top: 1px solid ${CONFIG.colors.border};
      }
      .footer-row {
        display: flex;
        justify-content: space-between;
        margin: 18px 0 12px;
      }
      .signature-line {
        border-bottom: 2px solid ${CONFIG.colors.border};
        width: 220px;
        height: 1px;
        margin-top: 5px;
      }
      .signature-label {
        font-weight: 700;
        font-size: ${CONFIG.fonts.sizes.normal}px;
        color: ${CONFIG.colors.text};
      }
      .footer-note {
        text-align: center;
        font-size: ${CONFIG.fonts.sizes.normal}px;
        line-height: 1.4;
      }
    `;

    container.innerHTML = `
      <style>${css}</style>
      <div class="report-footer">
        <div class="footer-row">
          <div class="technician-section"><span class="signature-label">Technician Signature</span><div class="signature-line"></div></div>
          <div class="pathologist-section"><span class="signature-label">Pathologist Signature</span><div class="signature-line"></div></div>
        </div>
        <div class="footer-note">
          <p>Not Valid for Medico-Legal Purpose.</p>
          <p>Please Correlate Clinically.</p>
        </div>
      </div>`;

    return container;
  }

  /**
   * Generate HTML-based PDF
   */
  async generateHTMLBasedPDF(reportData: ReportData): Promise<Blob> {
    console.log('🎨 Generating HTML-based PDF report...');

    try {
      // Create main HTML and header elements
      const htmlElement = await this.createReportHTML(reportData);
      const headerElement = await this.createRepeatableHeaderHTML(reportData);
      const footerElement = await this.createRepeatableFooterHTML();
      document.body.appendChild(htmlElement);
      document.body.appendChild(headerElement);
      document.body.appendChild(footerElement);

      // Wait for images to load
      await Promise.all([
        this.waitForImages(htmlElement),
        this.waitForImages(headerElement),
        this.waitForImages(footerElement)
      ]);

      // Render canvases at high resolution
      const [canvas, headerCanvas, footerCanvas] = await Promise.all([
        html2canvas(htmlElement, {
          scale: 2.5, // Slightly reduced for better performance
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff',
          width: 850,
          height: htmlElement.scrollHeight + 50, // Extra space for safety
          scrollX: 0,
          scrollY: 0,
        }),
        html2canvas(headerElement, {
          scale: 2.5,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff',
          width: 850,
          height: headerElement.scrollHeight + 20,
          scrollX: 0,
          scrollY: 0,
        }),
        html2canvas(footerElement, {
          scale: 2.5,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff',
          width: 850,
          height: footerElement.scrollHeight + 20,
          scrollX: 0,
          scrollY: 0,
        }),
      ]);

      // Clean up DOM
      document.body.removeChild(htmlElement);
      document.body.removeChild(headerElement);
      document.body.removeChild(footerElement);

      // Initialize PDF
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = CONFIG.page.width;
      const pageHeight = CONFIG.page.height;
      const reportImgHeight = (canvas.height * imgWidth) / canvas.width;
      const headerImgHeight = (headerCanvas.height * imgWidth) / headerCanvas.width;
      const footerImgHeight = (footerCanvas.height * imgWidth) / footerCanvas.width;

      const reportDataUrl = canvas.toDataURL('image/png');
      const headerDataUrl = headerCanvas.toDataURL('image/png');
      const footerDataUrl = footerCanvas.toDataURL('image/png');

      // Clean and simple multi-page PDF generation
      // First page: Add full content (jsPDF will auto-clip at page boundary)
      pdf.addImage(reportDataUrl, 'PNG', 0, 0, imgWidth, reportImgHeight);
      // Mask bottom area and add footer at bottom of first page
      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, pageHeight - footerImgHeight - 1, imgWidth, footerImgHeight + 2, 'F');
      pdf.addImage(footerDataUrl, 'PNG', 0, pageHeight - footerImgHeight, imgWidth, footerImgHeight);

      // If content overflows, create additional pages
      if (reportImgHeight > pageHeight) {
        const contentPerPage = pageHeight - headerImgHeight - footerImgHeight - 5; // space minus header+footer
        let currentOffset = -pageHeight; // start from where first page ended
        let remainingHeight = reportImgHeight - pageHeight;

        while (remainingHeight > 10) { // Continue while significant content remains
          pdf.addPage();

          // Add repeatable header at top
          pdf.addImage(headerDataUrl, 'PNG', 0, 0, imgWidth, headerImgHeight);

          // Add content slice below header
          const contentY = headerImgHeight;
          pdf.addImage(reportDataUrl, 'PNG', 0, currentOffset + contentY, imgWidth, reportImgHeight);

          // Mask bottom area and add footer at bottom
          pdf.setFillColor(255, 255, 255);
          pdf.rect(0, pageHeight - footerImgHeight - 1, imgWidth, footerImgHeight + 2, 'F');
          pdf.addImage(footerDataUrl, 'PNG', 0, pageHeight - footerImgHeight, imgWidth, footerImgHeight);

          // Move to next content section
          currentOffset -= contentPerPage;
          remainingHeight -= contentPerPage;
        }
      }

      return pdf.output('blob');
    } catch (error) {
      console.error('❌ Error generating HTML-based PDF:', error);
      throw error;
    }
  }

}
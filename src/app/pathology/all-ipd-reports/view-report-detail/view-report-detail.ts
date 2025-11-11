import { Component, EventEmitter, Input, Output, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'app-view-report-detail',
  standalone: false,
  templateUrl: './view-report-detail.html',
  styleUrl: './view-report-detail.css'
})
export class ViewReportDetail {
 @Input() show = false;
  @Input() report: any = null;
  @Output() close = new EventEmitter<void>();

  onOverlayClick(): void { this.close.emit(); }
  onClose(): void { this.close.emit(); }

  // Utilities copied for encapsulation
  getPatientInitials(patientData: any): string {
    if (!patientData) return 'P';
    const firstName = patientData.firstName || patientData.fullName?.split(' ')[0] || '';
    const lastName = patientData.lastName || patientData.fullName?.split(' ')[1] || '';
    return (firstName.charAt(0) || 'P').toUpperCase() + (lastName.charAt(0) || '').toUpperCase();
  }
  // Edited-state helpers for per-cell change dropdowns
  openChanges: { [key: string]: boolean } = {};
  makeKey(param: any, field: string): string {
    const name = (param?.name || param?.testName || '').toString();
    return `${name}::${field}`;
  }
  toggleChange(key: string): void {
    this.openChanges[key] = !this.openChanges[key];
  }
  private lastEditEntry(): any | null {
    const hist = this.report?.editHistory;
    if (hist && hist.length) return hist[hist.length - 1] || null;
    return null;
  }
  private paramChangeFromDetails(param: any): { before: any; after: any } | null {
    const entry = this.lastEditEntry();
    const details = entry?.changes?.testResults?.details;
    if (Array.isArray(details)) {
      const pName = (param?.name || param?.testName || '').toString().toLowerCase();
      const hit = details.find((d: any) => String(d?.parameter || '').toLowerCase() === pName);
      if (hit && (hit.before !== undefined || hit.after !== undefined)) {
        return { before: hit.before, after: hit.after };
      }
    }
    return null;
  }
  private latestChanges(): any | null {
    const hist = this.report?.editHistory;
    if (hist && hist.length) return hist[hist.length - 1]?.changes || null;
    return null;
  }
  private findChangeFor(param: any, fields: string[]): { before: any; after: any } | null {
    // First, try structured details array from backend
    const fromDetails = this.paramChangeFromDetails(param);
    if (fromDetails) return fromDetails;

    // Fallback: look for key-based diffs (older format)
    const changes = this.latestChanges();
    if (!changes) return null;
    const pName = (param?.name || param?.testName || '').toString().toLowerCase();
    for (const key of Object.keys(changes)) {
      const kl = key.toString().toLowerCase();
      if (pName && !kl.includes(pName)) continue;
      for (const f of fields) {
        if (kl.includes(f.toLowerCase())) {
          return changes[key];
        }
      }
    }
    return null;
  }
  changeForResult(param: any) { return this.findChangeFor(param, ['result', 'value']); }
  changeForMax(param: any) { return this.findChangeFor(param, ['upper', 'max', 'maxvalue', 'uppervalue']); }
  changeForMin(param: any) { return this.findChangeFor(param, ['lower', 'min', 'minvalue', 'lowervalue']); }
  hasAnyChange(param: any): boolean {
    return !!(this.changeForResult(param) || this.changeForMax(param) || this.changeForMin(param));
  }
  getChangedFields(param: any): Array<{label: string; before: any; after: any}> {
    const out: Array<{label: string; before: any; after: any}> = [];
    const r = this.changeForResult(param);
    if (r) out.push({ label: 'Result', before: r.before, after: r.after });
    const mx = this.changeForMax(param);
    if (mx) out.push({ label: 'Max', before: mx.before, after: mx.after });
    const mn = this.changeForMin(param);
    if (mn) out.push({ label: 'Min', before: mn.before, after: mn.after });
    return out;
  }



  getTestCategories(testResults: any[]): any[] {
    if (!testResults || testResults.length === 0) return [];
    const categories: { [key: string]: any[] } = {};
    testResults.forEach(test => {
      const categoryName = test.category || test.testCategory || 'GENERAL TESTS';
      if (!categories[categoryName]) categories[categoryName] = [];
      categories[categoryName].push(test);
    });
    return Object.keys(categories).map(name => ({ name: name.toUpperCase(), tests: categories[name] }));
  }

  isAbnormalResult(test: any): boolean {
    if (!test?.result) return false;
    const result = parseFloat(test.result);

    // Prefer explicit lower/upper bounds if present
    const hasLower = test?.lowerValue !== undefined && test.lowerValue !== null && test.lowerValue !== '';
    const hasUpper = test?.upperValue !== undefined && test.upperValue !== null && test.upperValue !== '';
    if (hasLower || hasUpper) {
      const low = hasLower ? parseFloat(String(test.lowerValue)) : -Infinity;
      const up = hasUpper ? parseFloat(String(test.upperValue)) : Infinity;
      return result < low || result > up;
    }

    // Fallback to parsing normalValue text
    if (!test?.normalValue) return false;
    const normal = String(test.normalValue).toLowerCase();
    if (normal.includes('-')) {
      const parts = normal.split('-').map((v: string) => parseFloat(v.trim()));
      if (parts.length === 2) return result < parts[0] || result > parts[1];
    }
    return false;
  }

  getMaxValue(test: any): string {
    // Debug log to see what we're getting
    console.log('getMaxValue called with:', test);

    // Check all possible field names for upper bound
    if (test?.upperValue !== undefined && test.upperValue !== null && test.upperValue !== '') {
      console.log('Found upperValue:', test.upperValue);
      return String(test.upperValue);
    }
    if (test?.maxValue !== undefined && test.maxValue !== null && test.maxValue !== '') {
      console.log('Found maxValue:', test.maxValue);
      return String(test.maxValue);
    }

    const nv = test?.normalValue;
    if (typeof nv === 'string') {
      const range = nv.match(/(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)/);
      if (range) return range[2];
      // One-sided bounds mapping to MAX/MIN columns
      const lt = nv.match(/<\s*(\d+(?:\.\d+)?)/);
      if (lt) return lt[1]; // '< X' -> MAX = X
      const gt = nv.match(/>\s*(\d+(?:\.\d+)?)/);
      if (gt) return '-'; // '> X' -> MAX not defined
    }
    console.log('getMaxValue returning default: -');
    return '-';
  }

  getMinValue(test: any): string {
    // Debug log to see what we're getting
    console.log('getMinValue called with:', test);

    // Check all possible field names for lower bound
    if (test?.lowerValue !== undefined && test.lowerValue !== null && test.lowerValue !== '') {
      console.log('Found lowerValue:', test.lowerValue);
      return String(test.lowerValue);
    }
    if (test?.minValue !== undefined && test.minValue !== null && test.minValue !== '') {
      console.log('Found minValue:', test.minValue);
      return String(test.minValue);
    }

    const nv = test?.normalValue;
    if (typeof nv === 'string') {
      const range = nv.match(/(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)/);
      if (range) return range[1];
      // One-sided bounds mapping to MAX/MIN columns
      const lt = nv.match(/<\s*(\d+(?:\.\d+)?)/);
      if (lt) return '-'; // '< X' -> MIN not defined
      const gt = nv.match(/>\s*(\d+(?:\.\d+)?)/);
      if (gt) return gt[1]; // '> X' -> MIN = X
    }
    console.log('getMinValue returning default: -');
    return '-';
  }

  // Display helpers that prefer explicit values and treat 0 as valid
  getDisplayMax(test: any): string {
    if (test && test.upperValue !== undefined && test.upperValue !== null && test.upperValue !== '') {
      return String(test.upperValue);
    }
    if (test && test.maxValue !== undefined && test.maxValue !== null && test.maxValue !== '') {
      return String(test.maxValue);
    }
    return this.getMaxValue(test);
  }

  getDisplayMin(test: any): string {
    if (test && test.lowerValue !== undefined && test.lowerValue !== null && test.lowerValue !== '') {
      return String(test.lowerValue);
    }
    if (test && test.minValue !== undefined && test.minValue !== null && test.minValue !== '') {
      return String(test.minValue);
    }
    return this.getMinValue(test);
  }
}


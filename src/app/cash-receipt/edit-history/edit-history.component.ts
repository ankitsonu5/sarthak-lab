import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { PathologyInvoiceService } from '../../services/pathology-invoice.service';

interface EditedInvoiceRow {
  _id: string;
  receiptNumber: number | string;
  registrationNumber?: string | number;
  patientName: string;
  patientPhone?: string;
  patientGender?: string;
  patientAge?: string;
  testsCount: number;
  amount: number;
  paymentMode?: string;
  visitMode?: string;
  editedAt?: string | Date;
  raw: any;
}

@Component({
  selector: 'app-edit-history',
  standalone: false,
  templateUrl: './edit-history.component.html',
  styleUrls: ['./edit-history.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EditHistoryComponent implements OnInit {
  isLoading = false;
  rows: EditedInvoiceRow[] = [];
  filtered: EditedInvoiceRow[] = [];

  // filters
  qReceipt = '';
  qText = '';
  qPayment: 'All' | 'CASH' | 'CARD' | 'UPI' = 'All';
  qVisit: 'All' | 'OPD' | 'IPD' = 'All';

  // modal state (reuse edit-audit design)
  showEditAuditModal = false;
  selectedAuditRecord: any = null;

  constructor(private invoiceSvc: PathologyInvoiceService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void { this.load(); }

  private load(): void {
    this.isLoading = true;
    this.invoiceSvc.getAllInvoices(1, 300).subscribe({
      next: ({ invoices }) => {
        const list: any[] = Array.isArray(invoices) ? invoices : [];
        const edited = list.filter(r => {
          const adj = (r?.payment?.adjustments || []).filter((a: any) => (a?.reason || '').toUpperCase() === 'EDIT');
          const eh = r?.editHistory || [];
          return adj.length > 0 || eh.length > 0;
        });
        this.rows = edited.map(r => this.mapRow(r)).sort((a, b) => new Date(b.editedAt || 0).getTime() - new Date(a.editedAt || 0).getTime());
        this.applyFilters();
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: () => { this.isLoading = false; this.cdr.markForCheck(); }
    });
  }

  private mapRow(r: any): EditedInvoiceRow {
    const patient = r?.patient || r?.patientDetails || {};
    const name = patient?.name || `${patient?.firstName || ''} ${patient?.lastName || ''}`.trim() || r?.patientName || 'Patient';
    const reg = r?.registrationNumber || patient?.registrationNumber || '';
    const tests = (r?.tests || r?.items || []).length || 0;
    const amount = Number(r?.payment?.totalAmount ?? r?.totalAmount ?? 0) || 0;
    const paymentMode = (r?.payment?.paymentMethod || r?.payment?.method || '').toString().toUpperCase();
    const visitMode = (r?.mode || r?.payment?.mode || '').toString().toUpperCase();

    const adj = (r?.payment?.adjustments || []).filter((a: any) => (a?.reason || '').toUpperCase() === 'EDIT');
    const eh = r?.editHistory || [];
    const lastAdj = adj.length ? adj[adj.length - 1] : null;
    const lastEh = eh.length ? eh[eh.length - 1] : null;
    const editedAt = (lastAdj?.at || lastEh?.at || lastEh?.editedAt || r?.updatedAt || r?.editedAt || r?.createdAt);

    return {
      _id: r?._id,
      receiptNumber: r?.receiptNumber,
      registrationNumber: reg,
      patientName: name,
      patientPhone: patient?.phone || r?.contact,
      patientGender: patient?.gender || r?.gender,
      patientAge: patient?.age ? `${patient.age}${patient?.ageIn ? ' ' + patient.ageIn : ''}` : undefined,
      testsCount: tests,
      amount,
      paymentMode,
      visitMode,
      editedAt,
      raw: r
    };
  }

  clearFilters(): void {
    this.qReceipt = this.qText = '';
    this.qPayment = 'All';
    this.qVisit = 'All';
    this.applyFilters();
    this.cdr.markForCheck();
  }

  applyFilters(): void {
    const txt = this.qText.trim().toLowerCase();
    this.filtered = this.rows.filter(r => {
      const okReceipt = this.qReceipt ? String(r.receiptNumber).includes(this.qReceipt) : true;
      const okTxt = txt ? (
        r.patientName.toLowerCase().includes(txt) ||
        String(r.registrationNumber || '').toLowerCase().includes(txt) ||
        String(r.patientPhone || '').toLowerCase().includes(txt)
      ) : true;
      const okPay = this.qPayment === 'All' ? true : (r.paymentMode || '').includes(this.qPayment);
      const okVisit = this.qVisit === 'All' ? true : ((r.visitMode || (r.raw?.mode || r.raw?.payment?.mode || '')).toUpperCase() === this.qVisit);
      return okReceipt && okTxt && okPay && okVisit;
    });
    this.cdr.markForCheck();
  }

  // View modal
  openEditAudit(row: EditedInvoiceRow): void {
    this.selectedAuditRecord = row.raw;
    this.showEditAuditModal = true;
    this.cdr.markForCheck();
  }
  closeEditAudit(): void { this.showEditAuditModal = false; this.selectedAuditRecord = null; this.cdr.markForCheck(); }

  // Helpers used by the modal (minimal versions)
  formatCurrencyNumber(n: any): string { const x = Number(n || 0); return x.toLocaleString('en-IN', { maximumFractionDigits: 2 }); }
  absValue(n: number): number { return Math.abs(Number(n || 0)); }

  getLastEditedAt(r: any): Date | string | undefined {
    const adj = (r?.payment?.adjustments || []).filter((a: any) => (a?.reason || '').toUpperCase() === 'EDIT');
    const eh = r?.editHistory || [];
    return adj.length ? adj[adj.length - 1]?.at : (eh.length ? (eh[eh.length - 1]?.at || eh[eh.length - 1]?.editedAt) : undefined);
  }
  getLastEditedBy(r: any): string | undefined { const eh = r?.editHistory || []; return eh.length ? (eh[eh.length - 1]?.editedBy || eh[eh.length - 1]?.user) : undefined; }

  getEditDelta(r: any): number {
    const adj = (r?.payment?.adjustments || []).filter((a: any) => (a?.reason || '').toUpperCase() === 'EDIT');
    if (adj.length) return Number(adj[adj.length - 1]?.delta || 0);
    const eh = r?.editHistory || [];
    if (eh.length) {
      const ch = eh[eh.length - 1]?.changes || {};
      const before = Number(ch?.payment?.totalAmount?.before ?? ch?.beforeTotal ?? 0);
      const after = Number(ch?.payment?.totalAmount?.after ?? ch?.afterTotal ?? (r?.payment?.totalAmount ?? 0));
      return after - before;
    }
    return 0;
  }

  getPatientName(r: any): string { return r?.patient?.name || r?.patientName || `${r?.patient?.firstName || ''} ${r?.patient?.lastName || ''}`.trim(); }
  getPatientAge(r: any): string { const p = r?.patient || r?.patientDetails || {}; return p?.age ? `${p.age}${p?.ageIn ? ' ' + p.ageIn : ''}` : ''; }
  getPatientGender(r: any): string { const p = r?.patient || r?.patientDetails || {}; return p?.gender || r?.gender || ''; }
  getPatientPhone(r: any): string { const p = r?.patient || r?.patientDetails || {}; return p?.phone || r?.contact || ''; }
  getRegistrationNumber(r: any, _i?: number): string | number { return r?.registrationNumber || r?.patient?.registrationNumber || ''; }
  getVisitMode(r: any): string { return (r?.mode || r?.payment?.mode || '').toString().toUpperCase() || 'OPD'; }

  // Previous/After tests minimal
  private testsList(r: any): any[] { return Array.isArray(r?.tests) ? r.tests : (Array.isArray(r?.items) ? r.items : []); }
  getAfterTests(r: any): any[] { return this.testsList(r); }
  getPreviousTests(_r: any): any[] { const eh = _r?.editHistory || []; const prev = eh.length ? (eh[eh.length - 1]?.changes?.testsBefore || []) : []; return Array.isArray(prev) ? prev : []; }
  getAddedTests(_r: any): any[] { const eh = _r?.editHistory || []; const add = eh.length ? (eh[eh.length - 1]?.changes?.testsAdded || []) : []; return Array.isArray(add) ? add : []; }
  getRemovedTests(_r: any): any[] { const eh = _r?.editHistory || []; const rem = eh.length ? (eh[eh.length - 1]?.changes?.testsRemoved || []) : []; return Array.isArray(rem) ? rem : []; }
  getPreviousAmount(r: any): number | null {
    const eh = r?.editHistory || [];
    if (eh.length) {
      const ch = eh[eh.length - 1]?.changes || {};
      return Number(ch?.payment?.totalAmount?.before ?? ch?.beforeTotal ?? 0);
    }
    return null;
  }
  getAmount(r: any): number { return Number(r?.payment?.totalAmount ?? r?.totalAmount ?? 0); }
  getAddedTotal(r: any): number { const arr = this.getAddedTests(r); return arr.reduce((s, t) => s + Number(t?.netAmount ?? t?.amount ?? t?.cost ?? 0), 0); }
  getRemovedTotal(r: any): number { const arr = this.getRemovedTests(r); return arr.reduce((s, t) => s + Number(t?.netAmount ?? t?.amount ?? t?.cost ?? 0), 0); }

  // Header metrics
  get totalCount(): number { return (this.rows || []).length; }
  get showingCount(): number { return (this.filtered || []).length; }
  get todayCount(): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return (this.rows || []).filter(r => {
      const d = new Date(r.editedAt as any);
      if (isNaN(d.getTime())) return false;
      d.setHours(0, 0, 0, 0);
      return d.getTime() === today.getTime();
    }).length;
  }
}


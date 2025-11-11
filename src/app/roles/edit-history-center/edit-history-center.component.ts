import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { AuditLogService, AuditLogEntry } from '../../services/audit-log.service';
import { localDateYmd } from '../../core/utils/date.util';

interface TabDef { key: string; label: string; entities: string[]; }

@Component({
  selector: 'app-edit-history-center',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './edit-history-center.component.html',
  styleUrls: ['./edit-history-center.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EditHistoryCenterComponent implements OnInit {
  loading = false;
  date = localDateYmd();
  tabs: TabDef[] = [
    { key: 'Patient', label: 'Patient', entities: ['Patient'] },
    { key: 'Appointment', label: 'Appointment', entities: ['Appointment', 'OldPatient'] },
    { key: 'PathologyInvoice', label: 'Cash Receipt', entities: ['PathologyInvoice'] },
    { key: 'Report', label: 'Report', entities: ['Report'] }
  ];
  active = this.tabs[0].key;

  grouped: Record<string, AuditLogEntry[]> = {};
  // Filters / UI state
  qText = '';
  // Default to UPDATE only: user wants to see only edits by default
  qAction: 'ALL' | 'CREATE' | 'UPDATE' | 'DELETE' = 'UPDATE';

  // Utility to mark for check on filter input changes
  onFilterChange() { this.cdr.markForCheck(); }

  // Quick date navigation
  prevDay() {
    const d = new Date(this.date);
    d.setDate(d.getDate() - 1);
    this.date = localDateYmd(d);
    this.load();
  }
  nextDay() {
    const d = new Date(this.date);
    d.setDate(d.getDate() + 1);
    this.date = localDateYmd(d);
    this.load();
  }
  today() {
    this.date = localDateYmd();
    this.load();
  }

  getCountFor(key: string): number {
    // Show unique entity count (e.g., unique patients edited)
    const tab = this.tabs.find(t => t.key === key);
    if (!tab) return 0;
    const ids = new Set<string>();
    for (const ent of tab.entities) {
      for (const row of (this.grouped[ent] || [])) {
        if (row?.entityId) ids.add(String(row.entityId));
      }
    }
    return ids.size;
  }


  constructor(private svc: AuditLogService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void { this.load(); }

  setActive(k: string) { this.active = k; }

  load(): void {
    this.loading = true;
    const ents = Array.from(new Set(this.tabs.flatMap(t => t.entities)));
    this.svc.getDaily(this.date, ents).subscribe({
      next: (res) => {
        this.grouped = res.grouped || {};
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => { this.loading = false; this.cdr.markForCheck(); }
    });
  }

  entriesForActive(): AuditLogEntry[] {
    const tab = this.tabs.find(t => t.key === this.active);
    if (!tab) return [];
    const all = tab.entities.flatMap(e => this.grouped[e] || []);

    const txt = this.qText.trim().toLowerCase();
    const action = this.qAction;
    const matches = (row: AuditLogEntry) => {
      if (action !== 'ALL' && row.action !== action) return false;
      if (!txt) return true;
      const parts: string[] = [];
      parts.push(String(row.entityId || ''));
      const by = row.by || {} as any;
      if (by.name) parts.push(String(by.name));
      if (by.role) parts.push(String(by.role));
      const meta = (row as any).meta || {};
      if (meta.patientId) parts.push(String(meta.patientId));
      if (meta.appointmentId) parts.push(String(meta.appointmentId));
      if (meta.receiptNumber) parts.push(String(meta.receiptNumber));
      const diff = row.diff || {};
      for (const k of Object.keys(diff)) {
        parts.push(k);
        const d = (diff as any)[k];
        parts.push(String(d?.before ?? ''));
        parts.push(String(d?.after ?? ''));
      }
      return parts.join(' ').toLowerCase().includes(txt);
    };

    // Apply additional filter: hide rows with no meaningful changes for detailed entities
    const rows = all.filter(matches).filter((e) => {
      if (e.action !== 'UPDATE') return true;
      if (!this.shouldShowDetailed(e)) return true;
      return this.changeItems(e).length > 0; // keep only meaningful
    });

    return rows.sort((a,b) => new Date(b.at as any).getTime() - new Date(a.at as any).getTime());
  }
  // Detailed diffs are shown for Patient, Appointment and Cash Receipt
  isCash(e: AuditLogEntry) { return (e?.entityType || '') === 'PathologyInvoice'; }
  isPatient(e: AuditLogEntry) { return (e?.entityType || '') === 'Patient'; }
  isAppointment(e: AuditLogEntry) { const t = (e?.entityType || ''); return t === 'Appointment' || t === 'OldPatient'; }
  shouldShowDetailed(e: AuditLogEntry) { return this.isCash(e) || this.isPatient(e) || this.isAppointment(e); }

  changeItems(e: AuditLogEntry): Array<{ field: string; label: string; before: any; after: any; type: 'add'|'remove'|'edit' }>{
    const diff = e?.diff || {} as any;
    const keys = Object.keys(diff);
    // Always exclude noise + DOB
    const exclude = /(updatedAt|createdAt|lastEditedAt|printedAt|collectionDate|bookingDate|registrationDate|dateOfBirth|dob|__v|_id|yearNumber|todayNumber|buffer)/i;
    const items: Array<{ field: string; label: string; before: any; after: any; type: 'add'|'remove'|'edit' }> = [];

    // For Patient: show only basic identity/contact fields
    const includePatient = /(firstName|lastName|name|age|address|phone|contact|gender|aadhar|aadhaar)/i;

    const labelMap: Record<string,string> = {
      'firstName': 'First Name',
      'lastName': 'Last Name',
      'name.first': 'First Name',
      'name.last': 'Last Name',
      'phone': 'Phone',
      'contact': 'Phone',
      'aadharNo': 'Aadhaar',
      'aadhaar': 'Aadhaar',
      'address.street': 'Address',
      'address.city': 'City',
      'address.post': 'Post',
      'age': 'Age',
      'gender': 'Gender',
      'payment.totalAmount': 'Total Amount',
      'payment.paidAmount': 'Paid Amount',
      'payment.dueAmount': 'Due Amount'
    };

    const pretty = (k: string) => {
      const mapped = labelMap[k];
      if (mapped) return mapped;
      const last = k.split('.').pop() || k;
      return last
        .replace(/([A-Z])/g, ' $1')
        .replace(/_/g, ' ')
        .replace(/\bId\b/i, 'ID')
        .replace(/^./, c => c.toUpperCase());
    };
    const isTimestampish = (v: any) => typeof v === 'string' && /T\d\d:\d\d/.test(v);

    const isTestsKey = (k: string) => /(^|\.)tests($|Before|After)$/i.test(k);
    const testKey = (t: any) => String(t?.testDefinitionId || t?.serviceHeadId || `${(t?.name||t?.testName||'').toString().trim()}`);
    const testName = (t: any) => (t?.name || t?.testName || '').toString();

    // For Appointment/FollowUp, only show these
    const includeAppointment = /(department|room|doctor|appointment(Date|Time)|status)/i;

    for (const k of keys) {
      if (exclude.test(k)) continue;
      // Hide noisy fields for Cash Receipt logs
      if (this.isCash(e) && (/^editHistory(\.|$)/i.test(k) || /(^|\.)payment\.adjustments/i.test(k))) continue;
      if (this.isPatient(e) && !includePatient.test(k)) continue;
      if (this.isAppointment(e) && !includeAppointment.test(k)) continue;

      const before = diff[k]?.before;
      const after = diff[k]?.after;
      // Special rendering for tests array to avoid "[object Object]"
      if (isTestsKey(k) && (Array.isArray(before) || Array.isArray(after))) {
        const b = Array.isArray(before) ? before : [];
        const a = Array.isArray(after) ? after : [];
        const bMap = new Map(b.map(x => [testKey(x), x]));
        const aMap = new Map(a.map(x => [testKey(x), x]));
        const removed: string[] = [];
        const added: string[] = [];
        const changed: string[] = [];
        for (const [k2, v] of bMap.entries()) {
          if (!aMap.has(k2)) removed.push(testName(v));
          else {
            const nv = aMap.get(k2);
            const sig = (t:any)=> `${Number(t?.quantity??1)}|${Number(t?.cost??t?.netAmount??0)}|${Number(t?.discount??0)}`;
            if (sig(v) !== sig(nv)) changed.push(testName(nv));
          }
        }
        for (const [k2, v] of aMap.entries()) {
          if (!bMap.has(k2)) added.push(testName(v));
        }
        if (removed.length) items.push({ field: k, label: 'Tests', before: removed, after: '', type: 'remove' });
        if (added.length) items.push({ field: k, label: 'Tests', before: '', after: added, type: 'add' });
        if (changed.length) items.push({ field: k, label: 'Tests', before: changed, after: changed, type: 'edit' });
        continue;
      }

      // Skip timestamps/noisy numbers
      if (isTimestampish(before) || isTimestampish(after)) continue;
      const bEmpty = before === undefined || before === null || String(before).trim?.() === '';
      const aEmpty = after === undefined || after === null || String(after).trim?.() === '';
      let type: 'add'|'remove'|'edit' = 'edit';
      if (bEmpty && !aEmpty) type = 'add';
      else if (!bEmpty && aEmpty) type = 'remove';
      else if (JSON.stringify(before) === JSON.stringify(after)) continue;

      items.push({ field: k, label: pretty(k), before, after, type });
      if (items.length >= 8) break; // keep concise
    }
    return items;
  }

  // Format values for display in HTML (avoid [object Object])
  showVal(v: any, field?: string): string {
    const emptyish = (x: any) => x === undefined || x === null || (typeof x === 'string' && x.trim() === '');
    if (emptyish(v)) return '—';
    const isAmountField = field ? /^payment\.(totalAmount|paidAmount|dueAmount)$/i.test(field) : false;
    const asCurrency = (n: any) => {
      const num = Number(n);
      if (isNaN(num)) return String(n);
      return `₹${num.toLocaleString('en-IN')}`;
    };
    if (Array.isArray(v)) {
      // For tests arrays we expect list of names already
      if (field && /tests/i.test(field)) return v.map(x => (typeof x === 'string' ? x : (x?.name || x?.testName || JSON.stringify(x)))).join(', ');
      const out = v.map(x => (typeof x === 'object' ? JSON.stringify(x) : (isAmountField ? asCurrency(x) : String(x).trim()))).join(', ');
      return out === '' ? '—' : out;
    }
    if (typeof v === 'object') return JSON.stringify(v);
    const s = String(v).trim();
    return isAmountField ? asCurrency(s) : (s === '' ? '—' : s);
  }

  // Make a short human string for changes
  previewChanges(e: AuditLogEntry): string {
    const diff = e.diff || {};
    const items = Object.keys(diff).slice(0, 3).map(k => `${k}: ${this.val(diff[k].before)} → ${this.val(diff[k].after)}`);
    const more = Math.max(0, Object.keys(diff).length - items.length);
    return items.join('; ') + (more ? ` (+${more} more)` : '');
  }
  private val(v: any) {
    if (v === undefined) return '—';
    if (v === null) return 'null';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }
}


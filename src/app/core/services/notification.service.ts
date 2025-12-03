import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { DataRefreshService, RefreshEvent } from './data-refresh.service';

import { SelfRegistrationService } from '../../shared/services/self-registration.service';
import { Auth, User } from './auth';

export type NotificationType = 'appointments' | 'pathology' | 'cashReceipts' | 'system';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  createdAt: string; // ISO string for easy storage
  read?: boolean;
  data?: any;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly storageKey = 'appNotifications';
    // Store self-registration entries that have already been checked/handled
    private readonly selfRegHandledKey = 'appNotificationsSelfRegHandled';
    private handledSelfRegIds: Set<string> = this.loadHandledSelfRegs();
  private notificationsSubject = new BehaviorSubject<AppNotification[]>(this.loadFromStorage());
  public notifications$ = this.notificationsSubject.asObservable();
  public unreadCount$: Observable<number> = this.notifications$.pipe(
    map(list => list.filter(n => !n.read).length)
  );

  constructor(private dataRefresh: DataRefreshService, private selfReg: SelfRegistrationService, private auth: Auth) {
    // Listen to global data refresh/booking events and convert them to notifications
    try {
      this.dataRefresh.refresh$.subscribe(ev => this.handleRefreshEvent(ev));
    } catch {}
    // Start polling public self-registrations to surface as notifications
    try { this.initSelfRegPolling(); } catch {}
  }

  // --- Public API ---
  add(notification: AppNotification): void {
    const list = [notification, ...this.notificationsSubject.value].slice(0, 30);
    this.notificationsSubject.next(list);
    this.saveToStorage(list);
  }

  markAllRead(): void {
	    const list = this.notificationsSubject.value.map(n => ({ ...n, read: true }));
	    // Once user has opened the notifications, treat all self-reg items as handled
	    this.markSelfRegsHandledFromList(list);
	    this.notificationsSubject.next(list);
	    this.saveToStorage(list);
  }

  clear(): void {
	    // When clearing, remember all self-reg IDs so we don't notify again for same entries
	    this.markSelfRegsHandledFromList(this.notificationsSubject.value);
	    this.notificationsSubject.next([]);
	    this.saveToStorage([]);
  }

  // --- Helpers ---
  private handleRefreshEvent(ev: RefreshEvent): void {
    const now = new Date().toISOString();
    let n: AppNotification | null = null;

    if (ev.entity === 'appointments' && (ev.action === 'CREATE' || ev.action === 'UPDATE')) {
      const name = ev.data?.patient?.name || ev.data?.patientName || '';
      n = {
        id: this.uuid(),
        type: 'appointments',
        title: ev.action === 'CREATE' ? 'New appointment booked' : 'Appointment updated',
        message: name ? `${name}` : undefined,
        createdAt: now,
        read: false,
        data: ev.data
      };
    }

    if ((ev.entity === 'pathology') && (ev.action === 'BOOKED' || ev.action === 'CREATE')) {
      const reg = ev.data?.registrationNumber || ev.data?.receiptNumber || '';
      n = {
        id: this.uuid(),
        type: 'pathology',
        title: 'Pathology test booked',
        message: reg ? `Reg No: ${reg}` : undefined,
        createdAt: now,
        read: false,
        data: ev.data
      };
    }

    if (ev.entity === 'cashReceipts' && ev.action === 'CREATE') {
      const amount = ev.data?.amount ? `₹${ev.data.amount}` : '';
      n = {
        id: this.uuid(),
        type: 'cashReceipts',
        title: 'New cash receipt',
        message: amount,
        createdAt: now,
        read: false,
        data: ev.data

      };
    }

    if (n) this.add(n);
  }

  private loadFromStorage(): AppNotification[] {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return [];
      const parsed: AppNotification[] = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }

  private saveToStorage(list: AppNotification[]) {
    try { localStorage.setItem(this.storageKey, JSON.stringify(list)); } catch {}
  }

	  // --- Self-registration handled IDs persistence ---
	  private loadHandledSelfRegs(): Set<string> {
	    try {
	      const raw = localStorage.getItem(this.selfRegHandledKey);
	      if (!raw) return new Set<string>();
	      const parsed: any = JSON.parse(raw);
	      if (!Array.isArray(parsed)) return new Set<string>();
	      const ids = parsed
	        .filter((x: any) => typeof x === 'string' && x)
	        .map((x: any) => String(x));
	      return new Set<string>(ids);
	    } catch {
	      return new Set<string>();
	    }
	  }

	  private saveHandledSelfRegs(): void {
	    try {
	      const arr = Array.from(this.handledSelfRegIds);
	      localStorage.setItem(this.selfRegHandledKey, JSON.stringify(arr));
	    } catch {}
	  }

	  // Public helper: mark a specific self-registration entry as handled
	  markSelfRegHandled(id: string | null | undefined): void {
	    if (!id) return;
	    this.handledSelfRegIds.add(String(id));
	    this.saveHandledSelfRegs();
	  }

	  // Internal helper: mark all self-reg notifications in the given list as handled
	  private markSelfRegsHandledFromList(list: AppNotification[]): void {
	    if (!list || list.length === 0) return;
	    for (const n of list) {
	      try {
	        const data = n?.data;
	        if (data && data.source === 'selfReg' && data.id) {
	          this.handledSelfRegIds.add(String(data.id));
	        }
	      } catch {}
	    }
	    this.saveHandledSelfRegs();
	  }

  private uuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // Poll public self-registrations and add as notifications
  private selfRegTimer: any;
  private initSelfRegPolling(): void {
    // First check immediately, then every 60s
    this.checkSelfRegistrations();
    try { this.selfRegTimer = setInterval(() => this.checkSelfRegistrations(), 60_000); } catch {}
  }

  private getCurrentLabCode(): string | null {
    try {
      const u: User | null = this.auth.getCurrentUser();
      if (u?.lab?.['labCode']) return String(u.lab['labCode']);
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const parsed = JSON.parse(userStr);
        if (parsed?.lab?.['labCode']) return String(parsed.lab['labCode']);
      }
    } catch {}
    return null;
  }

  private getCurrentLabId(): string | null {
    try {
      const u: User | null = this.auth.getCurrentUser();
      if (u?.lab?.['_id']) return String(u.lab['_id']);
      if (u?.labId) return String(u.labId);
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const parsed = JSON.parse(userStr);
        if (parsed?.lab?.['_id']) return String(parsed.lab['_id']);
        if (parsed?.labId) return String(parsed.labId);
      }
    } catch {}
    return null;
  }


	  private checkSelfRegistrations(): void {
	    try {
	      const labCode = this.getCurrentLabCode();
	      const labId = this.getCurrentLabId();
	      if (labCode) {
	        this.selfReg.listRecentByCode(labCode).subscribe({
	          next: (res) => {
	            const items: any[] = (res as any)?.items || [];
	            if (!Array.isArray(items) || items.length === 0) return;
	            const existing = this.notificationsSubject.value;
	            const existingIds = new Set(existing
	              .filter(n => n?.data?.source === 'selfReg')
	              .map(n => n.data?.id));
	            const handledIds = this.handledSelfRegIds;
	            const now = new Date().toISOString();
	            for (const it of items) {
	              if (it && it.id && !existingIds.has(it.id) && !handledIds.has(String(it.id))) {
	                this.add({
	                  id: this.uuid(),
	                  type: 'system',
	                  title: 'New self-registration',
	                  message: `${(it.firstName || '') + ' ' + (it.lastName || '')} \u2022 ${it.phone || ''}`.trim(),
	                  createdAt: now,
	                  read: false,
	                  data: { source: 'selfReg', id: it.id, payload: it }
	                });
	              }
	            }
	          },
	          error: () => {}
	        });
	      } else if (labId) {
	        this.selfReg.listRecent(labId).subscribe({
	          next: (res) => {
	            const items: any[] = (res as any)?.items || [];
	            if (!Array.isArray(items) || items.length === 0) return;
	            const existing = this.notificationsSubject.value;
	            const existingIds = new Set(existing
	              .filter(n => n?.data?.source === 'selfReg')
	              .map(n => n.data?.id));
	            const handledIds = this.handledSelfRegIds;
	            const now = new Date().toISOString();
	            for (const it of items) {
	              if (it && it.id && !existingIds.has(it.id) && !handledIds.has(String(it.id))) {
	                this.add({
	                  id: this.uuid(),
	                  type: 'system',
	                  title: 'New self-registration',
	                  message: `${(it.firstName || '') + ' ' + (it.lastName || '')} \u2022 ${it.phone || ''}`.trim(),
	                  createdAt: now,
	                  read: false,
	                  data: { source: 'selfReg', id: it.id, payload: it }
	                });
	              }
	            }
	          },
	          error: () => {}
	        });
	      }
	    } catch {}
	  }

}


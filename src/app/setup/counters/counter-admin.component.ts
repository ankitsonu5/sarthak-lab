import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Auth } from '../../core/services/auth';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-counter-admin',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div style="padding:16px; max-width:900px;">
      <h2>Counter Admin</h2>
      <p *ngIf="!labCode">No lab selected or lab code unavailable.</p>

      <div *ngIf="labCode">
        <table style="width:100%; border-collapse: collapse; margin-top: 12px;">
          <thead>
            <tr style="text-align:left; border-bottom:1px solid #e5e7eb;">
              <th style="padding:8px 12px">Counter</th>
              <th style="padding:8px 12px">Current Value</th>
              <th style="padding:8px 12px">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let c of counters" style="border-bottom:1px solid #f3f4f6;">
              <td style="padding:8px 12px">{{c.name}}</td>
              <td style="padding:8px 12px">{{c.valueDisplay}}</td>
              <td style="padding:8px 12px">
                <button (click)="refreshCounter(c)" style="margin-right:8px;">Refresh</button>
                <button (click)="resetCounterPrompt(c)" style="margin-right:8px;">Reset</button>
                <button (click)="nextCounter(c)">Get Next</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `
})
export class CounterAdminComponent implements OnInit {
  labCode: string | null = null;
  counters: Array<{ name: string; value: number | string; valueDisplay: string }> = [];

  constructor(private http: HttpClient, private auth: Auth) {}

  ngOnInit(): void {
    try {
      const u: any = this.auth.getCurrentUser();
      this.labCode = u?.lab?.labCode || null;
    } catch {
      this.labCode = null;
    }

    if (this.labCode) {
      const selfName = `self_registration_${this.labCode}`;
      const labName = `lab_registration_${this.labCode}`;
      this.counters = [
        { name: selfName, value: 0, valueDisplay: 'Loading...' },
        { name: labName, value: 0, valueDisplay: 'Loading...' }
      ];
      this.counters.forEach(c => this.refreshCounter(c));
    }
  }

  private apiBase() { return environment.apiUrl + '/counter-management'; }

  refreshCounter(c: any) {
    const url = `${this.apiBase()}/${encodeURIComponent(c.name)}`;
    this.http.get<any>(url).subscribe({
      next: (res) => {
        const val = res?.data?.value ?? res?.data ?? 0;
        c.value = val;
        c.valueDisplay = String(val);
      },
      error: (err) => {
        c.valueDisplay = 'Error';
        console.error('Failed to fetch counter', c.name, err);
      }
    });
  }

  resetCounterPrompt(c: any) {
    const ans = prompt(`Enter new value for ${c.name} (numeric). Current: ${c.valueDisplay}`, String(c.value || 0));
    if (ans === null) return;
    const v = parseInt(String(ans || '0'), 10);
    if (isNaN(v)) {
      alert('Please enter a valid number');
      return;
    }
    this.resetCounter(c, v);
  }

  resetCounter(c: any, value: number) {
    const url = `${this.apiBase()}/reset/${encodeURIComponent(c.name)}`;
    this.http.post<any>(url, { value }).subscribe({
      next: (res) => {
        alert(`Counter ${c.name} reset to ${value}`);
        this.refreshCounter(c);
      },
      error: (err) => {
        console.error('Failed to reset counter', c.name, err);
        alert('Failed to reset counter. See console.');
      }
    });
  }

  nextCounter(c: any) {
    const url = `${this.apiBase()}/next/${encodeURIComponent(c.name)}`;
    // Request next value with padding/format according to our prefixes
    const body = { format: c.name.startsWith('self_') ? 'SR-' : 'LAB-', padding: 4 };
    this.http.post<any>(url, body).subscribe({
      next: (res) => {
        const formatted = res?.data?.formattedId || (res?.data?.formatted ?? res?.data);
        alert(`Next value: ${formatted}`);
        this.refreshCounter(c);
      },
      error: (err) => {
        console.error('Failed to get next counter value', c.name, err);
        alert('Failed to get next value. See console.');
      }
    });
  }
}

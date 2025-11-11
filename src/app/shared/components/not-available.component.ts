import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-not-available',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="na-container">
      <div class="na-card">
        <div class="na-chip">Coming Soon</div>
        <h1>{{ title || 'Module not available' }}</h1>
        <p>{{ message || 'This module/page is not available right now. Please check back later.' }}</p>
        <div class="sections" *ngIf="tips?.length">
          <div class="tip" *ngFor="let t of tips">• {{ t }}</div>
        </div>
        <div class="actions">
          <a routerLink="/dashboard/admin" class="btn primary">Go to Dashboard</a>
          <a routerLink="/cash-receipt/register-opt-ipd" class="btn">Go to Cash Receipt</a>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .na-container{display:flex;align-items:center;justify-content:center;min-height:calc(100vh - 60px);background:#f8fafc;padding:20px}
    .na-card{background:white;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.06);padding:28px;max-width:640px;width:100%;text-align:center}
    .na-chip{display:inline-block;background:#eef2ff;color:#4f46e5;border:1px solid #c7d2fe;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:700;margin-bottom:8px}
    h1{margin:6px 0 8px;color:#111827;font-size:20px;font-weight:700}
    p{margin:0 0 14px;color:#6b7280}
    .sections{margin:10px 0 16px;text-align:left;color:#374151}
    .tip{margin:4px 0}
    .actions{display:flex;gap:10px;justify-content:center}
    .btn{display:inline-block;padding:10px 14px;border-radius:8px;border:1px solid #e5e7eb;text-decoration:none;color:#111827;font-weight:600;background:#fff}
    .btn.primary{background:#2563eb;color:#fff;border-color:#2563eb}
    .btn.primary:hover{background:#1d4ed8}
  `]
})
export class NotAvailableComponent implements OnInit {
  @Input() title?: string;
  @Input() message?: string;
  @Input() tips?: string[];

  constructor(private route: ActivatedRoute) {}
  ngOnInit(): void {
    const data = this.route.snapshot.data || {};
    this.title = this.title || data['title'];
    this.message = this.message || data['message'];
    if (!this.tips || this.tips.length === 0) this.tips = data['tips'] || [];
  }
}


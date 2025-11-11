import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="nf-container">
      <div class="nf-card">
        <div class="nf-code">404</div>
        <h1>Page not found</h1>
        <p>The page you are looking for doesn't exist or has been moved.</p>
        <div class="actions">
          <a routerLink="/dashboard/admin" class="btn primary">Go to Dashboard</a>
          <a routerLink="/auth/login" class="btn">Login</a>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .nf-container{display:flex;align-items:center;justify-content:center;min-height:calc(100vh - 60px);background:#f8fafc;padding:20px}
    .nf-card{background:white;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.06);padding:32px;max-width:520px;width:100%;text-align:center}
    .nf-code{font-size:56px;font-weight:800;color:#1d4ed8;letter-spacing:2px;margin-bottom:8px}
    h1{margin:8px 0 6px 0;color:#111827;font-size:20px;font-weight:700}
    p{margin:0 0 18px 0;color:#6b7280}
    .actions{display:flex;gap:10px;justify-content:center}
    .btn{display:inline-block;padding:10px 14px;border-radius:8px;border:1px solid #e5e7eb;text-decoration:none;color:#111827;font-weight:600;background:#fff}
    .btn.primary{background:#2563eb;color:#fff;border-color:#2563eb}
    .btn.primary:hover{background:#1d4ed8}
  `]
})
export class NotFoundComponent {}


import { Component } from '@angular/core';
import { Auth } from '../../core/services/auth';

@Component({
  selector: 'app-forgot-password',
  standalone: false,
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.css'
})
export class ForgotPassword {
  email = '';
  msg = '';
  err = '';
  loading = false;

  constructor(private auth: Auth) {}

  send() {
    if (!this.email) { this.err = 'Enter your email'; this.msg = ''; return; }
    this.loading = true; this.err = ''; this.msg = '';
    this.auth.forgotPassword(this.email).subscribe({
      next: (res) => { this.loading = false; this.msg = res.message || 'If the email exists, a reset link has been sent'; },
      error: (e) => { this.loading = false; this.err = e?.error?.message || 'Failed to send reset link'; }
    });
  }
}

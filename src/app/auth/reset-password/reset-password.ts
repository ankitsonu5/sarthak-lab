import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Auth } from '../../core/services/auth';

@Component({
  selector: 'app-reset-password',
  standalone: false,
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.css'
})
export class ResetPasswordComponent {
  token = '';
  password = '';
  confirm = '';
  msg = '';
  err = '';
  loading = false;

  constructor(private route: ActivatedRoute, private router: Router, private auth: Auth) {
    this.token = this.route.snapshot.queryParamMap.get('token') || '';
  }

  reset() {
    this.err = '';
    this.msg = '';
    if (!this.token) { this.err = 'Invalid or missing token.'; return; }
    if (!this.password || this.password.length < 6) { this.err = 'Password must be at least 6 characters.'; return; }
    if (this.password !== this.confirm) { this.err = 'Passwords do not match.'; return; }

    this.loading = true;
    this.auth.resetPassword(this.token, this.password).subscribe({
      next: (res) => { this.loading = false; this.msg = res.message || 'Password reset successfully'; },
      error: (e) => { this.loading = false; this.err = e?.error?.message || 'Failed to reset password'; }
    });
  }

  goLogin() { this.router.navigate(['/auth/login']); }
}


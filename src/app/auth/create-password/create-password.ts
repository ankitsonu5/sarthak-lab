import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Auth } from '../../core/services/auth';

@Component({
  selector: 'app-create-password',
  standalone: false,
  templateUrl: './create-password.html',
  styleUrl: './create-password.css'
})
export class CreatePasswordComponent {
  token = '';
  password = '';
  confirm = '';
  msg = '';
  err = '';
  loading = false;

  constructor(private route: ActivatedRoute, private router: Router, private auth: Auth) {
    this.token = this.route.snapshot.queryParamMap.get('token') || '';
  }

  create() {
    this.err = '';
    this.msg = '';

    if (!this.token) {
      this.err = 'Invalid or missing token.';
      return;
    }

    if (!this.password || this.password.length < 6) {
      this.err = 'Password must be at least 6 characters.';
      return;
    }

    if (this.password !== this.confirm) {
      this.err = 'Passwords do not match.';
      return;
    }

    this.loading = true;
    this.auth.createPassword(this.token, this.password).subscribe({
      next: (res) => {
        this.loading = false;
        this.msg = res.message || 'Password created successfully. You can now log in.';
      },
      error: (e) => {
        this.loading = false;
        this.err = e?.error?.message || 'Failed to create password';
      }
    });
  }

  goLogin() {
    this.router.navigate(['/auth/login']);
  }
}


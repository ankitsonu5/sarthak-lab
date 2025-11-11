import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth, LoginRequest } from '../../core/services/auth';

@Component({
  selector: 'app-login',
  standalone: false,
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class Login implements OnInit {
  loginForm!: FormGroup;
  loading = false;
  error = '';
  hidePassword = true;

  constructor(
    private formBuilder: FormBuilder,
    private authService: Auth,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Clear any invalid auth data first
    this.clearInvalidAuth();

    this.loginForm = this.formBuilder.group({
      email: ['admin@hospital.com', [Validators.required, Validators.email]],
      password: ['admin123', [Validators.required, Validators.minLength(6)]]
    });

    // Clear any existing errors
    this.error = '';

    // Check if user is already logged in with valid token
    if (this.authService.isLoggedIn()) {
      console.log('User already logged in, redirecting based on role');
      const user = this.authService.getCurrentUser();
      if (user?.role === 'Pathology') {
        this.router.navigate(['/dashboard/pathology']);
      } else if (user?.role === 'SuperAdmin') {
        this.router.navigate(['/roles/super-admin']);
      } else if (user?.role === 'Admin') {
        this.router.navigate(['/dashboard/admin']);
      } else if (user?.role === 'Pharmacy') {
        this.router.navigate(['/pharmacy']);
      }
    }
  }

  clearInvalidAuth(): void {
    console.log('🧹 Clearing any invalid authentication data');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.authService.clearAuthData();
  }

  clearAndLogin(): void {
    console.log('🧹 Clear and fresh login');
    this.clearInvalidAuth();
    this.error = '';
    this.loginForm.patchValue({
      email: 'admin@hospital.com',
      password: 'admin123'
    });
    this.onSubmit();
  }



  onSubmit(): void {
    if (this.loginForm.valid) {
      this.loading = true;
      this.error = '';

      const credentials: LoginRequest = this.loginForm.value;
      console.log('🔄 Attempting login with:', credentials);

      // Always use real authentication (no bypass)
      this.authService.login(credentials).subscribe({
        next: (response) => {
          console.log('✅ Login successful:', response);
          this.loading = false;

          // FAST ROUTING: Use Angular router instead of window.location
          if (response.user.role === 'Pathology') {
            console.log('🔄 Fast navigation to pathology dashboard...');
            this.router.navigate(['/dashboard/pathology'], { replaceUrl: true });
          } else if (response.user.role === 'SuperAdmin') {
            console.log('🔄 Fast navigation to super admin dashboard...');
            this.router.navigate(['/roles/super-admin'], { replaceUrl: true });
          } else if (response.user.role === 'Admin') {
            console.log('🔄 Fast navigation to admin dashboard...');
            this.router.navigate(['/dashboard/admin'], { replaceUrl: true });
          } else if (response.user.role === 'Pharmacy') {
            console.log('🔄 Fast navigation to pharmacy dashboard...');
            this.router.navigate(['/pharmacy'], { replaceUrl: true });
          } else {
            console.log('❌ Unknown role, redirecting to login');
            this.router.navigate(['/auth/login'], { replaceUrl: true });
          }
        },
        error: (error) => {
          console.error('❌ Login error:', error);
          this.loading = false;

          // If server is not available, show helpful message
          if (error.status === 0 || error.status === 500) {
            this.error = 'Server is not running. Please check backend server.';
          } else {
            this.error = error.error?.message || 'Login failed. Please try again.';
          }
        }
      });
    } else {
      console.log('❌ Form is invalid:', this.loginForm.errors);
      this.error = 'Please fill in all required fields correctly.';
    }
  }

  get email() { return this.loginForm.get('email'); }
  get password() { return this.loginForm.get('password'); }
}

import { Component, OnInit, AfterViewInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Auth, LoginRequest } from '../../core/services/auth';
import gsap from 'gsap';

@Component({
  selector: 'app-login',
  standalone: false,
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class Login implements OnInit, AfterViewInit {
  loginForm!: FormGroup;
  loading = false;
  error = '';
  hidePassword = true;

  constructor(
    private formBuilder: FormBuilder,
    private authService: Auth,
    private router: Router,
    private route: ActivatedRoute
  ) { }

  ngOnInit(): void {
    // Clear any invalid auth data first (ensure user must provide credentials)
    this.clearInvalidAuth();

    this.loginForm = this.formBuilder.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      rememberMe: [false]
    });

    // If redirected from Lab Register, prefill email from query param or localStorage
    const qpEmail = this.route.snapshot.queryParamMap.get('email');
    // Remembered email (set when user checked "Remember me")
    const remembered = localStorage.getItem('rememberedEmail');
    const prefill = qpEmail || remembered || localStorage.getItem('prefillLoginEmail');
    if (prefill) {
      this.loginForm.patchValue({ email: prefill });
      if (remembered) { this.loginForm.patchValue({ rememberMe: true }); }
      if (qpEmail) { try { localStorage.removeItem('prefillLoginEmail'); } catch { } }
    }

    // Clear any existing errors
    this.error = '';

    // Check if user is already logged in with valid token
    if (this.authService.isLoggedIn()) {
      console.log('User already logged in, redirecting based on role');
      this.redirectBasedOnRole();
    }
  }

  ngAfterViewInit(): void {
    // Initial State - Hidden
    gsap.set('.hero-content > *', { opacity: 0, y: 20 });
    gsap.set('.auth-card', { opacity: 0, y: 30 }); // Animate the whole card now

    // Timeline
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    // 1. Auth Card Entrance
    tl.to('.auth-card', {
      opacity: 1,
      y: 0,
      duration: 0.8
    })
      // 2. Hero Content Text
      .to('.hero-content > *', {
        opacity: 1,
        y: 0,
        duration: 0.8,
        stagger: 0.2
      }, '-=0.4');
  }

  redirectBasedOnRole(): void {
    const user = this.authService.getCurrentUser();
    console.log('🔄 Redirecting user based on role:', user?.role);

    if (user?.role === 'SuperAdmin') {
      this.router.navigate(['/super-admin/dashboard']);
    } else if (user?.role === 'LabAdmin') {
      this.router.navigate(['/dashboard/pathology']);
    } else if (user?.role === 'Technician') {
      this.router.navigate(['/dashboard/pathology']);
    } else if (user?.role === 'Receptionist') {
      this.router.navigate(['/dashboard/pathology']);
    } else if (user?.role === 'Doctor') {
      this.router.navigate(['/dashboard/pathology']);
    } else if (user?.role === 'Pathology') {
      this.router.navigate(['/dashboard/pathology']);
    } else if (user?.role === 'Admin') {
      // Lab-scoped Admins (with lab info) should see the same lab dashboard
      // as LabAdmin and other lab users. Only non-lab Admins (if any) go to
      // the legacy admin dashboard.
      if ((user as any)?.lab || (user as any)?.labId) {
        this.router.navigate(['/dashboard/pathology']);
      } else {
        this.router.navigate(['/dashboard/admin']);
      }
    } else if (user?.role === 'Pharmacy') {
      this.router.navigate(['/pharmacy']);
    } else {
      console.log('❌ Unknown role, staying on login');
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

      const emailNorm = String(this.loginForm.value.email || '').trim().toLowerCase();
      const credentials: LoginRequest = { email: emailNorm, password: this.loginForm.value.password };
      console.log('🔄 Attempting login with:', credentials);

      // Persist remembered email preference immediately so it works even if login fails
      try {
        if (this.loginForm.value.rememberMe) {
          localStorage.setItem('rememberedEmail', emailNorm);
        } else {
          localStorage.removeItem('rememberedEmail');
        }
      } catch { }

      // Always use real authentication (no bypass)
      this.authService.login(credentials).subscribe({
        next: (response) => {
          console.log('✅ Login successful:', response);
          this.loading = false;

          // Show success message for multi-tenant login
          if (response.user.lab) {
            console.log('🏢 Lab:', response.user.lab.labName, '(Code: ' + response.user.lab.labCode + ')');
          }

          // Redirect based on role
          this.redirectBasedOnRole();
        },
        error: (error) => {
          console.error('❌ Login error:', error);
          this.loading = false;

          // If server is not available, show helpful message
          if (error.status === 0 || error.status === 500) {
            this.error = 'Server is not running. Please check backend server.';
          } else if (error.status === 401) {
            this.error = 'Email ya password galat hai.';
          } else if (error.status === 403) {
            this.error = error.error?.message || 'Access denied.';
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

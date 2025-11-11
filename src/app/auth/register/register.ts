import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth, RegisterRequest } from '../../core/services/auth';

@Component({
  selector: 'app-register',
  standalone: false,
  templateUrl: './register.html',
  styleUrl: './register.css'
})
export class Register implements OnInit {
  registerForm!: FormGroup;
  loading = false;
  error = '';

  roles = ['Admin', 'Pathology'];

  constructor(
    private fb: FormBuilder,
    private auth: Auth,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.registerForm = this.fb.group({
      firstName: ['', Validators.required],
      lastName: [''],
      username: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      phone: [''],
      role: ['Admin', Validators.required],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  onSubmit(): void {
    if (this.registerForm.invalid) {
      this.error = 'Please fill all required fields correctly.';
      return;
    }

    this.loading = true;
    this.error = '';

    const payload: RegisterRequest = this.registerForm.value;

    this.auth.register(payload).subscribe({
      next: (res) => {
        this.loading = false;
        // Route based on role
        const role = res.user.role;
        if (role === 'Pathology') {
          this.router.navigate(['/dashboard/pathology'], { replaceUrl: true });
        } else if (role === 'SuperAdmin') {
          this.router.navigate(['/roles/super-admin'], { replaceUrl: true });
        } else {
          this.router.navigate(['/dashboard/admin'], { replaceUrl: true });
        }
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.message || 'Registration failed. Please try again.';
      }
    });
  }

  get firstName() { return this.registerForm.get('firstName'); }
  get username() { return this.registerForm.get('username'); }
  get email() { return this.registerForm.get('email'); }
  get role() { return this.registerForm.get('role'); }
  get password() { return this.registerForm.get('password'); }
}

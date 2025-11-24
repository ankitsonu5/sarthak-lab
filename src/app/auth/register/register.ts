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
  success = '';

  roles = ['SuperAdmin', 'LabAdmin', 'Admin', 'Pathology', 'Technician', 'Doctor', 'Receptionist'];

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
    this.success = '';

    const payload: RegisterRequest = this.registerForm.value;

    this.auth.adminCreateUser(payload).subscribe({
      next: (res) => {
        this.loading = false;
        this.success = `User "${res.user.firstName} ${res.user.lastName}" created successfully!`;

        // Reset form after 2 seconds
        setTimeout(() => {
          this.resetForm();
          this.success = '';
        }, 2000);
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.message || 'Failed to create user. Please try again.';
      }
    });
  }

  resetForm(): void {
    this.registerForm.reset({
      firstName: '',
      lastName: '',
      username: '',
      email: '',
      phone: '',
      role: 'Admin',
      password: ''
    });
    this.error = '';
    this.success = '';
  }

  get firstName() { return this.registerForm.get('firstName'); }
  get username() { return this.registerForm.get('username'); }
  get email() { return this.registerForm.get('email'); }
  get role() { return this.registerForm.get('role'); }
  get password() { return this.registerForm.get('password'); }
}

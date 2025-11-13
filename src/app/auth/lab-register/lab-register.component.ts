import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-lab-register',
  standalone: false,
  templateUrl: './lab-register.component.html',
  styleUrls: ['./lab-register.component.css']
})
export class LabRegisterComponent implements OnInit {
  registerForm!: FormGroup;
  loading = false;
  error = '';
  success = false;
  registeredLabCode = '';
  // Helps show targeted actions when emails already exist
  conflict: 'adminEmail' | 'labEmail' | null = null;

  constructor(
    private formBuilder: FormBuilder,
    private http: HttpClient,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.registerForm = this.formBuilder.group({
      // Lab Details
      labName: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', [Validators.required, Validators.pattern(/^[0-9]{10}$/)]],
      address: ['', Validators.required],
      city: ['', Validators.required],
      state: ['', Validators.required],
      country: ['India'],
      pincode: ['', [Validators.pattern(/^[0-9]{6}$/)]],

      // Admin User Details
      adminFirstName: ['', Validators.required],
      adminLastName: [''],
      adminEmail: ['', [Validators.required, Validators.email]],
      adminPhone: ['', [Validators.pattern(/^[0-9]{10}$/)]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', Validators.required]
    }, {
      validators: this.passwordMatchValidator
    });
  }

  passwordMatchValidator(form: FormGroup) {
    const password = form.get('password');
    const confirmPassword = form.get('confirmPassword');

    if (password && confirmPassword && password.value !== confirmPassword.value) {
      confirmPassword.setErrors({ passwordMismatch: true });
      return { passwordMismatch: true };
    }
    return null;
  }

  onSubmit(): void {
    if (this.registerForm.valid) {
      this.loading = true;
      this.error = '';
      this.conflict = null;

      const formData = this.registerForm.value;
      delete formData.confirmPassword; // Remove confirm password

      const apiUrl = `${environment.apiUrl || 'http://localhost:3000/api'}/lab-management/register`;

      this.http.post<any>(apiUrl, formData).subscribe({
        next: (response) => {
          console.log('✅ Lab registration successful:', response);
          this.loading = false;
          this.success = true;
          this.registeredLabCode = response.lab.labCode;

          // Redirect to login after 3 seconds
          setTimeout(() => {
            this.router.navigate(['/auth/login']);
          }, 5000);
        },
        error: (error) => {
          console.error('❌ Lab registration error:', error);
          this.loading = false;

          if (error?.status === 409) {
            const msg = (error.error?.message || '').toLowerCase();
            if (msg.includes('user') && msg.includes('exists')) {
              this.conflict = 'adminEmail';
              this.error = 'Admin email already registered. Please login or use Forgot Password.';
              this.registerForm.get('adminEmail')?.setErrors({ conflict: true });
            } else if (msg.includes('lab') && msg.includes('exists')) {
              this.conflict = 'labEmail';
              this.error = 'Lab email already registered. Please use a different email or login if you own this lab.';
              this.registerForm.get('email')?.setErrors({ conflict: true });
            } else {
              this.error = error.error?.message || 'Email already exists.';
            }
          } else if (error?.status === 0 || error?.status === 500) {
            this.error = 'Server is not reachable. Please ensure backend is running.';
          } else {
            this.error = error.error?.message || 'Registration failed. Please try again.';
          }
        }
      });
    } else {
      this.error = 'Please fill in all required fields correctly.';
      this.markFormGroupTouched(this.registerForm);
    }
  }

  markFormGroupTouched(formGroup: FormGroup) {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }

  // Getters for form controls
  get labName() { return this.registerForm.get('labName'); }
  get email() { return this.registerForm.get('email'); }
  get phone() { return this.registerForm.get('phone'); }
  get address() { return this.registerForm.get('address'); }
  get city() { return this.registerForm.get('city'); }
  get state() { return this.registerForm.get('state'); }
  get pincode() { return this.registerForm.get('pincode'); }
  get adminFirstName() { return this.registerForm.get('adminFirstName'); }
  get adminLastName() { return this.registerForm.get('adminLastName'); }
  get adminEmail() { return this.registerForm.get('adminEmail'); }
  get adminPhone() { return this.registerForm.get('adminPhone'); }
  get password() { return this.registerForm.get('password'); }
  get confirmPassword() { return this.registerForm.get('confirmPassword'); }
}


import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, Validators, FormGroup } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { SharedModule } from '../../shared/shared-module';
import { SelfRegistrationService } from '../../shared/services/self-registration.service';

@Component({
  selector: 'app-self-register',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, SharedModule],
  templateUrl: './self-register.component.html',
  styleUrls: ['./self-register.component.css']
})
export class SelfRegisterComponent {
  submitting = false;
  submitSuccess = false;
  errorMsg = '';
  appOrigin: string = (typeof window !== 'undefined' && (window as any).location) ? (window as any).location.origin : '';
  labCode: string = '';

  form!: FormGroup;

  constructor(private fb: FormBuilder, private api: SelfRegistrationService, private route: ActivatedRoute) {
    try { this.labCode = this.route.snapshot.paramMap.get('labCode') || ''; } catch {}
    this.form = this.fb.group({
      firstName: ['', [Validators.required, Validators.minLength(2)]],
      lastName: [''],
      phone: ['', [Validators.required, Validators.minLength(8)]],
      gender: [''],
      age: [''],
      address: [''],
      city: [''],
      preferredDate: [''],
      preferredTime: [''],
      testsNote: [''],
      homeCollection: [true]
    });
  }

  get f() { return this.form.controls; }

  submit(): void {
    this.errorMsg = '';
    this.submitSuccess = false;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMsg = 'Please fill required fields (Name and Phone).';
      return;
    }

    if (!this.labCode) {
      this.errorMsg = 'Invalid link. Lab identifier missing.';
      return;
    }

    this.submitting = true;
    const val = this.labCode;
    const isObjectId = /^[a-fA-F0-9]{24}$/.test(val);
    const req$ = isObjectId
      ? this.api.submit(this.form.value as any, val)
      : this.api.submitByCode(this.form.value as any, val);
    req$.subscribe({
      next: () => {
        this.submitSuccess = true;
        this.submitting = false;
        this.form.reset({ homeCollection: true });
      },
      error: (e) => {
        this.errorMsg = (e?.error?.message || 'Submission failed. Try again.');
        this.submitting = false;
      }
    });
  }
}


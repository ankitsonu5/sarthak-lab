import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth, User } from '../core/services/auth';
import { environment } from '../../environments/environment';
import { AlertService } from '../shared/services/alert.service';

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './user-profile.component.html',
  styleUrls: ['./user-profile.component.css']
})
export class UserProfileComponent implements OnInit {
  form!: FormGroup;
  passwordForm!: FormGroup;
  user: User | null = null;
  loading = false;
  success = '';
  error = '';
  previewUrl: string | null = null;
  selectedFile: File | null = null;

  // UI state
  pwMsg = '';
  pwErr = '';
  showOld = false;
  showNew = false;
  showEdit = false;
  showImageViewer = false;

  // SMTP (SuperAdmin only)
  smtpForm!: FormGroup;
  showSmtp = false;
  showSmtpPass = false;
  smtpMsg = '';
  smtpErr = '';
  smtpLoading = false;
  smtpTestTo = '';

  constructor(private fb: FormBuilder, private auth: Auth, private router: Router, private alerts: AlertService, private cdr: ChangeDetectorRef) {}

  private resolveProfileUrl(raw: string | null | undefined): string | null {
    const val = (raw || '').trim();
    if (!val) return null;
    if (/^https?:\/\//.test(val)) return val;
    // Ensure absolute from API base in both dev and prod
    const base = (environment.apiUrl || '').replace(/\/$/, '').replace(/\/api\/?$/, '');
    if (val.startsWith('/')) return base + val;
    return base + '/' + val;
  }

  onImgError() { this.previewUrl = null; }

  ngOnInit(): void {
    this.form = this.fb.group({
      firstName: ['', Validators.required],
      lastName: [''],
      username: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      phone: ['']
    });

    this.passwordForm = this.fb.group({
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required, Validators.minLength(6)]]
    });

    // SMTP form (SuperAdmin only)
    this.smtpForm = this.fb.group({
      host: ['smtp.gmail.com', Validators.required],
      port: [587, Validators.required],
      secure: [false],
      user: ['', [Validators.required, Validators.email]],
      pass: [''], // optional on edit; required only on first-time setup
      from: ['']
    });

    // Smart helpers: auto-fix common mistakes and auto-switch port on Secure toggle
    const hostCtrl = this.smtpForm.get('host');
    const portCtrl = this.smtpForm.get('port');
    const secureCtrl = this.smtpForm.get('secure');
    const userCtrl = this.smtpForm.get('user');
    const passCtrl = this.smtpForm.get('pass');

    // 1) Fix smpt -> smtp typos and trim
    hostCtrl?.valueChanges.subscribe((val: any) => {
      const v = String(val || '').trim();
      if (!v) return;
      const fixed = v.replace(/(^|\.)smpt\./i, '$1smtp.');
      if (fixed !== v) hostCtrl.patchValue(fixed, { emitEvent: false });
    });

    // 2) Auto-switch port based on Secure toggle (465 for secure, 587 otherwise)
    secureCtrl?.valueChanges.subscribe((isSecure: any) => {
      const current = Number(portCtrl?.value || 0);
      if (!!isSecure) {
        if (!current || current === 587) portCtrl?.patchValue(465, { emitEvent: false });
      } else {
        if (!current || current === 465) portCtrl?.patchValue(587, { emitEvent: false });
      }
    });

    // 3) Normalize user email and strip spaces from app password
    userCtrl?.valueChanges.subscribe((val: any) => {
      const v = String(val || '').trim();
      if (v && v !== val) userCtrl.patchValue(v.toLowerCase(), { emitEvent: false });
    });
    passCtrl?.valueChanges.subscribe((val: any) => {
      const v = String(val || '').replace(/\s+/g, '');
      if (v !== val) passCtrl.patchValue(v, { emitEvent: false });
    });

    this.auth.currentUser$.subscribe(u => {
      this.user = u;
      if (u) {
        this.form.patchValue({
          firstName: u.firstName || '',
          lastName: u.lastName || '',
          username: u.username || '',
          email: u.email || '',
          phone: u.phone || ''
        });
        this.previewUrl = this.resolveProfileUrl(u.profilePicture);
      }
    });
  }

  onFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files && input.files[0] ? input.files[0] : null;
    this.selectedFile = file;
    if (file) {
      const reader = new FileReader();
      reader.onload = () => this.previewUrl = String(reader.result || '');
      reader.readAsDataURL(file);
    }
  }

  uploadPicture() {
    if (!this.selectedFile) return;
    this.loading = true; this.error = ''; this.success = '';
    this.auth.uploadProfilePicture(this.selectedFile).subscribe({
      next: (res) => {
        this.loading = false;
        this.success = 'Profile picture updated';
        this.alerts.showUpdateSuccess('Profile picture');
        this.selectedFile = null;
        this.previewUrl = this.resolveProfileUrl(res?.user?.profilePicture || '');
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.message || 'Failed to upload picture';
        this.alerts.showError('Upload failed', this.error);
      }
    });
  }

  openEdit() { this.showEdit = true; this.success = ''; this.error = ''; }
  closeEdit() { this.showEdit = false; }

  // ===== SMTP Settings (SuperAdmin) =====
  toggleSmtp() {
    this.showSmtp = !this.showSmtp; this.smtpErr = ''; this.smtpMsg = '';
    if (this.showSmtp) {
      // Load current SMTP for convenience
      this.smtpLoading = true;
      this.auth.getMySmtp().subscribe({
        next: (res) => {
          this.smtpLoading = false;
          const s = res?.smtp || {};
          this.smtpForm.patchValue({
            host: s.host || 'smtp.gmail.com',
            port: s.port || 587,
            secure: !!s.secure,
            user: s.user || (this.user?.email || ''),
            pass: '', // never prefill password
            from: s.from || (this.user ? `${this.user.firstName || 'HMS'} ${this.user.lastName || ''} <${this.user.email}>` : '')
          });
        },
        error: () => { this.smtpLoading = false; }
      });
    }
  }

  saveSmtp() {
    // Simple validation: host/port/user required; pass optional if already configured
    const val = this.smtpForm.value;
    const passClean = String(val.pass || '').replace(/\s+/g, '');

    if (!val.host || !val.port || !val.user) {
      this.smtpErr = 'Host, Port, and SMTP User are required'; this.smtpMsg = ''; return;
    }

    this.smtpLoading = true; this.smtpErr = ''; this.smtpMsg = '';

    const payload: any = {
      host: (val.host || '').trim(),
      port: Number(val.port || 587),
      secure: !!val.secure,
      user: (val.user || '').trim().toLowerCase(),
      from: (val.from || '').trim() || `RAMCAH HMS <${(val.user || '').trim()}>`
    };
    if (passClean) payload.pass = passClean; // only send when provided

    this.auth.saveMySmtp(payload).subscribe({
      next: () => { this.smtpLoading = false; this.smtpMsg = 'SMTP settings saved'; this.cdr.detectChanges(); },
      error: (err) => { this.smtpLoading = false; this.smtpErr = err?.error?.message || 'Failed to save SMTP'; this.cdr.detectChanges(); }
    });
  }

  sendTest() {
    this.smtpLoading = true; this.smtpErr = ''; this.smtpMsg = '';
    this.auth.sendTestEmail(this.smtpTestTo ? String(this.smtpTestTo).trim() : undefined).subscribe({
      next: (res) => { this.smtpLoading = false; this.smtpMsg = res?.message || 'Test sent'; this.cdr.detectChanges(); },
      error: (err) => { this.smtpLoading = false; this.smtpErr = err?.error?.message || 'Failed to send test'; this.cdr.detectChanges(); }
    });
  }

  save(): void {
    if (this.form.invalid) return;
    this.loading = true; this.error = ''; this.success = '';
    const v = this.form.value;
    const payload = {
      ...v,
      email: (v.email || '').trim().toLowerCase(),
      username: (v.username || '').trim()
    };
    this.auth.updateProfile(payload).subscribe({
      next: () => {
        this.loading = false;
        this.success = 'Profile updated successfully';
        this.alerts.showUpdateSuccess('Profile');
        this.showEdit = false;
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.message || 'Failed to update profile';
        this.alerts.showError('Update failed', this.error);
      }
    });
  }

  onChangePassword(): void {
    if (this.passwordForm.invalid) {
      this.pwErr = 'Please fill current/new/confirm password.'; this.pwMsg = ''; return;
    }
    const { currentPassword, newPassword, confirmPassword } = this.passwordForm.value;
    if (newPassword !== confirmPassword) { this.pwErr = 'New password and confirm password must match.'; this.pwMsg=''; return; }
    this.pwErr = ''; this.pwMsg = '';
    this.auth.changePassword(currentPassword, newPassword).subscribe({
      next: (res) => {
        this.pwMsg = res.message || 'Password changed';
        this.alerts.showSuccess('Password Updated', this.pwMsg);
        this.passwordForm.reset(); this.showOld = false; this.showNew = false;
      },
      error: (err) => {
        this.pwErr = err?.error?.message || 'Failed to change password';
        this.alerts.showError('Password change failed', this.pwErr);
      }
    });
  }

  // Request SuperAdmin approval to reset password (sends email)
  requestApproval() {
    this.pwErr = ''; this.pwMsg = '';
    const email = this.user?.email || '';
    if (!email) { this.pwErr = 'Your email is missing in profile'; return; }
    this.alerts.showInfo('Requesting approval', 'Notifying SuperAdmin...');
    this.auth.requestPasswordResetApproval(email).subscribe({
      next: (res) => { this.pwMsg = res.message || 'Request sent to SuperAdmin'; },
      error: (e) => { this.pwErr = e?.error?.message || 'Failed to send approval request'; }
    });
  }
}

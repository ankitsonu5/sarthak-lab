import { Component, ChangeDetectionStrategy, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { RolesService, AppUser } from '../services/roles.service';
import { Auth } from '../../core/services/auth';
import { Router } from '@angular/router';
import { SuccessAlertComponent } from '../../shared/components/success-alert/success-alert.component';
import { RecordExistsModalComponent } from '../../shared/components/record-exists-modal/record-exists-modal.component';
import { AlertService } from '../../shared/services/alert.service';

@Component({
  selector: 'app-add-role',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, SuccessAlertComponent, RecordExistsModalComponent],
  templateUrl: './add-role.component.html',
  styleUrls: ['./add-role.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AddRoleComponent {
  form!: FormGroup;
  saving = false;
  message = '';
  createdUser?: AppUser;
  selectedImage?: File;
  imagePreview?: string;
  tempPassword = '';
  showSuccess = false;
  showImageOverlay = false;

  // Alerts/Modals
  showSuccessAlert = false;
  successTitle = '🎉 User Created Successfully!';
  successMessage = 'User saved successfully.';
  showRecordExistsModal = false;
  recordExistsMessage = '';

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  // Simple permission preview map (UI only)
  readonly rolePermissions: Record<string, string[]> = {
    SuperAdmin: ['Full access to system (all)'],
    Admin: ['Manage users', 'Manage doctors/patients/appointments', 'View all data', 'Manage system settings'],
    Doctor: ['View patients & appointments', 'Create prescriptions/reports', 'Update appointments'],
    Patient: ['View own appointments/reports/prescriptions', 'Update own profile'],
    Pathology: ['Manage pathology', 'Create lab reports', 'Generate lab invoices'],

  };

  // Map sidebar routes -> permission keys (subset; extend as needed)
  private readonly ROUTE_PERMISSION_MAP: Record<string, string> = {
    '/roles/add': 'manage_users',
    '/roles/list': 'manage_users',

    // Setup
    '/setup/doctors/doctor-registration': 'manage_doctors',
    '/setup/doctors/doctor-list': 'manage_doctors',
    '/setup/category-heads/category-head-registration': 'manage_system',
    '/setup/category-heads/service-head': 'manage_system',
    '/setup/category-heads/search-service': 'manage_system',

    '/setup/prefixes/new': 'manage_system',
    '/setup/prefixes/list': 'manage_system',

    // Pathology setup
    '/setup/pathology/test-master': 'manage_test_categories',
    '/setup/pathology/test-entry': 'manage_test_categories',
    '/setup/pathology/test-database': 'manage_test_categories',
    '/setup/pathology/test-panels': 'manage_test_categories',
    '/setup/pathology/reference-ranges': 'manage_test_categories',

    // Reception
    '/reception/patient-registration': 'manage_patients',
    '/reception/search-patient': 'manage_patients',

    // IPD removed

    // Cash Receipt
    '/cash-receipt/register-opt-ipd': 'manage_reports',
    '/cash-receipt/edit-record': 'manage_reports',
    '/cash-receipt/edit-history': 'manage_reports',

    // Pathology module
    '/pathology-module/register-test-opd': 'manage_pathology',
    '/pathology-module/register-test-ipd': 'manage_pathology',
    '/pathology-module/test-report': 'create_lab_reports',
    '/pathology/registered-report': 'manage_lab_results',
    '/pathology-module/all-reports': 'manage_reports',
    '/pathology-module/reports-records': 'manage_reports',
    '/pathology-module/test-summary': 'manage_reports',

    // Reporting

  };

  // Derived role components based on sidebar definitions
  availableComponents: Array<{ section: string; label: string; route: string; perm?: string; selected: boolean }> = [];


  constructor(
    private fb: FormBuilder,
    private rolesService: RolesService,
    private auth: Auth,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private alert: AlertService
  ) {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      firstName: [''],
      lastName: [''],
      phone: ['', Validators.required], // mandatory per preference
      role: ['', Validators.required], // force selection
      password: ['', [Validators.required, Validators.minLength(6)]],
      username: [''] // will be auto from email before submit
    });
  }

  get selectedRolePerms(): string[] { return this.rolePermissions[this.form.get('role')?.value] || []; }

  onRoleChange(role: string) {
    this.availableComponents = this.buildRoleComponents(role);
    this.cdr.markForCheck();
  }

  private buildRoleComponents(role: string): Array<{ section: string; label: string; route: string; perm?: string; selected: boolean }>{
    // Reuse sidebar sections definition (static snapshot)
    const allSections: Array<{ title: string; children: Array<{ label: string; route: string }> }> = [
      { title: 'Setup', children: [
        { label: 'Doctor Registration', route: '/setup/doctors/doctor-registration' },
        { label: 'Search Doctor', route: '/setup/doctors/doctor-list' },
        { label: 'Category Head', route: '/setup/category-heads/category-head-registration' },
        { label: 'Service Head', route: '/setup/category-heads/service-head' },
        { label: 'Search Service', route: '/setup/category-heads/search-service' },
        { label: 'Test Master', route: '/setup/pathology/test-master' },
        { label: 'Test Entry', route: '/setup/pathology/test-entry' },
        { label: 'Test Database', route: '/setup/pathology/test-database' },
        { label: 'Test Panels', route: '/setup/pathology/test-panels' },
        { label: 'Reference Ranges', route: '/setup/pathology/reference-ranges' },
      ]},
      { title: 'Role Assignment', children: [
        { label: 'Add Role', route: '/roles/add' },
        { label: 'All Roles', route: '/roles/list' },
      ]},
      { title: 'Reception', children: [
        { label: 'Patient Registration', route: '/reception/patient-registration' },
        { label: 'Search Patient', route: '/reception/search-patient' }
      ]},

      { title: 'Cash Receipt', children: [
        { label: 'Receive Cash', route: '/cash-receipt/register-opt-ipd' },
        { label: 'Edit Record', route: '/cash-receipt/edit-record' },
        { label: 'Edit History', route: '/cash-receipt/edit-history' },
      ]},
      { title: 'Pathology', children: [
        { label: 'Register Test', route: '/pathology-module/register-test-opd' },
        { label: 'Register Test IPD', route: '/pathology-module/register-test-ipd' },
        { label: 'Generate Report', route: '/pathology-module/test-report' },
        { label: 'Registered Report', route: '/pathology/registered-report' },
        { label: 'All Reports', route: '/pathology-module/all-reports' },
        { label: 'Reports Records', route: '/pathology-module/reports-records' },
        { label: 'Test Summary', route: '/pathology-module/test-summary' },
      ]},

    ];

    // Role-based filtering similar to sidebar.ts
    const roleNorm = String(role || '').trim();
    let visible = allSections.slice();
    if (roleNorm === 'SuperAdmin') {
      const hide = ['Reception', 'IPD', 'Cash Receipt', 'Pathology'];
      visible = allSections.filter(s => !hide.includes(s.title));
    } else if (roleNorm === 'Admin') {
      visible = allSections
        .filter(s => s.title !== 'Pathology' && s.title !== 'Data' && s.title !== 'Role Assignment');
    } else if (roleNorm === 'Pathology') {
      visible = allSections.filter(s => ['Setup','Pathology'].includes(s.title));
    }


    // Flatten with mapping to permissions
    const items: Array<{ section: string; label: string; route: string; perm?: string; selected: boolean }> = [];
    for (const sec of visible) {
      for (const child of sec.children) {
        const perm = this.ROUTE_PERMISSION_MAP[child.route];
        items.push({ section: sec.title, label: child.label, route: child.route, perm, selected: !!perm });
      }
    }
    return items;
  }

  toggleComp(item: { selected: boolean }) { item.selected = !item.selected; this.cdr.markForCheck(); }

  get selectedPermKeys(): string[] {
    const set = new Set<string>();
    for (const it of this.availableComponents) { if (it.selected && it.perm) set.add(it.perm); }
    return Array.from(set);
  }
  get selectedRoutes(): string[] { return this.availableComponents.filter(it => it.selected).map(it => it.route); }

  trackComp = (_: number, it: any) => it?.route;

  goToPermissionsNow() {
    if (!this.createdUser?._id) return;
    const state = { preselectPermissions: this.selectedPermKeys, preselectRoutes: this.selectedRoutes } as any;
    this.router.navigate(['/roles/permissions', this.createdUser._id], { state });
  }

  // Auto username from email local-part
  onEmailInput() {
    const email = (this.form.get('email')?.value || '').toString().trim().toLowerCase();
    const local = email.split('@')[0] || '';
    if (!this.form.get('username')?.value) {
      this.form.patchValue({ username: local });
    }
  }

  // Capitalize first letter of names on input
  onNameInput(controlName: 'firstName'|'lastName') {
    const v = (this.form.get(controlName)?.value || '').toString();
    const cap = v
      .replace(/\s+/g,' ')
      .split(' ')
      .map((w: string) => w ? (w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()) : '')
      .join(' ')
      .trim();
    this.form.patchValue({ [controlName]: cap }, { emitEvent: false });
  }

  pickImage() { this.fileInput?.nativeElement?.click(); }
  handleFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files[0];
    if (!file) return;
    this.selectedImage = file;
    const reader = new FileReader();
    reader.onload = () => this.imagePreview = reader.result as string;
    reader.readAsDataURL(file);
  }

  // Open a larger preview as full-screen overlay
  openPreview() {
    if (this.imagePreview) { this.showImageOverlay = true; }
  }
  closePreview() { this.showImageOverlay = false; }

  submit() {
    if (this.form.invalid || this.saving) return;
    this.saving = true;
    const vals = this.form.value as any;
    this.tempPassword = vals.password || '';
    const emailLocal = (vals.email ? String(vals.email).toLowerCase().split('@')[0] : '').trim();

    // Force fixed usernames for specific roles as per preference
    const roleLc = String(vals.role || '').toLowerCase();
    if (roleLc === 'admin') vals.username = 'admin';
    else if (roleLc === 'pathology') vals.username = 'pathology';
    else if (!vals.username || !String(vals.username).trim()) vals.username = emailLocal;

    this.auth.adminCreateUser(vals).subscribe({
      next: (res: any) => {
        this.message = 'User created successfully';
        this.createdUser = res?.user as AppUser;
        const finish = () => {
          this.saving = false;
          this.showSuccess = true;
          // SuccessAlert instead of window.alert
          const sent = !!res?.emailSent;
          this.successMessage = sent ? 'User saved and email sent successfully' : 'User saved successfully';
          this.showSuccessAlert = true;

          // Reset form and local UI state
          this.form.reset();
          this.form.patchValue({ email: '', firstName: '', lastName: '', phone: '', role: '', password: '', username: '' });
          this.selectedImage = undefined;
          this.imagePreview = undefined;
          if (this.fileInput?.nativeElement) {
            this.fileInput.nativeElement.value = '';
          }
          this.cdr.detectChanges();
        };
        if (this.selectedImage && this.createdUser?._id) {
          this.rolesService.uploadProfilePicture(this.createdUser._id, this.selectedImage).subscribe({
            next: () => finish(),
            error: () => finish()
          });
        } else {
          finish();
        }
      },
      error: (err) => {
        this.saving = false;
        this.message = err?.error?.message || 'Failed to create user';
        // Show Record Exists modal for duplicates, otherwise AlertService
        if (err?.status === 409 || /exist/i.test(this.message)) {
          this.recordExistsMessage = this.message;
          this.showRecordExistsModal = true;
        } else {
          this.alert.showError('Create Failed', this.message);
        }
        this.cdr.detectChanges();
      }
    });
  }

  onRecordExistsModalClosed(): void {
    this.showRecordExistsModal = false;
    this.recordExistsMessage = '';
  }

  goToList() { this.router.navigate(['/roles/list']); }
}

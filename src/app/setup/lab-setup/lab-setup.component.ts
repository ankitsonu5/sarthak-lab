import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { LabSettingsService, LabSettings, CustomRole } from './lab-settings.service';

@Component({
  selector: 'app-lab-setup',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './lab-setup.component.html',
  styleUrls: ['./lab-setup.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LabSetupComponent implements OnInit {
  form!: FormGroup;
  saving = false;
  preview: LabSettings | null = null;
  statusMessage: string | null = null;
  statusError = false;

  // Self-registration link & QR
  appOrigin = typeof window !== 'undefined' && (window as any).location ? (window as any).location.origin : '';
  labCode: string = '';
  selfRegLink: string = '';
  selfRegQrUrl: string = '';
  copyDone = false;

  // Custom Role Management
  customRoles: CustomRole[] = [];
  newRoleName = '';
  newRoleLabel = '';
  newRoleDescription = '';
  roleLoading = false;
  roleError: string | null = null;
  roleSuccess: string | null = null;

  constructor(
    private fb: FormBuilder,
    private api: LabSettingsService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      labName: [''], shortName: [''],
      addressLine1: [''], addressLine2: [''], city: [''], state: [''], pincode: [''],
      phone: [''], altPhone: [''], email: [''], website: [''],
      logoDataUrl: [''], sideLogoDataUrl: [''], signatureDataUrl: [''],
      headerNote: [''], footerNote: [''], reportDisclaimer: [''],
      prefixes: this.fb.group({ receipt: [''], report: [''], labYearlyPrefix: [''], labDailyPrefix: [''] }),
      numbering: this.fb.group({ receiptStart: [1], reportStart: [1], resetRule: ['yearly'] }),
      printLayout: this.fb.group({ template: ['classic'], showHeader: [true], showFooter: [true], showQr: [false], showRefDoctor: [true], showAmount: [true] })
    });

    this.api.getMyLab().subscribe({
      next: (res) => {
        if (res.lab) {
          this.form.patchValue(res.lab);
          this.updatePreview();
        }
        // Try to pick labCode from current user
        try {
          const userStr = localStorage.getItem('user');
          if (userStr) {
            const u = JSON.parse(userStr);
            this.labCode = (u?.lab?.labCode || u?.labCode || '').toString();
          }
        } catch {}
        this.recomputeSelfReg();
        this.cdr.markForCheck();
      },
      error: () => { this.cdr.markForCheck(); }
    });

    // Load custom roles
    this.loadRoles();
  }

  onFileChange(ev: Event, controlName: 'logoDataUrl' | 'sideLogoDataUrl' | 'signatureDataUrl') {
    const input = ev.target as HTMLInputElement;
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { this.form.get(controlName)?.setValue(reader.result as string); this.updatePreview(); this.cdr.markForCheck(); };
    reader.readAsDataURL(file);
  }

  updatePreview() {
    this.preview = this.form.value as LabSettings;
    this.cdr.markForCheck();
  }

  private recomputeSelfReg() {
    if (!this.labCode) {
      this.selfRegLink = '';
      this.selfRegQrUrl = '';
      return;
    }
    this.selfRegLink = `${this.appOrigin}/public/self-register/${encodeURIComponent(this.labCode)}`;
    this.selfRegQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(this.selfRegLink)}`;
  }

  copySelfRegLink() {
    if (!this.selfRegLink) return;
    try {
      navigator.clipboard.writeText(this.selfRegLink).then(() => {
        this.copyDone = true;
        setTimeout(() => { this.copyDone = false; this.cdr.markForCheck(); }, 1500);
        this.cdr.markForCheck();
      });
    } catch {}
  }

  printSelfRegQR() {
    if (!this.selfRegLink) return;
    const w = window.open('', '_blank', 'width=420,height=600');
    if (!w) return;
    const html = `<!doctype html><html><head><title>Print QR</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 16px; text-align: center; }
        .link { margin-top: 12px; word-break: break-all; font-size: 13px; }
        img { margin-top: 8px; }
        .lab { font-weight: 600; margin-bottom: 8px; font-size: 16px; }
      </style>
    </head><body>
      <div class="lab">Self-Registration QR</div>
      <img src="${this.selfRegQrUrl}" width="220" height="220" alt="Self-Register QR"/>
      <div class="link">${this.selfRegLink}</div>
      <script>window.onload = function(){ setTimeout(()=>window.print(), 200); };</script>
    </body></html>`;
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  saveAndPreview() {
    this.saving = true;
    this.statusMessage = null;
    this.statusError = false;
    this.cdr.markForCheck();
    const payload = this.form.value as LabSettings;
    this.api.saveMyLab(payload).subscribe({
      next: (res) => {
        this.saving = false;
        if (res?.lab) {
          this.form.patchValue(res.lab);
          this.preview = res.lab;
        }
        this.statusMessage = 'Saved';
        this.statusError = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.saving = false;
        this.statusMessage = err?.error?.message || 'Save failed';
        this.statusError = true;
        this.cdr.markForCheck();
      }
    });
  }

  // =====================================================
  // CUSTOM ROLE MANAGEMENT
  // =====================================================

  loadRoles() {
    this.roleLoading = true;
    this.roleError = null;
    this.api.getRoles().subscribe({
      next: (res) => {
        this.customRoles = res.roles || [];
        this.roleLoading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.roleError = err?.error?.message || 'Failed to load roles';
        this.roleLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  addRole() {
    if (!this.newRoleName.trim()) {
      this.roleError = 'Role name is required';
      this.cdr.markForCheck();
      return;
    }

    this.roleLoading = true;
    this.roleError = null;
    this.roleSuccess = null;

    this.api.createRole({
      name: this.newRoleName.trim(),
      label: this.newRoleLabel.trim() || this.newRoleName.trim(),
      description: this.newRoleDescription.trim()
    }).subscribe({
      next: (res) => {
        this.roleSuccess = `Role '${res.role.name}' created successfully!`;
        this.newRoleName = '';
        this.newRoleLabel = '';
        this.newRoleDescription = '';
        this.loadRoles();
        setTimeout(() => { this.roleSuccess = null; this.cdr.markForCheck(); }, 3000);
      },
      error: (err) => {
        this.roleError = err?.error?.message || 'Failed to create role';
        this.roleLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  deleteRole(roleName: string) {
    if (!confirm(`Are you sure you want to delete role '${roleName}'?`)) return;

    this.roleLoading = true;
    this.roleError = null;

    this.api.deleteRole(roleName).subscribe({
      next: () => {
        this.roleSuccess = `Role '${roleName}' deleted successfully!`;
        this.loadRoles();
        setTimeout(() => { this.roleSuccess = null; this.cdr.markForCheck(); }, 3000);
      },
      error: (err) => {
        this.roleError = err?.error?.message || 'Failed to delete role';
        this.roleLoading = false;
        this.cdr.markForCheck();
      }
    });
  }
}


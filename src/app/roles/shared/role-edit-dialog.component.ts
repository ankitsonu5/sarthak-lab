import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, FormGroup } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { AppUser, RolesService } from '../services/roles.service';

@Component({
  selector: 'app-role-edit-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule],
  template: `
    <div class="dialog">
      <h3>Edit User</h3>
      <form [formGroup]="form" (ngSubmit)="save()" class="form">
        <div class="row"><label>First Name</label><input formControlName="firstName"></div>
        <div class="row"><label>Last Name</label><input formControlName="lastName"></div>
        <div class="row"><label>Username</label><input formControlName="username"></div>
        <div class="row"><label>Email</label><input type="email" formControlName="email"></div>
        <div class="row">
          <label>Role</label>
          <select formControlName="role">
            <option>SuperAdmin</option>
            <option>Admin</option>
            <option>Doctor</option>
            
            <option>Pathology</option>
            <option>Pharmacy</option>
          </select>
        </div>
        <div class="row"><label>Phone</label><input formControlName="phone"></div>
        <div class="row"><label>Status</label>
          <select formControlName="isActive">
            <option [ngValue]="true">Active</option>
            <option [ngValue]="false">Inactive</option>
          </select>
        </div>
        <div class="actions">
          <button type="button" class="btn" (click)="dialogRef.close()">Cancel</button>
          <button type="submit" class="btn primary" [disabled]="form.invalid || saving">{{ saving ? 'Saving...' : 'Save' }}</button>
        </div>
      </form>
    </div>
  `,
  styles: [`
    .dialog{padding:16px;max-width:760px}
    .form{background:#fff;padding:1rem;border-radius:.75rem;box-shadow:0 2px 10px rgba(0,0,0,.1)}
    .row{display:flex;gap:1rem;align-items:center;margin-bottom:.75rem}
    label{width:150px;color:#374151;font-weight:600}
    input,select{flex:1;padding:.5rem .75rem;border:1px solid #d1d5db;border-radius:.5rem;background:#f9fafb}
    .actions{display:flex;justify-content:flex-end;margin-top:1rem;gap:.5rem}
    .btn{padding:.5rem 1rem;border:none;border-radius:.5rem;background:#9ca3af;color:#fff;cursor:pointer}
    .btn.primary{background:#3b82f6}
  `]
})
export class RoleEditDialogComponent {
  form!: FormGroup;
  saving = false;

  constructor(
    private fb: FormBuilder,
    private roles: RolesService,
    public dialogRef: MatDialogRef<RoleEditDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { user: AppUser }
  ) {
    const u = data.user;
    this.form = this.fb.group({
      firstName: [u.firstName || ''],
      lastName: [u.lastName || ''],
      username: [u.username, Validators.required],
      email: [u.email, [Validators.required, Validators.email]],
      role: [u.role || 'Admin', Validators.required],
      phone: [u.phone || ''],
      isActive: [u.isActive ?? true]
    });
  }

  save() {
    if (this.form.invalid || this.saving) return;
    this.saving = true;
    this.roles.updateUser(this.data.user._id, this.form.value as any).subscribe({
      next: (res) => {
        this.saving = false;
        this.dialogRef.close(res.user);
      },
      error: () => { this.saving = false; }
    });
  }
}


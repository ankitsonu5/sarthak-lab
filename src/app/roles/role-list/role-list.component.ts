import { Component, ChangeDetectionStrategy, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { RolesService, AppUser } from '../services/roles.service';
import { Auth } from '../../core/services/auth';
import { AlertService } from '../../shared/services/alert.service';
import { DeleteConfirmationModalComponent } from '../../shared/components/delete-confirmation-modal/delete-confirmation-modal.component';
import { DeleteSuccessModalComponent } from '../../shared/components/delete-success-modal/delete-success-modal.component';
import { finalize } from 'rxjs/operators';


@Component({
  selector: 'app-role-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, DeleteConfirmationModalComponent, DeleteSuccessModalComponent],
  templateUrl: './role-list.component.html',
  styleUrls: ['./role-list.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoleListComponent implements OnInit {
  users: AppUser[] = [];
  filtered: AppUser[] = [];
  q = '';
  loading = false;
  canToggle = false;
  updatingId: string | null = null;

  // Delete modal state
  showDeleteConfirmation = false;
  showDeleteSuccess = false;
  deleteMessage = '';
  deleteSuccessTitle = 'User Deleted';
  userToDelete: AppUser | null = null;


  constructor(
    private rolesService: RolesService,
    private auth: Auth,
    private cdr: ChangeDetectorRef,
    private alert: AlertService
  ) {}

  ngOnInit(): void {
    const me = this.auth.getCurrentUser();
    this.canToggle = me?.role === 'SuperAdmin';
    this.fetch();
  }

  fetch(): void {
    this.loading = true;
    this.cdr.markForCheck();
    this.rolesService.getUsers().subscribe({
      next: (res) => {
        this.users = res?.users || [];
        this.filtered = [...this.users];
        this.filter();
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.cdr.markForCheck();
      }
    });
  }

  filter(): void {
    const q = (this.q || '').toString().toLowerCase().trim();
    if (!q) {
      this.filtered = [...this.users];
      this.cdr.markForCheck();
      return;
    }
    this.filtered = this.users.filter(u => {
      const fields = [
        u.username, u.email, u.role, u.firstName, u.lastName, u.phone
      ].map(v => (v || '').toString().toLowerCase());
      return fields.some(f => f.includes(q));
    });
    this.cdr.markForCheck();
  }

  toggleActive(u: AppUser): void {
    if (!this.canToggle) { return; }
    const original = !!u.isActive;
    const next = !original;
    this.updatingId = u._id;
    u.isActive = next; // optimistic UI update
    this.cdr.markForCheck();

    this.rolesService.setUserActive(u._id, next)
      .pipe(finalize(() => { this.updatingId = null; this.cdr.markForCheck(); }))
      .subscribe({
        next: () => {
          const name = (u.firstName ? `${u.firstName} ${u.lastName || ''}`.trim() : (u.username || u.email));
          const statusText = u.isActive ? 'activated' : 'deactivated';
          this.alert.showSuccess('Status Updated', `${name} ${statusText} successfully.`);
        },
        error: (err: any) => {
          u.isActive = original; // revert on error
          const msg = err?.error?.message || 'Failed to update status';
          this.alert.showError('Update Failed', msg);
        }
      });
  }

  // Delete handlers
  openDelete(u: AppUser): void {
    this.userToDelete = u;
    const name = (u.firstName ? `${u.firstName} ${u.lastName || ''}`.trim() : (u.username || u.email));
    this.deleteMessage = `Are you sure you want to delete user \"${name}\"?`;
    this.showDeleteConfirmation = true;
    this.cdr.markForCheck();
  }

  cancelDelete(): void {
    this.showDeleteConfirmation = false;
    this.userToDelete = null;
    this.cdr.markForCheck();
  }

  confirmDelete(): void {
    if (!this.userToDelete) return;
    const id = this.userToDelete._id;
    this.rolesService.deleteUser(id).subscribe({
      next: () => {
        // Refresh list and show success modal
        this.showDeleteConfirmation = false;
        this.showDeleteSuccess = true;
        // remove item locally for immediate feedback
        this.users = this.users.filter(u => u._id !== id);
        this.filter();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.showDeleteConfirmation = false;
        const msg = err?.error?.message || 'Failed to delete user';
        this.alert.showError('Delete Failed', msg);
        this.cdr.markForCheck();
      }
    });
  }

  onDeleteSuccessClosed(): void {
    this.showDeleteSuccess = false;
    this.userToDelete = null;
    this.cdr.markForCheck();
  }

}


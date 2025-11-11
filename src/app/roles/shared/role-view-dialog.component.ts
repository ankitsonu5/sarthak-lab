import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { AppUser } from '../services/roles.service';

@Component({
  selector: 'app-role-view-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule],
  template: `
    <div class="dialog">
      <h3>User Details</h3>
      <div class="grid">
        <div><strong>Name:</strong> {{ (data.user.firstName || '') + ' ' + (data.user.lastName || '') }}</div>
        <div><strong>Email:</strong> {{ data.user.email }}</div>
        <div><strong>Role:</strong> {{ data.user.role }}</div>
        <div><strong>Username:</strong> {{ data.user.username }}</div>
        <div><strong>Status:</strong> {{ data.user.isActive ? 'Active' : 'Inactive' }}</div>
      </div>
    </div>
  `,
  styles: [`
    .dialog{padding:16px;max-width:760px}
    .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
  `]
})
export class RoleViewDialogComponent {
  constructor(@Inject(MAT_DIALOG_DATA) public data: { user: AppUser }) {}
}


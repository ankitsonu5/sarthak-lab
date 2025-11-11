import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatDialogModule } from '@angular/material/dialog';
import { RolesRoutingModule } from './roles-routing.module';

import { AddRoleComponent } from './add-role/add-role.component';
import { RoleViewDialogComponent } from './shared/role-view-dialog.component';
import { SuperAdminDashboardComponent } from './super-admin-dashboard/super-admin-dashboard.component';
import { RoleListComponent } from './role-list/role-list.component';
import { UserPermissionsComponent } from './user-permissions/user-permissions.component';
import { EditHistoryCenterComponent } from './edit-history-center/edit-history-center.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    RolesRoutingModule,

    AddRoleComponent,
    RoleViewDialogComponent,
    SuperAdminDashboardComponent,
    RoleListComponent,
    UserPermissionsComponent,
    EditHistoryCenterComponent
  ],
  declarations: []
})
export class RolesModule { }

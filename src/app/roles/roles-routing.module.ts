import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { AddRoleComponent } from './add-role/add-role.component';
import { SuperAdminDashboardComponent } from './super-admin-dashboard/super-admin-dashboard.component';
import { RoleListComponent } from './role-list/role-list.component';
import { UserPermissionsComponent } from './user-permissions/user-permissions.component';
import { EditHistoryCenterComponent } from './edit-history-center/edit-history-center.component';

const routes: Routes = [
  { path: '', redirectTo: 'list', pathMatch: 'full' },
  { path: 'list', component: RoleListComponent },
  { path: 'permissions/:id', component: UserPermissionsComponent },
  { path: 'add', component: AddRoleComponent },
  { path: 'super-admin', component: SuperAdminDashboardComponent },
  { path: 'edit-history', component: EditHistoryCenterComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class RolesRoutingModule { }

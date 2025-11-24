import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SuperAdminDashboardComponent } from './dashboard/super-admin-dashboard.component';
import { LabProfileComponent } from './lab-profile/lab-profile.component';
import { UserManagementComponent } from './user-management/user-management.component';
import { RoleGuard } from '../core/guards/role.guard';

const routes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  },
  {
    path: 'dashboard',
    component: SuperAdminDashboardComponent,
    canActivate: [RoleGuard],
    data: { roles: ['SuperAdmin'] }
  },
  {
    path: 'users',
    component: UserManagementComponent,
    canActivate: [RoleGuard],
    data: { roles: ['SuperAdmin'] }
  },
  {
    path: 'lab/:id',
    component: LabProfileComponent,
    canActivate: [RoleGuard],
    data: { roles: ['SuperAdmin'] }
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class SuperAdminRoutingModule { }


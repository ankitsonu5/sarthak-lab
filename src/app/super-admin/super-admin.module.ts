import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SuperAdminRoutingModule } from './super-admin-routing.module';
import { SuperAdminDashboardComponent } from './dashboard/super-admin-dashboard.component';
import { LabProfileComponent } from './lab-profile/lab-profile.component';
import { UserManagementComponent } from './user-management/user-management.component';

@NgModule({
  declarations: [
    SuperAdminDashboardComponent,
    LabProfileComponent,
    UserManagementComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    SuperAdminRoutingModule
  ]
})
export class SuperAdminModule { }


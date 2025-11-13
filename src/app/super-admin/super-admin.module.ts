import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SuperAdminRoutingModule } from './super-admin-routing.module';
import { SuperAdminDashboardComponent } from './dashboard/super-admin-dashboard.component';
import { LabProfileComponent } from './lab-profile/lab-profile.component';

@NgModule({
  declarations: [
    SuperAdminDashboardComponent,
    LabProfileComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    SuperAdminRoutingModule
  ]
})
export class SuperAdminModule { }


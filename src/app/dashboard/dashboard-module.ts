import { NgModule } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SharedModule } from '../shared/shared-module';
import { DashboardRoutingModule } from './dashboard-routing.module';
import { Dashboard } from './dashboard/dashboard';
@NgModule({
  declarations: [
    Dashboard
  ],
  imports: [
    CommonModule,
    SharedModule,
    DashboardRoutingModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatProgressSpinnerModule
  ],
  providers: [
    DecimalPipe
  ]
})
export class DashboardModule { }

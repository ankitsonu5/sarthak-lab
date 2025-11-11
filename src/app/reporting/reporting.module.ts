import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { ReportingRoutingModule } from './reporting-routing.module';
import { ConsolidatedOpdReportComponent } from './consolidatedopd/consolidated-opd-report.component';
import { DailyOpdReportComponent } from './dailyopd/daily-opd-report.component';
import { DailyCashReportComponent } from './dailycash/daily-cash-report.component';
import { MonthlyOpdReportComponent } from './monthlyopd/monthly-opd-report.component';
import { DailyCashSummaryComponent } from './dailycashsummary/daily-cash-summary.component';
import { CentralOpdRegistrationComponent } from './centralopd/central-opd-registration.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    HttpClientModule,
    ReportingRoutingModule,
    ConsolidatedOpdReportComponent,
    DailyOpdReportComponent,
    DailyCashReportComponent,
    MonthlyOpdReportComponent,
    DailyCashSummaryComponent
  ],
  declarations: []
})
export class ReportingModule { }

import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ConsolidatedOpdReportComponent } from './consolidatedopd/consolidated-opd-report.component';
import { DailyOpdReportComponent } from './dailyopd/daily-opd-report.component';
import { DailyCashReportComponent } from './dailycash/daily-cash-report.component';
import { MonthlyOpdReportComponent } from './monthlyopd/monthly-opd-report.component';
import { DailyCashSummaryComponent } from './dailycashsummary/daily-cash-summary.component';
import { CentralOpdRegistrationComponent } from './centralopd/central-opd-registration.component';
import { NotAvailableComponent } from '../shared/components/not-available.component';
import { RoleGuard } from '../core/guards/role.guard';

const routes: Routes = [
  { path: '', redirectTo: 'daily-cash-report', pathMatch: 'full' },
  { path: 'daily-cash-report', component: DailyCashReportComponent },
  { path: 'daily-ipd-report', component: NotAvailableComponent, data: { title: 'Daily IPD Report', message: 'This report is not available right now.', tips: ['Try OPD reports', 'Contact admin to enable IPD reporting'] } },
  { path: 'consolidated-ipd-report', component: NotAvailableComponent, data: { title: 'Consolidated IPD Report', message: 'This report is not available right now.', tips: ['Use Consolidated OPD for now'] } },
  { path: 'monthly-ipd-report', component: NotAvailableComponent, data: { title: 'Monthly IPD Report', message: 'This report is not available right now.' } },
  { path: 'daily-cash-summary', component: DailyCashSummaryComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ReportingRoutingModule { }

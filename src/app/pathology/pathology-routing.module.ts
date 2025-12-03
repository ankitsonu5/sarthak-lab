import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PathologyDashboardComponent } from './pathology-dashboard/pathology-dashboard.component';
import { PathologyRegistrationComponent } from './registration/registration.component';
import { TestReportComponent } from './test-report/test-report.component';
import { AllReportsComponent } from './all-reports/all-reports.component';
import { ReportsRecordsComponent } from './reports-records/reports-records.component';
import { PathologyPrintComponent } from './print/pathology-print.component';
import { ScheduledTestsComponent } from './scheduled-tests/scheduled-tests.component';
import { RegisteredReportComponent } from './registered-report/registered-report.component';
import { TestSummaryComponent } from './test-summary/test-summary.component';
import { AllIpdReports } from './all-ipd-reports/all-ipd-reports';


const routes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  },
  {
    path: 'dashboard',
    component: PathologyDashboardComponent
  },
  {
    path: 'registration',
    component: PathologyRegistrationComponent
  },
  {
    path: 'register-test-opd',
    component: PathologyRegistrationComponent
  },
  {
    path: 'register-test-ipd',
    component: PathologyRegistrationComponent
  },
  {
    path: 'report-generation',
    component: TestReportComponent
  },
  {
    path: 'generate-report',
    component: TestReportComponent
  },
  {
    path: 'test-report',
    component: TestReportComponent
  },
  {
    path: 'all-reports',
    component: AllReportsComponent
  },
  {
    path: 'all-ipd-reports',
    component: AllIpdReports
  },

  {
    path: 'reports-records',
    component: ReportsRecordsComponent
  },
  {
    path: 'print',
    component: PathologyPrintComponent
  },
  {
    path: 'scheduled-tests',
    component: ScheduledTestsComponent
  },
  {
    path: 'registered-report',
    component: RegisteredReportComponent
  },
  {
    path: 'test-summary',
    component: TestSummaryComponent
  },
  {
    path: 'my-subscription',
    loadComponent: () => import('./my-subscription/my-subscription.component').then(m => m.MySubscriptionComponent)
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class PathologyRoutingModule { }

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { OverlayModule } from '@angular/cdk/overlay';
import { PathologyRoutingModule } from './pathology-routing.module';
import { TestReportComponent } from './test-report/test-report.component';
import { AllReportsComponent } from './all-reports/all-reports.component';
import { PathologyPrintComponent } from './print/pathology-print.component';
import { AllReportsViewComponent } from './all-reports/view/all-reports-view.component';
import { ReportsRecordsComponent } from './reports-records/reports-records.component';
import { ScheduledTestsComponent } from './scheduled-tests/scheduled-tests.component';
import { TestSummaryComponent } from './test-summary/test-summary.component';
import { AllIpdReports } from './all-ipd-reports/all-ipd-reports';
import { ViewReportDetail } from './all-ipd-reports/view-report-detail/view-report-detail';


@NgModule({
  declarations: [
    AllReportsComponent,
    AllReportsViewComponent,
    ReportsRecordsComponent,
    ScheduledTestsComponent,
    TestSummaryComponent,
    AllIpdReports,
    ViewReportDetail
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    OverlayModule,
    PathologyRoutingModule,
    TestReportComponent,
    PathologyPrintComponent
  ]
})
export class PathologyModule { }

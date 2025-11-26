import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LabSetupComponent } from './lab-setup.component';
import { ReportTemplateComponent } from './report-template.component';

const routes: Routes = [
  { path: '', component: LabSetupComponent },
  { path: 'report-template', component: ReportTemplateComponent }
];

@NgModule({
  imports: [LabSetupComponent, ReportTemplateComponent, RouterModule.forChild(routes)]
})
export class LabSetupModule {}


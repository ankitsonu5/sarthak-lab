import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: 'test-master',
    loadComponent: () => import('./test-master/test-master.component').then(m => m.TestMasterComponent)
  },

  {
    path: 'reference-ranges',
    loadComponent: () => import('./reference-ranges/reference-ranges.component').then(m => m.ReferenceRangesComponent)
  },
  {
    path: 'test-database',
    loadComponent: () => import('./test-database/test-database.component').then(m => m.TestDatabaseComponent)
  },
  {
    path: 'test-entry',
    loadComponent: () => import('./test-entry/test-entry.component').then(m => m.TestEntryComponent)
  },
  {
    path: 'test-detail/:id',
    loadComponent: () => import('./test-detail/test-detail.component').then(m => m.TestDetailComponent)
  },
  {
    path: 'test-panels',
    loadComponent: () => import('./test-panels/test-panels.component').then(m => m.TestPanelsComponent)
  },
  {
    path: 'test-panels/new',
    loadComponent: () => import('./test-panels/test-panel-form/test-panel-form.component').then(m => m.TestPanelFormComponent)
  },
  {
    path: 'test-panels/:id/view',
    loadComponent: () => import('./test-panels/test-panel-view/test-panel-view.component').then(m => m.TestPanelViewComponent)
  },
  {
    path: 'test-panels/:id/edit',
    loadComponent: () => import('./test-panels/test-panel-form/test-panel-form.component').then(m => m.TestPanelFormComponent)
  },

  // {
  //   path: 'report-templates',
  //   loadComponent: () => import('./report-templates/report-templates.component').then(m => m.ReportTemplatesComponent)
  // },
  // {
  //   path: 'patient-test-entry',
  //   loadComponent: () => import('./patient-test-entry/patient-test-entry.component').then(m => m.PatientTestEntryComponent)
  // },
  // {
  //   path: 'report-generation',
  //   loadComponent: () => import('./report-generation/report-generation.component').then(m => m.ReportGenerationComponent)
  // },
  // {
  //   path: 'report-history',
  //   loadComponent: () => import('./report-history/report-history.component').then(m => m.ReportHistoryComponent)
  // },
  {
    path: '',
    redirectTo: 'test-database',
    pathMatch: 'full'
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class PathologyRoutingModule { }

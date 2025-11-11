import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PathologyDetailFormComponent } from './pathology-detail-form/pathology-detail-form.component';
import { EditRecord } from './edit-record/edit-record';
import { EditHistoryComponent } from './edit-history/edit-history.component';

import { NotAvailableComponent } from '../shared/components/not-available.component';

const routes: Routes = [
  { path: '', redirectTo: 'register-opt-ipd', pathMatch: 'full' },
  { path: 'register-opt-ipd', component: PathologyDetailFormComponent },
  // Setup screens that are not available yet under Cash Receipt
  { path: 'group-creation', component: NotAvailableComponent, data: { title: 'Group Creation', message: 'This screen is not available right now.' } },
  { path: 'head-setup', component: NotAvailableComponent, data: { title: 'Head Setup', message: 'This screen is not available right now.' } },
  { path: 'receive-cash-old-session', component: NotAvailableComponent, data: { title: 'Receive Cash (Old Session)', message: 'This screen is not available right now.' } },

  { path: 'register-opd-ipd', component: PathologyDetailFormComponent },
  { path: 'generate-report', component: PathologyDetailFormComponent },
  { path: 'edit-record', component: EditRecord },
  { path: 'edit-history', component: EditHistoryComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class CashReceiptRoutingModule { }

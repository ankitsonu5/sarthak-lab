import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { InvoiceList } from './invoice-list/invoice-list';
import { InvoiceDetail } from './invoice-detail/invoice-detail';
import { RoleGuard } from '../core/guards/role.guard';

const routes: Routes = [
  {
    path: '',
    component: InvoiceList,
    canActivate: [RoleGuard],
    data: { permissions: ['manage_appointments', 'manage_system'] }
  },
  {
    path: ':id',
    component: InvoiceDetail,
    canActivate: [RoleGuard],
    data: { permissions: ['manage_appointments', 'manage_system'] }
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class BillingRoutingModule { }

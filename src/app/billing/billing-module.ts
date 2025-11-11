import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { InvoiceList } from './invoice-list/invoice-list';
import { InvoiceDetail } from './invoice-detail/invoice-detail';

const routes: Routes = [
  { path: '', component: InvoiceList },
  { path: 'invoice', component: InvoiceDetail },
  { path: ':id', component: InvoiceDetail }
];

@NgModule({
  declarations: [
    InvoiceList,
    InvoiceDetail
  ],
  imports: [
    CommonModule,
    RouterModule.forChild(routes)
  ]
})
export class BillingModule { }

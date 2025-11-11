import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { CashReceiptRoutingModule } from './cash-receipt-routing.module';
import { PathologyDetailFormComponent } from './pathology-detail-form/pathology-detail-form.component';
import { PathologyService } from './pathology.service';
import { EditRecord } from './edit-record/edit-record';
import { EditHistoryComponent } from './edit-history/edit-history.component';

import { SuccessAlertComponent } from '../shared/components/success-alert/success-alert.component';
import { DeleteConfirmationModalComponent } from '../shared/components/delete-confirmation-modal/delete-confirmation-modal.component';
import { DeleteSuccessModalComponent } from '../shared/components/delete-success-modal/delete-success-modal.component';

@NgModule({
  declarations: [
    PathologyDetailFormComponent,
    EditRecord,
    EditHistoryComponent
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    HttpClientModule,
    CashReceiptRoutingModule,
    SuccessAlertComponent,
    DeleteConfirmationModalComponent,
    DeleteSuccessModalComponent
  ],
  providers: [
    PathologyService
  ]
})
export class CashReceiptModule { }

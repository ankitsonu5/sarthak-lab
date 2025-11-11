import { NgModule, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogModule } from '@angular/material/dialog';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { ReceptionRoutingModule } from './reception-routing.module';
import { PatientRegistrationComponent } from './patient-registration/patient-registration.component';
import { TestPageComponent } from './test-page.component';
import { DeleteConfirmationModalComponent } from '../shared/components/delete-confirmation-modal/delete-confirmation-modal.component';
import { DeleteSuccessModalComponent } from '../shared/components/delete-success-modal/delete-success-modal.component';
import { SuccessAlertComponent } from '../shared/components/success-alert/success-alert.component';

import { SearchPatient } from './search-patient/search-patient';

// Future: Import new OPD components when ready
// import { PatientSearchComponent } from './opd-registration/components/patient-search/patient-search.component';


@NgModule({
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatSnackBarModule,
    MatTableModule,
    MatPaginatorModule,
    MatIconModule,
    MatDialogModule,
    ScrollingModule,
    ReceptionRoutingModule,
    PatientRegistrationComponent,
    TestPageComponent,
    DatePipe,
    DeleteConfirmationModalComponent,
    DeleteSuccessModalComponent,
    SuccessAlertComponent

  ],
  declarations: [
    SearchPatient,
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class ReceptionModule { }

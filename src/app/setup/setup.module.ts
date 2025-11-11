import { NgModule } from '@angular/core';
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
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTabsModule } from '@angular/material/tabs';
import { SetupRoutingModule } from './setup-routing.module';
import { DoctorRegistrationComponent as DoctorRegistration } from './doctors/doctor-registration/doctor-registration.component';
import { DoctorListComponent } from './doctors/doctor-list/doctor-list.component';

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
  MatCheckboxModule,
  MatTabsModule,
  SetupRoutingModule,
  DoctorRegistration,
  DoctorListComponent
],
declarations: [

  ],
providers: [
  DatePipe
 
]
})
export class SetupModule { }

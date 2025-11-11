import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { AppointmentList } from './appointment-list/appointment-list';
import { AppointmentForm } from './appointment-form/appointment-form';

const routes: Routes = [
  { path: '', component: AppointmentList },
  { path: 'new', component: AppointmentForm },
  { path: 'edit/:id', component: AppointmentForm }
];

@NgModule({
  declarations: [
    AppointmentList,
    AppointmentForm
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule.forChild(routes)
  ]
})
export class AppointmentsModule { }

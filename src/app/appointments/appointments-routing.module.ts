import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AppointmentList } from './appointment-list/appointment-list';
import { AppointmentForm } from './appointment-form/appointment-form';
import { RoleGuard } from '../core/guards/role.guard';

const routes: Routes = [
  {
    path: '',
    component: AppointmentList
  },
  {
    path: 'new',
    component: AppointmentForm,
    canActivate: [RoleGuard],
    data: { permissions: ['manage_appointments', 'view_appointments'] }
  },
  {
    path: ':id/edit',
    component: AppointmentForm,
    canActivate: [RoleGuard],
    data: { permissions: ['manage_appointments', 'update_appointments'] }
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AppointmentsRoutingModule { }

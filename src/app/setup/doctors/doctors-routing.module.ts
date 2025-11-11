import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DoctorRegistrationComponent } from './doctor-registration/doctor-registration.component';
import { DoctorListComponent } from './doctor-list/doctor-list.component';
import { DoctorProfileComponent } from './doctor-profile/doctor-profile.component';

const routes: Routes = [
  {
    path: '',
    component: DoctorRegistrationComponent
  },
  {
    path: 'registration',
    component: DoctorRegistrationComponent
  },
  {
    path: 'doctor-registration',
    component: DoctorRegistrationComponent
  },
  {
    path: 'list',
    component: DoctorListComponent
  },
  {
    path: 'doctor-list',
    component: DoctorListComponent
  },
  {
    path: 'profile/:id',
    component: DoctorProfileComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class DoctorsRoutingModule { }

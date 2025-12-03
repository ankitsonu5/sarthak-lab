import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DoctorRegistrationComponent } from './doctors/doctor-registration/doctor-registration.component';
import { DoctorListComponent } from './doctors/doctor-list/doctor-list.component';
import { NotAvailableComponent } from '../shared/components/not-available.component';


const routes: Routes = [
  { path: '', redirectTo: 'doctor-registration', pathMatch: 'full' },
  { path: 'doctor-registration', component: DoctorRegistrationComponent },
  { path: 'doctor-list', component: DoctorListComponent },
  { path: 'doctors/doctor-registration', component: DoctorRegistrationComponent },
  { path: 'doctors/doctor-list', component: DoctorListComponent },
  {
    path: 'doctors',
    loadChildren: () => import('./doctors/doctors.module').then(m => m.DoctorsModule)
  },


  {
    path: 'prefixes',
    loadChildren: () => import('./prefixes/prefixes.module').then(m => m.PrefixesModule)
  },


  {
    path: 'category-heads',
    loadChildren: () => import('./category-heads/category-heads.module').then(m => m.CategoryHeadsModule)
  },


  { path: 'lab-setup', loadChildren: () => import('./lab-setup/lab-setup.module').then(m => m.LabSetupModule) },

  {
    path: 'pathology',
    loadChildren: () => import('./pathology/pathology.module').then(m => m.PathologyModule)
  },
  {
    path: 'counters',
    loadComponent: () => import('./counters/counter-admin.component').then(m => m.CounterAdminComponent)
  },

];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class SetupRoutingModule { }

import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PatientRegistrationComponent } from './patient-registration/patient-registration.component';
import { TestPageComponent } from './test-page.component';
import { SearchPatient } from './search-patient/search-patient';


const routes: Routes = [
  { path: '', redirectTo: 'patient-registration', pathMatch: 'full' },
  { path: 'patient-registration', component: PatientRegistrationComponent },
  { path: 'patient', component: PatientRegistrationComponent }, // Backward compatibility
  { path: 'search-patient', component: SearchPatient },
  { path: 'test', component: TestPageComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ReceptionRoutingModule { }

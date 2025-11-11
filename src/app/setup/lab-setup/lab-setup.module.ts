import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LabSetupComponent } from './lab-setup.component';

const routes: Routes = [
  { path: '', component: LabSetupComponent }
];

@NgModule({
  imports: [LabSetupComponent, RouterModule.forChild(routes)]
})
export class LabSetupModule {}


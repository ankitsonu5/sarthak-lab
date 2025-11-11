import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DoctorRoomDirectoryComponent } from './doctor-room-directory.component';

const routes: Routes = [
  {
    path: '',
    component: DoctorRoomDirectoryComponent
  },
  {
    path: 'directory',
    component: DoctorRoomDirectoryComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class DoctorRoomDirectoryRoutingModule { }

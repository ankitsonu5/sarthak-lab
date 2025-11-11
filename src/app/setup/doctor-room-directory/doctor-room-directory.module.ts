import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';

import { DoctorRoomDirectoryRoutingModule } from './doctor-room-directory-routing.module';
import { DoctorRoomDirectoryComponent } from './doctor-room-directory.component';
import { DoctorRoomDirectoryService } from './services/doctor-room-directory.service';

@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    HttpClientModule,
    DoctorRoomDirectoryRoutingModule,
    DoctorRoomDirectoryComponent
  ],
  providers: [
    DoctorRoomDirectoryService
  ]
})
export class DoctorRoomDirectoryModule { }

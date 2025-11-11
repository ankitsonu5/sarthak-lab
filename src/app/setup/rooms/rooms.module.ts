import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { RoomsRoutingModule } from './rooms-routing.module';
import { RoomRegistrationComponent } from './room-registration/room-registration.component';
import { RoomListComponent } from './room-list/room-list.component';
import { RoomService } from './services/room.service';

@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    RouterModule,
    RoomsRoutingModule,
    RoomRegistrationComponent,
    RoomListComponent
  ],
  providers: [RoomService]
})
export class RoomsModule { }

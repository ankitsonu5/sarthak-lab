import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { RoomRegistrationComponent } from './room-registration/room-registration.component';
import { RoomListComponent } from './room-list/room-list.component';
import { NotAvailableComponent } from '../../shared/components/not-available.component';


// Coming soon placeholder inside Rooms, if someone hits /setup/rooms/room-creation by mistake

const routes: Routes = [

  { path: 'room-registration', component: RoomRegistrationComponent },
  // If someone types room-creation under rooms module, show coming soon (not 404)
  { path: 'room-creation', component: NotAvailableComponent, data: { title: 'Room Creation', message: 'This module is not available right now.' } },

  { path: 'room-list', component: RoomListComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class RoomsRoutingModule { }

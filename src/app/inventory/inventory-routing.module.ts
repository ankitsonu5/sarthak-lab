import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ManageInventoryComponent } from './manage-inventory/manage-inventory.component';
import { TrackStockExpiryComponent } from './track-stock-expiry/track-stock-expiry.component';
import { AuthGuard } from '../core/guards/auth.guard';

const routes: Routes = [
  { path: '', redirectTo: 'manage', pathMatch: 'full' },
  { path: 'manage', component: ManageInventoryComponent, canActivate: [AuthGuard] },
  { path: 'stock-expiry', component: TrackStockExpiryComponent, canActivate: [AuthGuard] },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class InventoryRoutingModule {}


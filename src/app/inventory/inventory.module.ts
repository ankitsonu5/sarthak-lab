import { NgModule, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { InventoryRoutingModule } from './inventory-routing.module';
import { ManageInventoryComponent } from './manage-inventory/manage-inventory.component';
import { TrackStockExpiryComponent } from './track-stock-expiry/track-stock-expiry.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    InventoryRoutingModule,
    ManageInventoryComponent,
    TrackStockExpiryComponent
  ],
  declarations: [],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class InventoryModule {}


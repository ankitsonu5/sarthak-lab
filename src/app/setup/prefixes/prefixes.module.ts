import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';

import { PrefixesRoutingModule } from './prefixes-routing.module';
import { PrefixListComponent } from './prefix-list/prefix-list.component';
import { PrefixFormComponent } from './prefix-form/prefix-form.component';

@NgModule({
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    HttpClientModule,
    PrefixesRoutingModule,
    PrefixListComponent,
    PrefixFormComponent
  ]
})
export class PrefixesModule {}


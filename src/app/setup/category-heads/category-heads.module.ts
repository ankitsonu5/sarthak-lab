import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { CategoryHeadsRoutingModule } from './category-heads-routing.module';
import { CategoryHeadRegistrationComponent } from './category-head-registration/category-head-registration.component';
import { SearchServiceComponent } from './search-service/search-service.component';

@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    RouterModule,
    CategoryHeadsRoutingModule,
    CategoryHeadRegistrationComponent,
    SearchServiceComponent
  ]
})
export class CategoryHeadsModule { }

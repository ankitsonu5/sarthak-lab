import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CategoryHeadRegistrationComponent } from './category-head-registration/category-head-registration.component';
import { ServiceHeadComponent } from './service-head/service-head.component';
import { SearchServiceComponent } from './search-service/search-service.component';

const routes: Routes = [
  {
    path: '',
    redirectTo: 'category-head-registration',
    pathMatch: 'full'
  },
  {
    path: 'category-head-registration',
    component: CategoryHeadRegistrationComponent
  },
  {
    path: 'service-head',
    component: ServiceHeadComponent
  },
  {
    path: 'search-service',
    component: SearchServiceComponent
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class CategoryHeadsRoutingModule { }

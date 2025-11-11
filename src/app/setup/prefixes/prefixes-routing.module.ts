import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PrefixListComponent } from './prefix-list/prefix-list.component';
import { PrefixFormComponent } from './prefix-form/prefix-form.component';

const routes: Routes = [
  { path: '', redirectTo: 'list', pathMatch: 'full' },
  { path: 'list', component: PrefixListComponent },
  { path: 'new', component: PrefixFormComponent },
  { path: 'edit/:id', component: PrefixFormComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class PrefixesRoutingModule {}


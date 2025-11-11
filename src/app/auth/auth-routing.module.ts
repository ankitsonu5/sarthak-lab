import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { Login } from './login/login';
import { Register } from './register/register';
import { ForgotPassword } from './forgot-password/forgot-password';
import { ResetPasswordComponent } from './reset-password/reset-password';
import { RoleGuard } from '../core/guards/role.guard';

const routes: Routes = [
  { path: '', redirectTo: '/auth/login', pathMatch: 'full' },
  { path: 'login', component: Login },
  // Only SuperAdmin can access registration
  { path: 'register', component: Register, canActivate: [RoleGuard], data: { roles: ['SuperAdmin'] } },
  { path: 'forgot-password', component: ForgotPassword },
  { path: 'reset-password', component: ResetPasswordComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AuthRoutingModule { }

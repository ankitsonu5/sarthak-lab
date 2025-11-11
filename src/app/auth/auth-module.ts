import { NgModule } from '@angular/core';
import { SharedModule } from '../shared/shared-module';
import { AuthRoutingModule } from './auth-routing.module';
import { Login } from './login/login';
import { Register } from './register/register';
import { ForgotPassword } from './forgot-password/forgot-password';
import { ResetPasswordComponent } from './reset-password/reset-password';

@NgModule({
  declarations: [
    Login,
    Register,
    ForgotPassword,
    ResetPasswordComponent
  ],
  imports: [
    SharedModule,
    AuthRoutingModule
  ]
})
export class AuthModule { }

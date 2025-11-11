import { NgModule } from '@angular/core';
import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { SharedModule } from '../shared/shared-module';
import { Header } from './header/header';
import { AuthInterceptor } from './interceptors/auth.interceptor';

@NgModule({
  declarations: [
    Header
  ],
  imports: [
    SharedModule
  ],
  exports: [
    Header
  ],
  providers: [
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi: true
    }
  ]
})
export class CoreModule { }

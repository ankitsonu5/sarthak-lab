import { Injectable } from '@angular/core';
import { Resolve, ActivatedRouteSnapshot } from '@angular/router';

@Injectable({ providedIn: 'root' })
export class NotAvailableRouteResolver implements Resolve<{title?: string; message?: string; tips?: string[]}> {
  resolve(route: ActivatedRouteSnapshot) {
    const title = route.data?.['title'];
    const message = route.data?.['message'];
    const tips = route.data?.['tips'] || [];
    return { title, message, tips };
  }
}


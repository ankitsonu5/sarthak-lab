import { Injectable } from '@angular/core';
import { CanActivate, Router, ActivatedRouteSnapshot } from '@angular/router';
import { Observable, map, take } from 'rxjs';
import { Auth } from '../services/auth';

@Injectable({
  providedIn: 'root'
})
export class RoleDashboardGuard implements CanActivate {

  constructor(
    private authService: Auth,
    private router: Router
  ) {}

  canActivate(route: ActivatedRouteSnapshot): Observable<boolean> {
    return this.authService.currentUser$.pipe(
      take(1), // PERFORMANCE FIX: Take only first emission to prevent multiple redirects
      map(user => {
        console.log('🛡️ RoleDashboardGuard - Current user:', user);
        console.log('🛡️ RoleDashboardGuard - Route path:', route.routeConfig?.path);
        console.log('🛡️ RoleDashboardGuard - Expected role:', route.data['expectedRole']);

        if (!user) {
          console.log('❌ No user found, redirecting to login');
          this.router.navigate(['/auth/login'], { replaceUrl: true });
          return false;
        }

        const expectedRole = route.data['expectedRole'];
        const currentPath = route.routeConfig?.path;

        // If user is trying to access dashboard without specific role requirement
        if (currentPath === '' && !expectedRole) {
          console.log('🔄 Redirecting to role-specific dashboard');
          // Use replaceUrl to prevent caching issues
          if (user.role === 'Pathology') {
            this.router.navigate(['/dashboard/pathology'], { replaceUrl: true });
            return false;
          } else if (user.role === 'SuperAdmin') {
            this.router.navigate(['/roles/super-admin'], { replaceUrl: true });
            return false;
          } else if (user.role === 'Admin') {
            this.router.navigate(['/dashboard/admin'], { replaceUrl: true });
            return false;
          } else if (user.role === 'Pharmacy') {
            this.router.navigate(['/pharmacy'], { replaceUrl: true });
            return false;
          }
        }

        // If specific role is expected, check if user has that role
        if (expectedRole && user.role !== expectedRole) {
          console.log(`❌ Role mismatch. Expected: ${expectedRole}, Got: ${user.role}`);
          // Use replaceUrl to prevent caching and navigation history issues
          if (user.role === 'Pathology') {
            this.router.navigate(['/dashboard/pathology'], { replaceUrl: true });
          } else if (user.role === 'SuperAdmin') {
            this.router.navigate(['/roles/super-admin'], { replaceUrl: true });
          } else if (user.role === 'Admin') {
            this.router.navigate(['/dashboard/admin'], { replaceUrl: true });
          } else if (user.role === 'Pharmacy') {
            this.router.navigate(['/pharmacy'], { replaceUrl: true });
          } else {
            this.router.navigate(['/auth/login'], { replaceUrl: true });
          }
          return false;
        }

        console.log('✅ Access granted');
        return true;
      })
    );
  }
}

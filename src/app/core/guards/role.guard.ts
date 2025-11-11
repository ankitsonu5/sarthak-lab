import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { Auth } from '../services/auth';

@Injectable({
  providedIn: 'root'
})
export class RoleGuard implements CanActivate {

  constructor(
    private authService: Auth,
    private router: Router
  ) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean {
    const user = this.authService.getCurrentUser();

    if (!user) {
      this.router.navigate(['/auth/login']);
      return false;
    }

    // SuperAdmin bypass: can access everything
    if (user.role === 'SuperAdmin') {
      return true;
    }

    // Check for required roles
    const requiredRoles = route.data['roles'] as string[];
    if (requiredRoles && requiredRoles.length > 0) {
      if (!requiredRoles.includes(user.role)) {
        this.router.navigate(['/unauthorized']);
        return false;
      }
    }

    // Check for required permissions
    const requiredPermissions = route.data['permissions'] as string[];
    if (requiredPermissions && requiredPermissions.length > 0) {
      if (!this.authService.hasAnyPermission(requiredPermissions)) {
        this.router.navigate(['/unauthorized']);
        return false;
      }
    }

    return true;
  }
}

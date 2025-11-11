import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { Auth } from '../services/auth';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {

  constructor(
    private authService: Auth,
    private router: Router
  ) {}

  canActivate(): boolean {
    console.log('🛡️ AuthGuard: Checking authentication...');

    // PERFORMANCE: Fast synchronous check using localStorage
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');

    console.log('🛡️ AuthGuard: Token exists:', !!token);
    console.log('🛡️ AuthGuard: User exists:', !!user);

    if (token && user) {
      try {
        // Quick validation without API call
        const userData = JSON.parse(user);
        console.log('🛡️ AuthGuard: User data:', userData);

        if (userData && userData.role) {
          console.log('✅ AuthGuard: Access granted for role:', userData.role);
          return true;
        }
      } catch (error) {
        console.log('❌ AuthGuard: Error parsing user data:', error);
        // Invalid user data, clear and redirect
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }

    console.log('❌ AuthGuard: Access denied, redirecting to login');
    // Fast redirect without navigation delay
    this.router.navigate(['/auth/login'], { replaceUrl: true });
    return false;
  }
}

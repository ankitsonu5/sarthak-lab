import { Injectable } from '@angular/core';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class RoutePreloaderService {
  private preloadedRoutes = new Set<string>();

  constructor(private router: Router) {}

  // Preload common routes for faster navigation
  preloadCommonRoutes(): void {
    const commonRoutes = [
      '/reception/patient-registration',
      '/reception/search-patient',
      '/cash-receipt/register-opt-ipd',
      '/cash-receipt/edit-record',
      '/setup/doctor-registration',
      '/setup/departments',
      '/setup/rooms'
    ];

    commonRoutes.forEach(route => {
      if (!this.preloadedRoutes.has(route)) {
        this.preloadRoute(route);
        this.preloadedRoutes.add(route);
      }
    });
  }

  private preloadRoute(route: string): void {
    try {
      // Use router to preload the route
      this.router.navigate([route], { skipLocationChange: true }).then(() => {
        console.log(`✅ Preloaded route: ${route}`);
      }).catch(() => {
        console.log(`❌ Failed to preload route: ${route}`);
      });
    } catch (error) {
      console.log(`❌ Error preloading route ${route}:`, error);
    }
  }

  // Fast navigation with preloaded routes
  fastNavigate(route: string, replaceUrl: boolean = true): void {
    this.router.navigate([route], { 
      replaceUrl,
      skipLocationChange: false 
    });
  }
}

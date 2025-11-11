import { Component, OnInit } from '@angular/core';
import { RoutePreloaderService } from './core/services/route-preloader.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  standalone: false,
  styleUrl: './app.css'
})
export class App implements OnInit {
  protected title = 'hospital-management-system';

  constructor(private routePreloader: RoutePreloaderService) {}

  ngOnInit(): void {
    // PERFORMANCE: Preload common routes for faster navigation
    console.log('🚀 APP: Route preloading disabled to prevent auto-navigation');
    // Disabled route preloading to prevent unwanted navigation
    // setTimeout(() => {
    //   this.routePreloader.preloadCommonRoutes();
    // }, 2000);
  }
}

import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { Auth, User } from '../../core/services/auth';
import { LabSettingsService, LabSettings } from '../../setup/lab-setup/lab-settings.service';
import { DefaultLabConfigService } from '../services/default-lab-config.service';
import { NotificationService, AppNotification } from '../services/notification.service';

@Component({
  selector: 'app-header',
  standalone: false,
  templateUrl: './header.html',
  styleUrl: './header.css'
})
export class Header implements OnInit {
  @Output() sidenavToggle = new EventEmitter<void>();
  currentUser: User | null = null;

  // Lab settings for dynamic logo/name
  labSettings: LabSettings | null = null;
  // Whether current route is dashboard (show logo only here)
  isDashboard: boolean = false;

  // Notifications
  notifications: AppNotification[] = [];
  unreadCount = 0;

  constructor(
    private authService: Auth,
    private router: Router,
    private labService: LabSettingsService,
    public defaultLabConfig: DefaultLabConfigService,
    private notificationService: NotificationService
  ) {}

  ngOnInit(): void {
    this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;
    });

    this.updateIsDashboard();
    try {
      this.router.events.subscribe(evt => {
        if (evt instanceof NavigationEnd) {
          this.updateIsDashboard();
        }
      });
    } catch {}

    // Subscribe to notifications
    try {
      this.notificationService.notifications$.subscribe(list => {
        this.notifications = list || [];
        this.unreadCount = this.notifications.filter(n => !n.read).length;
      });
    } catch {}

    this.loadLabSettings();
  }

  private loadLabSettings(): void {
    // Load from cache first for instant UI
    try {
      const cached = localStorage.getItem('labSettings');
      if (cached) {
        this.labSettings = JSON.parse(cached);
      }
    } catch {}

    // Fetch fresh data
    try {
      this.labService.getMyLab().subscribe({
        next: (res) => {
          this.labSettings = res.lab || this.labSettings;
        },
        error: () => {}
      });
    } catch {}
  }

  private updateIsDashboard(): void {
    try {
      const url = (this.router.url || '').split('?')[0] || '';
      this.isDashboard = url.startsWith('/dashboard');
    } catch {
      this.isDashboard = false;
    }
  }

  toggleSidenav(): void {
    this.sidenavToggle.emit();
  }

  onNotificationMenuOpened(): void {
    // Mark all as read when user opens the menu
    try { this.notificationService.markAllRead(); } catch {}
  }

  clearNotifications(): void {
    try { this.notificationService.clear(); } catch {}
  }

  getNotificationIcon(n: AppNotification): string {
    switch (n.type) {
      case 'appointments': return 'schedule';
      case 'pathology': return 'medical_services';
      case 'cashReceipts': return 'receipt_long';
      default: return 'notifications';
    }
  }

  openNotification(n: AppNotification): void {
    try {
      if (n.type === 'appointments') {
        this.router.navigate(['/appointments']);
      } else if (n.type === 'pathology') {
        this.router.navigate(['/cash-receipt/edit-record']);
      } else if (n.type === 'cashReceipts') {
        this.router.navigate(['/reporting/daily-cash-report']);
      } else {
        this.router.navigate(['/dashboard']);
      }
    } catch {}
  }

  logout(): void {
    const confirmed = window.confirm('Are you sure you want to logout?');
    if (!confirmed) return;
    this.authService.logout();
    this.router.navigate(['/auth/login']);
  }
}

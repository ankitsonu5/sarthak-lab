import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { Router } from '@angular/router';
import { Auth, User } from '../../core/services/auth';

@Component({
  selector: 'app-header',
  standalone: false,
  templateUrl: './header.html',
  styleUrl: './header.css'
})
export class Header implements OnInit {
  @Output() sidenavToggle = new EventEmitter<void>();
  currentUser: User | null = null;

  constructor(
    private authService: Auth,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;
    });
  }

  toggleSidenav(): void {
    this.sidenavToggle.emit();
  }

  logout(): void {
    const confirmed = window.confirm('Are you sure you want to logout?');
    if (!confirmed) return;
    this.authService.logout();
    this.router.navigate(['/auth/login']);
  }
}

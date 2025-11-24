import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface User {
  _id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: string;
  isActive: boolean;
  labId?: string;
  createdAt: string;
  lastLogin?: string;
}

@Component({
  selector: 'app-user-management',
  standalone: false,
  templateUrl: './user-management.component.html',
  styleUrls: ['./user-management.component.css']
})
export class UserManagementComponent implements OnInit {
  users: User[] = [];
  filteredUsers: User[] = [];
  loading = false;
  error = '';
  searchQuery = '';
  filterRole = 'all';
  filterStatus = 'all';

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers(): void {
    this.loading = true;
    this.error = '';

    const apiUrl = `${environment.apiUrl || 'http://localhost:3000/api'}/auth/users`;
    const token = localStorage.getItem('token');

    this.http.get<any>(apiUrl, {
      headers: { Authorization: `Bearer ${token}` }
    }).subscribe({
      next: (response) => {
        console.log('✅ Users loaded:', response);
        this.users = response.users || [];
        this.applyFilters();
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('❌ Error loading users:', error);
        this.error = error.error?.message || 'Failed to load users';
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  applyFilters(): void {
    let filtered = [...this.users];

    // Search filter
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(u =>
        u.firstName?.toLowerCase().includes(query) ||
        u.lastName?.toLowerCase().includes(query) ||
        u.email?.toLowerCase().includes(query) ||
        u.username?.toLowerCase().includes(query) ||
        u.phone?.includes(query)
      );
    }

    // Role filter
    if (this.filterRole !== 'all') {
      filtered = filtered.filter(u => u.role === this.filterRole);
    }

    // Status filter
    if (this.filterStatus === 'active') {
      filtered = filtered.filter(u => u.isActive);
    } else if (this.filterStatus === 'inactive') {
      filtered = filtered.filter(u => !u.isActive);
    }

    this.filteredUsers = filtered;
    this.cdr.detectChanges();
  }

  onFilterChange(): void {
    this.applyFilters();
  }

  toggleUserStatus(user: User): void {
    const apiUrl = `${environment.apiUrl || 'http://localhost:3000/api'}/auth/users/${user._id}/toggle-active`;
    const token = localStorage.getItem('token');

    this.http.patch<any>(apiUrl, {}, {
      headers: { Authorization: `Bearer ${token}` }
    }).subscribe({
      next: (response) => {
        console.log('✅ User status updated:', response);
        user.isActive = response.user.isActive;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('❌ Error updating user status:', error);
        alert(error.error?.message || 'Failed to update user status');
      }
    });
  }

  deleteUser(user: User): void {
    if (!confirm(`Are you sure you want to delete user "${user.firstName} ${user.lastName}"?`)) {
      return;
    }

    const apiUrl = `${environment.apiUrl || 'http://localhost:3000/api'}/auth/users/${user._id}`;
    const token = localStorage.getItem('token');

    this.http.delete<any>(apiUrl, {
      headers: { Authorization: `Bearer ${token}` }
    }).subscribe({
      next: () => {
        console.log('✅ User deleted');
        alert('User deleted successfully!');
        this.loadUsers();
      },
      error: (error) => {
        console.error('❌ Error deleting user:', error);
        alert(error.error?.message || 'Failed to delete user');
      }
    });
  }

  formatDate(dateString: string): string {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-IN');
  }

  getActiveUsersCount(): number {
    return this.users.filter(u => u.isActive).length;
  }

  getInactiveUsersCount(): number {
    return this.users.filter(u => !u.isActive).length;
  }
}


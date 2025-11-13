import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface Lab {
  _id: string;
  labCode: string;
  labName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  country: string;
  pincode: string;
  
  // Branding
  logoUrl?: string;
  sideLogoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  headerNote?: string;
  footerNote?: string;
  
  // Subscription
  subscriptionPlan: string;
  subscriptionStatus: string;
  trialEndsAt?: string;
  subscriptionEndsAt?: string;
  
  // Approval
  approvalStatus: string;
  approvedBy?: any;
  approvedAt?: string;
  rejectionReason?: string;
  
  // Usage Stats
  totalUsers: number;
  totalPatients: number;
  totalReports: number;
  monthlyReports: number;
  
  // Settings
  settings?: any;
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
}

interface User {
  _id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

@Component({
  selector: 'app-lab-profile',
  standalone: false,
  templateUrl: './lab-profile.component.html',
  styleUrls: ['./lab-profile.component.css']
})
export class LabProfileComponent implements OnInit {
  labId: string = '';
  lab: Lab | null = null;
  users: User[] = [];
  loading = false;
  error = '';
  
  activeTab: string = 'overview'; // overview, users, settings, stats

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    this.labId = this.route.snapshot.paramMap.get('id') || '';
    if (this.labId) {
      this.loadLabProfile();
      this.loadLabUsers();
    }
  }

  loadLabProfile(): void {
    this.loading = true;
    this.error = '';

    const apiUrl = `${environment.apiUrl || 'http://localhost:3000/api'}/lab-management/labs/${this.labId}`;
    const token = localStorage.getItem('token');

    this.http.get<any>(apiUrl, {
      headers: { Authorization: `Bearer ${token}` }
    }).subscribe({
      next: (response) => {
        console.log('✅ Lab profile loaded:', response);
        this.lab = response.lab;
        this.loading = false;
      },
      error: (error) => {
        console.error('❌ Error loading lab profile:', error);
        this.error = error.error?.message || 'Failed to load lab profile';
        this.loading = false;
      }
    });
  }
  loadLabUsers(): void {
    const apiUrl = `${environment.apiUrl || 'http://localhost:3000/api'}/lab-management/labs/${this.labId}/users`;
    const token = localStorage.getItem('token');

    this.http.get<any>(apiUrl, {
      headers: { Authorization: `Bearer ${token}` }
    }).subscribe({
      next: (response) => {
        console.log('✅ Lab users loaded:', response);
        this.users = response.users || [];
      },
      error: (error) => {
        console.error('❌ Error loading lab users:', error);
      }
    });
  }

  approveLab(): void {
    if (!confirm('Are you sure you want to approve this lab?')) {
      return;
    }

    const apiUrl = `${environment.apiUrl || 'http://localhost:3000/api'}/lab-management/labs/${this.labId}/approve`;
    const token = localStorage.getItem('token');

    this.http.put<any>(apiUrl, {}, {
      headers: { Authorization: `Bearer ${token}` }
    }).subscribe({
      next: (response) => {
        console.log('✅ Lab approved:', response);
        alert('Lab approved successfully!');
        this.loadLabProfile();
      },
      error: (error) => {
        console.error('❌ Error approving lab:', error);
        alert(error.error?.message || 'Failed to approve lab');
      }
    });
  }

  rejectLab(): void {
    const reason = prompt('Enter rejection reason:');
    if (!reason) {
      return;
    }

    const apiUrl = `${environment.apiUrl || 'http://localhost:3000/api'}/lab-management/labs/${this.labId}/reject`;
    const token = localStorage.getItem('token');

    this.http.put<any>(apiUrl, { reason }, {
      headers: { Authorization: `Bearer ${token}` }
    }).subscribe({
      next: (response) => {
        console.log('✅ Lab rejected:', response);
        alert('Lab rejected successfully!');
        this.loadLabProfile();
      },
      error: (error) => {
        console.error('❌ Error rejecting lab:', error);
        alert(error.error?.message || 'Failed to reject lab');
      }
    });
  }

  goBack(): void {
    this.router.navigate(['/super-admin/dashboard']);
  }

  setActiveTab(tab: string): void {
    this.activeTab = tab;
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'pending': return 'badge-warning';
      case 'approved': return 'badge-success';
      case 'rejected': return 'badge-danger';
      default: return 'badge-secondary';
    }
  }

  getPlanBadgeClass(plan: string): string {
    switch (plan) {
      case 'trial': return 'badge-info';
      case 'basic': return 'badge-primary';
      case 'premium': return 'badge-gold';
      default: return 'badge-secondary';
    }
  }

  formatDate(dateString: string): string {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getDaysLeft(dateString: string): number {
    if (!dateString) return -1;
    const endDate = new Date(dateString);
    const today = new Date();
    const diffTime = endDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  getPlanLimits(): any {
    if (!this.lab) return {};
    
    const plans: any = {
      trial: { maxUsers: 2, maxPatients: 50, maxReportsPerMonth: 100 },
      basic: { maxUsers: 5, maxPatients: 5000, maxReportsPerMonth: 1000 },
      premium: { maxUsers: -1, maxPatients: -1, maxReportsPerMonth: -1 }
    };
    
    return plans[this.lab.subscriptionPlan] || {};
  }

  getUsagePercentage(current: number, max: number): number {
    if (max === -1) return 0; // Unlimited
    return Math.min((current / max) * 100, 100);
  }
}


import { Component, OnInit, AfterViewInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { CategoryHeadService, CategoryHead } from '../services/category-head.service';
import { DeleteConfirmationModalComponent } from '../../../shared/components/delete-confirmation-modal/delete-confirmation-modal.component';
import { DeleteSuccessModalComponent } from '../../../shared/components/delete-success-modal/delete-success-modal.component';

import { environment } from '../../../../environments/environment';

export interface ServiceHead {
  _id?: string;
  category: CategoryHead | string;
  testName: string;
  price: number;
  createdAt?: Date;
  updatedAt?: Date;
}

@Component({
  selector: 'app-search-service',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DeleteConfirmationModalComponent,
    DeleteSuccessModalComponent
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './search-service.component.html',
  styleUrls: ['./search-service.component.css']
})
export class SearchServiceComponent implements OnInit, AfterViewInit, OnDestroy {
  private subscription: Subscription = new Subscription();

  // Categories from database
  categoryOptions: CategoryHead[] = [];

  // Services by category
  servicesByCategory: { [key: string]: ServiceHead[] } = {};

  // Search results
  searchResults: ServiceHead[] = [];
  searchTerm = '';

  // Selected category info for header display
  selectedCategoryName = 'ALL CATEGORIES';
  selectedCategoryId: string = 'ALL';
  totalServicesCount = 0;

  // Pagination
  pageSize = 20;
  currentPage = 1;

  get totalPages(): number { return Math.max(1, Math.ceil(this.totalServicesCount / this.pageSize)); }
  get paginatedResults(): ServiceHead[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.searchResults.slice(start, start + this.pageSize);
  }
  get displayStart(): number { return this.totalServicesCount === 0 ? 0 : (this.currentPage - 1) * this.pageSize + 1; }
  get displayEnd(): number { const end = this.currentPage * this.pageSize; return end > this.totalServicesCount ? this.totalServicesCount : end; }

  setPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
  }
  nextPage(): void { this.setPage(this.currentPage + 1); }
  prevPage(): void { this.setPage(this.currentPage - 1); }
  private clampPage(): void {
    if (this.currentPage > this.totalPages) this.currentPage = this.totalPages;
    if (this.currentPage < 1) this.currentPage = 1;
  }

  // Delete modal properties
  showDeleteConfirmation = false;
  showDeleteSuccess = false;
  deleteMessage = '';
  serviceToDelete: ServiceHead | null = null;
  isDeleting = false;

  constructor(
    private categoryHeadService: CategoryHeadService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {
    console.log('🔍 Search Service Constructor - Component Created');
  }

  ngOnInit(): void {
    console.log('🔍 Search Service Component Initializing...');

    // Show empty arrays immediately so UI renders fast
    this.categoryOptions = [];
    this.searchResults = [];
    this.servicesByCategory = {};

    this.forceLoadData(); // Force load data immediately
  }

  ngAfterViewInit(): void {
    console.log('🔍 Search Service View Initialized');
    // Remove manual change detection to prevent loops

    // Double check data loading after view init
    if (this.categoryOptions.length === 0) {
      console.log('🔄 No categories found, retrying data load...');
      this.forceLoadData();
    }
  }

  // Force data loading method
  private forceLoadData(): void {
    console.log('🚀 FORCE LOADING DATA for Search Service...');
    this.loadCategories();

    // Remove setTimeout to prevent loops
    // setTimeout(() => {
    //   if (this.categoryOptions.length === 0) {
    //     console.log('🔄 Retrying data load after delay...');
    //     this.loadCategories();
    //   }
    // }, 100);
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  // No longer needed since we're using ngModel
  // Kept for reference

  // Load categories from database
  loadCategories(): void {
    console.log('📊 SEARCH SERVICE: Loading categories...');
    console.log('📊 SEARCH SERVICE: CategoryHeadService:', this.categoryHeadService);

    this.subscription.add(
      this.categoryHeadService.getCategoryHeads(100, true).subscribe({
        next: (categories) => {
          this.categoryOptions = categories;

          // Default to ALL on first load
          this.selectedCategoryId = 'ALL';
          this.selectedCategoryName = 'ALL CATEGORIES';

          // Load all categories' services so table can show ALL
          this.loadAllServices();

          // Apply filter for ALL and render
          this.onCategoryChange();
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('❌ SEARCH SERVICE: Error loading categories:', error);
          console.error('❌ SEARCH SERVICE: Error details:', error.message, error.status);
          this.categoryOptions = [];
          this.cdr.detectChanges();
        }
      })
    );
  }

  // Load all services for all categories
  loadAllServices(): void {
    this.categoryOptions.forEach(category => {
      this.loadServicesByCategory(category._id!);
    });
  }

  // Load services by category
  loadServicesByCategory(categoryId: string): void {
    console.log('🔄 Loading services for category:', categoryId);

    this.getServicesByCategory(categoryId)
      .then(services => {
        // Normalize category so UI can always read a name
        const resolvedName = this.getCategoryName(categoryId);
        const normalized = services.map((s: any) => {
          if (s && typeof s.category === 'string') {
            return { ...s, category: { _id: s.category, categoryName: resolvedName } };
          }
          if (s && typeof s.category === 'object' && s.category && !s.category.categoryName) {
            return { ...s, category: { ...s.category, categoryName: resolvedName } };
          }
          return s;
        });

        this.servicesByCategory[categoryId] = normalized;
        console.log(`✅ Loaded ${normalized.length} services for category: ${categoryId}`);

        // Update search results depending on current filter
        if (this.selectedCategoryId === categoryId) {
          this.searchResults = normalized;
          this.applySearchFilter();
        } else if (this.selectedCategoryId === 'ALL') {
          const all: ServiceHead[] = Object.keys(this.servicesByCategory)
            .flatMap(id => this.servicesByCategory[id] || []);
          this.searchResults = all;
          this.applySearchFilter();
        }

        // Force change detection
        this.cdr.detectChanges();
      })
      .catch(error => {
        console.error('❌ Error loading services for category:', categoryId, error);
        this.servicesByCategory[categoryId] = [];
        this.cdr.detectChanges();
      });
  }

  // Filter services by category
  onCategoryChange(): void {
    // Reset to first page whenever filter changes
    this.currentPage = 1;

    if (this.selectedCategoryId === 'ALL') {
      // Aggregate all services
      const all: ServiceHead[] = Object.keys(this.servicesByCategory)
        .flatMap(id => this.servicesByCategory[id] || []);
      this.searchResults = all;
      this.selectedCategoryName = 'ALL CATEGORIES';
    } else if (this.selectedCategoryId) {
      this.searchResults = this.servicesByCategory[this.selectedCategoryId] || [];
      const category = this.categoryOptions.find(cat => cat._id === this.selectedCategoryId);
      this.selectedCategoryName = category ? category.categoryName : 'Unknown';
    } else {
      this.searchResults = [];
      this.selectedCategoryName = 'ALL CATEGORIES';
    }

    // Update total count and apply search
    this.applySearchFilter();

    // Force change detection
    this.cdr.detectChanges();
    console.log(`🔍 Category changed to: ${this.selectedCategoryName}, Services: ${this.totalServicesCount}`);
  }

  // Search functionality
  onSearch(): void {
    this.applySearchFilter();
  }

  // Clear search term and reset filtering
  clearSearch(): void {
    if (!this.searchTerm) return;
    this.searchTerm = '';
    this.currentPage = 1;
    this.applySearchFilter();
    this.cdr.detectChanges();
  }

  private applySearchFilter(): void {
    // Base list according to filter
    let services: ServiceHead[] = [];
    if (this.selectedCategoryId === 'ALL') {
      services = Object.keys(this.servicesByCategory)
        .flatMap(id => this.servicesByCategory[id] || []);
    } else if (this.selectedCategoryId) {
      services = this.servicesByCategory[this.selectedCategoryId] || [];
    }

    // Apply search term
    const term = this.searchTerm.trim().toLowerCase();
    this.searchResults = term
      ? services.filter(s => (s.testName || '').toLowerCase().includes(term))
      : services;

    // Update total count after filtering
    this.totalServicesCount = this.searchResults.length;
    this.clampPage();
  }

  // Navigation methods for tab buttons
  navigateToCategoryRegistration(): void {
    this.router.navigate(['/setup/category-heads/category-head-registration']);
  }

  navigateToServiceHead(): void {
    this.router.navigate(['/setup/category-heads/service-head']);
  }

  // HTTP Methods
  private getServicesByCategory(categoryId: string) {
    const token = localStorage.getItem('token');
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    return new Promise<ServiceHead[]>((resolve, reject) => {
      fetch(`${environment.apiUrl}/service-heads/${categoryId}`, {
        method: 'GET',
        headers: headers
      })
      .then(response => response.json())
      .then(data => {
        if (data.error) {
          reject(data);
        } else {
          resolve(Array.isArray(data) ? data : (data.data || []));
        }
      })
      .catch(error => reject(error));
    });
  }

  // Utility methods
  getCategoryName(categoryOrId: string | CategoryHead): string {
    if (categoryOrId && typeof categoryOrId === 'object') {
      const anyCat: any = categoryOrId as any;
      if (anyCat.categoryName) return anyCat.categoryName;
      if (anyCat.name) return anyCat.name;
      if (anyCat._id) {
        const c = this.categoryOptions.find(cat => cat._id === anyCat._id);
        if (c) return c.categoryName;
      }
      return 'Unknown';
    }
    const category = this.categoryOptions.find(cat => cat._id === categoryOrId);
    return category ? category.categoryName : 'Unknown';
  }

  formatPrice(price: number): string {
    return `₹${price}`;
  }

  // Get filtered services for a specific category
  getFilteredServicesForCategory(categoryId: string): ServiceHead[] {
    const services = this.servicesByCategory[categoryId] || [];

    if (this.searchTerm.trim()) {
      return services.filter(service =>
        service.testName.toLowerCase().includes(this.searchTerm.toLowerCase())
      );
    }

    return services;
  }

  // Edit service - navigate to service-head component with edit data
  editService(service: ServiceHead): void {
    console.log('Edit service:', service);

    // Store the service data in localStorage for the service-head component to pick up
    const editData = {
      serviceId: service._id,
      categoryId: typeof service.category === 'object' ? service.category._id : service.category,
      serviceName: service.testName,
      price: service.price.toString(),
      isEditMode: true
    };

    localStorage.setItem('editServiceData', JSON.stringify(editData));

    // Navigate to service-head component
    this.router.navigate(['/setup/category-heads/service-head']);
  }

  // Delete service
  deleteService(service: ServiceHead): void {
    this.serviceToDelete = service;
    this.deleteMessage = `You are about to remove service "${service.testName}" forever. Once deleted, this cannot be restored.`;
    this.showDeleteConfirmation = true;
    this.isDeleting = false;
  }

  // Delete Confirmation Methods
  cancelDelete(): void {
    this.showDeleteConfirmation = false;
    this.serviceToDelete = null;
    this.deleteMessage = '';
  }

  confirmDelete(): void {
    if (!this.serviceToDelete || this.isDeleting) return;
    this.isDeleting = true;
    // Close the confirmation immediately on first click
    this.showDeleteConfirmation = false;
    // Immediately show success modal as requested
    this.showDeleteSuccess = true;

    const serviceId = this.serviceToDelete._id!;
    this.deleteServiceFromDB(serviceId).then(() => {
      // Remove from search results
      this.searchResults = this.searchResults.filter(s => s._id !== serviceId);
      // Remove from category-specific arrays
      Object.keys(this.servicesByCategory).forEach(categoryId => {
        this.servicesByCategory[categoryId] = this.servicesByCategory[categoryId].filter(s => s._id !== serviceId);
      });
      // Update total count
      this.totalServicesCount = this.searchResults.length;
      this.serviceToDelete = null;
      this.isDeleting = false;
    }).catch((error: any) => {
      console.error('Error deleting service:', error);
      this.showDeleteSuccess = false; // hide success if failed
      alert('Error deleting service: ' + (error.error?.message || error.message));
      this.isDeleting = false;
      this.cancelDelete();
    });
  }

  // Delete Success Methods
  onDeleteSuccessClosed(): void {
    this.showDeleteSuccess = false;
    // Refresh data after success modal closes (like doctor-list)
    if (this.selectedCategoryId) {
      this.loadServicesByCategory(this.selectedCategoryId);
    }
  }

  private updateServiceInDB(serviceId: string, updateData: { testName: string; price: number }) {
    const token = localStorage.getItem('token');
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    return new Promise((resolve, reject) => {
      fetch(`${environment.apiUrl}/service-heads/${serviceId}`, {
        method: 'PUT',
        headers: headers,
        body: JSON.stringify(updateData)
      })
      .then(response => response.json())
      .then(data => {
        if (data.error) {
          reject(data);
        } else {
          resolve(data);
        }
      })
      .catch(error => reject(error));
    });
  }

  private deleteServiceFromDB(serviceId: string) {
    const token = localStorage.getItem('token');
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    return new Promise((resolve, reject) => {
      fetch(`${environment.apiUrl}/service-heads/${serviceId}`, {
        method: 'DELETE',
        headers: headers
      })
      .then(response => response.json())
      .then(data => {
        if (data.error) {
          reject(data);
        } else {
          resolve(data);
        }
      })
      .catch(error => reject(error));
    });
  }

  // 🚫 SIMPLIFIED: Direct search without timeout to prevent loops
  onSearchTermChange(value: string): void {
    // Reset to first page when searching under ALL
    this.currentPage = 1;
    this.onSearch();
  }

  private searchTimeout: any;
}

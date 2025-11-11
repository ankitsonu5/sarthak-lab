import { Component, OnInit, OnDestroy, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute, NavigationEnd } from '@angular/router';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { PathologyService } from '../services/pathology.service';
import { SuccessAlertComponent } from '../../../shared/components/success-alert/success-alert.component';
import { DeleteConfirmationModalComponent } from '../../../shared/components/delete-confirmation-modal/delete-confirmation-modal.component';
import { DeleteSuccessModalComponent } from '../../../shared/components/delete-success-modal/delete-success-modal.component';
import { DeleteBlockedModalComponent } from '../../../shared/components/delete-blocked-modal/delete-blocked-modal.component';

export interface TestDefinition {
  _id?: string;
  testId?: string;
  name: string;
  shortName: string | { testName: string; price: string; _id: string };
  category: string | { name: string; categoryId: string; _id: string };
  testType: 'single' | 'multiple' | 'nested' | 'document' | 'panel';
  // Fields for single parameter tests
  sampleType?: string | string[] | Array<{ _id: string; name: string }>;
  unit?: string;
  inputType?: 'Numeric' | 'Single Line' | 'Paragraph';
  // Single parameter default-result system at root
  resultType?: 'manual' | 'dropdown' | 'fixed' | 'formula';
  dropdownOptions?: string;
  defaultResult?: string;
  formula?: string;

  isOptional?: boolean;
  normalValues?: any[]; // For single parameter tests
  parameters: TestParameterDefinition[];
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface TestParameterDefinition {
  order: number;
  name: string;
  unit?: string;
  inputType: 'Numeric' | 'Single Line' | 'Paragraph';
  defaultResult?: string;
  isOptional: boolean;
  groupBy?: string; // For nested parameters
}

@Component({
  selector: 'app-test-database',
  standalone: true,
  imports: [CommonModule, SuccessAlertComponent, DeleteConfirmationModalComponent, DeleteSuccessModalComponent, DeleteBlockedModalComponent],
  templateUrl: './test-database.component.html',
  styleUrls: ['./test-database.component.css']
})
export class TestDatabaseComponent implements OnInit, OnDestroy, AfterViewInit {
  testDefinitions: TestDefinition[] = [];
  filteredTests: TestDefinition[] = [];
  testCategories: any[] = [];
  private subscription: Subscription = new Subscription();

  // Filter properties
  selectedCategory = 'All';
  searchTerm = '';

  // Pagination
  currentPage = 1;
  pageSize = 10;
  totalPages = 0;

  // Auto-refresh interval
  private refreshInterval: any;

  // Alert properties
  showAlert = false;
  alertMessage = '';
  alertType: 'success' | 'error' = 'success';

  // Delete Modal properties
  showDeleteConfirmation = false;
  showDeleteSuccess = false;
  showDeleteBlocked = false;
  deleteMessage = '';
  deleteSuccessMessage = '';
  deleteBlockedMessage = '';
  itemToDelete: TestDefinition | null = null;

  // Math object for template
  Math = Math;

  constructor(
    private pathologyService: PathologyService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    console.log('🧪 Test Database Component Initializing...');

    // Show empty arrays immediately so UI renders fast
    this.testDefinitions = [];
    this.filteredTests = [];

    this.checkRouteParams();
    this.setupNavigationListeners();
    this.setupServiceNotifications();
    this.setupWindowFocusListener();
    this.setupAutoRefresh();
  }

  setupNavigationListeners(): void {
    // Listen for ALL navigation events to this component
    this.subscription.add(
      this.router.events.pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd)
      ).subscribe((e: NavigationEnd) => {
        console.log('🔄 Navigation event detected:', e.url, e.urlAfterRedirects);

        // Check multiple URL patterns to catch all navigations to this component
        const isTestDatabaseRoute =
          e.url.includes('/setup/pathology/test-database') ||
          e.urlAfterRedirects.includes('/setup/pathology/test-database') ||
          e.url.includes('/test-setup/pathology/test-database') ||
          e.urlAfterRedirects.includes('/test-setup/pathology/test-database') ||
          e.url.includes('/setup/pathology') ||
          e.urlAfterRedirects.includes('/setup/pathology') ||
          e.url.includes('/test-setup/pathology') ||
          e.urlAfterRedirects.includes('/test-setup/pathology') ||
          e.url === '/setup/pathology/test-database' ||
          e.urlAfterRedirects === '/setup/pathology/test-database' ||
          e.url === '/test-setup/pathology/test-database' ||
          e.urlAfterRedirects === '/test-setup/pathology/test-database' ||
          e.url === '/setup/pathology' ||
          e.urlAfterRedirects === '/setup/pathology' ||
          e.url === '/test-setup/pathology' ||
          e.urlAfterRedirects === '/test-setup/pathology';

        if (isTestDatabaseRoute) {
          console.log('🔄 Detected navigation to test-database, refreshing data...');
          setTimeout(() => {
            this.refreshData();
          }, 100);
        }
      })
    );
  }

  setupServiceNotifications(): void {
    // Listen for test definition changes from pathology service
    this.subscription.add(
      this.pathologyService.testDefinitionChanged$.subscribe(() => {
        console.log('🔄 Test definition change notification received, refreshing data...');
        this.loadTestDefinitions();
      })
    );

    // Listen for test deletion notifications
    this.subscription.add(
      this.pathologyService.testDeleted$.subscribe(() => {
        console.log('🔄 Test deletion notification received, refreshing data...');
        this.loadTestDefinitions();
      })
    );
  }

  setupWindowFocusListener(): void {
    // Refresh data when user returns to browser tab
    const handleFocus = () => {
      console.log('🔄 Window focus detected, refreshing data...');
      this.loadTestDefinitions();
    };

    // Refresh data when tab becomes visible
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('🔄 Tab visibility change detected, refreshing data...');
        this.loadTestDefinitions();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Clean up listeners on destroy
    this.subscription.add({
      unsubscribe: () => {
        window.removeEventListener('focus', handleFocus);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    } as any);
  }

  setupAutoRefresh(): void {
    // Set up periodic refresh every 30 seconds as a fallback
    this.refreshInterval = setInterval(() => {
      console.log('🔄 Auto-refresh interval triggered...');
      this.loadTestDefinitions();
    }, 30000); // 30 seconds
  }

  ngAfterViewInit(): void {
    console.log('🧪 Test Database View Initialized - Loading data...');
    // Load data after view is initialized for better performance
    setTimeout(() => {
      this.loadTestCategories();
      this.loadTestDefinitions();
    }, 0);

    // Also refresh after a short delay to ensure we have the latest data
    setTimeout(() => {
      console.log('🔄 Secondary refresh to ensure latest data...');
      this.loadTestDefinitions();
    }, 500);
  }

  checkRouteParams(): void {
    this.route.queryParams.subscribe(params => {
      if (params['category']) {
        this.selectedCategory = params['category'];
        this.applyFilters();
      }
    });
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();

    // Clean up auto-refresh interval
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  // Force refresh data (like category-head-registration)
  refreshData(): void {
    console.log('🔄 Force refreshing all data...');

    this.searchTerm = '';
    this.currentPage = 1;
    this.selectedCategory = 'All';

    // Clear the current data first
    this.testDefinitions = [];
    this.filteredTests = [];
    this.totalPages = 0;

    // Force reload from API
    this.loadTestCategories();
    this.loadTestDefinitions();
  }

  // Public method to force refresh from external components
  forceRefresh(): void {
    console.log('🔄 External force refresh requested...');
    this.refreshData();
  }

  loadTestCategories(): void {
    this.subscription.add(
      this.pathologyService.getTestCategories(true).subscribe({
        next: (categories) => {
          this.testCategories = categories;
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('Error loading test categories:', error);
          this.showAlertMessage('Error loading test categories', 'error');
        }
      })
    );
  }

  loadTestDefinitions(): void {
    console.log('🧪 Loading test definitions...');

    // Force refresh from API first (like category-head-registration)
    this.subscription.add(
      this.pathologyService.getTestDefinitions(true).subscribe({
        next: (testDefinitions) => {
          console.log('✅ Test definitions loaded successfully:', testDefinitions.length);

          // Update local data (like category-head-registration)
          this.testDefinitions = testDefinitions || [];
          this.applyFilters(); // Apply search and pagination

          // Force Angular change detection (like category-head-registration)
          this.cdr.detectChanges();
          console.log('✅ TEST DATABASE: Change detection triggered!');
        },
        error: (error) => {
          console.error('Error loading test definitions:', error);
          this.testDefinitions = [];
          this.filteredTests = [];
          this.totalPages = 0;


        }
      })
    );
  }


  applyFilters(): void {
    // Exclude panel type tests from Test Database view
    let filtered = [...this.testDefinitions].filter(td => (td.testType || '').toLowerCase() !== 'panel');

    // Category filter
    if (this.selectedCategory && this.selectedCategory !== 'All') {
      filtered = filtered.filter(test => {
        // Handle both populated and non-populated category
        const categoryName = typeof test.category === 'object' && test.category?.name
          ? test.category.name
          : test.category;
        return categoryName === this.selectedCategory;
      });
    }

    // Search filter
    if (this.searchTerm.trim()) {
      const searchLower = this.searchTerm.toLowerCase();
      filtered = filtered.filter(test => {
        const categoryName = typeof test.category === 'object' && test.category?.name
          ? test.category.name
          : test.category;
        const shortName = typeof test.shortName === 'object' && test.shortName?.testName
          ? test.shortName.testName
          : test.shortName;

        return test.name.toLowerCase().includes(searchLower) ||
               (typeof shortName === 'string' ? shortName.toLowerCase() : '').includes(searchLower) ||
               (typeof categoryName === 'string' ? categoryName.toLowerCase() : '').includes(searchLower);
      });
    }

    this.filteredTests = filtered;
    this.totalPages = Math.ceil(this.filteredTests.length / this.pageSize);
    this.currentPage = 1;
    this.cdr.detectChanges();
  }

  onCategoryChange(category: string): void {
    this.selectedCategory = category;
    this.applyFilters();
  }

  onSearchChange(event: any): void {
    this.searchTerm = event.target.value;
    this.applyFilters();
  }

  clearSearch(): void {
    this.searchTerm = '';
    this.applyFilters();
  }

  getPaginatedTests(): TestDefinition[] {
    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    return this.filteredTests.slice(startIndex, endIndex);
  }

  getSerialNumber(index: number): number {
    return (this.currentPage - 1) * this.pageSize + index + 1;
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.cdr.detectChanges();
    }
  }

  addNewTest(): void {
    this.router.navigate(['/setup/pathology/test-entry']);
  }

  // Add new test with current selected category preselected and locked
  addNewTestForSelected(): void {
    const category = this.selectedCategory && this.selectedCategory !== 'All' ? this.selectedCategory : '';
    this.router.navigate(['/setup/pathology/test-entry'], {
      queryParams: { preselectCategory: category }
    });
  }

  editTest(test: TestDefinition): void {
    this.router.navigate(['/setup/pathology/test-entry'], {
      queryParams: { id: test._id, mode: 'edit' }
    });
  }

  viewTest(test: TestDefinition): void {
    this.router.navigate(['/setup/pathology/test-detail', test._id]);
  }

  deleteTest(test: TestDefinition): void {
    this.itemToDelete = test;
    this.deleteMessage = `You are about to remove "${test.name}" forever. Once deleted, this cannot be restored.`;
    this.showDeleteConfirmation = true;
  }

  deleteTestDefinition(test: TestDefinition): void {
    console.log('🗑️ Deleting test definition:', test.name);

    this.subscription.add(
      this.pathologyService.deleteTestDefinition(test._id!).subscribe({
        next: (response) => {
          console.log('✅ Test definition deleted successfully:', response);

          // Remove from local array immediately
          this.testDefinitions = this.testDefinitions.filter(t => t._id !== test._id);
          console.log('🔄 Updated local array, remaining tests:', this.testDefinitions.length);

          // Apply filters to update the display
          this.applyFilters();

          // Immediately reload from API to ensure server state is reflected
          this.loadTestDefinitions();

          // Force change detection
          this.cdr.detectChanges();

          // Show success message
          this.showDeleteSuccessMessage(`Test "${test.name}" deleted successfully!`);

          // Notify other components
          this.pathologyService.notifyTestDeleted();
        },
        error: (error) => {
          console.error('❌ Error deleting test definition:', error);
          // If backend blocks delete due to dependencies, show blocked modal
          const msg = error?.error?.message || 'This test cannot be deleted because it is being used.';
          this.deleteBlockedMessage = msg;
          this.showDeleteBlocked = true;
          this.cdr.detectChanges();
          setTimeout(() => this.closeDeleteBlocked(), 2000);
        }
      })
    );
  }

  confirmDelete(): void {
    if (this.itemToDelete) {
      this.deleteTestDefinition(this.itemToDelete);
      this.closeDeleteConfirmation();
    }
  }

  // Delete Success Methods (like category-head-registration)
  showDeleteSuccessMessage(message: string): void {
    this.deleteSuccessMessage = message;
    this.showDeleteSuccess = true;
    this.cdr.detectChanges(); // Force change detection
  }

  onDeleteSuccessClosed(): void {
    this.showDeleteSuccess = false;
    this.deleteSuccessMessage = '';
    // Refresh data after success modal closes (like category-head-registration)
    this.loadTestDefinitions();
    this.cdr.detectChanges(); // Force change detection
  }

  // Delete Confirmation Methods
  closeDeleteConfirmation(): void {
    this.showDeleteConfirmation = false;
    this.itemToDelete = null;
    this.deleteMessage = '';
  }

  cancelDelete(): void {
    this.closeDeleteConfirmation();
  }

  // Delete Blocked Methods
  closeDeleteBlocked(): void {
    this.showDeleteBlocked = false;
    this.deleteBlockedMessage = '';
  }

  showAlertMessage(message: string, type: 'success' | 'error'): void {
    this.alertMessage = message;
    this.alertType = type;
    this.showAlert = true;

    setTimeout(() => {
      this.showAlert = false;
      this.cdr.detectChanges();
    }, 3000);
  }

  getTestTypeDisplay(type: string): string {
    switch (type) {
      case 'single': return 'Single Parameter';
      case 'multiple': return 'Multiple Parameters';
      case 'nested': return 'Nested Parameters';
      case 'document': return 'Document';
      default: return type;
    }
  }

  getParameterCount(test: TestDefinition): number {
    // For single parameter tests, show 1 even though parameters array is empty
    if (test.testType === 'single') {
      return 1;
    }
    // For multiple/nested tests, show actual parameters array length
    return test.parameters ? test.parameters.length : 0;
  }

  getCategoryName(test: TestDefinition): string {
    if (typeof test.category === 'object' && test.category?.name) {
      return test.category.name;
    }
    return typeof test.category === 'string' ? test.category : 'Unknown';
  }

  getShortName(test: TestDefinition): string {
    if (typeof test.shortName === 'object' && test.shortName?.testName) {
      return test.shortName.testName;
    }
    return typeof test.shortName === 'string' ? test.shortName : 'N/A';
  }
}

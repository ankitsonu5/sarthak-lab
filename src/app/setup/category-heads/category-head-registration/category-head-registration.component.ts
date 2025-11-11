import { Component, OnInit, AfterViewInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute, RouterModule, NavigationEnd } from '@angular/router';
import { Subscription, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, filter } from 'rxjs/operators';
import { CategoryHeadService, CategoryHead } from '../services/category-head.service';
import { DeleteConfirmationModalComponent, DeleteSuccessModalComponent } from '../../../shared/components';
import { RecordExistsModalComponent } from '../../../shared/components/record-exists-modal/record-exists-modal.component';
import { SuccessAlertComponent } from '../../../shared/components/success-alert/success-alert.component';
import { DeleteBlockedModalComponent } from '../../../shared/components/delete-blocked-modal/delete-blocked-modal.component';
import { ServiceHeadService } from '../../../services/service-head.service';


@Component({
  selector: 'app-category-head-registration',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    RouterModule,
    DeleteConfirmationModalComponent,
    DeleteSuccessModalComponent,
    RecordExistsModalComponent,
    SuccessAlertComponent,
    DeleteBlockedModalComponent
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './category-head-registration.component.html',
  styleUrls: ['./category-head-registration.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush // PERFORMANCE FIX: OnPush change detection
})
export class CategoryHeadRegistrationComponent implements OnInit, AfterViewInit, OnDestroy {
  categoryHeadForm!: FormGroup;
  isSubmitting = false;
  isEditMode = false;
  editingCategoryHeadId: string | null = null;
  private subscription: Subscription = new Subscription();

  // List functionality
  categoryHeads: CategoryHead[] = [];
  filteredCategoryHeads: CategoryHead[] = [];
  searchTerm = '';

  // PERFORMANCE FIX: Debounced search
  private searchSubject = new Subject<string>();

  // Pagination
  currentPage = 1;
  pageSize = 5; // REDUCED: For easier testing of pagination
  totalPages = 1;
  totalCategoryHeads = 0;
  Math = Math; // For template usage

  // Icon suggestions (Font Awesome classes) commonly used in lab apps
  showIconPicker = false;
  iconOptions: string[] = [
    // Lab Equipment & Testing
    'fa-solid fa-flask-vial',
    'fa-solid fa-vial',
    'fa-solid fa-vials',
    'fa-solid fa-flask',
    'fa-solid fa-microscope',
    'fa-solid fa-syringe',
    'fa-solid fa-droplet',
    'fa-solid fa-droplet-slash',
    'fa-solid fa-prescription-bottle',
    'fa-solid fa-prescription-bottle-medical',
    'fa-solid fa-pills',
    'fa-solid fa-capsules',
    'fa-solid fa-tablets',

    // Medical Imaging & Diagnostics
    'fa-solid fa-x-ray',
    'fa-solid fa-lungs',
    'fa-solid fa-lungs-virus',
    'fa-solid fa-heart-pulse',
    'fa-solid fa-heart',
    'fa-solid fa-heartbeat',
    'fa-solid fa-wave-square',
    'fa-solid fa-waveform',
    'fa-solid fa-circle-radiation',

    // Body Parts & Organs
    'fa-solid fa-brain',
    'fa-solid fa-head-side-brain',
    'fa-solid fa-head-side-virus',
    'fa-solid fa-head-side-cough',
    'fa-solid fa-tooth',
    'fa-solid fa-bone',
    'fa-solid fa-eye',
    'fa-solid fa-eye-dropper',
    'fa-solid fa-ear-listen',
    'fa-solid fa-hand-dots',
    'fa-solid fa-kidneys',
    'fa-solid fa-liver',

    // Medical Tools & Equipment
    'fa-solid fa-stethoscope',
    'fa-solid fa-thermometer',
    'fa-solid fa-magnet',
    'fa-solid fa-bolt',
    'fa-solid fa-radiation',
    'fa-solid fa-biohazard',
    'fa-solid fa-virus',
    'fa-solid fa-viruses',
    'fa-solid fa-bacteria',
    'fa-solid fa-disease',

    // DNA & Genetics
    'fa-solid fa-dna',
    'fa-solid fa-atom',
    'fa-solid fa-circle-nodes',

    // Medical Records & Documentation
    'fa-solid fa-notes-medical',
    'fa-solid fa-file-medical',
    'fa-solid fa-file-prescription',
    'fa-solid fa-file-waveform',
    'fa-solid fa-clipboard-list',
    'fa-solid fa-clipboard-check',
    'fa-solid fa-clipboard-question',
    'fa-solid fa-clipboard-user',

    // Blood & Fluids
    'fa-solid fa-blood-drop',
    'fa-solid fa-droplet-percent',
    'fa-solid fa-water',

    // Hospital & Emergency
    'fa-solid fa-hospital',
    'fa-solid fa-hospital-user',
    'fa-solid fa-truck-medical',
    'fa-solid fa-bed-pulse',
    'fa-solid fa-bed',
    'fa-solid fa-briefcase-medical',
    'fa-solid fa-kit-medical',
    'fa-solid fa-house-medical',
    'fa-solid fa-square-h',
    'fa-solid fa-plus',
    'fa-solid fa-circle-plus',

    // Monitoring & Analysis
    'fa-solid fa-chart-line',
    'fa-solid fa-chart-simple',
    'fa-solid fa-chart-column',
    'fa-solid fa-chart-pie',
    'fa-solid fa-magnifying-glass',
    'fa-solid fa-magnifying-glass-chart',
    'fa-solid fa-magnifying-glass-plus',

    // Miscellaneous Medical
    'fa-solid fa-user-doctor',
    'fa-solid fa-user-nurse',
    'fa-solid fa-wheelchair',
    'fa-solid fa-crutch',
    'fa-solid fa-bandage',
    'fa-solid fa-shield-virus',
    'fa-solid fa-smoking',
    'fa-solid fa-lungs-virus',
    'fa-solid fa-temperature-high',
    'fa-solid fa-temperature-low',
    'fa-solid fa-weight-scale',
    'fa-solid fa-person-dots-from-line',

    // Arrows & Flow (for processes)
    'fa-solid fa-arrow-right-arrow-left',
    'fa-solid fa-arrows-rotate',
    'fa-solid fa-arrow-trend-up',
    'fa-solid fa-arrow-trend-down'
  ];

  // Icon picker search/filter state
  iconSearchTerm: string = '';
  filteredIconOptions: string[] = [];
  iconPickerOpen: boolean = false;

  // Color options (predefined palette for lab categories)
  colorOptions: string[] = [
    '#ef4444', // red-500
    '#f97316', // orange-500
    '#f59e0b', // amber-500
    '#eab308', // yellow-500
    '#84cc16', // lime-500
    '#22c55e', // green-500
    '#10b981', // emerald-500
    '#14b8a6', // teal-500
    '#06b6d4', // cyan-500
    '#0ea5e9', // sky-500
    '#3b82f6', // blue-500
    '#6366f1', // indigo-500
    '#8b5cf6', // violet-500
    '#a855f7', // purple-500
    '#d946ef', // fuchsia-500
    '#ec4899', // pink-500
    '#f43f5e', // rose-500
    '#64748b', // slate-500
    '#6b7280', // gray-500
    '#78716c'  // stone-500
  ];

  // Success Alert Properties
  showSuccessAlert = false;
  successMessage = '';

  // Delete Confirmation Properties
  showDeleteConfirmation = false;
  deleteMessage = '';
  categoryToDelete: CategoryHead | null = null;

  // Delete Success Properties
  showDeleteSuccess = false;
  deleteSuccessMessage = '';

  // Blocked delete modal
  showDeleteBlocked = false;
  deleteBlockedMessage = '';

  // Record exists modal properties
  showRecordExistsModal = false;
  recordExistsMessage = '';

  constructor(
    private fb: FormBuilder,
    private categoryHeadService: CategoryHeadService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private serviceHeadService: ServiceHeadService
  ) {
    this.createCategoryHeadForm();
  }

  ngOnInit(): void {
    // PERFORMANCE FIX: Reduced console logging for better performance
    // console.log('📂 Category Head Registration Component Initializing...');

    // PERFORMANCE FIX: Setup debounced search to prevent excessive API calls
    this.subscription.add(
      this.searchSubject.pipe(
        debounceTime(300), // Wait 300ms after user stops typing
        distinctUntilChanged() // Only search if the term actually changed
      ).subscribe(searchTerm => {
        this.searchTerm = searchTerm;
        this.applySearchAndPagination();
      })
    );

    // Init icon picker filtered list
    this.filteredIconOptions = [...this.iconOptions];

    // Show empty arrays immediately so UI renders fast
    this.categoryHeads = [];
    this.filteredCategoryHeads = [];

    this.checkEditMode();

    // Auto-refresh: when navigating back to this route from other screens (e.g., service-head),
    // refresh the list so the table is always current without manual action
    this.subscription.add(
      this.router.events.pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd)
      ).subscribe((e: NavigationEnd) => {
        if (e.urlAfterRedirects.includes('/setup/category-heads/category-head-registration')) {
          this.loadCategoryHeads();
        }
      })
    );
  }

  ngAfterViewInit(): void {
    console.log('📂 Category Head View Initialized - Loading data...');
    // Load data after view is initialized for better performance
    setTimeout(() => {
      // Clear cached service-heads to avoid stale dependency checks
      try { this.serviceHeadService.clearCache(); } catch {}
      this.loadCategoryHeads();
    }, 0);
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  createCategoryHeadForm(): FormGroup {
    this.categoryHeadForm = this.fb.group({
      categoryName: ['', [Validators.required, Validators.minLength(2)]],
      icon: [''] // Font Awesome class, e.g., 'fa-solid fa-flask-vial'
    });

    return this.categoryHeadForm;
  }

  checkEditMode(): void {
    this.subscription.add(
      this.route.queryParams.subscribe(params => {
        if (params['edit'] && params['id']) {
          this.isEditMode = true;
          this.editingCategoryHeadId = params['id'];
          this.loadCategoryHeadForEdit(params['id']);
        }
      })
    );
  }

  loadCategoryHeadForEdit(id: string): void {
    this.subscription.add(
      this.categoryHeadService.getCategoryHeadById(id).subscribe({
        next: (categoryHead) => {
          this.categoryHeadForm.patchValue({
            categoryName: categoryHead.categoryName,
            icon: (categoryHead as any).icon || '',
            isActive: categoryHead.isActive
          });
        },
        error: (error) => {
          console.error('Error loading category head for edit:', error);
          alert('Error loading category head data');
        }
      })
    );
  }

  onSubmit(): void {
    console.log('Form submission started');
    console.log('Form valid:', this.categoryHeadForm.valid);
    console.log('Form values:', this.categoryHeadForm.getRawValue());

    if (!this.categoryHeadForm.valid) {
      console.log('Form is invalid');
      this.markFormGroupTouched();
      alert('Please fill all required fields correctly');
      return;
    }

    this.isSubmitting = true;
    const formValues = this.categoryHeadForm.getRawValue();
    const categoryNameUpper = formValues.categoryName.toUpperCase();

    // Check if category already exists in the list (for both add and edit mode)
    const existsInList = this.categoryHeads.some(category => {
      // For edit mode, exclude the current category being edited
      if (this.isEditMode && this.editingCategoryHeadId && category._id === this.editingCategoryHeadId) {
        return false;
      }
      return category.categoryName.toUpperCase() === categoryNameUpper;
    });

    if (existsInList) {
      this.isSubmitting = false;
      this.showRecordExists(categoryNameUpper);
      return;
    }

    // Prepare submission data
    const submissionData = {
      categoryName: categoryNameUpper,
      category: 'PATHOLOGY', // Default to PATHOLOGY
      icon: (formValues.icon || '').trim() || undefined,
      isActive: formValues.isActive || true
    };

    console.log('Submission data:', submissionData);

    if (this.isEditMode && this.editingCategoryHeadId) {
      // Update existing category head
      this.subscription.add(
        this.categoryHeadService.updateCategoryHead(this.editingCategoryHeadId, submissionData).subscribe({
          next: (response) => {
            this.isSubmitting = false;
            console.log('Category head updated successfully:', response);
            this.showSuccessMessage(`Category "${response.categoryHead?.categoryName}" updated successfully!`);
            this.resetForm();
            // Immediately refresh the list on update as well
            this.loadCategoryHeads();
          },
          error: (error) => {
            this.isSubmitting = false;
            console.error('Error updating category head:', error);
            const errorMessage = error.error?.message || error.message;

            // Check if it's a duplicate category error
            if (errorMessage.toLowerCase().includes('already exists') ||
                errorMessage.toLowerCase().includes('duplicate')) {
              const categoryName = this.categoryHeadForm.get('categoryName')?.value || 'this category';
              this.showRecordExists(categoryName);
            } else {
              // Show simple error alert for other errors
              alert('Error updating category head: ' + errorMessage);
            }
          }
        })
      );
    } else {
      // Create new category head
      this.subscription.add(
        this.categoryHeadService.createCategoryHead(submissionData).subscribe({
          next: (response) => {
            this.isSubmitting = false;
            console.log('Category head created successfully:', response);
            this.showSuccessMessage(`Category "${response.categoryHead?.categoryName}" registered successfully!`);
            this.resetForm();
            // Immediately refresh the list so the new item appears without manual action
            this.loadCategoryHeads();
          },
          error: (error) => {
            this.isSubmitting = false;
            console.error('Error creating category head:', error);
            const errorMessage = error.error?.message || error.message;

            // Check if it's a duplicate category error
            if (errorMessage.toLowerCase().includes('already exists') ||
                errorMessage.toLowerCase().includes('duplicate')) {
              const categoryName = this.categoryHeadForm.get('categoryName')?.value || 'this category';
              this.showRecordExists(categoryName);
            } else {
              // Show simple error alert for other errors
              alert('Error creating category head: ' + errorMessage);
            }
          }
        })
      );
    }
  }

  resetForm(): void {
    this.categoryHeadForm.reset();
    this.isEditMode = false;
    this.editingCategoryHeadId = null;
  }

  cancelEdit(): void {
    this.resetForm();
  }

  private markFormGroupTouched(): void {
    Object.keys(this.categoryHeadForm.controls).forEach(key => {
      const control = this.categoryHeadForm.get(key);
      if (control) {
        control.markAsTouched();
      }
    });
  }

  // Helper methods for form validation
  isFieldInvalid(fieldName: string): boolean {
    const field = this.categoryHeadForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  getFieldError(fieldName: string): string {
    const field = this.categoryHeadForm.get(fieldName);
    if (field?.errors) {
      if (field.errors['required']) return `${fieldName} is required`;
      if (field.errors['minlength']) return `${fieldName} must be at least ${field.errors['minlength'].requiredLength} characters`;
    }
    return '';
  }

  // Capitalize first letter of each word
  onCategoryNameBlur(): void {
    const categoryNameControl = this.categoryHeadForm.get('categoryName');
    if (categoryNameControl && categoryNameControl.value) {
      const uppercaseValue = categoryNameControl.value.toUpperCase();
      categoryNameControl.setValue(uppercaseValue);
    }
  }

  // List management methods
  loadCategoryHeads(): void {
    console.log('📊 Loading category heads...');

    // Force refresh from API first
    this.subscription.add(
      this.categoryHeadService.getCategoryHeads(100, true).subscribe({
        next: (categoryHeads) => {
          console.log('✅ Category heads loaded successfully:', categoryHeads.length);

          // Update local data
          this.categoryHeads = categoryHeads;
          this.applySearchAndPagination(); // Apply search and pagination

          // Force Angular change detection
          this.cdr.detectChanges();
          console.log('✅ CATEGORY HEADS: Change detection triggered!');
        },
        error: (error) => {
          console.error('Error loading category heads:', error);
          this.categoryHeads = [];
          this.filteredCategoryHeads = [];
          this.totalCategoryHeads = 0;
        }
      })
    );
  }

  onSearch(): void {
    this.currentPage = 1; // Reset to first page on search
    this.applySearchAndPagination();
  }

  // FIXED: Separate method for applying search and pagination without resetting page
  applySearchAndPagination(): void {
    let filtered: CategoryHead[];
    if (!this.searchTerm.trim()) {
      filtered = [...this.categoryHeads];
    } else {
      filtered = this.categoryHeads.filter(categoryHead =>
        categoryHead.categoryName.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        (categoryHead.categoryId && categoryHead.categoryId.toLowerCase().includes(this.searchTerm.toLowerCase()))
      );
    }

    // Update pagination info
    this.totalCategoryHeads = filtered.length;
    this.totalPages = Math.ceil(this.totalCategoryHeads / this.pageSize);

    // Apply pagination
    this.updatePaginatedResults(filtered);
  }

  updatePaginatedResults(allResults: CategoryHead[]): void {
    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    this.filteredCategoryHeads = allResults.slice(startIndex, endIndex);
  }

  // FIXED: Pagination methods
  goToPage(page: number | string): void {
    if (typeof page === 'string' || page < 1 || page > this.totalPages) {
      return;
    }
    this.currentPage = page;
    this.applySearchAndPagination(); // Apply search with current page (no reset)
  }

  getPageNumbers(): (number | string)[] {
    const pages: (number | string)[] = [];
    const maxVisiblePages = 5;

    if (this.totalPages <= maxVisiblePages) {
      // Show all pages if total pages is small
      for (let i = 1; i <= this.totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Show first page
      pages.push(1);

      // Calculate start and end of middle pages
      let start = Math.max(2, this.currentPage - 1);
      let end = Math.min(this.totalPages - 1, this.currentPage + 1);

      // Add ellipsis if needed
      if (start > 2) {
        pages.push('...');
      }

      // Add middle pages
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      // Add ellipsis if needed
      if (end < this.totalPages - 1) {
        pages.push('...');
      }

      // Show last page
      if (this.totalPages > 1) {
        pages.push(this.totalPages);
      }
    }

    return pages;
  }

  editCategoryHead(categoryHead: CategoryHead): void {
    this.isEditMode = true;
    this.editingCategoryHeadId = categoryHead._id!;
    this.categoryHeadForm.patchValue({
      categoryName: categoryHead.categoryName,
      icon: (categoryHead as any).icon || ''
    });
  }

  deleteCategoryHead(categoryHead: CategoryHead): void {
    this.subscription.add(
      this.categoryHeadService.deleteCategoryHead(categoryHead._id!).subscribe({
        next: (response) => {
          console.log('Category head deleted successfully:', response);
          // Remove from local array (like doctor-list)
          this.categoryHeads = this.categoryHeads.filter(c => c._id !== categoryHead._id);
          this.showDeleteSuccessMessage(`Category "${categoryHead.categoryName}" deleted successfully!`);
        },
        error: (error) => {
          console.error('Error deleting category head:', error);
          // If backend blocks delete due to dependencies, show blocked modal
          const msg = error?.error?.message || 'This category cannot be deleted because services are linked.';
          this.deleteBlockedMessage = msg;
          this.showDeleteBlocked = true;
          this.cdr.detectChanges();
          setTimeout(() => this.closeDeleteBlocked(), 2000);
        }
      })
    );
  }

  // Utility methods
  formatDate(date: Date | string | undefined): string {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-IN');
  }

  // Navigation methods for tab buttons
  navigateToPathologySearch(): void {
    this.router.navigate(['/setup/pathology']);
  }

  navigateToServiceHead(): void {
    this.router.navigate(['/setup/category-heads/service-head']);
  }

  navigateToSearchService(): void {
    this.router.navigate(['/setup/category-heads/search-service']);
  }

  // Force refresh data
  refreshData(): void {
    this.searchTerm = '';
    this.currentPage = 1;

    // Clear the current data first
    this.categoryHeads = [];
    this.filteredCategoryHeads = [];
    this.totalCategoryHeads = 0;

    // Force reload from API
    this.loadCategoryHeads();
  }

  // PERFORMANCE FIX: TrackBy function for better ngFor performance
  trackByCategoryHeadId(index: number, categoryHead: CategoryHead): string {
    return categoryHead._id || index.toString();
  }

  // PERFORMANCE FIX: Debounced search method
  onSearchTermChange(value: string): void {
    this.searchSubject.next(value);
  }

  // Icon preview helper
  getIconPreviewClass(): string {
    const val = this.categoryHeadForm?.get('icon')?.value || '';
    return val && val.trim().length > 0 ? val.trim() : 'fa-solid fa-clipboard-list';
  }

  // Success Alert Methods
  showSuccessMessage(message: string): void {
    this.successMessage = message;
    this.showSuccessAlert = true;
    this.cdr.detectChanges(); // Force change detection
    // Alert will auto-hide after 2 seconds via success-alert component
  }


  // Icon picker search handler
  onIconSearchChange(term: string): void {
    this.iconSearchTerm = (term || '').toLowerCase();
    const q = this.iconSearchTerm.trim();
    if (!q) {
      this.filteredIconOptions = [...this.iconOptions];
    } else {
      this.filteredIconOptions = this.iconOptions.filter(opt => opt.toLowerCase().includes(q));
    }
    this.cdr.detectChanges();
  }


  // Icon picker controls
  toggleIconPicker(event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.iconPickerOpen = !this.iconPickerOpen;
    this.cdr.detectChanges();
  }

  pickIcon(iconClass: string): void {
    this.categoryHeadForm?.get('icon')?.setValue(iconClass);
    this.iconPickerOpen = false; // Close dropdown after selection
    this.cdr.detectChanges();
  }

  // Color picker control
  pickColor(colorHex: string): void {
    this.categoryHeadForm?.get('color')?.setValue(colorHex);
    this.cdr.detectChanges();
  }

  closeSuccessAlert(): void {
    this.showSuccessAlert = false;
    this.successMessage = '';
    this.cdr.detectChanges(); // Force change detection
  }

  // Delete Confirmation Methods
  showDeleteConfirmationDialog(categoryHead: CategoryHead): void {
    // Pre-check: if services exist for this category in serviceheads collection, block delete
    const categoryId = categoryHead._id!;
    this.subscription.add(
      this.serviceHeadService.getServiceHeadsByCategoryId(categoryId, undefined, true).subscribe(services => {
        if (services && services.length > 0) {
          const count = services.length;
          this.deleteBlockedMessage = `This category cannot be deleted because it has ${count} service linked.`;
          this.showDeleteBlocked = true;
          this.cdr.detectChanges();
          setTimeout(() => this.closeDeleteBlocked(), 2000);
        } else {
          // No services found, proceed with confirmation
          this.categoryToDelete = categoryHead;
          this.deleteMessage = `You are about to remove the category "${categoryHead.categoryName}" forever. Once deleted, this cannot be restored.`;
          this.showDeleteConfirmation = true;
          this.cdr.detectChanges();
        }
      })
    );
  }

  closeDeleteConfirmation(): void {
    this.showDeleteConfirmation = false;
    this.categoryToDelete = null;
    this.deleteMessage = '';
  }

  confirmDelete(): void {
    if (this.categoryToDelete) {
      this.deleteCategoryHead(this.categoryToDelete);
      this.closeDeleteConfirmation();
    }
  }

  // Delete Blocked modal close
  closeDeleteBlocked(): void {
    this.showDeleteBlocked = false;
    this.deleteBlockedMessage = '';
    this.cdr.detectChanges();
  }

  // Delete Success Methods
  showDeleteSuccessMessage(message: string): void {
    this.deleteSuccessMessage = message;
    this.showDeleteSuccess = true;
    this.cdr.detectChanges(); // Force change detection
  }

  onDeleteSuccessClosed(): void {
    this.showDeleteSuccess = false;
    this.deleteSuccessMessage = '';
    // Refresh data after success modal closes (like doctor-list)
    this.loadCategoryHeads();
    this.cdr.detectChanges(); // Force change detection
  }

  // Record exists modal methods
  onRecordExistsModalClosed(): void {
    this.showRecordExistsModal = false;
    this.recordExistsMessage = '';
    this.cdr.detectChanges(); // Force change detection
  }

  // Method to show record exists modal (call this when duplicate is found)
  showRecordExists(categoryName: string): void {
    this.recordExistsMessage = `A category with the name "${categoryName}" already exists in the system.`;
    this.showRecordExistsModal = true;
    this.cdr.detectChanges(); // Force change detection
  }


}

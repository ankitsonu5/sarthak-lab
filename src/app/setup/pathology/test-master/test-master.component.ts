import { Component, OnInit, OnDestroy, AfterViewInit, ChangeDetectorRef, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { PathologyService, TestCategory } from '../services/pathology.service';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { DeleteConfirmationModalComponent, DeleteSuccessModalComponent, DeleteBlockedModalComponent, RecordExistsModalComponent, SuccessAlertComponent } from '../../../shared/components';

@Component({
  selector: 'app-test-master',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, DeleteConfirmationModalComponent, DeleteSuccessModalComponent, DeleteBlockedModalComponent, SuccessAlertComponent, RecordExistsModalComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './test-master.html',
  styleUrls: ['./test-master.component.css']
})
export class TestMasterComponent implements OnInit, OnDestroy, AfterViewInit {
  testCategoryForm: FormGroup;
  testCategories: TestCategory[] = [];
  filteredCategories: TestCategory[] = [];
  private subscription: Subscription = new Subscription();
  
  // Form states
  isEditMode = false;
  editingCategoryId: string | null = null;
  
  // Search and pagination
  searchTerm = '';
  currentPage = 1;
  pageSize = 5; // Match category-head-registration
  totalPages = 1;
  totalCategories = 0;
  
  // Alert properties
  showAlert = false;
  alertMessage = '';
  alertType: 'success' | 'error' = 'success';

  // Success Alert Modal Properties
  showSuccessAlert = false;
  successMessage = '';

  // Record Exists Modal Properties
  showRecordExistsModal = false;
  recordExistsMessage = '';

  // Delete Modal Properties
  showDeleteConfirmation = false;
  showDeleteSuccess = false;
  showDeleteBlocked = false;
  deleteMessage = '';
  deleteSuccessMessage = '';
  deleteBlockedMessage = '';
  categoryToDelete: TestCategory | null = null;

  // Math object for template
  Math = Math;

  constructor(
    private fb: FormBuilder,
    private pathologyService: PathologyService,
    private cdr: ChangeDetectorRef,
    private router: Router
  ) {
    this.testCategoryForm = this.createForm();
  }

  ngOnInit(): void {
    // Live subscription: any create/update/delete from anywhere will reflect automatically
    this.subscription.add(
      this.pathologyService.testCategories$.subscribe((cats) => {
        if (cats && cats.length >= 0) {
          this.testCategories = [...cats].sort((a, b) => {
            const dateA = new Date(a.createdAt || 0).getTime();
            const dateB = new Date(b.createdAt || 0).getTime();
            return dateB - dateA;
          });
          this.applySearchAndPagination();
          this.cdr.detectChanges();
        }
      })
    );

    // Initial fresh fetch (bypass any HTTP cache)
    this.loadTestCategories(true);
    this.focusOnCategoryName();
  }

  ngAfterViewInit(): void {
    // Ensure data is always current when view is initialized
    // This helps when navigating back to this component
    setTimeout(() => {
      this.loadTestCategories(true);
    }, 100);
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  createForm(): FormGroup {
    return this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]]
    });
  }

  focusOnCategoryName(): void {
    setTimeout(() => {
      const categoryNameInput = document.getElementById('categoryName') as HTMLInputElement;
      if (categoryNameInput) {
        categoryNameInput.focus();
      }
    }, 100);
  }

  loadTestCategories(nocache: boolean = false): void {
    this.subscription.add(
      this.pathologyService.getTestCategories(nocache).subscribe({
        next: (categories) => {
          // Sort categories in descending order (newest first)
          this.testCategories = categories.sort((a, b) => {
            const dateA = new Date(a.createdAt || 0).getTime();
            const dateB = new Date(b.createdAt || 0).getTime();
            return dateB - dateA; // Descending order
          });
          this.applySearchAndPagination();
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('Error loading test categories:', error);
          this.showAlertMessage('Error loading test categories', 'error');
        }
      })
    );
  }

  onSubmit(): void {
    console.log('=== FORM SUBMIT ===');
    console.log('Form valid:', this.testCategoryForm.valid);
    console.log('Form value:', this.testCategoryForm.value);
    console.log('Is edit mode:', this.isEditMode);

    if (this.testCategoryForm.valid) {
      const formValues = this.testCategoryForm.getRawValue();
      const categoryNameUpper = formValues.name.toUpperCase();

      // Check if category already exists in the list (for both add and edit mode)
      const existsInList = this.testCategories.some(category => {
        // For edit mode, exclude the current category being edited
        if (this.isEditMode && this.editingCategoryId && category._id === this.editingCategoryId) {
          return false;
        }
        return category.name.toUpperCase() === categoryNameUpper;
      });

      if (existsInList) {
        this.showRecordExists(categoryNameUpper);
        return;
      }

      // Prepare submission data
      const formData: TestCategory = {
        name: categoryNameUpper
      };

      console.log('Processed form data:', formData);

      if (this.isEditMode && this.editingCategoryId) {
        console.log('Calling updateCategory...');
        this.updateCategory(formData);
      } else {
        console.log('Calling createCategory...');
        this.createCategory(formData);
      }
    } else {
      console.log('Form invalid, marking touched');
      this.markFormGroupTouched();
    }
  }

  createCategory(categoryData: TestCategory): void {
    this.subscription.add(
      this.pathologyService.createTestCategory(categoryData).subscribe({
        next: (response: any) => {
          // Show success alert modal
          this.successMessage = `Test category "${categoryData.name}" has been successfully created.`;
          this.showSuccessAlert = true;

          // Immediately add the new category to the beginning of the array (newest first)
          if (response && response.category) {
            this.testCategories.unshift(response.category);
            this.applySearchAndPagination();
            this.cdr.detectChanges();
          }

          this.resetForm();
        },
        error: (error) => {
          console.error('Error creating test category:', error);
          const errorMessage = error.error?.message || error.message;

          // Check if it's a duplicate category error
          if (errorMessage.toLowerCase().includes('already exists') ||
              errorMessage.toLowerCase().includes('duplicate')) {
            const categoryName = categoryData.name;
            this.showRecordExists(categoryName);
          } else {
            // Show simple error alert for other errors
            this.showAlertMessage('Error creating test category: ' + errorMessage, 'error');
          }
        }
      })
    );
  }

  updateCategory(categoryData: TestCategory): void {
    if (this.editingCategoryId) {
      this.subscription.add(
        this.pathologyService.updateTestCategory(this.editingCategoryId, categoryData).subscribe({
          next: (response: any) => {
            // Show success alert modal
            this.successMessage = `Test category "${categoryData.name}" has been successfully updated.`;
            this.showSuccessAlert = true;

            // Immediately update the category in the array
            if (response && response.category) {
              const index = this.testCategories.findIndex(cat => cat._id === this.editingCategoryId);
              if (index !== -1) {
                this.testCategories[index] = response.category;
                this.applySearchAndPagination();
                this.cdr.detectChanges();
              }
            }

            this.resetForm();
          },
          error: (error) => {
            console.error('Error updating test category:', error);
            const errorMessage = error.error?.message || error.message;

            // Check if it's a duplicate category error
            if (errorMessage.toLowerCase().includes('already exists') ||
                errorMessage.toLowerCase().includes('duplicate')) {
              const categoryName = categoryData.name;
              this.showRecordExists(categoryName);
            } else {
              // Show simple error alert for other errors
              this.showAlertMessage('Error updating test category: ' + errorMessage, 'error');
            }
          }
        })
      );
    }
  }

  editCategory(category: TestCategory): void {
    this.isEditMode = true;
    this.editingCategoryId = category._id || null;
    
    this.testCategoryForm.patchValue({
      name: category.name
    });
    
    this.focusOnCategoryName();
  }

  // Pre-check dependencies (test definitions). If none, show confirmation; otherwise show blocked modal.
  showDeleteConfirmationDialog(category: TestCategory): void {
    // Save selection
    this.categoryToDelete = category;

    const categoryId = category._id!;

    // Check if this category is being used by test definitions
    this.subscription.add(
      this.pathologyService.checkTestCategoryUsage(categoryId).subscribe({
        next: (usage) => {
          if (!usage.hasTests) {
            // Safe to delete – show standard confirmation
            this.deleteMessage = `You are about to remove the test category "${category.name}" forever. Once deleted, this cannot be restored.`;
            this.showDeleteConfirmation = true;
            this.cdr.detectChanges();
          } else {
            // Block deletion – show friendly alert for 3 seconds
            const testCount = usage.testCount;
            this.deleteBlockedMessage = `This test category cannot be deleted because it has ${testCount} test definition${testCount > 1 ? 's' : ''} linked.`;
            this.showDeleteBlocked = true;
            this.cdr.detectChanges();
            setTimeout(() => this.closeDeleteBlocked(), 3000);
          }
        },
        error: (err) => {
          console.error('Dependency check failed:', err);
          // Fallback to safe behavior – do not delete automatically
          this.deleteBlockedMessage = 'Unable to verify dependencies. Please try again later.';
          this.showDeleteBlocked = true;
          this.cdr.detectChanges();
          setTimeout(() => this.closeDeleteBlocked(), 3000);
        }
      })
    );
  }

  resetForm(): void {
    this.testCategoryForm.reset({
      name: ''
    });
    this.isEditMode = false;
    this.editingCategoryId = null;
    this.focusOnCategoryName();
  }

  onSearch(): void {
    this.currentPage = 1; // Reset to first page on search
    this.applySearchAndPagination();
  }

  // Apply search and pagination without resetting page (like category-head-registration)
  applySearchAndPagination(): void {
    let filtered: TestCategory[];
    if (!this.searchTerm.trim()) {
      filtered = [...this.testCategories];
    } else {
      filtered = this.testCategories.filter(category =>
        category.name.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        (category.categoryId && category.categoryId.toLowerCase().includes(this.searchTerm.toLowerCase()))
      );
    }

    // Update pagination info
    this.totalCategories = filtered.length;
    this.totalPages = Math.ceil(this.totalCategories / this.pageSize);

    // Apply pagination
    this.updatePaginatedResults(filtered);
  }

  updatePaginatedResults(allResults: TestCategory[]): void {
    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    this.filteredCategories = allResults.slice(startIndex, endIndex);
  }

  // Pagination methods (like category-head-registration)
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
      // Show all pages if total pages is less than or equal to max visible
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

  // Legacy method for backward compatibility
  getPaginatedCategories(): TestCategory[] {
    return this.filteredCategories;
  }

  // Legacy method for backward compatibility
  onPageChange(page: number): void {
    this.goToPage(page);
  }

  // Force refresh data (like category-head-registration)
  refreshData(): void {
    this.searchTerm = '';
    this.currentPage = 1;

    // Clear the current data first
    this.testCategories = [];
    this.filteredCategories = [];
    this.totalCategories = 0;

    // Force reload from API (bypass cache)
    this.loadTestCategories(true);
  }

  // Auto-uppercase on blur
  onCategoryNameBlur(event: any): void {
    const value = event.target.value;
    if (value) {
      this.testCategoryForm.patchValue({
        name: value.toUpperCase()
      });
    }
  }

  // Navigation methods
  navigateToTestParameters(): void {
    // Will be implemented when routing is set up
    console.log('Navigate to Test Parameters');
  }

  navigateToReferenceRanges(): void {
    // Will be implemented when routing is set up
    console.log('Navigate to Reference Ranges');
  }

  navigateToReportTemplates(): void {
    // Will be implemented when routing is set up
    console.log('Navigate to Report Templates');
  }

  markFormGroupTouched(): void {
    Object.keys(this.testCategoryForm.controls).forEach(key => {
      this.testCategoryForm.get(key)?.markAsTouched();
    });
  }

  showAlertMessage(message: string, type: 'success' | 'error'): void {
    this.alertMessage = message;
    this.alertType = type;
    this.showAlert = true;

    // Auto-hide alert after 3 seconds
    setTimeout(() => {
      this.showAlert = false;
      this.cdr.detectChanges();
    }, 3000);
  }

  closeAlert(): void {
    this.showAlert = false;
  }

  // Utility methods
  isFieldInvalid(fieldName: string): boolean {
    const field = this.testCategoryForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  getFieldError(fieldName: string): string {
    const field = this.testCategoryForm.get(fieldName);
    if (field && field.errors) {
      if (field.errors['required']) {
        return `${fieldName} is required`;
      }
      if (field.errors['minlength']) {
        return `${fieldName} must be at least ${field.errors['minlength'].requiredLength} characters`;
      }
    }
    return '';
  }

  viewTests(category: TestCategory): void {
    // Navigate to test database with category filter
    this.router.navigate(['/setup/pathology/test-database'], {
      queryParams: { category: category.name }
    });
  }

  // Delete Confirmation Methods
  closeDeleteConfirmation(): void {
    this.showDeleteConfirmation = false;
    this.categoryToDelete = null;
    this.deleteMessage = '';
  }

  confirmDelete(): void {
    if (this.categoryToDelete) {
      this.deleteTestCategory(this.categoryToDelete);
      this.closeDeleteConfirmation();
    }
  }

  deleteTestCategory(category: TestCategory): void {
    this.subscription.add(
      this.pathologyService.deleteTestCategory(category._id!).subscribe({
        next: (response) => {
          console.log('Test category deleted successfully:', response);
          // Remove from local array (like category-head-registration)
          this.testCategories = this.testCategories.filter(c => c._id !== category._id);
          this.showDeleteSuccessMessage(`Test category "${category.name}" deleted successfully!`);
        },
        error: (error) => {
          console.error('Error deleting test category:', error);
          console.error('Delete error details:', {
            status: error.status,
            error: error.error,
            message: error.error?.message,
            fullError: error
          });

          // If backend sends dependency information, show friendly modal
          const msg: string = error?.error?.message || error.message || 'Failed to delete test category.';
          if (/test|definition|dependent|assigned|linked|cannot.*delete/i.test(msg)) {
            // Show simple info-only blocked modal and auto-hide in 3s
            this.deleteBlockedMessage = msg;
            this.showDeleteBlocked = true;
            this.cdr.detectChanges();
            setTimeout(() => this.closeDeleteBlocked(), 3000);
          } else {
            this.showAlertMessage('Failed to delete test category. Please try again.', 'error');
          }
        }
      })
    );
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
    // Refresh data after success modal closes (bypass cache)
    this.loadTestCategories(true);
    this.cdr.detectChanges(); // Force change detection
  }

  // Delete Blocked Methods
  closeDeleteBlocked(): void {
    this.showDeleteBlocked = false;
    this.deleteBlockedMessage = '';
  }

  // Success Alert Methods
  closeSuccessAlert(): void {
    this.showSuccessAlert = false;
    this.successMessage = '';
  }

  // Record Exists Modal Methods
  onRecordExistsModalClosed(): void {
    this.showRecordExistsModal = false;
    this.recordExistsMessage = '';
    this.cdr.detectChanges(); // Force change detection
  }

  // Method to show record exists modal (call this when duplicate is found)
  showRecordExists(categoryName: string): void {
    this.recordExistsMessage = `A test category with the name "${categoryName}" already exists in the system.`;
    this.showRecordExistsModal = true;
    this.cdr.detectChanges(); // Force change detection
  }



}

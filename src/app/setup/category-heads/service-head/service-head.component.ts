import { Component, OnInit, AfterViewInit, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { CategoryHeadService, CategoryHead } from '../services/category-head.service';
import { DeleteConfirmationModalComponent } from '../../../shared/components/delete-confirmation-modal/delete-confirmation-modal.component';
import { DeleteSuccessModalComponent } from '../../../shared/components/delete-success-modal/delete-success-modal.component';
import { RecordExistsModalComponent } from '../../../shared/components/record-exists-modal/record-exists-modal.component';
import { SuccessAlertComponent } from '../../../shared/components/success-alert/success-alert.component';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AlertService } from '../../../shared/services/alert.service';

import { environment } from '../../../../environments/environment';

export interface ServiceHead {
  _id?: string;
  category: CategoryHead | string;
  testName: string;
  price: string;
  createdAt?: Date;
  updatedAt?: Date;
}

@Component({
  selector: 'app-service-head',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatSnackBarModule,
    DeleteConfirmationModalComponent,
    DeleteSuccessModalComponent,
    RecordExistsModalComponent,
    SuccessAlertComponent
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './service-head.component.html',
  styleUrls: ['./service-head.component.css']
})
export class ServiceHeadComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('serviceNameInput') serviceNameInput!: ElementRef;

  serviceForm!: FormGroup;
  private subscription: Subscription = new Subscription();

  // Temporary list for adding services before saving
  tempServiceList: ServiceHead[] = [];

  // All services by category (from database)
  allServicesByCategory: ServiceHead[] = [];

  // Selected category for viewing services
  selectedViewCategory = '';

  // Categories from database
  categoryOptions: CategoryHead[] = [];

  // Edit mode tracking
  isEditMode = false;
  editingServiceId: string | null = null;

  // Success Alert Properties
  showSuccessAlert = false;
  successMessage = '';

  // Delete modal properties
  showDeleteConfirmation = false;
  showDeleteSuccess = false;
  deleteMessage = '';
  serviceToDelete: ServiceHead | null = null;
  isDeleting = false;

  // Record exists modal properties
  showRecordExistsModal = false;
  recordExistsMessage = '';



  constructor(
    private fb: FormBuilder,
    private categoryHeadService: CategoryHeadService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private snackBar: MatSnackBar,
    private alertService: AlertService
  ) {
    this.createServiceForm();
    console.log('🔬 Service Head Constructor - Component Created');
  }

  ngOnInit(): void {
    console.log('🔬 Service Head Component Initializing...');
    console.log('🔬 AlertService instance:', this.alertService);

    // Show empty arrays immediately so UI renders fast
    this.categoryOptions = [];
    this.tempServiceList = [];
    this.allServicesByCategory = [];

    this.checkForEditData();
    this.forceLoadData(); // Force load data immediately
  }

  ngAfterViewInit(): void {
    console.log('🔬 Service Head View Initialized');
    // View initialized successfully

    // Double check data loading after view init
    if (this.categoryOptions.length === 0) {
      console.log('🔄 No categories found, retrying data load...');
      this.forceLoadData();
    }
  }

  // Force data loading method
  private forceLoadData(): void {
    console.log('🚀 FORCE LOADING DATA for Service Head...');
    this.loadCategories();

    // Also try to load data after a short delay if first attempt fails
    setTimeout(() => {
      if (this.categoryOptions.length === 0) {
        console.log('🔄 Retrying data load after delay...');
        this.loadCategories();
      }
    }, 100);
  }

  // Check if there's edit data from search-service component
  checkForEditData(): void {
    const editDataStr = localStorage.getItem('editServiceData');
    if (editDataStr) {
      try {
        const editData = JSON.parse(editDataStr);
        if (editData.isEditMode) {
          // Set edit mode
          this.isEditMode = true;
          this.editingServiceId = editData.serviceId;

          // Wait for categories to load, then populate form
          setTimeout(() => {
            this.populateFormForEdit(editData);
          }, 500);

          // Clear the localStorage data
          localStorage.removeItem('editServiceData');
        }
      } catch (error) {
        console.error('Error parsing edit data:', error);
        localStorage.removeItem('editServiceData');
      }
    }
  }

  // Populate form with edit data
  populateFormForEdit(editData: any): void {
    // Enable category dropdown temporarily to set value
    this.serviceForm.get('category')?.enable();

    const resolvedCat = this.resolveCategoryObjectId(editData.categoryId) || editData.categoryId;

    // Populate form with service data
    this.serviceForm.patchValue({
      category: resolvedCat,
      serviceName: editData.serviceName,
      price: editData.price
    });

    // Ensure dropdown shows selected category and stays disabled
    if (!this.categoryOptions || this.categoryOptions.length === 0) {
      setTimeout(() => this.ensureCategorySelected(String(resolvedCat)), 100);
    } else {
      this.ensureCategorySelected(String(resolvedCat));
    }

    // Update selected view category and load list for that category
    this.selectedViewCategory = String(resolvedCat);
    this.loadServicesByCategory();

    // Focus on service name input
    setTimeout(() => {
      if (this.serviceNameInput) {
        this.serviceNameInput.nativeElement.focus();
        this.serviceNameInput.nativeElement.select();
      }
    }, 100);

    console.log('Form populated for editing:', editData);
  }

  // Watch for category changes to update third row
  onCategoryChange(): void {
    const selectedCategory = this.serviceForm.get('category')?.value;
    console.log('🔄 Category changed to:', selectedCategory);
    if (selectedCategory) {
      this.selectedViewCategory = selectedCategory;
      console.log('🔄 Loading services for category:', selectedCategory);
      this.loadServicesByCategory();
    }
  }

 // Search and filters
  searchTerm = '';
   onSearch(): void {

    this.loadCategories();
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  createServiceForm(): FormGroup {
    this.serviceForm = this.fb.group({
      category: ['', Validators.required],
      serviceName: ['', [Validators.required, Validators.minLength(2)]],
      price: ['', [Validators.required, Validators.min(1)]]
    });

    return this.serviceForm;
  }

  // Load categories from database
  loadCategories(): void {
    console.log('📊 SERVICE HEAD: Loading categories...');
    console.log('📊 SERVICE HEAD: CategoryHeadService:', this.categoryHeadService);

    this.subscription.add(
      this.categoryHeadService.getCategoryHeads(100, true).subscribe({
        next: (categories) => {
          console.log('✅ SERVICE HEAD: Categories loaded successfully:', categories.length);
          console.log('✅ SERVICE HEAD: Categories data:', categories);

          this.categoryOptions = categories;
          if (categories.length > 0) {
            // Preserve current selection if already chosen (edit mode or user-selected)
            const existing = this.serviceForm?.get('category')?.value || this.selectedViewCategory;
            if (existing) {
              this.serviceForm.patchValue({ category: existing });
              this.selectedViewCategory = existing;
            } else {
              // Otherwise set first category as default
              this.serviceForm.patchValue({ category: categories[0]._id });
              this.selectedViewCategory = categories[0]._id!;
            }
            console.log('🔄 SERVICE HEAD: Loading services for category:', this.getCategoryName(this.selectedViewCategory));
            this.loadServicesByCategory();
          } else {
            console.log('⚠️ SERVICE HEAD: No categories found!');
          }

          // Force Angular change detection
          this.cdr.detectChanges();
          console.log('✅ SERVICE HEAD: Change detection triggered!');
        },
        error: (error) => {
          console.error('❌ SERVICE HEAD: Error loading categories:', error);
          console.error('❌ SERVICE HEAD: Error details:', error.message, error.status);
          this.categoryOptions = [];
          this.cdr.detectChanges();
        }
      })
    );
  }

  // Add or Update service
  addService(): void {
    if (!this.serviceForm.valid) {
      this.markFormGroupTouched();
      alert('Please fill all required fields correctly');
      return;
    }



    const formValues = this.serviceForm.getRawValue();

    // Use service name as entered by user (no automatic capitalization)
    const serviceName = formValues.serviceName.trim();

    console.log('🔍 Processing service:', {
      serviceName,
      category: formValues.category,
      isEditMode: this.isEditMode,
      editingServiceId: this.editingServiceId
    });

    if (this.isEditMode && this.editingServiceId) {
      // Check if service name already exists in same category (excluding current service)
      const existsInDatabase = this.allServicesByCategory.some(service => {
        const serviceCategory = typeof service.category === 'string' ? service.category : service.category._id;
        return serviceCategory === formValues.category &&
          service.testName.toLowerCase() === serviceName.toLowerCase() &&
          service._id !== this.editingServiceId; // Exclude current service being edited
      });

      if (existsInDatabase) {
        console.log('🚨 Duplicate found in UPDATE mode for serviceName:', serviceName);
        this.showRecordExists(serviceName);
        return;
      }

      // Update existing service in database
      const updateData = {
        testName: serviceName,
        price: parseFloat(formValues.price).toFixed(2)
      };

      console.log('Attempting to update service:', this.editingServiceId, updateData);

      this.updateServiceInDB(this.editingServiceId, updateData)
        .then((response) => {
          console.log('Update successful:', response);
          this.showSuccessMessage('Service updated successfully!');
          const keepCategory = this.serviceForm.get('category')?.value || this.selectedViewCategory;
          this.resetEditMode();
          if (keepCategory) {
            this.serviceForm.get('category')?.setValue(keepCategory, { emitEvent: false });
            this.selectedViewCategory = keepCategory;
          }
          this.loadServicesByCategory(); // Refresh the list
        })
        .catch((error: any) => {
          console.error('Error updating service:', error);
          let errorMessage = 'Error updating service';

          if (error.message) {
            errorMessage += ': ' + error.message;
          } else if (error.error?.message) {
            errorMessage += ': ' + error.error.message;
          } else if (typeof error === 'string') {
            errorMessage += ': ' + error;
          }

          // Check if it's a duplicate service error
          if (errorMessage.toLowerCase().includes('already exists') ||
              errorMessage.toLowerCase().includes('duplicate')) {
            const serviceName = this.serviceForm.get('serviceName')?.value || 'this service';
            this.showRecordExists(serviceName);
          } else {
            // Show simple error alert for other errors
            alert(errorMessage);
          }
        });
      return;
    }

    // Check if service already exists in temp list (for add mode)
    console.log('🔍 Checking temp list for duplicates:', {
      tempServiceList: this.tempServiceList,
      totalTempServices: this.tempServiceList.length,
      selectedCategory: formValues.category,
      searchingFor: serviceName.toLowerCase()
    });

    const existsInTempList = this.tempServiceList.some(service => {
      const tempServiceCategory = typeof service.category === 'string' ? service.category : service.category._id;
      const matches = tempServiceCategory === formValues.category &&
        service.testName.toLowerCase() === serviceName.toLowerCase();

      if (matches) {
        console.log('🎯 Found matching service in temp list:', {
          existingService: service,
          tempServiceCategory,
          testName: service.testName
        });
      }

      return matches;
    });

    if (existsInTempList) {
      console.log('🚨 Duplicate found in TEMP LIST for serviceName:', serviceName);
      this.showRecordExists(serviceName);
      return;
    }

    // Also check if service already exists in database
    console.log('🔍 Checking database for duplicates:', {
      allServicesByCategory: this.allServicesByCategory,
      totalServices: this.allServicesByCategory.length,
      selectedCategory: formValues.category,
      searchingFor: serviceName.toLowerCase()
    });

    const existsInDatabase = this.allServicesByCategory.some(service => {
      const serviceCategory = typeof service.category === 'string' ? service.category : service.category._id;
      const matches = serviceCategory === formValues.category &&
        service.testName.toLowerCase() === serviceName.toLowerCase();

      if (matches) {
        console.log('🎯 Found matching service:', {
          existingService: service,
          serviceCategory,
          testName: service.testName
        });
      }

      return matches;
    });

    if (existsInDatabase) {
      console.log('🚨 Duplicate found in DATABASE for serviceName:', serviceName);
      this.showRecordExists(serviceName);
      return;
    }

    const newService: ServiceHead = {
      category: formValues.category,
      testName: serviceName,
      price: parseFloat(formValues.price).toFixed(2)
    };

    this.tempServiceList.push(newService);

    // Disable category dropdown after first service is added
    this.serviceForm.get('category')?.disable();

    // Reset only service name and price, keep category selected
    this.serviceForm.patchValue({
      serviceName: '',
      price: ''
    });

    // Focus on service name input after adding
    setTimeout(() => {
      if (this.serviceNameInput) {
        this.serviceNameInput.nativeElement.focus();
      }
    }, 100);

    console.log('Service added to temp list:', newService);
  }

  // Reset edit mode
  resetEditMode(): void {
    this.isEditMode = false;
    this.editingServiceId = null;
    this.serviceForm.patchValue({
      serviceName: '',
      price: ''
    });
    // Re-enable category if no temp services
    if (this.tempServiceList.length === 0) {
      this.serviceForm.get('category')?.enable();
    }

  }

  // Remove service from temporary list
  removeFromTempList(index: number): void {
    this.tempServiceList.splice(index, 1);

    // Category dropdown stays disabled until Save All Services is successful
    // Only enable if user manually removes all services before saving
    if (this.tempServiceList.length === 0) {
      this.serviceForm.get('category')?.enable();
    }
  }

  // Save all services to database
  saveServices(): void {
    if (this.tempServiceList.length === 0) {
      alert('Please add at least one service before saving');
      return;
    }

    console.log('Saving services:', this.tempServiceList);

    // Save each service to database
    const savePromises = this.tempServiceList.map(service =>
      this.createServiceHead(service)
    );

    Promise.all(savePromises)
      .then(responses => {
        console.log('All services saved successfully:', responses);
        this.showSuccessMessage(`${this.tempServiceList.length} services saved successfully!`);

        const keepCategory = this.serviceForm.get('category')?.value || this.selectedViewCategory;

        // Clear temp list
        this.tempServiceList = [];

        // Reset only name and price; keep category selected
        this.serviceForm.patchValue({ serviceName: '', price: '' });
        this.serviceForm.get('category')?.enable();
        if (keepCategory) {
          this.serviceForm.get('category')?.setValue(keepCategory, { emitEvent: false });
          this.selectedViewCategory = keepCategory;
        }

        // Refresh services list without reloading the page
        this.loadServicesByCategory();
      })
      .catch(error => {
        console.error('Error saving services:', error);
        const errorMessage = error.error?.message || error.message;

        // Check if it's a duplicate service error
        if (errorMessage.toLowerCase().includes('already exists') ||
            errorMessage.toLowerCase().includes('duplicate')) {
          // For batch save, we can't determine which specific service is duplicate
          // So show a generic message
          this.showRecordExists('one or more services');
        } else {
          // Show simple error alert for other errors
          alert('Error saving services: ' + errorMessage);
        }
      });
  }


  setDigit(val: any) {
    let _val = parseFloat(val.target.value);
    if (!isNaN(_val)) {
      this.serviceForm.get('price')?.patchValue(_val.toFixed(2));
    }
  }

  // Load services by selected category
  loadServicesByCategory(): void {
    // Use the category from form if available, otherwise use selectedViewCategory
    const categoryToLoad = this.serviceForm?.get('category')?.value || this.selectedViewCategory;

    if (!categoryToLoad) {
      console.log('No category selected for loading services');
      this.allServicesByCategory = [];
      this.cdr.detectChanges();
      return;
    }

    console.log('🔄 Loading services for category:', categoryToLoad);

    this.getServicesByCategory(categoryToLoad)
      .then(services => {
        // Normalize category so UI can always read a name
        const resolvedName = this.getCategoryName(categoryToLoad);
        this.allServicesByCategory = services.map((s: any) => {
          if (s && typeof s.category === 'string') {
            return { ...s, category: { _id: s.category, categoryName: resolvedName } };
          }
          if (s && typeof s.category === 'object' && s.category && !s.category.categoryName) {
            return { ...s, category: { ...s.category, categoryName: resolvedName } };
          }
          return s;
        });

        console.log(`✅ Loaded ${services.length} services for category: ${categoryToLoad}`);

        // Force change detection to update UI immediately
        this.cdr.detectChanges();
      })
      .catch(error => {
        console.error('❌ Error loading services:', error);
        this.allServicesByCategory = [];
        this.cdr.detectChanges();
      });
  }

  // Category change handler for viewing services
  onViewCategoryChange(): void {
    this.loadServicesByCategory();
  }

  // Edit service - populate form for editing
  private resolveCategoryObjectId(raw: any): string | null {
    // Normalize to a category _id present in categoryOptions
    if (!raw) return null;
    // If already _id string
    if (typeof raw === 'string') {
      const byId = this.categoryOptions.find(c => c._id === raw);
      if (byId) return byId._id!;
      const byCatId = this.categoryOptions.find(c => (c as any).categoryId === raw);
      if (byCatId) return byCatId._id!;
      const byName = this.categoryOptions.find(c => c.categoryName?.toUpperCase() === raw.toUpperCase());
      if (byName) return byName._id!;
      return raw; // fallback
    }
    // If object with _id
    if (raw._id) {
      const byId = this.categoryOptions.find(c => c._id === raw._id);
      if (byId) return byId._id!;
    }
    // If object with categoryId
    if (raw.categoryId) {
      const byCatId = this.categoryOptions.find(c => (c as any).categoryId === raw.categoryId);
      if (byCatId) return byCatId._id!;
    }
    // If object with name
    const name = raw.categoryName || raw.name;
    if (name) {
      const byName = this.categoryOptions.find(c => c.categoryName?.toUpperCase() === String(name).toUpperCase());
      if (byName) return byName._id!;
    }
    return null;
  }

  private ensureCategorySelected(categoryId: string): void {
    // Apply category selection robustly and keep disabled
    const ctrl = this.serviceForm.get('category');
    if (!ctrl) return;
    const resolvedId = this.resolveCategoryObjectId(categoryId) || categoryId;
    ctrl.enable({ emitEvent: false });
    ctrl.setValue(resolvedId, { emitEvent: false });
    // Also update selectedViewCategory so third-row header updates
    this.selectedViewCategory = resolvedId;
    // Lock it
    ctrl.disable({ emitEvent: false });
    this.cdr.detectChanges();
    // Re-apply once more in case options render after CD
    setTimeout(() => {
      ctrl.enable({ emitEvent: false });
      ctrl.setValue(resolvedId, { emitEvent: false });
      ctrl.disable({ emitEvent: false });
      this.cdr.detectChanges();
    }, 50);
  }

  editService(service: ServiceHead): void {
    // Set edit mode
    this.isEditMode = true;
    this.editingServiceId = service._id!;

    // Resolve category ID robustly (object may have _id/id/categoryId or only name)
    let categoryId = '' as any;
    const cat: any = (service as any).category;
    if (typeof cat === 'string') {
      categoryId = cat;
    } else if (cat && typeof cat === 'object') {
      categoryId = cat._id || cat.id || cat.categoryId || '';
      if (!categoryId && (cat.categoryName || cat.name)) {
        const match = this.categoryOptions.find(c => c.categoryName === (cat.categoryName || cat.name));
        if (match) categoryId = match._id!;
      }
    }
    if (!categoryId) {
      // Fallback to current selection to avoid blank state
      categoryId = this.serviceForm.get('category')?.value || this.selectedViewCategory;
    }
    if (!categoryId) {
      alert('Error: Category ID not found');
      return;
    }

    // Populate form with service data
    this.serviceForm.patchValue({
      category: categoryId,
      serviceName: service.testName,
      price: service.price.toString()
    });

    // Ensure categories are loaded before enforcing selection
    if (!this.categoryOptions || this.categoryOptions.length === 0) {
      // Try again shortly if options not yet rendered
      setTimeout(() => this.ensureCategorySelected(String(categoryId)), 100);
    } else {
      this.ensureCategorySelected(String(categoryId));
    }

    // Focus on service name input
    setTimeout(() => {
      if (this.serviceNameInput) {
        this.serviceNameInput.nativeElement.focus();
        this.serviceNameInput.nativeElement.select();
      }
    }, 0);

    console.log('Editing service:', service);
  }

  // Delete service
  deleteService(service: ServiceHead): void {
    this.serviceToDelete = service;
    this.deleteMessage = `You are about to remove service "${service.testName}" forever. Once deleted, this cannot be restored.`;
    this.isDeleting = false;
    this.showDeleteConfirmation = true;
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

    this.deleteServiceFromDB(this.serviceToDelete._id!).then(() => {
      // Remove from local array (like doctor-list)
      this.allServicesByCategory = this.allServicesByCategory.filter(s => s._id !== this.serviceToDelete!._id);
      this.serviceToDelete = null;
      this.isDeleting = false;
    }).catch((error: any) => {
      console.error('Error deleting service:', error);
      // Hide success if API fails
      this.showDeleteSuccess = false;
      alert('Error deleting service: ' + (error.error?.message || error.message));
      this.isDeleting = false;
      this.cancelDelete();
    });
  }

  // Delete Success Methods
  onDeleteSuccessClosed(): void {
    this.showDeleteSuccess = false;
    // Refresh data after success modal closes (like doctor-list)
    this.loadServicesByCategory();
  }



  // HTTP Methods
  private createServiceHead(serviceData: ServiceHead) {
    const token = localStorage.getItem('token');
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    return new Promise((resolve, reject) => {
      fetch(`${environment.apiUrl}/service-heads`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(serviceData)
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

  private getServicesByCategory(category: string) {
    const token = localStorage.getItem('token');
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    return new Promise<ServiceHead[]>((resolve, reject) => {
      fetch(`${environment.apiUrl}/service-heads/${category}`, {
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

  private updateServiceInDB(serviceId: string, updateData: { testName: string; price: string }) {
    const token = localStorage.getItem('token');
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    console.log('Updating service with data:', updateData);
    console.log('Service ID:', serviceId);
    console.log('Token:', token ? 'Present' : 'Missing');
    console.log('API URL:', `${environment.apiUrl}/service-heads/${serviceId}`);

    return new Promise((resolve, reject) => {
      fetch(`${environment.apiUrl}/service-heads/${serviceId}`, {
        method: 'PUT',
        headers: headers,
        body: JSON.stringify(updateData)
      })
      .then(async response => {
        console.log('Response status:', response.status);
        console.log('Response headers:', response.headers);

        // Get response text for debugging
        const responseText = await response.text();
        console.log('Response text:', responseText);

        // Check if response is ok
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}, response: ${responseText}`);
        }

        // Try to parse as JSON
        try {
          return JSON.parse(responseText);
        } catch (parseError) {
          console.error('JSON parse error:', parseError);
          // If parsing fails but response was ok, return success
          return { success: true, message: 'Service updated successfully' };
        }
      })
      .then(data => {
        console.log('Update response data:', data);
        if (data.error) {
          reject(data);
        } else {
          resolve(data);
        }
      })
      .catch(error => {
        console.error('Update service error:', error);
        reject(error);
      });
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

  // Utility methods
  private markFormGroupTouched(): void {
    Object.keys(this.serviceForm.controls).forEach(key => {
      const control = this.serviceForm.get(key);
      if (control) {
        control.markAsTouched();
      }
    });
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.serviceForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  getFieldError(fieldName: string): string {
    const field = this.serviceForm.get(fieldName);
    if (field?.errors) {
      if (field.errors['required']) return `${fieldName} is required`;
      if (field.errors['minlength']) return `${fieldName} must be at least ${field.errors['minlength'].requiredLength} characters`;
      if (field.errors['min']) return `${fieldName} must be greater than 0`;
      if (field.errors['duplicate']) return 'This service name is already registered in this category';
    }
    return '';
  }

  // Navigation methods for tab buttons
  navigateToCategoryRegistration(): void {
    this.router.navigate(['/setup/category-heads/category-head-registration']);
  }

  navigateToSearchService(): void {
    this.router.navigate(['/setup/category-heads/search-service']);
  }

  formatPrice(price: string): string {
    return `₹${price}`;
  }



  // Get category name by ID (robust to different shapes)
  getCategoryName(categoryOrId: string | CategoryHead): string {
    // If populated object with categoryName
    if (categoryOrId && typeof categoryOrId === 'object') {
      const anyCat: any = categoryOrId as any;
      if (anyCat.categoryName) return anyCat.categoryName;
      if (anyCat.name) return anyCat.name; // sometimes backend returns `name`
      if (anyCat._id) {
        const c = this.categoryOptions.find(cat => cat._id === anyCat._id);
        if (c) return c.categoryName;
      }
      return 'Unknown';
    }

    // If it's an ID string
    const category = this.categoryOptions.find(cat => cat._id === categoryOrId);
    return category ? category.categoryName : 'Unknown';
  }

  // Success Alert Methods
  showSuccessMessage(message: string): void {
    this.successMessage = message;
    this.showSuccessAlert = true;
    this.cdr.detectChanges(); // Force change detection

    // Auto-hide alert after 4 seconds
    setTimeout(() => {
      this.closeSuccessAlert();
    }, 4000);
  }

  closeSuccessAlert(): void {
    this.showSuccessAlert = false;
    this.successMessage = '';
    this.cdr.detectChanges(); // Force change detection
  }

  // Record exists modal methods
  onRecordExistsModalClosed(): void {
    this.showRecordExistsModal = false;
    this.recordExistsMessage = '';
  }

  // Method to show record exists modal (call this when duplicate is found)
  showRecordExists(serviceName: string): void {
    console.log('🚨 showRecordExists called with serviceName:', serviceName);
    this.recordExistsMessage = `A service with the name "${serviceName}" already exists in the system.`;
    this.showRecordExistsModal = true;
    console.log('🚨 Modal properties set:', {
      showRecordExistsModal: this.showRecordExistsModal,
      recordExistsMessage: this.recordExistsMessage
    });
    this.cdr.detectChanges(); // Force change detection
  }

  // Check for duplicate service name on blur (like doctor phone validation)
  checkDuplicateService(): void {
    const serviceNameCtrl = this.serviceForm.get('serviceName');
    const serviceName = serviceNameCtrl?.value?.trim();
    const selectedCategory = this.serviceForm.get('category')?.value;

    console.log('🔍 checkDuplicateService called with:', {
      serviceName,
      selectedCategory,
      allServicesByCategory: this.allServicesByCategory.length,
      tempServiceList: this.tempServiceList.length
    });

    if (!serviceName || !selectedCategory || serviceNameCtrl?.invalid) {
      console.log('❌ Early return - missing data or invalid field');
      return;
    }

    // If no services loaded for this category, load them first
    if (this.allServicesByCategory.length === 0 && selectedCategory) {
      console.log('🔄 No services loaded, loading services for category:', selectedCategory);
      this.selectedViewCategory = selectedCategory;
      this.loadServicesByCategory();
      // Wait a bit and then recheck
      setTimeout(() => {
        if (this.allServicesByCategory.length > 0) {
          console.log('🔄 Services loaded, rechecking duplicate...');
          this.checkDuplicateService();
        }
      }, 500);
      return;
    }

    // Check in temp list first
    // Normalize selected category to an _id for robust comparison
    const selectedCategoryId = this.resolveCategoryObjectId(selectedCategory) || selectedCategory;

    const existsInTempList = this.tempServiceList.some(service => {
      const tempServiceCategoryId = this.resolveCategoryObjectId((service as any).category) ||
        (typeof (service as any).category === 'string' ? (service as any).category : (service as any).category?._id);
      const nameMatch = service.testName.trim().toLowerCase() === serviceName.trim().toLowerCase();
      const categoryMatch = tempServiceCategoryId === selectedCategoryId;
      if (nameMatch && !categoryMatch) {
        console.log('⚠️ Temp list name match but category mismatch', {
          tempServiceCategoryId,
          selectedCategoryId,
          serviceCategoryRaw: (service as any).category
        });
      }
      return nameMatch && categoryMatch;
    });

    if (existsInTempList) {
      // Mark as error and show alert service message
      serviceNameCtrl?.setErrors({ duplicate: true });
      const categoryName = this.getCategoryName(selectedCategory);
      console.log('🚨 Showing Alert Service for duplicate:', serviceName);
      console.log('🚨 AlertService instance check:', this.alertService);
      try {
        this.alertService.showError(
          '❌ Duplicate Service Name',
          `This service name "${serviceName}" is already registered in ${categoryName} category. Please register another service name.`
        );
        console.log('✅ Alert service called successfully');
      } catch (error) {
        console.error('❌ Error calling alert service:', error);
      }
      return;
    }

    // Check in database
    console.log('🔍 Checking database with services:', this.allServicesByCategory.map(s => ({
      id: s._id,
      name: s.testName,
      category: typeof s.category === 'string' ? s.category : s.category._id
    })));

    console.log('🔍 Looking for duplicate:', {
      searchName: serviceName.toLowerCase(),
      searchCategoryRaw: selectedCategory,
      searchCategoryId: selectedCategoryId,
      totalServices: this.allServicesByCategory.length
    });

    const existsInDatabase = this.allServicesByCategory.some(service => {
      const serviceCategoryId = this.resolveCategoryObjectId((service as any).category) ||
        (typeof (service as any).category === 'string' ? (service as any).category : (service as any).category?._id);

      // Trim and normalize both names for comparison
      const dbName = service.testName.trim().toLowerCase();
      const searchName = serviceName.trim().toLowerCase();
      const nameMatch = dbName === searchName;
      const categoryMatch = serviceCategoryId === selectedCategoryId;
      const matches = categoryMatch && nameMatch;

      console.log('🔍 Checking service:', {
        serviceName: service.testName,
        dbNameNormalized: dbName,
        searchNameNormalized: searchName,
        serviceCategoryId,
        selectedCategoryId,
        nameMatch,
        categoryMatch,
        matches,
        isEditMode: this.isEditMode,
        editingServiceId: this.editingServiceId
      });

      // Special check for AG Ratio
      if (service.testName.toLowerCase().includes('ag ratio') || serviceName.toLowerCase().includes('ag ratio')) {
        console.log('🚨 SPECIAL AG RATIO CHECK:', {
          dbName: `"${service.testName}"`,
          searchName: `"${serviceName}"`,
          dbNameTrimmed: `"${service.testName.trim()}"`,
          searchNameTrimmed: `"${serviceName.trim()}"`,
          dbNameLength: service.testName.length,
          searchNameLength: serviceName.length,
          exactMatch: service.testName.trim().toLowerCase() === serviceName.trim().toLowerCase(),
          // Category debugging
          dbCategoryType: typeof service.category,
          dbCategoryValue: service.category,
          dbCategoryId: typeof service.category === 'string' ? service.category : service.category?._id,
          selectedCategoryValue: selectedCategoryId,
          categoryMatch: serviceCategoryId === selectedCategoryId
        });
      }

      // If in edit mode, exclude current service being edited
      if (this.isEditMode && this.editingServiceId) {
        const finalResult = matches && service._id !== this.editingServiceId;
        console.log('🔍 Edit mode result:', finalResult);
        return finalResult;
      }

      console.log('🔍 Normal mode result:', matches);
      return matches;
    });

    console.log('🔍 Final duplicate check result:', existsInDatabase);

    if (existsInDatabase) {
      // Mark as error and show alert service message
      serviceNameCtrl?.setErrors({ duplicate: true });
      const categoryName = this.getCategoryName(selectedCategory);
      console.log('🚨 Database duplicate found, showing alert for:', serviceName);
      console.log('🚨 AlertService instance:', this.alertService);
      try {
        this.alertService.showError(
          '❌ Duplicate Service Name',
          `This service name "${serviceName}" is already registered in ${categoryName} category. Please register another service name.`
        );
        console.log('✅ Database duplicate alert shown successfully');
      } catch (error) {
        console.error('❌ Error showing database duplicate alert:', error);
      }
      return;
    } else {
      console.log('✅ No duplicate found in database');
    }

    // Clear any existing duplicate errors if no duplicate found
    if (serviceNameCtrl?.errors?.['duplicate']) {
      const errors = { ...serviceNameCtrl.errors };
      delete errors['duplicate'];
      serviceNameCtrl.setErrors(Object.keys(errors).length ? errors : null);
    }
  }






}

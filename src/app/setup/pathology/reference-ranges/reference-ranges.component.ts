import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormArray } from '@angular/forms';
import { Router, NavigationEnd, ActivatedRoute } from '@angular/router';
import { PathologyService, TestParameter, TestCategory, TestDefinition, TestReferenceRange } from '../services/pathology.service';
import { NormalValueEditorComponent, NormalValue, TestParameterDefinition } from '../normal-value-editor/normal-value-editor.component';

import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';


// Local interfaces for component

export interface TestParameterWithRanges {
  _id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  unit: string;
  sampleType: string;
  ranges: TestReferenceRange[];
  isActive: boolean;
}

@Component({
  selector: 'app-reference-ranges',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, NormalValueEditorComponent],
  templateUrl: './reference-ranges.component.html',
  styleUrls: ['./reference-ranges.component.css']
})
export class ReferenceRangesComponent implements OnInit, OnDestroy {
  referenceRangeForm: FormGroup;
  testParameters: TestParameter[] = [];
  testCategories: TestCategory[] = [];
  testDefinitions: TestDefinition[] = [];
  referenceRanges: TestReferenceRange[] = [];
  filteredRanges: TestReferenceRange[] = [];
  parametersWithRanges: TestParameterWithRanges[] = [];
  private subscription: Subscription = new Subscription();

  // Form/UI states
  selectedTestParameter: TestParameter | null = null;
  selectedTestDefinition: TestDefinition | null = null;
  selectedCategoryId = '';
  selectedCategoryName = '';
  isEditMode = false;
  editingRangeId: string | null = null;

  // Normal value editor modal state
  showNormalValueModal = false;
  selectedParameter: TestParameterDefinition | null = null;
  selectedParameterIndex: number = -1;
  testForEdit: TestDefinition | null = null;

  // Search and pagination
  searchTerm = '';
  selectedParameterFilter = '';
  selectedTestFilter = '';
  currentPage = 1;
  pageSize = 10;
  totalPages = 0;

  // Alert properties
  showAlert = false;
  alertMessage = '';
  alertType: 'success' | 'error' = 'success';

  // Math object for template
  Math = Math;

  constructor(
    private fb: FormBuilder,
    private pathologyService: PathologyService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private route: ActivatedRoute
  ) {
    this.referenceRangeForm = this.createForm();
  }

  // Auto-refresh current data on navigation and on service notifications
  ngAfterViewInit?(): void { /* placeholder for interface compatibility */ }

  /** Attach listeners to auto-refresh when data changes elsewhere or when returning to this screen */
  private setupAutoRefresh(): void {
    // From service: creations/updates/deletes of test definitions should refresh our tables
    this.subscription.add(
      this.pathologyService.testDefinitionChanged$.subscribe(() => this.loadTestDefinitions(true))
    );
    this.subscription.add(
      this.pathologyService.testDeleted$.subscribe(() => this.loadTestDefinitions(true))
    );
  }

  // Auto-refresh whenever user navigates back to this route
  private setupRouteRefresh(): void {
    this.subscription.add(
      this.router.events
        .pipe(filter((e: any) => e instanceof NavigationEnd))
        .subscribe(() => {
          const url = (this.router.url || '').toLowerCase();
          if (url.includes('reference-ranges')) {
            // Pull latest data fresh
            this.loadTestCategories();
            this.loadTestDefinitions(true);
            this.loadTestParameters();
          }
        })
    );
  }


  ngOnInit(): void {
    this.loadInitialData();
    this.setupAutoRefresh();
    this.setupRouteRefresh();
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  private createForm(): FormGroup {
    return this.fb.group({
      testDefinitionId: ['', Validators.required],
      parameterId: ['', Validators.required]
    });
  }

  private loadInitialData(): void {
    this.loadTestCategories();
    this.loadTestDefinitions(true);
    this.loadTestParameters();
  }

  loadTestCategories(): void {
    this.subscription.add(
      this.pathologyService.getTestCategories().subscribe({
        next: (categories) => {
          // Sort categories in ascending order by name for selection buttons
          this.testCategories = [...categories].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

          // If no category selected yet, default to BIOCHEMISTRY
          if (!this.selectedCategoryId && this.testCategories.length) {
            const defaultCat = this.testCategories.find(c => (c.name || '').toUpperCase() === 'BIOCHEMISTRY');
            if (defaultCat && defaultCat._id) {
              this.selectedCategoryId = defaultCat._id;
              this.selectedCategoryName = defaultCat.name;
              this.currentPage = 1;
              this.applyFilters();
            }
          }

          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('Error loading test categories:', error);
          this.showAlertMessage('Error loading test categories', 'error');
        }
      })
    );
  }

  loadTestDefinitions(nocache: boolean = true): void {
    console.log('🔄 Loading test definitions from database...');
    this.subscription.add(
      this.pathologyService.getTestDefinitions(nocache).subscribe({
        next: (testDefinitions) => {
          console.log('✅ Loaded test definitions:', testDefinitions);
          this.testDefinitions = testDefinitions;
          this.applyFilters();
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('❌ Error loading test definitions:', error);
          this.showAlertMessage('Error loading test definitions', 'error');
        }
      })
    );
  }

  loadTestParameters(): void {
    this.subscription.add(
      this.pathologyService.getTestParameters().subscribe({
        next: (parameters) => {
          this.testParameters = parameters;
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('Error loading test parameters:', error);
          this.showAlertMessage('Error loading test parameters', 'error');
        }
      })
    );
  }

  onTestDefinitionSelect(testDefinition: TestDefinition): void {
    this.selectedTestDefinition = testDefinition;
    console.log('Selected test definition:', testDefinition);

    // Load parameters for this test definition
    if (testDefinition.parameters && testDefinition.parameters.length > 0) {
      // If test has parameters, show them
      this.loadReferenceRangesForTest(testDefinition._id!);
    }
  }

  loadReferenceRangesForTest(testDefinitionId: string): void {
    // This would load reference ranges for the selected test
    // For now, we'll show the test definition data
    console.log('Loading reference ranges for test:', testDefinitionId);
  }

  applyFilters(): void {
    // Exclude 'panel' type tests; show both 'single' and 'nested'
    let filtered = [...this.testDefinitions].filter(td => (td.testType || '').toLowerCase() !== 'panel');

    // Apply search filter
    if (this.searchTerm.trim()) {
      const searchLower = this.searchTerm.toLowerCase();
      filtered = filtered.filter(test => {
        const testName = test.name?.toLowerCase() || '';
        const categoryName = this.getCategoryName(test.category).toLowerCase();
        const testType = test.testType?.toLowerCase() || '';

        return testName.includes(searchLower) ||
               categoryName.includes(searchLower) ||
               testType.includes(searchLower);
      });
    }

    // Apply category filter
    if (this.selectedCategoryId) {
      filtered = filtered.filter(test => {
        if (typeof test.category === 'string') {
          return test.category === this.selectedCategoryId;
        } else if (typeof test.category === 'object' && test.category) {
          return test.category._id === this.selectedCategoryId ||
                 test.category.categoryId === this.selectedCategoryId;
        }
        return false;
      });
    }

    this.filteredRanges = filtered as any;
    this.updatePagination();
  }

  onSearch(): void {
    this.currentPage = 1;
    this.applyFilters();
  }

  onCategoryFilter(): void {
    this.currentPage = 1;
    this.applyFilters();
  }

  selectCategory(categoryId: string): void {
    this.selectedCategoryId = categoryId;
    const category = this.testCategories.find(cat => cat._id === categoryId);
    this.selectedCategoryName = category ? category.name : '';
    this.currentPage = 1;
    this.applyFilters();
  }

  getTestsByCategory(): any[] {
    if (!this.selectedCategoryId) {
      return [];
    }

    let results = this.testDefinitions.filter(test => {
      // Exclude 'panel' type tests
      if ((test.testType || '').toLowerCase() === 'panel') {
        return false;
      }

      // Handle populated category object
      if (typeof test.category === 'object' && test.category) {
        return (test.category as any)._id === this.selectedCategoryId ||
               (test.category as any).categoryId === this.selectedCategoryId;
      }
      // Handle string category ID
      if (typeof test.category === 'string') {
        return test.category === this.selectedCategoryId;
      }
      return false;
    });

    // Apply search within this category
    if (this.searchTerm && this.searchTerm.trim()) {
      const q = this.searchTerm.trim().toLowerCase();
      results = results.filter(test => {
        const name = (test.name || '').toLowerCase();
        const type = (test.testType || '').toLowerCase();
        const catName = this.getCategoryName(test.category).toLowerCase();
        return name.includes(q) || type.includes(q) || catName.includes(q);
      });
    }

    return results;
  }

  // Total non-panel tests count for header
  getTotalEligibleTestsCount(): number {
    return this.testDefinitions.filter(td => (td.testType || '').toLowerCase() !== 'panel').length;
  }

  // Open editor for single-parameter tests (store values at root)
  editNormalValues(test: TestDefinition): void {
    this.testForEdit = test;

    const parameter: TestParameterDefinition = {
      order: 1,
      name: test.name || 'Parameter',
      unit: (test as any)?.unit?.name ?? (test as any)?.unit ?? '',
      inputType: (test as any).inputType || 'Numeric',
      isOptional: false,
      normalValues: test.normalValues || []
    };

    this.selectedParameter = parameter;
    this.selectedParameterIndex = -1; // -1 means root-level values
    this.showNormalValueModal = true;
  }

  // Open editor for a specific parameter of a nested/multiple test
  editParameterNormalValues(test: TestDefinition, parameter: any): void {
    this.testForEdit = test;

    // Try to find index by order or name
    const idx = (test.parameters || []).findIndex((p: any) =>
      (p.order !== undefined && p.order === parameter.order) ||
      (p.name && p.name === parameter.name)
    );

    this.selectedParameterIndex = idx >= 0 ? idx : 0;

    // Ensure parameter has normalValues array
    const param: TestParameterDefinition = {
      order: parameter.order ?? this.selectedParameterIndex + 1,
      name: parameter.name,
      unit: (parameter as any)?.unit?.name ?? parameter.unit,
      inputType: parameter.inputType || 'Numeric',
      defaultResult: parameter.defaultResult,
      isOptional: !!parameter.isOptional,
      groupBy: parameter.groupBy,
      normalValues: parameter.normalValues || []
    };

    this.selectedParameter = param;
    this.showNormalValueModal = true;
  }

  closeNormalValueModal(): void {
    this.showNormalValueModal = false;
    this.selectedParameter = null;
    this.selectedParameterIndex = -1;
    this.testForEdit = null;
  }

  // Save handler from modal
  saveNormalValues(normalValues: NormalValue[]): void {
    if (!this.testForEdit) { return; }

    const test = this.testForEdit as any;
    let updateData: any;

    // Helper mappers to ensure IDs are sent (backend expects ObjectIds)
    const toId = (val: any) => (val && typeof val === 'object') ? (val._id || val.id || val) : val;
    const toIdArray = (arr: any) => Array.isArray(arr) ? arr.map((x: any) => toId(x)) : toId(arr);

    const shortNameId = toId(test.shortName);
    const categoryId = toId(test.category);
    const sampleTypeIds = toIdArray(test.sampleType);

    if (this.selectedParameterIndex === -1) {
      // Save at root level for single tests
      updateData = {
        name: test.name,
        shortName: shortNameId,
        category: categoryId,
        sampleType: sampleTypeIds,
        testType: test.testType,
        unit: typeof test.unit === 'object' ? test.unit?.name : test.unit,
        inputType: test.inputType,
        method: test.method,
        instrument: test.instrument,
        normalValues: normalValues,
        parameters: []
      };

      // Update local
      test.normalValues = normalValues;
    } else {
      // Update in parameters array
      const updatedParam = {
        ...(test.parameters?.[this.selectedParameterIndex] || {}),
        normalValues
      };

      const newParams = [...(test.parameters || [])];
      newParams[this.selectedParameterIndex] = updatedParam as any;

      updateData = {
        name: test.name,
        shortName: shortNameId,
        category: categoryId,
        sampleType: sampleTypeIds,
        testType: test.testType,
        parameters: newParams,
        method: test.method,
        instrument: test.instrument
      };

      test.parameters = newParams as any;
    }

    // Persist
    if (test._id) {
      this.subscription.add(
        this.pathologyService.updateTestDefinition(test._id, updateData).subscribe({
          next: () => {
            this.alertMessage = 'Normal values updated successfully';
            this.alertType = 'success';
            this.showAlert = true;
            this.closeNormalValueModal();
            // Reload fresh data to ensure latest values (bypass cache)
            this.loadTestDefinitions(true);
            this.cdr.detectChanges();
          },
          error: (err) => {
            console.error('Error updating normal values', err);
            console.error('Payload sent:', updateData);
            this.alertMessage = 'Error updating normal values';
            this.alertType = 'error';
            this.showAlert = true;
          }
        })
      );
    }
  }

  // Helper method to get normal values for a test
  getNormalValuesForTest(test: any): any[] {
    // For single tests, normal values are at the root level
    if ((!test.parameters || test.parameters.length === 0) && test.normalValues) {
      return test.normalValues;
    }

    // For nested/multiple tests, normal values are in parameters
    if (test.parameters && test.parameters.length > 0) {
      // Return normal values from the first parameter for display
      // In a real scenario, you might want to show all parameters
      const firstParam = test.parameters[0];
      return firstParam.normalValues || [];
    }

    return [];
  }

  updatePagination(): void {
    this.totalPages = Math.ceil(this.filteredRanges.length / this.pageSize);
    if (this.currentPage > this.totalPages && this.totalPages > 0) {
      this.currentPage = this.totalPages;
    }
  }

  getPaginatedRanges(): any[] {
    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    return this.filteredRanges.slice(startIndex, endIndex);
  }

  // Get total parameter count for serial numbering
  getTotalParameterCount(): number {
    let count = 0;
    const startIndex = (this.currentPage - 1) * this.pageSize;

    for (let i = 0; i < startIndex; i++) {
      if (this.filteredRanges[i] && (this.filteredRanges[i] as any).parameters) {
        count += (this.filteredRanges[i] as any).parameters.length;
      }
    }
    return count;
  }

  // Get parameter serial number
  getParameterSerialNumber(testIndex: number, paramIndex: number): number {
    let count = this.getTotalParameterCount();

    // Add parameters from previous tests in current page
    const paginatedTests = this.getPaginatedRanges();
    for (let i = 0; i < testIndex; i++) {
      if (paginatedTests[i] && (paginatedTests[i] as any).parameters) {
        count += (paginatedTests[i] as any).parameters.length;
      }
    }

    return count + paramIndex + 1;
  }

  // Expansion state management
  private expandedTests: Set<string> = new Set();

  toggleTestExpansion(testId: string): void {
    if (this.expandedTests.has(testId)) {
      this.expandedTests.delete(testId);
    } else {
      this.expandedTests.add(testId);
    }
  }

  isTestExpanded(testId: string): boolean {
    return this.expandedTests.has(testId);
  }

  // Get total parameters count across all tests
  getTotalParametersCount(): number {
    return this.testDefinitions.reduce((total, test) => {
      return total + (test.parameters?.length || 0);
    }, 0);
  }

  // Get global serial number for table rows
  getGlobalSerialNumber(testIndex: number, paramIndex: number, valueIndex: number): number {
    let count = 0;
    const paginatedTests = this.getPaginatedRanges();

    // Count from previous tests
    for (let i = 0; i < testIndex; i++) {
      const test = paginatedTests[i] as any;
      if (test.parameters) {
        for (const param of test.parameters) {
          count += param.normalValues?.length || 1; // At least 1 for parameter without values
        }
      } else {
        count += 1; // Test without parameters
      }
    }

    // Count from previous parameters in current test
    const currentTest = paginatedTests[testIndex] as any;
    if (currentTest && currentTest.parameters) {
      for (let i = 0; i < paramIndex; i++) {
        const param = currentTest.parameters[i];
        count += param.normalValues?.length || 1;
      }
    }

    // Add current value index
    count += valueIndex + 1;

    // Add offset from previous pages (based on total normal values, not tests)
    const previousPagesCount = this.getPreviousPagesNormalValuesCount();
    count += previousPagesCount;

    return count;
  }

  // Helper method to count normal values from previous pages
  private getPreviousPagesNormalValuesCount(): number {
    let count = 0;
    const startIndex = (this.currentPage - 1) * this.pageSize;

    for (let i = 0; i < startIndex && i < this.filteredRanges.length; i++) {
      const test = this.filteredRanges[i] as any;
      if (test.parameters) {
        for (const param of test.parameters) {
          count += param.normalValues?.length || 1;
        }
      } else {
        count += 1;
      }
    }

    return count;
  }

  // Get total normal values count for a test (for rowspan)
  getTotalNormalValuesForTest(test: any): number {
    // Handle single test type differently
    if (!test.parameters || test.parameters.length === 0) {
      // For single tests, check if normalValues exist at test level
      if (test.normalValues && test.normalValues.length > 0) {
        return test.normalValues.length;
      }
      return 1;
    }

    // Handle nested test type
    if (!test.parameters || test.parameters.length === 0) {
      return 1;
    }

    return test.parameters.reduce((total: number, param: any) => {
      return total + (param.normalValues?.length || 1);
    }, 0);
  }

  // Edit normal value
  editNormalValue(test: any, parameter: any, normalValue: any, index: number): void {
    console.log('Edit normal value:', { test, parameter, normalValue, index });
    // TODO: Implement edit functionality
    // This could open a modal or navigate to edit form
  }

  // Delete normal value
  deleteNormalValue(test: any, parameter: any, index: number): void {
    if (confirm('Are you sure you want to delete this normal value?')) {
      if (!test.parameters || test.parameters.length === 0) {
        // For single tests, remove from test.normalValues
        if (test.normalValues && test.normalValues.length > index) {
          test.normalValues.splice(index, 1);
          console.log('Deleted normal value from single test');
        }
      } else if (parameter && parameter.normalValues) {
        // For nested tests, remove from parameter.normalValues
        parameter.normalValues.splice(index, 1);
        console.log('Deleted normal value from parameter');
      }

      // TODO: Call API to update the test definition
      // this.updateTestDefinition(test);
    }
  }

  getPaginationPages(): number[] {
    const pages: number[] = [];
    const maxVisiblePages = 5;
    const halfVisible = Math.floor(maxVisiblePages / 2);

    let startPage = Math.max(1, this.currentPage - halfVisible);
    let endPage = Math.min(this.totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return pages;
  }

  onPageChange(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }

  deleteRange(range: any): void {
    // Implementation for deleting reference range
    console.log('Delete range:', range);
  }

  // Helper methods for template
  getShortNameDisplay(shortName: any): string {
    if (typeof shortName === 'string') {
      return shortName;
    } else if (typeof shortName === 'object' && shortName.testName) {
      return shortName.testName;
    }
    return 'N/A';
  }

  getGenderBadgeClass(gender?: string): string {
    const g = (gender || 'Any').toLowerCase();
    if (g === 'male' || g === 'm') return 'gender-badge gender-male';
    if (g === 'female' || g === 'f') return 'gender-badge gender-female';
    return 'gender-badge gender-any';
  }

  getCategoryName(category: any): string {
    if (typeof category === 'string') {
      return category;
    } else if (typeof category === 'object' && category.name) {
      return category.name;
    }
    return 'N/A';
  }

  getParameterCount(test: TestDefinition): number {
    return test.parameters ? test.parameters.length : 0;
  }

  getParameterPreview(test: TestDefinition): string {
    if (!test.parameters || test.parameters.length === 0) {
      return 'No parameters';
    }

    const firstTwo = test.parameters.slice(0, 2).map(p => p.name).join(', ');
    if (test.parameters.length > 2) {
      return `${firstTwo}... (+${test.parameters.length - 2} more)`;
    }
    return firstTwo;
  }

  // Group parameters by groupBy for nested tests (case-insensitive merge, order by first appearance)
  getParameterGroups(test: TestDefinition): Array<{ name: string; items: any[]; firstOrder: number }> {
    const params = (test.parameters || []).slice();
    const map = new Map<string, { name: string; items: any[]; firstOrder: number }>();

    for (const p of params) {
      const raw = (p.groupBy || 'Ungrouped').trim();
      const key = raw.toLowerCase();
      const display = raw.charAt(0).toUpperCase() + raw.slice(1); // Title case first letter
      if (!map.has(key)) {
        map.set(key, { name: display, items: [], firstOrder: Number.isFinite(p.order) ? p.order : 999999 });
      }
      const bucket = map.get(key)!;
      bucket.items.push(p);
      // track smallest order encountered for this group to sort groups
      if (Number.isFinite(p.order)) {
        bucket.firstOrder = Math.min(bucket.firstOrder, p.order as number);
      }
    }

    const groups = Array.from(map.values());

    // Sort parameters within group by order
    for (const g of groups) {
      g.items.sort((a, b) => (a.order || 0) - (b.order || 0));
    }

    // Sort groups by firstOrder; keep 'Ungrouped' last always
    groups.sort((a, b) => {
      const aUng = a.name.toLowerCase() === 'ungrouped';
      const bUng = b.name.toLowerCase() === 'ungrouped';
      if (aUng && !bUng) return 1;
      if (!aUng && bUng) return -1;
      return (a.firstOrder || 0) - (b.firstOrder || 0);
    });

    return groups;
  }
  // For 'multiple' tests, return parameters ordered by 'order'
  getOrderedParameters(test: TestDefinition): any[] {
    const params = (test.parameters || []).slice();
    return params.sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
  }


  viewTestDetails(test: TestDefinition): void {
    console.log('View test details:', test);
    this.selectedTestDefinition = test;
    // You can implement a modal or navigation to detailed view
  }

  manageReferenceRanges(test: TestDefinition): void {
    console.log('Manage reference ranges for test:', test);
    this.selectedTestDefinition = test;

    // Load reference ranges for this test's parameters
    if (test.parameters && test.parameters.length > 0) {
      // For each parameter, load its reference ranges
      test.parameters.forEach(param => {
        // Try different possible ID fields
        const paramId = (param as any)._id || (param as any).id || param.name;
        if (paramId) {
          this.loadReferenceRangesForParameter(paramId);
        }
      });
    }
  }

  loadReferenceRangesForParameter(parameterId: string): void {
    this.subscription.add(
      this.pathologyService.getReferenceRanges(parameterId).subscribe({
        next: (ranges) => {
          console.log(`Reference ranges for parameter ${parameterId}:`, ranges);
          // Store these ranges for display
          if (ranges && ranges.length > 0) {
            this.referenceRanges = [...this.referenceRanges, ...ranges];
            this.cdr.detectChanges();
          }
        },
        error: (error) => {
          console.error('Error loading reference ranges:', error);
          this.showAlertMessage(`Error loading reference ranges for parameter ${parameterId}`, 'error');
        }
      })
    );
  }

  private showAlertMessage(message: string, type: 'success' | 'error'): void {
    this.alertMessage = message;
    this.alertType = type;
    this.showAlert = true;

    setTimeout(() => {
      this.showAlert = false;
      this.cdr.detectChanges();
    }, 3000);
  }

}

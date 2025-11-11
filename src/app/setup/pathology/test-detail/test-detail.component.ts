import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { PathologyService } from '../services/pathology.service';

import { NormalValueEditorComponent } from '../normal-value-editor/normal-value-editor.component';

export interface TestDefinition {
  _id?: string;
  testId?: string;
  name: string;
  shortName: string | { testName: string; price: string; _id: string };
  category: string | { name: string; categoryId: string; _id: string };
  testType: 'single' | 'multiple' | 'nested' | 'document' | 'panel';
  // Fields for single parameter tests
  sampleType?: string | string[]; // supports multi-select now
  unit?: string;
  inputType?: 'Numeric' | 'Single Line' | 'Paragraph';
  // Single parameter default-result system at root
  resultType?: 'manual' | 'dropdown' | 'fixed' | 'formula';
  dropdownOptions?: string;
  defaultResult?: string;
  formula?: string;

  isOptional?: boolean;
  parameters: TestParameterDefinition[];
  method?: string;
  instrument?: string;
  normalValues?: NormalValue[]; // For single parameter tests
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
  removed?: boolean;
  groupBy?: string;
  normalValues?: NormalValue[];
}

export interface NormalValue {
  _id?: string;
  type: 'Numeric range' | 'Text';
  gender?: string; // Changed from sex to gender
  minAge?: string; // Changed to string to store "14 Years" format
  maxAge?: string; // Changed to string to store "100 Years" format
  ageUnit?: string;
  lowerValue?: string;
  upperValue?: string;
  textValue?: string;
  displayInReport?: string;
  remark?: string;
}

@Component({
  selector: 'app-test-detail',
  standalone: true,
  imports: [CommonModule, NormalValueEditorComponent],
  templateUrl: './test-detail.component.html',
  styleUrls: ['./test-detail.component.css']
})
export class TestDetailComponent implements OnInit, OnDestroy {
  testDefinition: TestDefinition | null = null;
  testId: string | null = null;
  private subscription: Subscription = new Subscription();

  // Units map (ObjectId -> name) for displaying unit names
  private unitsMap: { [id: string]: string } = {};

  // Alert properties
  showAlert = false;
  alertMessage = '';
  alertType: 'success' | 'error' = 'success';

  // Modal properties
  showNormalValueModal = false;
  selectedParameter: TestParameterDefinition | null = null;
  selectedParameterIndex: number = -1;

  constructor(
    private pathologyService: PathologyService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Check for route parameter first, then query parameter
    this.route.params.subscribe(params => {
      if (params['id']) {
        this.testId = params['id'];
        this.loadTestDefinition(true);
      }
    });

    // Fallback to query params for backward compatibility
    this.route.queryParams.subscribe(params => {
      if (params['id'] && !this.testId) {
        this.testId = params['id'];
        this.loadTestDefinition(true);
      }
    });

    // Whenever any test definition is created/updated elsewhere, refresh this view
    this.subscription.add(
      this.pathologyService.testDefinitionChanged$.subscribe(() => {
        if (this.testId) {
          this.loadTestDefinition(true);
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  loadTestDefinition(nocache: boolean = false): void {
    if (!this.testId) return;

    console.log('🔄 Loading test definition for ID:', this.testId, 'nocache:', nocache);

    // Load units first to build id->name map, then load the test definition
    this.subscription.add(
      this.pathologyService.getUnits().subscribe({
        next: (units) => {
          this.unitsMap = {};
          (units || []).forEach(u => this.unitsMap[u._id] = u.name);

          this.subscription.add(
            this.pathologyService.getTestDefinitionById(this.testId!, nocache).subscribe({
              next: (testDefinition) => {
                console.log('✅ Loaded test definition:', testDefinition);
                this.testDefinition = testDefinition;
                this.cdr.detectChanges();
              },
              error: (error) => {
                console.error('❌ Error loading test definition:', error);
                this.showAlertMessage('Error loading test definition. Please try again.', 'error');
                setTimeout(() => this.router.navigate(['/setup/pathology/test-database']), 3000);
              }
            })
          );
        },
        error: () => {
          // Even if units fail to load, proceed to load test definition
          this.subscription.add(
            this.pathologyService.getTestDefinitionById(this.testId!, nocache).subscribe({
              next: (testDefinition) => {
                this.testDefinition = testDefinition;
                this.cdr.detectChanges();
              },
              error: (error) => {
                console.error('❌ Error loading test definition:', error);
                this.showAlertMessage('Error loading test definition. Please try again.', 'error');
                setTimeout(() => this.router.navigate(['/setup/pathology/test-database']), 3000);
              }
            })
          );
        }
      })
    );
  }

  editTest(): void {
    if (this.testDefinition?._id) {
      this.router.navigate(['/setup/pathology/test-entry'], {
        queryParams: { id: this.testDefinition._id, mode: 'edit' }
      });
    }
  }

  editNormalValues(parameter: TestParameterDefinition, index: number): void {
    this.selectedParameter = parameter;
    this.selectedParameterIndex = index;
    this.showNormalValueModal = true;
  }

  closeNormalValueModal(): void {
    this.showNormalValueModal = false;
    this.selectedParameter = null;
    this.selectedParameterIndex = -1;
  }

  saveNormalValues(normalValues: NormalValue[]): void {
    console.log('🔄 Test Detail - saveNormalValues called');
    console.log('📥 Received normalValues:', normalValues);
    console.log('🎯 Selected parameter:', this.selectedParameter);
    console.log('📊 Selected parameter index:', this.selectedParameterIndex);
    console.log('🔍 Test type:', this.testDefinition?.testType);

    if (this.selectedParameter && this.testDefinition) {
      let updateData: any;
      // Ensure IDs are sent for relations to satisfy backend expectations
      const toId = (val: any) => (val && typeof val === 'object') ? (val._id || (val.id ?? val)) : val;
      const toIdArray = (arr: any) => Array.isArray(arr) ? arr.map((x: any) => toId(x)) : toId(arr);

      const shortNameId = toId(this.testDefinition.shortName);
      const categoryId = toId(this.testDefinition.category);
      const sampleTypeIds = toIdArray(this.testDefinition.sampleType);

      const unitVal: any = (typeof this.testDefinition.unit === 'object')
        ? (this.testDefinition.unit as any)?.name
        : this.testDefinition.unit;


      if (this.testDefinition.testType === 'single' || this.selectedParameterIndex === -1) {
        // For single parameter tests, save normalValues at root level
        console.log('📝 Updating single parameter test - saving normalValues at root level');

        updateData = {
          name: this.testDefinition.name,
          shortName: shortNameId,
          category: categoryId,
          sampleType: sampleTypeIds,
          testType: this.testDefinition.testType,
          unit: unitVal,
          inputType: this.testDefinition.inputType,
          method: this.testDefinition.method,
          instrument: this.testDefinition.instrument,
          normalValues: normalValues, // Save at root level for single parameter
          // Do not send 'parameters' at all for single-parameter tests to avoid schema cast issues
          isActive: this.testDefinition.isActive
        };

        // Update local testDefinition to reflect the change
        this.testDefinition.normalValues = normalValues;

      } else if (this.selectedParameterIndex >= 0) {
        // For multiple/nested parameter tests, save normalValues in parameters array
        console.log('📝 Updating multiple/nested parameter test - saving normalValues in parameters array');

        const updatedParameter = {
          ...this.selectedParameter,
          normalValues: normalValues
        };

        // Update the parameter in the parameters array
        this.testDefinition.parameters[this.selectedParameterIndex] = updatedParameter;

        updateData = {
          name: this.testDefinition.name,
          shortName: shortNameId,
          category: categoryId,
          sampleType: sampleTypeIds,
          testType: this.testDefinition.testType,
          parameters: this.testDefinition.parameters,
          method: this.testDefinition.method,
          instrument: this.testDefinition.instrument,
          isActive: this.testDefinition.isActive
        };
      } else {
        console.log('❌ Invalid parameter index for multiple/nested test');
        return;
      }

      console.log('📤 Sending update data to backend:', updateData);

      // Update the test definition in the database
      this.subscription.add(
        this.pathologyService.updateTestDefinition(this.testDefinition._id!, updateData).subscribe({
          next: (response) => {
            console.log('✅ Backend update successful:', response);
            // Refresh the test definition to get the latest data (force no-cache)
            this.loadTestDefinition(true);
            this.showAlertMessage('Normal values updated successfully', 'success');
            this.closeNormalValueModal();
          },
          error: (error) => {
            console.error('❌ Error updating normal values:', error);
            this.showAlertMessage('Error updating normal values', 'error');
          }
        })
      );
    } else {
      console.log('❌ Missing required data for save operation');
      console.log('selectedParameter:', this.selectedParameter);
      console.log('testDefinition:', this.testDefinition);
      console.log('selectedParameterIndex:', this.selectedParameterIndex);
    }
  }

  goBack(): void {
    this.router.navigate(['/setup/pathology/test-database']);
  }

  goBackToCategory(): void {
    const categoryName = this.getCategoryName();
    if (categoryName && categoryName !== 'Unknown') {
      // Navigate to test-database with category filter applied
      this.router.navigate(['/setup/pathology/test-database'], {
        queryParams: { category: categoryName }
      });
    } else {
      // Fallback to general test-database if no category
      this.goBack();
    }
  }

  createSimilarTest(): void {
    if (this.testDefinition) {
      this.router.navigate(['/setup/pathology/test-entry'], {
        queryParams: { copyFrom: this.testDefinition._id }
      });
    }
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

  getCategoryName(): string {
    if (!this.testDefinition) return '';

    if (typeof this.testDefinition.category === 'object' && this.testDefinition.category?.name) {
      return this.testDefinition.category.name;
    }
    return typeof this.testDefinition.category === 'string' ? this.testDefinition.category : 'Unknown';
  }

  getShortName(): string {
    if (!this.testDefinition) return '';

    if (typeof this.testDefinition.shortName === 'object' && this.testDefinition.shortName?.testName) {
      return this.testDefinition.shortName.testName;
    }
    return typeof this.testDefinition.shortName === 'string' ? this.testDefinition.shortName : 'N/A';
  }



  getParameterDisplayName(parameter: TestParameterDefinition): string {
    return parameter.name;
  }

  getParameterUnit(parameter: any): string {
    const raw: any = parameter?.unit;
    if (!raw) return '';
    if (typeof raw === 'object' && raw.name) return raw.name;
    if (typeof raw === 'string' && /^[a-f0-9]{24}$/i.test(raw) && this.unitsMap[raw]) return this.unitsMap[raw];
    return typeof raw === 'string' ? raw : '';
  }

  getSingleParameterUnit(): string {
    const rawMain: any = this.testDefinition?.unit;
    const rawParam: any = (this.testDefinition?.parameters && this.testDefinition.parameters.length > 0)
      ? this.testDefinition.parameters[0].unit
      : '';
    const raw: any = rawMain || rawParam || '';
    if (!raw) return '';
    if (typeof raw === 'object' && raw.name) return raw.name;
    if (typeof raw === 'string' && /^[a-f0-9]{24}$/i.test(raw) && this.unitsMap[raw]) return this.unitsMap[raw];
    return typeof raw === 'string' ? raw : '';
  }

  editSingleParameterNormalValues(): void {
    // For single parameter tests, create a parameter object using root level normalValues
    const parameter: TestParameterDefinition = {
      order: 1,
      name: this.testDefinition?.name || 'Parameter',
      unit: this.getSingleParameterUnit(),
      inputType: this.testDefinition?.inputType || 'Numeric',
      isOptional: false,
      normalValues: this.testDefinition?.normalValues || [] // Use root level normalValues
    };

    // Use index -1 to indicate this is a single parameter test (special case)
    this.editNormalValues(parameter, -1);
  }

  editParameterNormalValues(parameter: TestParameterDefinition): void {
    // For multiple/nested parameter tests, use the parameter's own normalValues
    const parameterIndex = this.testDefinition?.parameters?.findIndex(p => p.order === parameter.order) ?? -1;
    this.editNormalValues(parameter, parameterIndex);
  }

  isParameterOptional(parameter: TestParameterDefinition): boolean {
    return parameter.isOptional;
  }

  hasNormalValues(parameter: TestParameterDefinition): boolean {
    return !!(parameter.normalValues && parameter.normalValues.length > 0);
  }

  getNormalValuesCount(parameter: TestParameterDefinition): number {
    return parameter.normalValues ? parameter.normalValues.length : 0;
  }

  getSortedParameters(): TestParameterDefinition[] {
    if (!this.testDefinition || !this.testDefinition.parameters) {
      return [];
    }
    // Hide parameters marked as removed; apply only on detail page after save/update
    return [...this.testDefinition.parameters]
      .filter(p => !p.removed)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  // Drag & drop reordering for Multiple parameters
  onRowDragStart(event: DragEvent, parameter: TestParameterDefinition): void {
    event.dataTransfer?.setData('text/plain', String(parameter.order));
  }

  onRowDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  onRowDrop(event: DragEvent, targetParameter: TestParameterDefinition): void {
    event.preventDefault();
    if (!this.testDefinition || !this.testDefinition.parameters) return;

    const sourceOrderStr = event.dataTransfer?.getData('text/plain') || '';
    const sourceOrder = parseInt(sourceOrderStr, 10);
    if (isNaN(sourceOrder)) return;

    const params = this.testDefinition.parameters;
    const fromIndex = params.findIndex(p => p.order === sourceOrder);
    const toIndex = params.findIndex(p => p.order === targetParameter.order);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;

    const [moved] = params.splice(fromIndex, 1);
    params.splice(toIndex, 0, moved);

    // Recalculate order values to match new positions (1-based)
    params.forEach((p, idx) => (p.order = idx + 1));

    this.persistReorderedParameters();
  }

  private persistReorderedParameters(): void {
    if (!this.testDefinition) return;

    // Ensure IDs are sent for relations
    const toId = (val: any) => (val && typeof val === 'object') ? (val._id || (val.id ?? val)) : val;
    const toIdArray = (arr: any) => Array.isArray(arr) ? arr.map((x: any) => toId(x)) : toId(arr);

    const updateData: Partial<TestDefinition> = {
      name: this.testDefinition.name,
      shortName: toId(this.testDefinition.shortName),
      category: toId(this.testDefinition.category),
      sampleType: toIdArray(this.testDefinition.sampleType),
      testType: this.testDefinition.testType,
      parameters: this.testDefinition.parameters,
      method: this.testDefinition.method,
      instrument: this.testDefinition.instrument,
      isActive: this.testDefinition.isActive
    };

    this.subscription.add(
      this.pathologyService.updateTestDefinition(this.testDefinition._id!, updateData).subscribe({
        next: () => {
          this.cdr.detectChanges();
          this.showAlertMessage('Order updated successfully', 'success');
          // Reload fresh after order update to reflect backend state exactly
          this.loadTestDefinition(true);
        },
        error: (error) => {
          console.error('❌ Error updating order:', error);
          this.showAlertMessage('Error updating order', 'error');
        }
      })
    );
  }

  getGroupedParameters(): { groupName: string; parameters: TestParameterDefinition[] }[] {
    if (!this.testDefinition || !this.testDefinition.parameters) {
      return [];
    }

    // Merge groups by normalized name (trim + case-insensitive)
    const buckets: { [norm: string]: { display: string; items: TestParameterDefinition[] } } = {};

    this.testDefinition.parameters.forEach(parameter => {
      if (parameter.removed) {
        return; // Skip removed parameters
      }
      const raw = (parameter.groupBy || 'Other') + '';
      const norm = raw.trim().toLowerCase();
      // Preserve the first encountered casing for display
      if (!buckets[norm]) {
        buckets[norm] = { display: raw.trim() || 'Other', items: [] };
      }
      buckets[norm].items.push(parameter);
    });

    return Object.keys(buckets).map(norm => ({
      groupName: buckets[norm].display,
      parameters: buckets[norm].items.sort((a, b) => (a.order || 0) - (b.order || 0))
    }));
  }

  getParameterIndex(parameter: TestParameterDefinition): number {
    if (!this.testDefinition || !this.testDefinition.parameters) {
      return -1;
    }
    return this.testDefinition.parameters.findIndex(p => p.order === parameter.order);
  }
}

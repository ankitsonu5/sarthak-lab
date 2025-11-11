import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { CdkDropList, CdkDragDrop, CdkDrag, moveItemInArray } from '@angular/cdk/drag-drop';
import { PathologyService, TestDefinition } from '../../services/pathology.service';

@Component({
  selector: 'app-test-panel-view',
  standalone: true,
  imports: [CommonModule, CdkDropList, CdkDrag],
  templateUrl: './test-panel-view.component.html',
  styleUrls: ['./test-panel-view.component.css']
})
export class TestPanelViewComponent implements OnInit {
  panel: TestDefinition | null = null;
  panelId: string | null = null;
  tests: Array<{ _id?: string; name: string }> = [];
  savingOrder = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private pathologyService: PathologyService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.panelId = this.route.snapshot.paramMap.get('id');
    if (this.panelId) this.loadPanel(this.panelId);
  }

  private loadPanel(id: string): void {
    this.pathologyService.getTestDefinitionById(id, true).subscribe({
      next: (def: TestDefinition) => {
        this.panel = def;
        // Normalize tests array to names
        const raw = (def as any)?.tests || [];
        this.tests = Array.isArray(raw)
          ? raw.map((t: any) => ({ _id: typeof t === 'object' ? t._id : undefined, name: typeof t === 'object' ? (t.name || t.testName || '') : String(t) }))
          : [];
        this.cdr.detectChanges();
      },
      error: () => {
        this.panel = null;
        this.tests = [];
        this.cdr.detectChanges();
      }
    });
  }

  goBack(): void {
    this.router.navigate(['/setup/pathology/test-panels']);
  }

  editPanel(): void {
    if (this.panelId) this.router.navigate(['/setup/pathology/test-panels', this.panelId, 'edit']);
  }

  getCategoryName(): string {
    const cat: any = this.panel?.category;
    return typeof cat === 'object' ? (cat?.name || '') : (cat || '');
  }

  // Drag & Drop reorder handlers (reference: test-detail ordering)
  onDrop(event: CdkDragDrop<any[]>): void {
    if (!this.panel || !Array.isArray(this.tests)) return;

    // Only reorder if position actually changed
    if (event.previousIndex !== event.currentIndex) {
      console.log(`🔄 Reordering test from position ${event.previousIndex + 1} to ${event.currentIndex + 1}`);
      moveItemInArray(this.tests, event.previousIndex, event.currentIndex);
      // Update order in panel.parameters-like structure: here we only persist order of 'tests' array
      this.persistOrder();
    }
  }

  private persistOrder(): void {
    if (!this.panel || this.savingOrder) return;
    this.savingOrder = true;

    const toId = (val: any) => (val && typeof val === 'object') ? (val._id || (val.id ?? val)) : val;
    const toIdArray = (arr: any[]) => (arr || []).map(x => toId(x));

    const payload: Partial<TestDefinition> = {
      name: this.panel.name,
      shortName: toId(this.panel.shortName) as any,
      category: toId(this.panel.category) as any,
      sampleType: toIdArray(this.panel.sampleType as any),
      testType: this.panel.testType,
      tests: this.tests.map(t => toId((t as any)._id || t)) as any,
      isActive: this.panel.isActive
    } as any;

    this.pathologyService.updateTestDefinition(this.panel._id!, payload).subscribe({
      next: () => { this.savingOrder = false; this.cdr.detectChanges(); },
      error: () => { this.savingOrder = false; }
    });
  }
}


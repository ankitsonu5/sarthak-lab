import { Component, OnInit, OnDestroy, ChangeDetectorRef, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { PathologyService, TestDefinition } from '../services/pathology.service';
import { DeleteConfirmationModalComponent } from '../../../shared/components/delete-confirmation-modal/delete-confirmation-modal.component';
import { DeleteSuccessModalComponent } from '../../../shared/components/delete-success-modal/delete-success-modal.component';

interface PanelRow {
  _id: string;
  name: string;
  category: string;
  tests: string[]; // included test names
}

@Component({
  selector: 'app-test-panels',
  standalone: true,
  imports: [CommonModule, DeleteConfirmationModalComponent, DeleteSuccessModalComponent],
  templateUrl: './test-panels.component.html',
  styleUrls: ['./test-panels.component.css'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class TestPanelsComponent implements OnInit, OnDestroy {
  panels: PanelRow[] = [];
  allPanels: PanelRow[] = [];
  isLoading = true;

  // Filters
  searchTerm = '';
  selectedCategory = 'All';
  categories: string[] = [];

  // delete modal state
  showDeleteConfirmation = false;
  showDeleteSuccess = false;
  deleteMessage = 'Are you sure you want to delete this test panel?';
  deleteSuccessTitle = 'Panel Deleted';
  private pendingDeleteId: string | null = null;

  private routerSub?: any;

  constructor(private router: Router, private cdr: ChangeDetectorRef, private pathologyService: PathologyService) {}

  ngOnInit(): void {
    this.loadPanels();
    // Auto-refresh when navigating back to this route
    this.routerSub = this.router.events.subscribe((evt) => {
      if (evt instanceof NavigationEnd) {
        const url = (evt.urlAfterRedirects || evt.url || '').toString();
        if (url.includes('/setup/pathology/test-panels')) {
          this.loadPanels();
        }
      }
    });
  }

  private loadPanels(): void {
    this.isLoading = true;
    this.pathologyService.getTestDefinitions(true).subscribe({
      next: (defs: TestDefinition[]) => {
        // Filter only panel type and map to table rows
        const panels = (defs || []).filter(d => d.testType === 'panel');
        const mapped = panels.map(p => ({
          _id: p._id!,
          name: p.name,
          category: typeof p.category === 'object' ? (p.category as any).name : (p.category as any),
          tests: Array.isArray((p as any).tests)
            ? ((p as any).tests as any[]).map(t => (typeof t === 'object' ? (t as any).name : String(t)))
            : []
        }));
        this.allPanels = mapped;
        this.categories = Array.from(new Set(mapped.map(m => m.category))).sort();
        this.applyFilters();
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.panels = [];
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  addNew(): void {
    this.router.navigate(['/setup/pathology/test-panels/new']);
  }

  viewPanel(panel: PanelRow): void {
    this.router.navigate(['/setup/pathology/test-panels', panel._id, 'view']);
  }

  editPanel(panel: PanelRow): void {
    this.router.navigate(['/setup/pathology/test-panels', panel._id, 'edit']);
  }

  // Delete actions
  promptDelete(panel: PanelRow): void {
    this.pendingDeleteId = panel._id;
    this.deleteMessage = `Are you sure you want to delete panel "${panel.name}"?`;
    this.showDeleteConfirmation = true;
  }

  confirmDelete(): void {
    const id = this.pendingDeleteId;
    this.showDeleteConfirmation = false;
    if (!id) return;
    this.pathologyService.deleteTestDefinition(id).subscribe({
      next: () => {
        this.showDeleteSuccess = true;
        // remove locally for instant feedback
        this.allPanels = this.allPanels.filter(p => p._id !== id);
        this.applyFilters();
        this.cdr.detectChanges();
      },
      error: () => {
        // Silent fail to avoid intrusive alerts; reload list
        this.loadPanels();
      }
    });
  }

  // Filters logic
  applyFilters(): void {
    let filtered = [...this.allPanels];
    if (this.selectedCategory && this.selectedCategory !== 'All') {
      filtered = filtered.filter(p => (p.category || '').toLowerCase() === this.selectedCategory.toLowerCase());
    }
    if (this.searchTerm.trim()) {
      const s = this.searchTerm.toLowerCase();
      filtered = filtered.filter(p => {
        const inName = (p.name || '').toLowerCase().includes(s);
        const inCategory = (p.category || '').toLowerCase().includes(s);
        const inTests = (p.tests || []).join(', ').toLowerCase().includes(s);
        return inName || inCategory || inTests;
      });
    }
    this.panels = filtered;
  }

  onSearchChange(event: any): void {
    this.searchTerm = (event?.target?.value || '').trim();
    this.applyFilters();
  }

  onCategoryChange(event: any): void {
    this.selectedCategory = (event?.target?.value || 'All');
    this.applyFilters();
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.selectedCategory = 'All';
    this.applyFilters();
  }

  cancelDelete(): void {
    this.showDeleteConfirmation = false;
    this.pendingDeleteId = null;
  }

  onDeleteSuccessClosed(): void {
    this.showDeleteSuccess = false;
    this.pendingDeleteId = null;
    // ensure data is in sync
    this.loadPanels();
  }

  ngOnDestroy(): void {
    if (this.routerSub) {
      this.routerSub.unsubscribe?.();
      this.routerSub = undefined;
    }
  }
}


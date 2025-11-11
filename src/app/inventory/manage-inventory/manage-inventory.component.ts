import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { InventoryService, InventoryItem, InventoryBatch } from '../services/inventory.service';

@Component({
  selector: 'app-manage-inventory',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, DatePipe],
  templateUrl: './manage-inventory.component.html',
  styleUrls: ['./manage-inventory.component.css']
})
export class ManageInventoryComponent implements OnInit {
  items: InventoryItem[] = [];
  search = '';
  selectedItem: InventoryItem | null = null;

  itemForm: FormGroup;
  batchForm: FormGroup;
  batches: InventoryBatch[] = [];

  isLoading = false;

  constructor(private fb: FormBuilder, private inv: InventoryService) {
    this.itemForm = this.fb.group({
      name: ['', Validators.required],
      type: ['Reagent', Validators.required],
      unit: [''],
      minStock: [0, [Validators.min(0)]],
      category: [''],
      description: ['']
    });

    this.batchForm = this.fb.group({
      batchNo: [''],
      lotNo: [''],
      quantity: [0, [Validators.required, Validators.min(0)]],
      expiryDate: [''],
      supplierName: ['']
    });
  }

  ngOnInit(): void {
    this.loadItems();
  }

  loadItems(): void {
    this.isLoading = true;
    this.inv.getItems({ search: this.search }).subscribe({
      next: (res) => { this.items = res.items || []; this.isLoading = false; },
      error: () => { this.isLoading = false; }
    });
  }

  createItem(): void {
    if (this.itemForm.invalid) return;
    this.inv.createItem(this.itemForm.value).subscribe({
      next: () => { this.itemForm.reset({ type: 'Reagent', minStock: 0 }); this.loadItems(); },
      error: () => {}
    });
  }

  selectItem(item: InventoryItem): void {
    this.selectedItem = item;
    this.batchForm.reset({ quantity: 0 });
    this.loadBatches();
  }

  loadBatches(): void {
    if (!this.selectedItem?._id) { this.batches = []; return; }
    this.inv.getBatches(this.selectedItem._id).subscribe({
      next: (res) => { this.batches = res.batches || []; },
      error: () => {}
    });
  }

  addBatch(): void {
    if (!this.selectedItem?._id) return;
    if (this.batchForm.invalid) return;
    const payload = { ...this.batchForm.value } as any;
    if (payload.expiryDate) payload.expiryDate = new Date(payload.expiryDate).toISOString();

    this.inv.addBatch(this.selectedItem._id, payload).subscribe({
      next: () => { this.batchForm.reset({ quantity: 0 }); this.loadItems(); this.loadBatches(); },
      error: () => {}
    });
  }
}


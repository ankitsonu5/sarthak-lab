import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InventoryService, InventoryBatch, InventoryItem } from '../services/inventory.service';

@Component({
  selector: 'app-track-stock-expiry',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './track-stock-expiry.component.html',
  styleUrls: ['./track-stock-expiry.component.css']
})
export class TrackStockExpiryComponent implements OnInit {
  lowStockItems: InventoryItem[] = [];
  expiringBatches: InventoryBatch[] = [];

  days = 30;
  threshold: number | null = null;

  isLoading = false;

  constructor(private inv: InventoryService) {}

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.isLoading = true;

    // Load low stock
    this.inv.lowStock(this.threshold ?? undefined).subscribe({
      next: res => { this.lowStockItems = res.items || []; },
      error: () => {}
    });

    // Load expiring soon
    this.inv.expiringSoon(this.days).subscribe({
      next: res => { this.expiringBatches = res.batches || []; this.isLoading = false; },
      error: () => { this.isLoading = false; }
    });
  }
}


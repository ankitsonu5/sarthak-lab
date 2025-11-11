import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface InventoryItem {
  _id?: string;
  name: string;
  type: 'Equipment' | 'Reagent';
  category?: string;
  unit?: string;
  minStock?: number;
  description?: string;
  isActive?: boolean;
  stock?: number;
  nextExpiry?: string | null;
}

export interface InventoryBatch {
  _id?: string;
  item: string | InventoryItem;
  batchNo?: string;
  lotNo?: string;
  quantity: number;
  remainingQuantity: number;
  unitCost?: number;
  supplierName?: string;
  receivedDate?: string;
  expiryDate?: string | null;
  notes?: string;
}

@Injectable({ providedIn: 'root' })
export class InventoryService {
  private baseUrl = `${environment.apiUrl}/inventory`;

  constructor(private http: HttpClient) {}

  getItems(params?: { search?: string; type?: string; active?: 'true'|'false'|'all' }): Observable<{ success: boolean; items: InventoryItem[] }> {
    let p = new HttpParams();
    if (params?.search) p = p.set('search', params.search);
    if (params?.type) p = p.set('type', params.type);
    if (params?.active) p = p.set('active', params.active);
    return this.http.get<{ success: boolean; items: InventoryItem[] }>(`${this.baseUrl}/items`, { params: p });
  }

  createItem(data: Partial<InventoryItem>): Observable<{ success: boolean; item: InventoryItem }> {
    return this.http.post<{ success: boolean; item: InventoryItem }>(`${this.baseUrl}/items`, data);
  }

  updateItem(id: string, data: Partial<InventoryItem>): Observable<{ success: boolean; item: InventoryItem }> {
    return this.http.put<{ success: boolean; item: InventoryItem }>(`${this.baseUrl}/items/${id}`, data);
  }

  addBatch(itemId: string, data: Partial<InventoryBatch>): Observable<{ success: boolean; batch: InventoryBatch }> {
    return this.http.post<{ success: boolean; batch: InventoryBatch }>(`${this.baseUrl}/items/${itemId}/batches`, data);
  }

  getBatches(itemId: string): Observable<{ success: boolean; batches: InventoryBatch[] }> {
    return this.http.get<{ success: boolean; batches: InventoryBatch[] }>(`${this.baseUrl}/items/${itemId}/batches`);
  }

  consume(itemId: string, quantity: number, batchId?: string): Observable<{ success: boolean; used: number; partial: boolean; details: any[] }> {
    return this.http.post<{ success: boolean; used: number; partial: boolean; details: any[] }>(`${this.baseUrl}/consume`, { itemId, quantity, batchId });
  }

  lowStock(threshold?: number): Observable<{ success: boolean; items: InventoryItem[] }> {
    let p = new HttpParams();
    if (typeof threshold === 'number') p = p.set('threshold', String(threshold));
    return this.http.get<{ success: boolean; items: InventoryItem[] }>(`${this.baseUrl}/low-stock`, { params: p });
  }

  expiringSoon(days: number = 30): Observable<{ success: boolean; batches: InventoryBatch[] }> {
    const p = new HttpParams().set('days', String(days));
    return this.http.get<{ success: boolean; batches: InventoryBatch[] }>(`${this.baseUrl}/expiring-soon`, { params: p });
  }
}


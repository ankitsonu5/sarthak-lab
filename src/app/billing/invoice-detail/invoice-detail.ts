import { Component, OnInit, Input, ChangeDetectorRef, OnChanges, SimpleChanges } from '@angular/core';

interface PatientInfo {
  patientId: string;
  name: string;
  phone: string;
  gender: string;
  age: number;
  address: string;
}

interface TestItem {
  name: string;
  category: string;
  price: number;
  quantity: number;
  discount: number;
  netAmount: number;
}

interface InvoiceData {
  invoiceNumber: string;
  bookingId: string;
  bookingDate: Date;
  patient: PatientInfo;
  doctor?: {
    name: string;
    specialization: string;
  };
  tests: TestItem[];
  payment: {
    totalAmount: number;
    paidAmount: number;
    dueAmount: number;
    paymentStatus: string;
    paymentMethod: string;
  };
  labInfo: {
    name: string;
    address: string;
    phone: string;
  };
  // OPD/IPD mode
  mode?: string;
}

@Component({
  selector: 'app-invoice-detail',
  standalone: false,
  templateUrl: './invoice-detail.html',
  styleUrl: './invoice-detail.css'
})
export class InvoiceDetail implements OnInit, OnChanges {
  @Input() invoiceData: InvoiceData | null = null;
  @Input() bookingId: string = '';

  // No sample data - use only real data from pathology form

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    // Only use real data passed from pathology form
    this.computeGrouping();
    this.cdr.detectChanges();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['invoiceData']) {
      this.computeGrouping();
    }
  }

  groupedCategories: Array<{ category: string; tests: TestItem[]; total: number }> = [];

  private computeGrouping(): void {
    const tests = this.invoiceData?.tests || [];
    const mapByCat = new Map<string, TestItem[]>();
    for (const t of tests) {
      const key = (t.category || 'UNCATEGORIZED').toString();
      if (!mapByCat.has(key)) { mapByCat.set(key, []); }
      mapByCat.get(key)!.push(t);
    }
    this.groupedCategories = Array.from(mapByCat.entries()).map(([category, tests]) => ({
      category,
      tests,
      total: tests.reduce((sum, it) => sum + (Number(it.netAmount) || 0), 0)
    }));
  }

  printInvoice(): void {
    window.print();
  }

  formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('en-IN');
  }

  getReceiptNumber(): string {
    return this.invoiceData?.invoiceNumber?.replace('INV', '') || '10';
  }
}

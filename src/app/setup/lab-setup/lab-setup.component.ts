import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { LabSettingsService, LabSettings } from './lab-settings.service';

@Component({
  selector: 'app-lab-setup',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './lab-setup.component.html',
  styleUrls: ['./lab-setup.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LabSetupComponent implements OnInit {
  form!: FormGroup;
  saving = false;
  preview: LabSettings | null = null;
  statusMessage: string | null = null;
  statusError = false;

  constructor(
    private fb: FormBuilder,
    private api: LabSettingsService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      labName: [''], shortName: [''],
      addressLine1: [''], addressLine2: [''], city: [''], state: [''], pincode: [''],
      phone: [''], altPhone: [''], email: [''], website: [''],
      logoDataUrl: [''], sideLogoDataUrl: [''], signatureDataUrl: [''],
      headerNote: [''], footerNote: [''], reportDisclaimer: [''],
      prefixes: this.fb.group({ receipt: [''], report: [''], labYearlyPrefix: [''], labDailyPrefix: [''] }),
      numbering: this.fb.group({ receiptStart: [1], reportStart: [1], resetRule: ['yearly'] }),
      printLayout: this.fb.group({ template: ['classic'], showHeader: [true], showFooter: [true], showQr: [false], showRefDoctor: [true], showAmount: [true] })
    });

    this.api.getMyLab().subscribe({
      next: (res) => {
        if (res.lab) {
          this.form.patchValue(res.lab);
          this.updatePreview();
        }
        this.cdr.markForCheck();
      },
      error: () => { this.cdr.markForCheck(); }
    });


  }

  onFileChange(ev: Event, controlName: 'logoDataUrl' | 'sideLogoDataUrl' | 'signatureDataUrl') {
    const input = ev.target as HTMLInputElement;
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { this.form.get(controlName)?.setValue(reader.result as string); this.updatePreview(); this.cdr.markForCheck(); };
    reader.readAsDataURL(file);
  }

  updatePreview() {
    this.preview = this.form.value as LabSettings;
    this.cdr.markForCheck();
  }

  saveAndPreview() {
    this.saving = true;
    this.statusMessage = null;
    this.statusError = false;
    this.cdr.markForCheck();
    const payload = this.form.value as LabSettings;
    this.api.saveMyLab(payload).subscribe({
      next: (res) => {
        this.saving = false;
        if (res?.lab) {
          this.form.patchValue(res.lab);
          this.preview = res.lab;
        }
        this.statusMessage = 'Saved';
        this.statusError = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.saving = false;
        this.statusMessage = err?.error?.message || 'Save failed';
        this.statusError = true;
        this.cdr.markForCheck();
      }
    });
  }
}


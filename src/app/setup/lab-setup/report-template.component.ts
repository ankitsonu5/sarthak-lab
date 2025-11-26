import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { LabSettingsService, LabSettings } from './lab-settings.service';

@Component({
  selector: 'app-report-template',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './report-template.component.html',
  styleUrls: ['./lab-setup.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReportTemplateComponent implements OnInit {
  form!: FormGroup;
  saving = false;
  statusMessage: string | null = null;
  statusError = false;

  constructor(
    private fb: FormBuilder,
    private api: LabSettingsService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      reportTemplate: ['classic']
    });

    // Load existing settings
    this.api.getMyLab().subscribe({
      next: (res) => {
        if (res.lab && res.lab.reportTemplate) {
          this.form.patchValue({ reportTemplate: res.lab.reportTemplate });
        }
        this.cdr.markForCheck();
      },
      error: () => { this.cdr.markForCheck(); }
    });
  }

  saveTemplate() {
    this.saving = true;
    this.statusMessage = null;
    this.statusError = false;
    this.cdr.markForCheck();

    const payload = { reportTemplate: this.form.value.reportTemplate } as Partial<LabSettings>;
    
    this.api.saveMyLab(payload as LabSettings).subscribe({
      next: (res) => {
        this.saving = false;
        if (res?.lab) {
          this.form.patchValue({ reportTemplate: res.lab.reportTemplate });
        }
        this.statusMessage = 'Template saved successfully!';
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


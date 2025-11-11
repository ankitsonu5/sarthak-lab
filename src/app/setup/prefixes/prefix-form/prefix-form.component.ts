import { Component, OnInit, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, FormGroup } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { PrefixService, Prefix } from '../services/prefix.service';

@Component({
  selector: 'app-prefix-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './prefix-form.component.html',
  styleUrls: ['./prefix-form.component.css'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class PrefixFormComponent implements OnInit {
  form!: FormGroup;
  id: string | null = null;
  isEdit = false;
  error = '';

  constructor(private fb: FormBuilder, private service: PrefixService, private route: ActivatedRoute, private router: Router) {
    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      gender: ['Female', Validators.required],
      isActive: [true]
    });
  }

  ngOnInit(): void {
    this.id = this.route.snapshot.paramMap.get('id');
    this.isEdit = !!this.id;
    if (this.isEdit && this.id) {
      // Reuse list API to fetch and find item
      this.service.getPrefixes(1, 1000).subscribe({
        next: (res) => {
          const found = (res.prefixes || []).find(p => p._id === this.id);
          if (found) this.form.patchValue(found);
        }
      });
    }
  }

  save(): void {
    if (this.form.invalid) return;
    const payload: Partial<Prefix> = this.form.getRawValue() as any;
    const req = this.isEdit && this.id ? this.service.updatePrefix(this.id, payload) : this.service.createPrefix(payload);
    req.subscribe({
      next: () => this.router.navigate(['/setup/prefixes/list']),
      error: (e) => this.error = e?.error?.message || 'Save failed'
    });
  }
}


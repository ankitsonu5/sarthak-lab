import { Component, OnInit, ChangeDetectorRef, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { PrefixService, Prefix } from '../services/prefix.service';

@Component({
  selector: 'app-prefix-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './prefix-list.component.html',
  styleUrls: ['./prefix-list.component.css'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class PrefixListComponent implements OnInit {
  prefixes: Prefix[] = [];
  isLoading = false;
  error = '';

  constructor(private service: PrefixService, private router: Router, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.isLoading = true;
    this.error = '';
    this.service.getPrefixes(1, 200).subscribe({
      next: (res) => { this.prefixes = res.prefixes || []; this.isLoading = false; this.cdr.detectChanges(); },
      error: (e) => { this.error = 'Failed to load prefixes'; this.isLoading = false; }
    });
  }

  addNew(): void { this.router.navigate(['/setup/prefixes/new']); }
  edit(p: Prefix): void { if (p._id) this.router.navigate(['/setup/prefixes/edit', p._id]); }
  delete(p: Prefix): void {
    if (!p._id || !confirm(`Delete prefix "${p.name}"?`)) return;
    this.service.deletePrefix(p._id).subscribe({ next: () => this.load() });
  }
}


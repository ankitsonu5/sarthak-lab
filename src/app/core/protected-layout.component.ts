import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Sidebar } from './sidebar/sidebar';
import { Footer } from './footer/footer';

@Component({
  selector: 'app-protected-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, Sidebar, Footer],
  templateUrl: './protected-layout.component.html',
  styleUrls: ['./protected-layout.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush // PERFORMANCE FIX: OnPush for main layout
})
export class ProtectedLayoutComponent {}

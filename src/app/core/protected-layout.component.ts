import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Sidebar } from './sidebar/sidebar';
import { Footer } from './footer/footer';
import { CoreModule } from './core-module';

@Component({
  selector: 'app-protected-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, Sidebar, Footer, CoreModule],
  templateUrl: './protected-layout.component.html',
  styleUrls: ['./protected-layout.component.css']
  // NOTE: Removed OnPush to allow child components (Dashboard, etc.) to update automatically
  // when async data arrives. OnPush was blocking change detection propagation.
})
export class ProtectedLayoutComponent {}

import { Component } from '@angular/core';

@Component({
  selector: 'app-test-dashboard',
  standalone: true,
  template: `
    <div style="background: red; color: white; padding: 50px; margin: 20px; text-align: center;">
      <h1>🚨 TEST DASHBOARD COMPONENT LOADED! 🚨</h1>
      <h2>If you can see this, routing is working!</h2>
      <p>Current URL: {{ getCurrentUrl() }}</p>
      <p>Time: {{ getCurrentTime() }}</p>
    </div>
  `
})
export class TestDashboardComponent {
  getCurrentUrl(): string {
    return window.location.href;
  }
  
  getCurrentTime(): string {
    return new Date().toLocaleTimeString();
  }
}

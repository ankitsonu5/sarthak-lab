import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-test-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div style="padding: 2rem;">
      <h1>🧪 Test Page</h1>
      <p>This is a test page to verify routing is working.</p>
      <p>Current route: {{ getCurrentRoute() }}</p>
      <div style="margin-top: 2rem;">
        <h3>Available Routes:</h3>
        <ul>
          <li>/reception/patient-registration</li>
          <li>/reception/search-patient</li>
          <li>/cash-receipt/register-opt-ipd</li>
        </ul>
      </div>
    </div>
  `
})
export class TestPageComponent {
  getCurrentRoute() {
    return window.location.pathname;
  }
}

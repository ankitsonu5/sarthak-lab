import { Injectable } from '@angular/core';

/**
 * Default Lab Configuration Service
 * Provides default values when lab setup is not configured
 */
@Injectable({
  providedIn: 'root'
})
export class DefaultLabConfigService {
  
  // Default Lab Information (when not configured)
  private readonly DEFAULT_LAB_NAME = 'Lab Book Pathology';
  private readonly DEFAULT_LAB_ADDRESS = 'Advanced Diagnostic & Pathology Services';
  private readonly DEFAULT_LOGO_SVG = `data:image/svg+xml;base64,${btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
      <defs>
        <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
        </linearGradient>
      </defs>
      <!-- Microscope Base -->
      <rect x="60" y="160" width="80" height="8" fill="#333" rx="2"/>
      <!-- Microscope Stand -->
      <rect x="95" y="120" width="10" height="40" fill="#555"/>
      <!-- Microscope Body -->
      <ellipse cx="100" cy="110" rx="25" ry="30" fill="url(#grad1)"/>
      <!-- Microscope Lens -->
      <circle cx="100" cy="95" r="12" fill="#fff" opacity="0.8"/>
      <circle cx="100" cy="95" r="8" fill="#667eea"/>
      <!-- Microscope Eyepiece -->
      <rect x="85" y="70" width="30" height="15" fill="#764ba2" rx="3"/>
      <circle cx="100" cy="70" r="6" fill="#fff" opacity="0.6"/>
      <!-- Objective Lenses -->
      <rect x="88" y="135" width="8" height="12" fill="#667eea" rx="2"/>
      <rect x="104" y="135" width="8" height="12" fill="#667eea" rx="2"/>
      <!-- Stage -->
      <rect x="75" y="125" width="50" height="4" fill="#555" rx="1"/>
      <!-- Adjustment Knobs -->
      <circle cx="125" cy="110" r="5" fill="#764ba2"/>
      <circle cx="75" cy="110" r="5" fill="#764ba2"/>
      <!-- Light Source -->
      <circle cx="100" cy="155" r="6" fill="#ffd700"/>
      <circle cx="100" cy="155" r="3" fill="#fff" opacity="0.8"/>
    </svg>
  `)}`;

  constructor() {}

  /**
   * Get lab name - returns custom if available, otherwise default
   */
  getLabName(customLabName?: string): string {
    return customLabName?.trim() || this.DEFAULT_LAB_NAME;
  }

  /**
   * Get lab address - returns custom if available, otherwise default
   */
  getLabAddress(customAddress?: string): string {
    return customAddress?.trim() || this.DEFAULT_LAB_ADDRESS;
  }

  /**
   * Get lab logo - returns custom if available, otherwise default microscope SVG
   */
  getLabLogo(customLogoUrl?: string): string {
    return customLogoUrl?.trim() || this.DEFAULT_LOGO_SVG;
  }

  /**
   * Get full lab info object with defaults
   */
  getLabInfo(labSettings?: any): { name: string; address: string; logoUrl: string } {
    return {
      name: this.getLabName(labSettings?.labName),
      address: this.getLabAddress(
        labSettings?.addressLine1 
          ? [labSettings.addressLine1, labSettings.addressLine2, labSettings.city, labSettings.state, labSettings.pincode]
              .filter(Boolean)
              .join(', ')
          : undefined
      ),
      logoUrl: this.getLabLogo(labSettings?.logoDataUrl)
    };
  }

  /**
   * Check if lab is configured (has custom settings)
   */
  isLabConfigured(labSettings?: any): boolean {
    return !!(labSettings?.labName?.trim());
  }

  /**
   * Get default values
   */
  getDefaults() {
    return {
      labName: this.DEFAULT_LAB_NAME,
      address: this.DEFAULT_LAB_ADDRESS,
      logoSvg: this.DEFAULT_LOGO_SVG
    };
  }
}


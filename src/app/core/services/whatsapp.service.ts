import { Injectable } from '@angular/core';

export interface WhatsAppShareOptions {
  phoneNumber: string;
  message: string;
  fileBlob?: Blob;
  fileName?: string;
}

@Injectable({
  providedIn: 'root'
})
export class WhatsAppService {

  constructor() { }

  /**
   * Validate WhatsApp phone number format
   * @param phoneNumber Phone number to validate
   * @returns boolean indicating if number is valid
   */
  validatePhoneNumber(phoneNumber: string): boolean {
    // Remove all spaces and special characters except +
    const cleanNumber = phoneNumber.replace(/[^\d+]/g, '');
    
    // Check if it's a valid international format
    const phoneRegex = /^\+\d{1,3}\d{10,15}$/;
    return phoneRegex.test(cleanNumber);
  }

  /**
   * Format phone number for WhatsApp API
   * @param phoneNumber Raw phone number
   * @returns Formatted phone number without + sign
   */
  formatPhoneNumber(phoneNumber: string): string {
    // Remove all non-digits
    let cleanNumber = phoneNumber.replace(/[^\d]/g, '');

    // Ensure it starts with country code (91 for India)
    if (!cleanNumber.startsWith('91') && cleanNumber.length === 10) {
      cleanNumber = '91' + cleanNumber;
    }

    console.log('📱 Formatted phone number:', cleanNumber);
    return cleanNumber;
  }

  /**
   * Share text message via WhatsApp Web
   * @param options WhatsApp sharing options
   */
  shareTextMessage(options: WhatsAppShareOptions): void {
    if (!this.validatePhoneNumber(options.phoneNumber)) {
      throw new Error('Invalid WhatsApp number format');
    }

    console.log('📱 Direct WhatsApp sharing to:', options.phoneNumber);

    // Always use direct wa.me link for specific phone numbers
    const formattedNumber = this.formatPhoneNumber(options.phoneNumber);
    const encodedMessage = encodeURIComponent(options.message);
    const whatsappUrl = `https://wa.me/${formattedNumber}?text=${encodedMessage}`;

    console.log('📱 Opening WhatsApp directly with URL:', whatsappUrl);
    window.open(whatsappUrl, '_blank');
  }

  /**
   * Try enhanced WhatsApp Web integration
   */
  private tryWhatsAppWebIntegration(options: WhatsAppShareOptions): boolean {
    try {
      // For desktop users, prefer WhatsApp Web
      if (this.isDesktop()) {
        return this.openWhatsAppWebEnhanced(options);
      }
      return false;
    } catch (error) {
      console.error('❌ WhatsApp Web integration failed:', error);
      return false;
    }
  }

  /**
   * Open WhatsApp Web with enhanced integration
   */
  private openWhatsAppWebEnhanced(options: WhatsAppShareOptions): boolean {
    try {
      const formattedNumber = this.formatPhoneNumber(options.phoneNumber);
      const encodedMessage = encodeURIComponent(options.message);

      // Use WhatsApp Web URL with better parameters
      const whatsappWebUrl = `https://web.whatsapp.com/send?phone=${formattedNumber}&text=${encodedMessage}&app_absent=0`;

      // Open with specific window features for better integration
      const whatsappWindow = window.open(
        whatsappWebUrl,
        'whatsapp_web_' + Date.now(),
        'width=1200,height=800,scrollbars=yes,resizable=yes,toolbar=no,menubar=no,location=no'
      );

      if (whatsappWindow) {
        console.log('✅ WhatsApp Web opened with enhanced integration');

        // Show helpful notification
        this.showWhatsAppWebNotification();

        return true;
      }

      return false;

    } catch (error) {
      console.error('❌ Enhanced WhatsApp Web opening failed:', error);
      return false;
    }
  }

  /**
   * Show WhatsApp Web notification
   */
  private showWhatsAppWebNotification(): void {
    const notification = document.createElement('div');
    notification.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
        color: white;
        padding: 15px 25px;
        border-radius: 25px;
        box-shadow: 0 8px 25px rgba(37, 211, 102, 0.4);
        z-index: 10000;
        font-family: 'Segoe UI', Arial, sans-serif;
        font-size: 14px;
        font-weight: 500;
        animation: bounceIn 0.5s ease-out;
        text-align: center;
      ">
        🚀 WhatsApp Web opened! Message is ready to send.
      </div>
      <style>
        @keyframes bounceIn {
          0% { transform: translateX(-50%) scale(0.3); opacity: 0; }
          50% { transform: translateX(-50%) scale(1.05); }
          70% { transform: translateX(-50%) scale(0.9); }
          100% { transform: translateX(-50%) scale(1); opacity: 1; }
        }
        @keyframes fadeOut {
          from { opacity: 1; transform: translateX(-50%) scale(1); }
          to { opacity: 0; transform: translateX(-50%) scale(0.8); }
        }
      </style>
    `;

    document.body.appendChild(notification);

    // Remove notification after 4 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.animation = 'fadeOut 0.3s ease-in forwards';
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
        }, 300);
      }
    }, 4000);
  }

  /**
   * Share file via WhatsApp with enhanced attachment support
   * @param options WhatsApp sharing options with file
   */
  shareFile(options: WhatsAppShareOptions): void {
    if (!options.fileBlob || !options.fileName) {
      throw new Error('File blob and filename are required for file sharing');
    }

    if (!this.validatePhoneNumber(options.phoneNumber)) {
      throw new Error('Invalid WhatsApp number format');
    }

    console.log('📎 DIRECT WhatsApp file sharing to:', options.phoneNumber);
    console.log('📎 File name:', options.fileName);
    console.log('📎 File size:', options.fileBlob.size, 'bytes');

    try {
      // FORCE direct WhatsApp approach - NO Web Share API
      console.log('🚫 Bypassing Web Share API - using direct wa.me link');
      this.shareViaDirectWhatsApp(options);

    } catch (error) {
      console.error('❌ Error in direct file sharing:', error);
      this.shareViaDownloadAndMessage(options);
    }
  }

  /**
   * Check if Web Share API is available and supports files
   */
  private canUseWebShareAPI(): boolean {
    return 'navigator' in window &&
           'share' in navigator &&
           'canShare' in navigator &&
           navigator.canShare({ files: [new File([''], 'test.txt')] });
  }

  /**
   * Check if user is on desktop
   */
  private isDesktop(): boolean {
    return !(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
  }

  /**
   * Share via direct WhatsApp to specific phone number
   */
  private shareViaDirectWhatsApp(options: WhatsAppShareOptions): void {
    console.log('📱 Using direct WhatsApp approach for:', options.phoneNumber);

    // Download the file first
    this.downloadFile(options.fileBlob!, options.fileName!);

    // Create enhanced message with clear, simple instructions
    const directMessage = `${options.message}\n\n📎 *${options.fileName} Downloaded!*\n\n🔗 *To attach this file:*\n• Click the 📎 (paperclip) icon below\n• Choose "Document" \n• Select "${options.fileName}" from Downloads\n• Click Send\n\n✅ File is ready in your Downloads folder!`;

    // Show prominent notification first
    this.showEnhancedFileNotification(options.fileName!);

    // Open WhatsApp directly to the specific phone number after a short delay
    setTimeout(() => {
      const formattedNumber = this.formatPhoneNumber(options.phoneNumber);
      const encodedMessage = encodeURIComponent(directMessage);
      const whatsappUrl = `https://wa.me/${formattedNumber}?text=${encodedMessage}`;

      console.log('📱 Opening WhatsApp directly to:', formattedNumber);
      console.log('📱 WhatsApp URL:', whatsappUrl);

      // Force direct WhatsApp opening
      window.open(whatsappUrl, '_blank');
    }, 1000);
  }

  /**
   * Share via Web Share API (direct file attachment)
   */
  private async shareViaWebShareAPI(options: WhatsAppShareOptions): Promise<void> {
    try {
      const file = new File([options.fileBlob!], options.fileName!, {
        type: options.fileBlob!.type
      });

      const shareData = {
        title: '🏥 Pathology Test Report',
        text: options.message,
        files: [file]
      };

      if (navigator.canShare && navigator.canShare(shareData)) {
        await navigator.share(shareData);
        console.log('✅ File shared successfully via Web Share API');
        return;
      }

      throw new Error('Web Share API cannot share this file type');
    } catch (error) {
      console.error('❌ Web Share API failed:', error);
      throw error;
    }
  }

  /**
   * Share via WhatsApp Web with enhanced file handling
   */
  private shareViaWhatsAppWeb(options: WhatsAppShareOptions): void {
    // Try advanced file handling first
    if (this.tryAdvancedFileHandling(options)) {
      return;
    }

    // Fallback to download + instructions
    this.downloadFile(options.fileBlob!, options.fileName!);

    // Create enhanced message with file instructions
    const enhancedMessage = `${options.message}\n\n📎 *File Downloaded: ${options.fileName}*\n\n📋 *To attach this file:*\n1️⃣ Click the 📎 attachment icon below\n2️⃣ Select "Document" or "Photos & Media"\n3️⃣ Choose "${options.fileName}" from Downloads\n4️⃣ Click Send\n\n💡 The file is ready in your Downloads folder!`;

    // Open WhatsApp Web
    setTimeout(() => {
      this.shareTextMessage({
        phoneNumber: options.phoneNumber,
        message: enhancedMessage
      });
    }, 1500);

    // Show user-friendly notification
    this.showFileAttachmentInstructions(options.fileName!);
  }

  /**
   * Try advanced file handling methods
   */
  private tryAdvancedFileHandling(options: WhatsAppShareOptions): boolean {
    try {
      // Method 1: Try to use File System Access API (Chrome 86+)
      if ('showSaveFilePicker' in window) {
        this.saveFileWithSystemAPI(options);
        return true;
      }

      // Method 2: Try clipboard API for images
      if (options.fileBlob!.type.startsWith('image/') && 'clipboard' in navigator) {
        this.copyImageToClipboard(options);
        return true;
      }

      // Method 3: Try drag and drop simulation
      if (this.canSimulateDragDrop()) {
        this.simulateFileDragDrop(options);
        return true;
      }

      return false;
    } catch (error) {
      console.error('❌ Advanced file handling failed:', error);
      return false;
    }
  }

  /**
   * Save file using File System Access API
   */
  private async saveFileWithSystemAPI(options: WhatsAppShareOptions): Promise<void> {
    try {
      const fileHandle = await (window as any).showSaveFilePicker({
        suggestedName: options.fileName,
        types: [{
          description: 'Medical Reports',
          accept: {
            'application/pdf': ['.pdf'],
            'image/png': ['.png'],
            'image/jpeg': ['.jpg'],
            'text/plain': ['.txt']
          }
        }]
      });

      const writable = await fileHandle.createWritable();
      await writable.write(options.fileBlob);
      await writable.close();

      // Open WhatsApp with success message
      const message = `${options.message}\n\n✅ File saved successfully!\n📎 You can now drag and drop "${options.fileName}" directly into WhatsApp Web.`;

      setTimeout(() => {
        this.shareTextMessage({
          phoneNumber: options.phoneNumber,
          message: message
        });
      }, 1000);

      this.showAdvancedFileNotification(options.fileName!, 'File saved! Drag it to WhatsApp Web.');

    } catch (error) {
      console.error('❌ File System Access API failed:', error);
      throw error;
    }
  }

  /**
   * Copy image to clipboard for easy pasting
   */
  private async copyImageToClipboard(options: WhatsAppShareOptions): Promise<void> {
    try {
      const clipboardItem = new ClipboardItem({
        [options.fileBlob!.type]: options.fileBlob!
      });

      await navigator.clipboard.write([clipboardItem]);

      // Open WhatsApp with paste instructions
      const message = `${options.message}\n\n📋 *Image copied to clipboard!*\n\n💡 *To send:*\n1️⃣ Click in WhatsApp message box\n2️⃣ Press Ctrl+V (or Cmd+V on Mac)\n3️⃣ The image will appear - click Send!\n\n✨ Quick and easy!`;

      setTimeout(() => {
        this.shareTextMessage({
          phoneNumber: options.phoneNumber,
          message: message
        });
      }, 1000);

      this.showAdvancedFileNotification(options.fileName!, 'Image copied! Press Ctrl+V in WhatsApp.');

    } catch (error) {
      console.error('❌ Clipboard API failed:', error);
      throw error;
    }
  }

  /**
   * Check if drag and drop simulation is possible
   */
  private canSimulateDragDrop(): boolean {
    return 'DataTransfer' in window && 'FileReader' in window;
  }

  /**
   * Simulate file drag and drop
   */
  private simulateFileDragDrop(options: WhatsAppShareOptions): void {
    // Create a temporary file input for better file handling
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.style.display = 'none';

    // Convert blob to file
    const file = new File([options.fileBlob!], options.fileName!, {
      type: options.fileBlob!.type
    });

    // Create a data transfer object
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInput.files = dataTransfer.files;

    document.body.appendChild(fileInput);

    // Open WhatsApp with drag-drop instructions
    const message = `${options.message}\n\n🖱️ *File ready for drag & drop!*\n\n📋 *Instructions:*\n1️⃣ A file has been prepared\n2️⃣ Look for the file in your Downloads\n3️⃣ Drag "${options.fileName}" directly into WhatsApp Web\n4️⃣ Drop it in the message area\n\n🎯 Super easy file sharing!`;

    setTimeout(() => {
      this.shareTextMessage({
        phoneNumber: options.phoneNumber,
        message: message
      });
    }, 1000);

    // Also download as backup
    this.downloadFile(options.fileBlob!, options.fileName!);

    // Clean up
    setTimeout(() => {
      if (fileInput.parentNode) {
        fileInput.parentNode.removeChild(fileInput);
      }
    }, 5000);

    this.showAdvancedFileNotification(options.fileName!, 'File ready! Drag it to WhatsApp Web.');
  }

  /**
   * Show direct sharing notification
   */
  private showDirectSharingNotification(fileName: string): void {
    const notification = document.createElement('div');
    notification.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
        color: white;
        padding: 20px;
        border-radius: 12px;
        box-shadow: 0 8px 25px rgba(37, 211, 102, 0.4);
        z-index: 10000;
        max-width: 380px;
        font-family: 'Segoe UI', Arial, sans-serif;
        font-size: 14px;
        line-height: 1.5;
        animation: slideIn 0.3s ease-out;
      ">
        <div style="font-weight: bold; margin-bottom: 10px; font-size: 16px;">
          📱 Direct WhatsApp Share!
        </div>
        <div style="margin-bottom: 8px;">
          <strong>📄 ${fileName}</strong>
        </div>
        <div style="font-size: 13px; opacity: 0.95;">
          File downloaded & WhatsApp opening to patient's number
        </div>
        <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.2); font-size: 12px; opacity: 0.8;">
          💡 Direct to patient - no contact selection needed!
        </div>
      </div>
      <style>
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      </style>
    `;

    document.body.appendChild(notification);

    // Remove notification after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.animation = 'slideOut 0.3s ease-in forwards';
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
        }, 300);
      }
    }, 5000);
  }

  /**
   * Show advanced file notification
   */
  private showAdvancedFileNotification(fileName: string, message: string): void {
    const notification = document.createElement('div');
    notification.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
        color: white;
        padding: 20px;
        border-radius: 12px;
        box-shadow: 0 8px 25px rgba(37, 211, 102, 0.4);
        z-index: 10000;
        max-width: 380px;
        font-family: 'Segoe UI', Arial, sans-serif;
        font-size: 14px;
        line-height: 1.5;
        animation: slideIn 0.3s ease-out;
      ">
        <div style="font-weight: bold; margin-bottom: 10px; font-size: 16px;">
          🚀 Enhanced File Sharing!
        </div>
        <div style="margin-bottom: 8px;">
          <strong>${fileName}</strong>
        </div>
        <div style="font-size: 13px; opacity: 0.95;">
          ${message}
        </div>
        <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.2); font-size: 12px; opacity: 0.8;">
          💡 This will make file sharing much easier!
        </div>
      </div>
      <style>
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      </style>
    `;

    document.body.appendChild(notification);

    // Remove notification after 10 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.animation = 'slideOut 0.3s ease-in forwards';
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
        }, 300);
      }
    }, 10000);

    // Add slideOut animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Fallback method - Download + Message
   */
  private shareViaDownloadAndMessage(options: WhatsAppShareOptions): void {
    // Download the file
    this.downloadFile(options.fileBlob!, options.fileName!);

    // Open WhatsApp with enhanced message
    const message = `${options.message}\n\n📎 File "${options.fileName}" has been downloaded to your device.\n\nPlease attach it manually in WhatsApp.`;

    setTimeout(() => {
      this.shareTextMessage({
        phoneNumber: options.phoneNumber,
        message: message
      });
    }, 1000);
  }

  /**
   * Download file to user's device
   */
  private downloadFile(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.style.display = 'none';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    console.log('📥 File downloaded:', fileName);
  }

  /**
   * Show user instructions for file attachment
   */
  private showFileAttachmentInstructions(fileName: string): void {
    // Create a nice notification
    const notification = document.createElement('div');
    notification.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        background: #25D366;
        color: white;
        padding: 15px 20px;
        border-radius: 10px;
        box-shadow: 0 4px 15px rgba(37, 211, 102, 0.3);
        z-index: 10000;
        max-width: 350px;
        font-family: Arial, sans-serif;
        font-size: 14px;
        line-height: 1.4;
      ">
        <div style="font-weight: bold; margin-bottom: 8px;">
          📎 File Ready for WhatsApp!
        </div>
        <div style="margin-bottom: 8px;">
          <strong>${fileName}</strong> has been downloaded
        </div>
        <div style="font-size: 12px; opacity: 0.9;">
          💡 Use the attachment (📎) button in WhatsApp to send this file
        </div>
      </div>
    `;

    document.body.appendChild(notification);

    // Remove notification after 8 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 8000);
  }

  /**
   * Generate WhatsApp message for medical report
   * @param reportData Report data object
   * @returns Formatted WhatsApp message
   */
  generateMedicalReportMessage(reportData: any): string {
    const message = `
🏥 *${reportData.hospitalName || 'PATHOLOGY TEST REPORT'}*

👤 *Patient Details:*
Name: ${reportData.patientName}
Age: ${reportData.age}
Gender: ${reportData.gender}
Receipt No: ${reportData.receiptNo}
Date: ${new Date(reportData.reportDate).toLocaleDateString('en-IN')}

🔬 *Test Results:*
${this.formatTestResults(reportData.testResults)}

📞 For any queries, contact the laboratory.
    `.trim();

    return message;
  }

  /**
   * Format test results for WhatsApp text
   * @param testResults Array of test results
   * @returns Formatted test results string
   */
  private formatTestResults(testResults: any[]): string {
    let formattedResults = '';
    
    if (!testResults || testResults.length === 0) {
      return 'No test results available';
    }

    testResults.forEach(test => {
      formattedResults += `\n📋 *${test.testName}*\n`;
      
      if (test.parameters && test.parameters.length > 0) {
        test.parameters.forEach((param: any) => {
          if (param.result) {
            const status = this.getResultStatus(param);
            const statusIcon = this.getStatusIcon(param.status);
            
            formattedResults += `${statusIcon} ${param.name}: *${param.result}* ${param.unit || ''}\n`;
            formattedResults += `   Normal: ${param.displayInReport || param.normalRange}\n`;
          }
          
          // Add sub-parameters if any
          if (param.subParameters) {
            param.subParameters.forEach((subParam: any) => {
              if (subParam.result) {
                const statusIcon = this.getStatusIcon(subParam.status);
                formattedResults += `   ${statusIcon} ${subParam.name}: *${subParam.result}* ${subParam.unit || ''}\n`;
              }
            });
          }
        });
      }
      
      formattedResults += '\n';
    });

    return formattedResults;
  }

  /**
   * Get status icon for test results
   * @param status Result status
   * @returns Appropriate emoji icon
   */
  private getStatusIcon(status: string): string {
    switch (status) {
      case 'normal': return '✅';
      case 'high': return '⬆️';
      case 'low': return '⬇️';
      case 'critical': return '🚨';
      default: return '📊';
    }
  }

  /**
   * Get result status description
   * @param param Parameter object
   * @returns Status description
   */
  private getResultStatus(param: any): string {
    switch (param.status) {
      case 'normal': return 'Normal';
      case 'high': return 'High';
      case 'low': return 'Low';
      case 'critical': return 'Critical';
      default: return '';
    }
  }

  /**
   * Check if WhatsApp is available on the device
   * @returns boolean indicating WhatsApp availability
   */
  isWhatsAppAvailable(): boolean {
    // Check if running on mobile device
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    return isMobile;
  }

  /**
   * Get appropriate WhatsApp URL based on device
   * @param phoneNumber Formatted phone number
   * @param message Message to share
   * @returns WhatsApp URL
   */
  getWhatsAppUrl(phoneNumber: string, message: string): string {
    const formattedNumber = this.formatPhoneNumber(phoneNumber);
    const encodedMessage = encodeURIComponent(message);

    // Always use wa.me for direct sharing to specific numbers
    return `https://wa.me/${formattedNumber}?text=${encodedMessage}`;
  }

  /**
   * Test direct WhatsApp sharing (for debugging)
   */
  testDirectWhatsApp(phoneNumber: string): void {
    const testMessage = '🧪 Test message from HMS - Direct WhatsApp sharing working!';
    const whatsappUrl = this.getWhatsAppUrl(phoneNumber, testMessage);

    console.log('🧪 Testing direct WhatsApp with URL:', whatsappUrl);
    window.open(whatsappUrl, '_blank');
  }

  /**
   * Show enhanced notification for file sharing
   */
  private showEnhancedFileNotification(fileName: string): void {
    // Create a more prominent, beautiful notification
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #25D366, #128C7E);
      color: white;
      padding: 24px;
      border-radius: 16px;
      box-shadow: 0 12px 40px rgba(37, 211, 102, 0.4);
      z-index: 10000;
      max-width: 420px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      animation: slideInBounce 0.5s ease-out;
      border: 2px solid rgba(255, 255, 255, 0.2);
    `;

    notification.innerHTML = `
      <div style="display: flex; align-items: center; margin-bottom: 16px;">
        <div style="background: rgba(255,255,255,0.2); padding: 8px; border-radius: 50%; margin-right: 12px;">
          <i class="fab fa-whatsapp" style="font-size: 24px;"></i>
        </div>
        <div>
          <strong style="font-size: 18px; display: block;">File Ready for WhatsApp!</strong>
          <span style="font-size: 12px; opacity: 0.9;">Direct sharing to patient</span>
        </div>
      </div>
      <div style="background: rgba(255,255,255,0.1); padding: 16px; border-radius: 12px; margin-bottom: 16px;">
        <div style="font-size: 14px; line-height: 1.6;">
          📎 <strong>${fileName}</strong> downloaded to your device<br>
          🚀 WhatsApp will open to patient's number<br>
          📋 Click the paperclip icon to attach the file
        </div>
      </div>
      <div style="text-align: center; font-size: 12px; opacity: 0.8;">
        ✨ File sharing made simple!
      </div>
    `;

    // Add CSS animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideInBounce {
        0% { transform: translateX(100%) scale(0.8); opacity: 0; }
        60% { transform: translateX(-10px) scale(1.05); opacity: 1; }
        100% { transform: translateX(0) scale(1); opacity: 1; }
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(notification);

    // Auto-remove after 10 seconds with fade out
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.transition = 'all 0.3s ease-out';
        notification.style.transform = 'translateX(100%)';
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
      }
    }, 10000);
  }
}

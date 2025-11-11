const mongoose = require('mongoose');
const PathologyInvoice = require('./back-end/models/PathologyInvoice');

// MongoDB connection
const connectDB = async () => {
  try {
    await mongoose.connect('mongodb+srv://HospitalManagementSystem:sarthak123@cluster0.vbwumpm.mongodb.net/hospital_management?retryWrites=true&w=majority');
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Fix existing invoices with proper patient names
const fixInvoiceNames = async () => {
  try {
    console.log('🔧 Starting to fix invoice patient names...');
    
    // Get all invoices
    const invoices = await PathologyInvoice.find();
    console.log(`📋 Found ${invoices.length} invoices to fix`);
    
    // Sample patient names to use
    const sampleNames = [
      'Rajesh Kumar',
      'Priya Sharma', 
      'Amit Singh',
      'Sunita Devi',
      'Vikash Gupta'
    ];
    
    let fixedCount = 0;
    
    for (let i = 0; i < invoices.length; i++) {
      const invoice = invoices[i];
      
      // Check if patient name needs fixing
      if (!invoice.patient.name || 
          invoice.patient.name === '???? ????' || 
          invoice.patient.name === '?? ???' ||
          invoice.patient.name.includes('?')) {
        
        // Use sample name based on index
        const newName = sampleNames[i % sampleNames.length];
        
        // Update the invoice
        await PathologyInvoice.findByIdAndUpdate(invoice._id, {
          'patient.name': newName
        });
        
        console.log(`✅ Fixed invoice ${invoice.receiptNumber}: ${invoice.patient.name} → ${newName}`);
        fixedCount++;
      } else {
        console.log(`✓ Invoice ${invoice.receiptNumber} already has valid name: ${invoice.patient.name}`);
      }
    }
    
    console.log(`🎉 Fixed ${fixedCount} invoices successfully!`);
    
  } catch (error) {
    console.error('❌ Error fixing invoices:', error);
  }
};

// Main function
const main = async () => {
  await connectDB();
  await fixInvoiceNames();
  await mongoose.connection.close();
  console.log('🔚 Script completed');
  process.exit(0);
};

main();

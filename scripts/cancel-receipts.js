/*
  One-time helper to mark test receipts as CANCELLED so they are ignored by reports.
  Usage:
    MONGODB_URI="<your mongodb+srv uri>" node scripts/cancel-receipts.js 69 70 71
  or
    node scripts/cancel-receipts.js 69

  Notes:
  - Only sets status: 'CANCELLED'. It does NOT delete the document.
  - Reports/Dashboard already ignore CANCELLED invoices.
  - Safe to run for testing receipts; keeps audit minimally intact.
*/

const mongoose = require('mongoose');
const path = require('path');

async function main() {
  const args = process.argv.slice(2).filter(Boolean);
  if (args.length === 0) {
    console.error('Provide one or more receipt numbers. Example: node scripts/cancel-receipts.js 69 70');
    process.exit(1);
  }

  // Parse numbers; support comma-separated too
  const receipts = args
    .flatMap(a => String(a).split(',').map(s => s.trim()))
    .map(s => parseInt(s, 10))
    .filter(n => !Number.isNaN(n));

  if (receipts.length === 0) {
    console.error('No valid numeric receipt numbers provided.');
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DB_URI || '';
  if (!uri) {
    console.warn('No MONGODB_URI found in environment. Falling back to default ONLY if you confirm in code.');
    // If you want a hardcoded fallback for local testing, uncomment and edit the line below:
    // const fallback = 'mongodb+srv://<user>:<pass>@<cluster>/<db>?retryWrites=true&w=majority';
    // throw new Error('Set MONGODB_URI env or add a fallback string.');
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 15000,
  });
  console.log('Connected.');

  // Load model after (or before) connect — both are fine with default connection
  const InvoiceModel = require(path.join(__dirname, '..', 'back-end', 'models', 'PathologyInvoice'));

  const results = [];
  for (const r of receipts) {
    const doc = await InvoiceModel.findOne({ receiptNumber: r });
    if (!doc) {
      console.warn(`Receipt ${r}: NOT FOUND`);
      results.push({ receipt: r, ok: false, reason: 'NOT_FOUND' });
      continue;
    }

    if (doc.status === 'CANCELLED') {
      console.log(`Receipt ${r}: already CANCELLED`);
      results.push({ receipt: r, ok: true, already: true });
      continue;
    }

    const res = await InvoiceModel.updateOne(
      { _id: doc._id },
      { $set: { status: 'CANCELLED' } }
    );
    if (res.modifiedCount > 0) {
      console.log(`Receipt ${r}: set to CANCELLED`);
      results.push({ receipt: r, ok: true, cancelled: true });
    } else {
      console.warn(`Receipt ${r}: no changes (maybe already CANCELLED)`);
      results.push({ receipt: r, ok: true, unchanged: true });
    }
  }

  await mongoose.disconnect();
  console.log('\nSummary:', results);
  console.log('Done.');
}

main().catch(async (err) => {
  console.error('Error:', err.message);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});


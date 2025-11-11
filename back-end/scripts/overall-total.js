/* Read-only script: prints overall total revenue from PathologyInvoice (all-time)
 * Logic: sum final test-line totals (netAmount -> else amount/cost * quantity - discount)
 * Filters: paymentStatus in PAID/paid; status != CANCELLED
 */
const mongoose = require('mongoose');
const path = require('path');
const modelPath = path.join(__dirname, '..', 'models', 'PathologyInvoice');
const PathologyInvoice = require(modelPath);

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://HospitalManagementSystem:sarthak123@cluster0.vbwumpm.mongodb.net/hospital_management?retryWrites=true&w=majority';

(async () => {
  try {
    console.log('🔄 Connecting to MongoDB...');
    const conn = await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 30000,
      maxPoolSize: 10,
    });
    console.log(`✅ Connected: ${conn.connection.host} / ${conn.connection.name}`);

    const agg = await PathologyInvoice.aggregate([
      { $match: { status: { $ne: 'CANCELLED' }, 'payment.paymentStatus': { $in: ['PAID', 'paid'] } } },
      { $addFields: {
          testsArr: {
            $cond: [
              { $gt: [ { $size: { $ifNull: ['$tests', []] } }, 0 ] },
              '$tests',
              { $ifNull: ['$selectedTests', []] }
            ]
          }
        }
      },
      { $unwind: { path: '$testsArr', preserveNullAndEmptyArrays: true } },
      { $addFields: {
          lineAmount: {
            $cond: [
              { $ne: [ '$testsArr.netAmount', null ] },
              { $ifNull: [ '$testsArr.netAmount', 0 ] },
              { $subtract: [
                  { $multiply: [
                      { $ifNull: [ '$testsArr.amount', { $ifNull: [ '$testsArr.cost', 0 ] } ] },
                      { $ifNull: [ '$testsArr.quantity', 1 ] }
                    ] },
                  { $ifNull: [ '$testsArr.discount', 0 ] }
                ] }
            ]
          }
        }
      },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$lineAmount', 0] } } } }
    ]);

    const total = agg && agg.length ? Math.round(agg[0].total) : 0;
    console.log('==================================');
    console.log('💰 PathologyInvoice Overall Total');
    console.log('TOTAL (₹):', total);
    console.log('==================================');
  } catch (err) {
    console.error('❌ Error:', err?.message || err);
  } finally {
    try { await mongoose.connection.close(); } catch {}
    process.exit(0);
  }
})();


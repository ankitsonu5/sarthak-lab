const mongoose = require('mongoose');
require('dotenv').config();

(async () => {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hospital_management';
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(uri, { autoIndex: false });
    console.log('✅ Connected');

    const db = mongoose.connection.db;
    const counters = db.collection('counters');

    console.log('🧹 Removing obsolete counter document: { name: "testCategory" }');
    const result = await counters.deleteOne({ name: 'testCategory' });

    if (result.deletedCount > 0) {
      console.log('✅ Removed testCategory counter');
    } else {
      console.log('ℹ️ No testCategory counter found; nothing to remove');
    }
  } catch (err) {
    console.error('❌ Migration failed:', err?.message || err);
    process.exitCode = 1;
  } finally {
    try { await mongoose.connection.close(); } catch {}
    console.log('🔌 Connection closed');
  }
})();


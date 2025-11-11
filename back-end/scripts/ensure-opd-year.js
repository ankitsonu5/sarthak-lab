/*
  Ensure OPD yearly counter to current totals without modifying event documents.
  Usage:
    node back-end/scripts/ensure-opd-year.js --year=2025

  Reads MONGODB_URI from environment (.env supported).
*/
const mongoose = require('mongoose');
require('dotenv').config();

const Appointment = require('../models/Appointment');
const CounterService = require('../services/counter-service');

function getArg(name, def) {
  const arg = process.argv.find(a => a.startsWith(`--${name}=`));
  if (!arg) return def;
  const v = arg.split('=')[1];
  return v === undefined ? def : v;
}

(async () => {
  const year = parseInt(getArg('year', String(new Date().getFullYear())), 10);
  const start = new Date(year, 0, 1, 0, 0, 0, 0);
  const end = new Date(year + 1, 0, 1, 0, 0, 0, 0);

  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hospital_management';
  console.log(`🔗 Connecting to MongoDB: ${uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 30000 });
  console.log('✅ Connected');

  try {
    console.log(`📅 Ensuring yearly counter for ${year}...`);
    const countA = await Appointment.countDocuments({ createdAt: { $gte: start, $lt: end }, status: { $ne: 'Cancelled' } });
    const value = countA || 0;
    await CounterService.resetCounter(`opd_year_${year}`, value);
    console.log('✅ Yearly counter ensured:', { year, value });
  } catch (e) {
    console.error('❌ Ensure yearly failed:', e.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Disconnected');
  }
})();


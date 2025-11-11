/*
  Backfill OPD monthlyNo and dailyNo for a specific month without touching yearlyNo.
  Usage:
    node back-end/scripts/backfill-opd-month.js --year=2025 --month=10
    node back-end/scripts/backfill-opd-month.js --month=9  # defaults year to current

  NOTE: This script counts only new OPD registrations (appointments).

  NOTE: Reads MONGODB_URI from environment (required in our project),
        falls back to local dev only if env not provided.
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
  const month = parseInt(getArg('month', ''), 10); // 1..12
  if (!month || month < 1 || month > 12) {
    console.error('❌ Provide a valid --month=1..12');
    process.exit(1);
  }

  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 1, 0, 0, 0, 0);

  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hospital_management';
  console.log(`🔗 Connecting to MongoDB: ${uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 30000 });
  console.log('✅ Connected');

  try {
    console.log(`📅 Backfilling month ${year}-${String(month).padStart(2, '0')}...`);

    // Use createdAt for filtering to match report ordering and "first patient of the month"
    const apts = await Appointment.find({ createdAt: { $gte: start, $lt: end }, status: { $ne: 'Cancelled' } })
      .select('_id createdAt')
      .lean();

    const events = [];
    for (const a of apts) events.push({ id: a._id, date: new Date(a.createdAt) });
    events.sort((x, y) => x.date.getTime() - y.date.getTime());

    let monthlyNo = 0;
    const dayMap = new Map(); // yyyyMMdd -> last
    const bulkA = [];

    for (const ev of events) {
      const d = ev.date;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dayKey = `${y}${m}${dd}`;

      monthlyNo += 1;
      const dVal = (dayMap.get(dayKey) || 0) + 1; dayMap.set(dayKey, dVal);

      const update = { updateOne: { filter: { _id: ev.id }, update: { $set: { monthlyNo: monthlyNo, dailyNo: dVal } } } };
      bulkA.push(update);
    }

    if (bulkA.length) await Appointment.bulkWrite(bulkA, { ordered: false });

    const mk = `${year}${String(month).padStart(2, '0')}`;
    await CounterService.resetCounter(`opd_month_${mk}`, monthlyNo);
    const lastDay = Array.from(dayMap.keys()).sort().pop();
    if (lastDay) await CounterService.resetCounter(`opd_today_${lastDay}`, dayMap.get(lastDay) || 0);

    console.log('✅ Backfill complete:', { year, month, updated: { appointments: bulkA.length }, totals: { monthlyNo, days: dayMap.size } });
  } catch (e) {
    console.error('❌ Backfill failed:', e.message);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Disconnected');
  }
})();


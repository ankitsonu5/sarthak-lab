const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// Optional Mongo model for lab lookup by labCode
let Lab = null;
try { Lab = require('../models/Lab'); } catch { Lab = null; }

// Optional email helper (works only if SMTP env is configured)
let sendEmail = null;
try { ({ sendEmail } = require('../utils/mailer')); } catch { sendEmail = null; }

const DATA_DIR = path.join(__dirname, '..', 'database');
const DATA_FILE = path.join(DATA_DIR, 'self-registrations.json');

function ensureStore() {
  try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
  try { if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf-8'); } catch {}
}

function readAll() {
  ensureStore();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeAll(list) {
  ensureStore();
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), 'utf-8'); } catch {}
}

function sanitizeString(s) {
  return (s == null ? '' : String(s)).slice(0, 500);
}

// Public endpoint: patient self-registration
router.post('/', async (req, res) => {
  try {
    const p = req.body || {};
    // Minimal validation
    const firstName = sanitizeString(p.firstName);
    const lastName = sanitizeString(p.lastName);
    const phone = sanitizeString(p.phone);
    const gender = sanitizeString(p.gender);
    const age = sanitizeString(p.age);
    const address = sanitizeString(p.address);
    const city = sanitizeString(p.city);
    const preferredDate = sanitizeString(p.preferredDate);
    const preferredTime = sanitizeString(p.preferredTime);
    const testsNote = sanitizeString(p.testsNote);
    const homeCollection = Boolean(p.homeCollection);

    if (!firstName && !phone) {
      return res.status(400).json({ success: false, message: 'Name or phone required' });
    }

    const entry = {
      id: `sr_${Date.now()}_${Math.floor(Math.random()*1e6)}`,
      createdAt: new Date().toISOString(),
      firstName, lastName, phone, gender, age, address, city,
      preferredDate, preferredTime, testsNote, homeCollection
    };

    const list = readAll();
    list.unshift(entry);
    // Keep last 200 entries
    writeAll(list.slice(0, 200));

    // Try to email lab if SMTP configured
    try {
      const to = process.env.SELF_REG_NOTIFY_TO || process.env.LAB_EMAIL || process.env.SMTP_USER;
      if (sendEmail && to) {
        const subject = 'New Patient Self-Registration';
        const html = `
          <h3>New self-registration received</h3>
          <p><b>Name:</b> ${firstName} ${lastName}</p>
          <p><b>Phone:</b> ${phone}</p>
          <p><b>Gender/Age:</b> ${gender || '-'} / ${age || '-'}</p>
          <p><b>Address:</b> ${address || '-'}, ${city || ''}</p>
          <p><b>Preferred Slot:</b> ${preferredDate || '-'} ${preferredTime || ''}</p>
          <p><b>Requested Tests/Notes:</b> ${testsNote || '-'}</p>
          <p><i>This is an automated notification from the Lab system.</i></p>
        `;
        await sendEmail({ to, subject, html, text: `${firstName} ${lastName} (${phone}) requested tests: ${testsNote}` });
      }
    } catch (e) { console.warn('Email send failed (self-reg):', e?.message); }

    return res.json({ success: true, message: 'Self-registration submitted', data: { id: entry.id } });
  } catch (e) {
    console.error('Self-registration error:', e);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});


// New: Per-lab routes using path params for multi-tenant public links
router.post('/:labId', async (req, res) => {
  try {
    const labId = String(req.params.labId || '').trim();
    if (!labId) return res.status(400).json({ success: false, message: 'labId required' });

    const p = req.body || {};
    const firstName = sanitizeString(p.firstName);
    const lastName = sanitizeString(p.lastName);
    const phone = sanitizeString(p.phone);
    const gender = sanitizeString(p.gender);
    const age = sanitizeString(p.age);
    const address = sanitizeString(p.address);
    const city = sanitizeString(p.city);
    const preferredDate = sanitizeString(p.preferredDate);
    const preferredTime = sanitizeString(p.preferredTime);
    const testsNote = sanitizeString(p.testsNote);
    const homeCollection = Boolean(p.homeCollection);

    if (!firstName && !phone) {
      return res.status(400).json({ success: false, message: 'Name or phone required' });
    }

    const entry = {
      id: `sr_${Date.now()}_${Math.floor(Math.random()*1e6)}`,
      labId,
      createdAt: new Date().toISOString(),
      firstName, lastName, phone, gender, age, address, city,
      preferredDate, preferredTime, testsNote, homeCollection
    };

    const list = readAll();
    list.unshift(entry);
    writeAll(list.slice(0, 200));

    // Email notify (optional)
    try {
      const to = process.env.SELF_REG_NOTIFY_TO || process.env.LAB_EMAIL || process.env.SMTP_USER;
      if (sendEmail && to) {
        const subject = `New Self-Registration (${labId})`;
        const html = `
          <h3>New self-registration received</h3>
          <p><b>Lab:</b> ${labId}</p>
          <p><b>Name:</b> ${firstName} ${lastName}</p>
          <p><b>Phone:</b> ${phone}</p>
          <p><b>Gender/Age:</b> ${gender || '-'} / ${age || '-'}</p>
          <p><b>Address:</b> ${address || '-'}, ${city || ''}</p>
          <p><b>Preferred Slot:</b> ${preferredDate || '-'} ${preferredTime || ''}</p>
          <p><b>Requested Tests/Notes:</b> ${testsNote || '-'}</p>
          <p><i>This is an automated notification from the Lab system.</i></p>
        `;
        await sendEmail({ to, subject, html, text: `${labId}: ${firstName} ${lastName} (${phone}) requested tests: ${testsNote}` });
      }
    } catch (e) { console.warn('Email send failed (self-reg per-lab):', e?.message); }

    return res.json({ success: true, message: 'Self-registration submitted', data: { id: entry.id } });
  } catch (e) {
    console.error('Self-registration error (per-lab):', e);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

// Per-labCode routes
router.post('/by-code/:labCode', async (req, res) => {
  try {
    const labCode = String(req.params.labCode || '').trim();
    if (!labCode) return res.status(400).json({ success: false, message: 'labCode required' });

    const p = req.body || {};
    const firstName = sanitizeString(p.firstName);
    const lastName = sanitizeString(p.lastName);
    const phone = sanitizeString(p.phone);
    const gender = sanitizeString(p.gender);
    const age = sanitizeString(p.age);
    const address = sanitizeString(p.address);
    const city = sanitizeString(p.city);
    const preferredDate = sanitizeString(p.preferredDate);
    const preferredTime = sanitizeString(p.preferredTime);
    const testsNote = sanitizeString(p.testsNote);
    const homeCollection = Boolean(p.homeCollection);

    if (!firstName && !phone) {
      return res.status(400).json({ success: false, message: 'Name or phone required' });
    }

    let labId = null;
    try { labId = await resolveLabIdByCode(labCode); } catch {}

    const entry = {
      id: `sr_${Date.now()}_${Math.floor(Math.random()*1e6)}`,
      labId: labId || undefined,
      labCode,
      createdAt: new Date().toISOString(),
      firstName, lastName, phone, gender, age, address, city,
      preferredDate, preferredTime, testsNote, homeCollection
    };

    const list = readAll();
    list.unshift(entry);
    writeAll(list.slice(0, 200));

    try {
      const to = process.env.SELF_REG_NOTIFY_TO || process.env.LAB_EMAIL || process.env.SMTP_USER;
      if (sendEmail && to) {
        const subject = `New Self-Registration (${labCode})`;
        const html = `
          <h3>New self-registration received</h3>
          <p><b>Lab Code:</b> ${labCode}</p>
          <p><b>Name:</b> ${firstName} ${lastName}</p>
          <p><b>Phone:</b> ${phone}</p>
          <p><b>Gender/Age:</b> ${gender || '-'} / ${age || '-'}</p>
          <p><b>Address:</b> ${address || '-'}, ${city || ''}</p>
          <p><b>Preferred Slot:</b> ${preferredDate || '-'} ${preferredTime || ''}</p>
          <p><b>Requested Tests/Notes:</b> ${testsNote || '-'}</p>
          <p><i>This is an automated notification from the Lab system.</i></p>
        `;
        await sendEmail({ to, subject, html, text: `${labCode}: ${firstName} ${lastName} (${phone}) requested tests: ${testsNote}` });
      }
    } catch (e) { console.warn('Email send failed (self-reg by-code):', e?.message); }

    return res.json({ success: true, message: 'Self-registration submitted', data: { id: entry.id } });
  } catch (e) {
    console.error('Self-registration error (by-code):', e);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.get('/by-code/:labCode/recent', (req, res) => {
  try {
    const labCode = String(req.params.labCode || '').trim();
    if (!labCode) return res.json({ success: true, items: [] });

    const all = readAll();
    const items = all.filter(x => String(x.labCode || '') === labCode).slice(0, 20);
    return res.json({ success: true, items });
  } catch (e) {
    return res.json({ success: true, items: [] });
  }
});


// Resolve labId by labCode (best effort)
async function resolveLabIdByCode(labCode) {
  try {
    if (!Lab || !labCode) return null;
    const doc = await Lab.findOne({ labCode: String(labCode).trim() }).select('_id').lean();
    return doc?._id ? String(doc._id) : null;
  } catch { return null; }
}

router.get('/:labId/recent', (req, res) => {
  try {
    const labId = String(req.params.labId || '').trim();
    if (!labId) return res.json({ success: true, items: [] });

    const all = readAll();
    const items = all.filter(x => String(x.labId || '') === labId).slice(0, 20);
    return res.json({ success: true, items });
  } catch (e) {
    return res.json({ success: true, items: [] });
  }
});

// Public endpoint: recent registrations (latest 20)
router.get('/recent', (req, res) => {
  try {
    const all = readAll();
    const items = all.slice(0, 20);
    return res.json({ success: true, items });
  } catch (e) {
    return res.json({ success: true, items: [] });
  }
});

module.exports = router;


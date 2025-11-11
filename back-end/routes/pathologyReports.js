const express = require('express');
const router = express.Router();
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();


// MongoDB connection string
const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) { throw new Error('MONGODB_URI environment variable is required'); }
const dbName = 'hospital_management';

let db;

// Connect to MongoDB
MongoClient.connect(mongoUri)
  .then(async client => {
    console.log('✅ Connected to MongoDB for Pathology Reports');
    db = client.db(dbName);

    // ⚡ Ensure high-impact indexes for fast queries (idempotent)
    try {
      await db.collection('reports').createIndexes([
        { key: { reportType: 1, createdAt: -1 }, name: 'reportType_createdAt' },
        { key: { reportType: 1, receiptNo: 1 }, name: 'reportType_receiptNo' },
        { key: { reportType: 1, receiptNumber: 1 }, name: 'reportType_receiptNumber' },
        { key: { reportType: 1, labYearlyNo: 1 }, name: 'reportType_labYearlyNo' },
        { key: { reportType: 1, reportDate: 1 }, name: 'reportType_reportDate' },
        { key: { reportType: 1, 'patientData.fullName': 1 }, name: 'reportType_patientFullName' }
      ]);
      await db.collection('pathologyinvoices').createIndexes([
        { key: { receiptNumber: 1 }, name: 'receiptNumber' }
      ]);
      await db.collection('pathologyregistration').createIndexes([
        { key: { receiptNumber: 1 }, name: 'receiptNumber' }
      ]);
      console.log('✅ Pathology indexes ensured');
    } catch (e) {
      console.warn('⚠️ Failed ensuring pathology indexes:', e?.message);
    }
  })
  .catch(error => {
    console.error('❌ MongoDB connection error:', error);
  });


// Helper: normalize and resolve OPD/IPD strictly from Pathology Invoice (receipt)
const normalizeType = (v) => (typeof v === 'string' ? v.trim().toUpperCase() : '');
async function typeFromInvoice(receiptNo) {
  try {
    if (!db || !receiptNo) return null;
    const rec = parseInt(String(receiptNo));
    if (Number.isNaN(rec)) return null;

    // Try from Pathology Invoice
    const inv = await db.collection('pathologyinvoices').findOne({ receiptNumber: rec });
    const mode1 = normalizeType(inv?.mode || inv?.addressType || inv?.patientType || inv?.patient?.type || inv?.patient?.mode);
    if (mode1 === 'IPD' || mode1 === 'OPD') return mode1;

    // Fallback: try from Pathology Registration (older data often stores here)
    const reg = await db.collection('pathologyregistration').findOne({ receiptNumber: rec });
    const mode2 = normalizeType(reg?.mode || reg?.addressType || reg?.patientType || reg?.patient?.type || reg?.patient?.mode);
    if (mode2 === 'IPD' || mode2 === 'OPD') return mode2;

    return null;
  } catch (e) {
    console.warn('⚠️ Could not resolve type from invoice/registration:', e.message);
    return null;
  }
}

// === Helper: Normalize test name for matching definitions ===
function normTestName(raw) {
  return (raw || '')
    .toString()
    .trim()
    .toUpperCase()
    .replace(/\./g, '') // remove dots e.g., C.B.C -> CBC
    .replace(/\s+/g, ' ');
}

// === Helper: ensure RN- prefix for room numbers ===
function ensureRN(room) {
  const s = (room || '').toString().trim();
  if (!s) return '';
  return s.startsWith('RN-') ? s : (s.startsWith('RN') ? `RN-${s.slice(2)}` : `RN-${s}`);
}

// === Helper: Enrich report with IDs (patient/department/doctor) and link tests with TestDefinition/Category/Parameters ===
async function enrichReportPayload(db, payload) {
  const out = { ...payload };

  try {
    // Resolve patientRef from patientId/registrationNo via invoice/registration data
    let patientIdStr = (payload?.patientData?.registrationNumber || payload?.patientData?.patientId || payload?.registrationNo || '').toString();

    // Try from Pathology Invoice first (authoritative)
    if (!patientIdStr && payload?.receiptNo) {
      try {
        const inv = await db.collection('pathologyinvoices').findOne({ receiptNumber: parseInt(String(payload.receiptNo)) });
        patientIdStr = inv?.patient?.patientId || patientIdStr;
        // Prefer department/doctor/room from invoice when available
        if (!out.department && inv?.department?.name) out.department = inv.department.name;
        if (!out.roomNo && inv?.doctor?.roomNumber) out.roomNo = inv.doctor.roomNumber;
        if (!out.doctor && inv?.doctor?.name) out.doctor = inv.doctor.name;
      } catch {}
    }

    // Find Patient _id by patientId
    if (patientIdStr) {
      try {
        const pat = await db.collection('patients').findOne({ patientId: patientIdStr }, { projection: { _id: 1 } });
        if (pat?._id) out.patientRef = String(pat._id);
      } catch {}
    }

    // Resolve Department _id by code or name
    const deptName = (payload?.department || '').toString().trim();
    if (deptName) {
      try {
        const dep = await db.collection('departments').findOne({
          $or: [
            { name: { $regex: `^${deptName}$`, $options: 'i' } },
            { code: { $regex: `^${deptName}$`, $options: 'i' } }
          ]
        }, { projection: { _id: 1 } });
        if (dep?._id) out.departmentRef = String(dep._id);
      } catch {}
    }

    // Resolve Room and Doctor via DoctorRoomDirectory
    const rn = ensureRN(payload?.roomNo);
    if (rn) {
      try {
        const roomDoc = await db.collection('rooms').findOne({ roomNumber: rn }, { projection: { _id: 1 } });
        if (roomDoc?._id) {
          out.roomRef = String(roomDoc._id);
          const drd = await db.collection('doctorroomdirectories').findOne({ room: roomDoc._id }, { projection: { doctor: 1 } });
          if (drd?.doctor) out.doctorRef = String(drd.doctor);
        }
      } catch {}
    }

    // Resolve/Link Tests
    const tests = Array.isArray(payload?.testResults) ? payload.testResults : [];
    const enriched = [];

    for (const t of tests) {
      const testNameRaw = t?.testName || t?.name || '';
      const key = normTestName(testNameRaw);
      let td = null;
      try {
        const esc = (s) => (s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const keyExact = new RegExp(`^${esc(key)}$`, 'i');
        const keyNoSpace = key.replace(/\s+/g, '');
        const keyLooseDots = new RegExp(esc(keyNoSpace).split('').join('\\.?\\s*'), 'i');
        // Try by name or shortName.testName (case-insensitive)
        td = await db.collection('testdefinitions').findOne({
          $or: [
            { name: keyExact },
            { 'shortName.testName': keyExact },
            { name: keyLooseDots },
            { 'shortName.testName': keyLooseDots }
          ]
        });
        if (!td) {
          // As a last resort, pull small candidate set and pick exact normalized match in JS
          const cands = await db.collection('testdefinitions')
            .find({ name: { $regex: esc(key.split(' ')[0]), $options: 'i' } })
            .project({ name: 1, shortName: 1, category: 1, parameters: 1 })
            .limit(20)
            .toArray();
          const norm = (s) => (s || '').toString().toUpperCase().replace(/\./g, '').replace(/\s+/g, '');
          td = cands.find(d => norm(d?.name) === norm(key) || norm(d?.shortName?.testName) === norm(key)) || null;
        }
      } catch {}

      // Derive category fallbacks
      let categoryId = td?.category || null;
      let serviceHeadId = td?.shortName || null;

      // If definition not found, try matching ServiceHead directly (handles C.B.C vs CBC etc.)
      if (!td && !serviceHeadId) {
        try {
          const esc = (s) => (s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const nospace = (testNameRaw || '').toString().replace(/\s+/g, '');
          const loose = new RegExp(esc(nospace).split('').join('\\.?\\s*'), 'i');
          const sh = await db.collection('serviceheads').findOne({ testName: { $regex: loose } }, { projection: { _id: 1, category: 1 } });
          if (sh?._id) {
            serviceHeadId = sh._id;
            // Try to map CategoryHead -> TestCategory by name
            if (sh.category) {
              try {
                const ch = await db.collection('categoryheads').findOne({ _id: sh.category }, { projection: { categoryName: 1 } });
                const catName = ch?.categoryName || t?.category || '';
                if (catName) {
                  const tc = await db.collection('testcategories').findOne({ name: { $regex: `^${esc(String(catName).trim())}$`, $options: 'i' } }, { projection: { _id: 1, name: 1 } });
                  if (tc?._id) categoryId = tc._id;
                }
              } catch {}
            }
          }
        } catch {}
      }

      // If M.P. CARD like test and no category from definition, set MICROBIOLOGY as requested
      const isMpCard = /\bmp\s*card\b|\bm\.?p\.?\s*card\b|malaria/i.test(testNameRaw || '');
      if (!categoryId && isMpCard) {
        try {
          const cat = await db.collection('testcategories').findOne({ name: { $regex: '^MICROBIOLOGY$', $options: 'i' } }, { projection: { _id: 1 } });
          if (cat?._id) categoryId = cat._id;
        } catch {}
      }

      // Additional requested fallbacks for common tests when definition linking fails
      const isCBC = /\b(c\.?b\.?c|complete\s*blood\s*(count|picture))\b/i.test(testNameRaw || '');
      const isWidal = /\bwidal\b/i.test(testNameRaw || '');
      const isBloodGroup = /blood\s*group|rh\b/i.test(testNameRaw || '');
      if (!categoryId && isCBC) {
        try {
          const cat = await db.collection('testcategories').findOne({ name: { $regex: '^HAEMATOLOGY$', $options: 'i' } }, { projection: { _id: 1 } });
          if (cat?._id) categoryId = cat._id;
        } catch {}
      }
      if (!categoryId && isWidal) {
        try {
          const cat = await db.collection('testcategories').findOne({ name: { $regex: '^SEROLOGY$', $options: 'i' } }, { projection: { _id: 1 } });
          if (cat?._id) categoryId = cat._id;
        } catch {}
      }
      if (!categoryId && isBloodGroup) {
        try {
          const cat = await db.collection('testcategories').findOne({ name: { $regex: '^HAEMATOLOGY$', $options: 'i' } }, { projection: { _id: 1 } });
          if (cat?._id) categoryId = cat._id;
        } catch {}
      }

      // Try to map category by string if still missing
      if (!categoryId && t?.category) {
        try {
          const esc = (s) => (s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const tc = await db.collection('testcategories').findOne({ name: { $regex: `^${esc(String(t.category).trim())}$`, $options: 'i' } }, { projection: { _id: 1 } });
          if (tc?._id) categoryId = tc._id;
        } catch {}
      }

      // If category still missing but definition or mapping found, fetch category name
      let categoryName = t?.category || '';
      if ((!categoryName || /^(general|others?)$/i.test(String(categoryName))) && categoryId) {
        try {
          const catDoc = await db.collection('testcategories').findOne({ _id: categoryId }, { projection: { name: 1 } });
          if (catDoc?.name) categoryName = catDoc.name;
        } catch {}
      }

      // Map parameters -> parameterId/unitId from definition
      let params = Array.isArray(t?.parameters) ? [...t.parameters] : [];
      if (td && Array.isArray(td.parameters) && td.parameters.length > 0 && params.length > 0) {
        try {
          const byName = new Map(td.parameters.map(p => [String(p.name).trim().toUpperCase(), p]));
          params = params.map(p => {
            const ref = byName.get(String(p?.name || '').trim().toUpperCase());
            if (ref) {
              return {
                ...p,
                parameterId: String(ref._id || ''),
                unitId: ref.unit ? String(ref.unit) : undefined
              };
            }
            return p;
          });
        } catch {}
      }

      enriched.push({
        ...t,
        testName: testNameRaw,
        testDefinitionId: td?._id ? String(td._id) : (t?.testDefinitionId || null),
        categoryId: categoryId ? String(categoryId) : (t?.categoryId || null),
        serviceHeadId: serviceHeadId ? String(serviceHeadId) : (t?.serviceHeadId || null),
        category: categoryName || t?.category || '',
        parameters: params
      });
    }

    out.testResults = enriched;
  } catch (e) {
    console.warn('⚠️ enrichReportPayload failed:', e?.message);
  }

  return out;
}


// ✅ CREATE NEW PATHOLOGY REPORT
router.post('/', async (req, res) => {
  try {
    console.log('💾 Creating new pathology report...');
    console.log('📋 Request data:', req.body);

    // Check if database connection exists
    if (!db) {
      console.error('❌ Database connection not available');
      return res.status(500).json({
        success: false,
        message: 'Database connection error'
      });
    }

    const {
      receiptNo,
      registrationNo,
      labYearlyNo,
      labDailyNo,
      labNumber,
      patientData,
      department,
      doctor,
      testResults,
      reportDate,
      reportStatus,
      createdBy,
      patientType
    } = req.body;

    // Validate required fields
    if (!receiptNo && !registrationNo && !labYearlyNo && !labDailyNo) {
      return res.status(400).json({
        success: false,
        message: 'At least one identifier (Receipt No, Registration No, Lab Yearly No, or Lab Daily No) is required'
      });
    }

    if (!patientData) {
      return res.status(400).json({
        success: false,
        message: 'Patient data is required'
      });
    }

    // Generate unique report ID using atomic counter to avoid duplicates
    const counters = db.collection('counters');
    const currentYear = new Date().getFullYear();
    const counterName = `pathology_report_${currentYear}`;
    const counterDoc = await counters.findOneAndUpdate(
      { name: counterName },
      { $setOnInsert: { name: counterName }, $inc: { value: 1 } },
      // Cross-version compatible options: returnDocument (v4+), returnOriginal (v3)
      { upsert: true, returnDocument: 'after', returnOriginal: false }
    );
    const seq = (counterDoc && (counterDoc.value?.value ?? counterDoc.value?.sequence ?? counterDoc.value)) || 1;
    const reportId = `RPT${String(seq).padStart(6, '0')}`;


	    // 🔎 Derive patientType robustly from multiple sources (body.patientType, body.type, body.addressType, body.mode, patientData.registrationMode)
	    const normalize = (v) => (typeof v === 'string' ? v.trim().toUpperCase() : '');
	    let inferredPatientType = (normalize(patientType)
	      || normalize(req.body?.type)
	      || normalize(req.body?.addressType)
	      || normalize(req.body?.mode)
	      || normalize(patientData?.registrationMode)
	      || normalize(patientData?.mode)) === 'IPD' ? 'IPD' : 'OPD';

    // If receipt is present, strictly resolve OPD/IPD from Pathology Invoice
    const receiptResolvedType = await typeFromInvoice(receiptNo);
    if (receiptResolvedType) {
      inferredPatientType = receiptResolvedType; // override with truth from receipt
    }

    // If receipt present, resolve invoiceRef (_id) and prefer its mode
    let invoiceRef = (req.body?.invoiceRef ?? '').toString();
    if (receiptNo) {
      try {
        const invDoc = await db.collection('pathologyinvoices').findOne(
          { receiptNumber: parseInt(String(receiptNo)) },
          { projection: { _id: 1, mode: 1, addressType: 1, patientType: 1, patient: 1 } }
        );
        if (invDoc && invDoc._id) {
          invoiceRef = String(invDoc._id);
        }
        const invMode = normalizeType(invDoc?.mode || invDoc?.addressType || invDoc?.patientType || invDoc?.patient?.mode || invDoc?.patient?.type);
        if (invMode === 'IPD' || invMode === 'OPD') {
          inferredPatientType = invMode; // prefer authoritative mode from invoice
        }
      } catch (e) {
        console.warn('⚠️ Could not resolve invoiceRef by receipt:', e.message);
      }
    }

    let reportData = {
      reportId,
      receiptNo: receiptNo || '',
      registrationNo: registrationNo || '',
      // Optional linkage refs (receipt/invoice/registration)
      registrationRef: (req.body?.registrationRef ?? '').toString(),
      invoiceRef: invoiceRef,
      labYearlyNo: labYearlyNo || '',
      labDailyNo: labDailyNo || '',
      labNumber: labNumber || '',
      roomNo: (req.body?.roomNo ?? req.body?.room ?? '').toString(),
      // Persist patient type (OPD/IPD) – prefer explicit IPD from body/mode/registration, default OPD
      patientType: inferredPatientType,
      patientData: {
        firstName: patientData.firstName || '',
        lastName: patientData.lastName || '',
        fullName: `${patientData.firstName || ''} ${patientData.lastName || ''}`.trim(),
        age: patientData.age || '',
        ageIn: patientData.ageIn || (req.body?.patientData?.ageIn ?? ''),
        gender: patientData.gender || '',
        phone: patientData.phone || '',
        address: patientData.address || '',
        aadhaar: patientData.aadhaar || ''
      },
      department: department || '',
      doctor: doctor || '',
      // Save doctorRefNo snapshot if provided by frontend
      doctorRefNo: (req.body?.doctorRefNo ?? '').toString(),
      testResults: testResults || [],
      reportDate: reportDate || new Date().toISOString().split('T')[0],
      reportStatus: reportStatus || 'Completed',
      reportType: 'pathology',
      createdAt: new Date(),
      createdBy: createdBy || 'System',
      updatedAt: new Date()
    };

    // 🔗 Enrich payload with IDs and linked definitions/categories/parameters
    try {
      reportData = await enrichReportPayload(db, reportData);
    } catch (e) {
      console.warn('⚠️ Enrichment failed (continuing with raw payload):', e?.message);
    }


    // Insert with duplicate-id auto-retry (robust, up to 5 attempts)
    const extractSeq = (doc) => {
      if (!doc) return null;
      const d = doc.value ?? doc; // handle FindOneAndUpdateResult wrapper
      if (d && typeof d === 'object') {
        if (typeof d.value === 'number') return d.value;
        if (typeof d.sequence === 'number') return d.sequence;
      }
      if (typeof d === 'number') return d;
      return null;
    };

    let result;
    let attempts = 0;
    const maxAttempts = 5;
    while (attempts < maxAttempts) {
      try {
        result = await db.collection('reports').insertOne(reportData);
        break; // success
      } catch (e) {
        if (e && e.code === 11000) {
          const key = (e && e.keyPattern && Object.keys(e.keyPattern)[0]) || '';
          const msg = (e && e.message ? e.message.toLowerCase() : '');
          const isReceiptDup = key === 'receiptNo' || msg.includes('receiptno') || msg.includes('receipt_number') || msg.includes('receiptnumber');
          const isReportIdDup = key === 'reportId' || msg.includes('reportid');

          if (isReceiptDup) {
            console.warn('⚠️ Duplicate receiptNo detected. Returning conflict without retry.');
            return res.status(409).json({
              success: false,
              message: 'Report already exists for this receipt number',
              error: { code: 11000, field: 'receiptNo' }
            });
          }

          // Default to handling as reportId duplicate: bump counter and retry
          console.warn('⚠️ Duplicate reportId detected. Retrying with incremented counter...');
          const bump = await counters.findOneAndUpdate(
            { name: counterName },
            { $inc: { value: 1 } },
            { returnDocument: 'after', returnOriginal: false }
          );
          const bumpedSeq = extractSeq(bump);
          const currentNum = Number(String(reportData.reportId).replace(/\D/g, '')) || 0;
          const newSeq = bumpedSeq ?? (currentNum + 1);
          reportData.reportId = `RPT${String(newSeq).padStart(6, '0')}`;
          attempts += 1;
          continue; // try again
        }
        // Other errors: rethrow
        throw e;
      }
    }

    if (!result) {
      throw new Error('Failed to create pathology report after multiple attempts');
    }

    if (result.insertedId) {
      console.log('✅ Pathology report created successfully:', result.insertedId);
      res.status(201).json({
        success: true,
        message: 'Pathology report created successfully',
        reportId: reportData.reportId,
        data: reportData
      });
    } else {
      throw new Error('Failed to create pathology report');
    }

  } catch (error) {
    console.error('❌ Error creating pathology report:', error);
    const details = {
      message: error?.message,
      code: error?.code,
      name: error?.name,
      stack: process.env.NODE_ENV === 'production' ? undefined : error?.stack
    };
    return res.status(500).json({
      success: false,
      message: 'Error creating pathology report',
      error: details
    });
  }
});

// ✅ TOTAL COUNT of pathology reports (fast count)
router.get('/count-total', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ success: false, message: 'Database connection error' });
    const total = await db.collection('reports').countDocuments({
      $or: [
        { reportType: 'pathology' },
        { reportType: { $exists: false } },
        { reportType: null },
        { reportType: '' }
      ]
    });
    return res.json({ success: true, totalReports: total });
  } catch (error) {
    console.error('❌ Error counting total pathology reports:', error);
    res.status(500).json({ success: false, message: 'Failed to count reports', error: error.message });
  }
});

// ✅ DAILY COUNT of pathology reports by createdAt/reportDate
router.get('/daily-count', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ success: false, message: 'Database connection error' });
    const { date } = req.query;
    const target = date ? new Date(date) : new Date();
    const startOfDay = new Date(target.getFullYear(), target.getMonth(), target.getDate());
    const endOfDay = new Date(target.getFullYear(), target.getMonth(), target.getDate() + 1);

    // Count by createdAt within day, allow reportDate string fallback
    const count = await db.collection('reports').countDocuments({
      $and: [
        {
          $or: [
            { reportType: 'pathology' },
            { reportType: { $exists: false } },
            { reportType: null },
            { reportType: '' }
          ]
        },
        {
          $or: [
            { createdAt: { $gte: startOfDay, $lt: endOfDay } },
            { reportDate: { $gte: startOfDay.toISOString().slice(0,10), $lte: endOfDay.toISOString().slice(0,10) } }
          ]
        }
      ]
    });

    return res.json({ success: true, count, date: startOfDay.toISOString().slice(0,10) });
  } catch (error) {
    console.error('❌ Error counting daily pathology reports:', error);
    res.status(500).json({ success: false, message: 'Failed to count daily reports', error: error.message });
  }
});

// Helper: Populate testResults IDs (testDefinitionId/categoryId/serviceHeadId) into lightweight objects
async function populateTestRefsForReports(reports, doPopulate = false) {
  try {
    if (!doPopulate || !Array.isArray(reports) || reports.length === 0) return reports;

    const tdIds = new Set();
    const catIds = new Set();
    const shIds = new Set();

    for (const r of reports) {
      const tests = Array.isArray(r?.testResults) ? r.testResults : [];
      for (const t of tests) {
        const td = t?.testDefinitionId; const cat = t?.categoryId; const sh = t?.serviceHeadId;
        if (td && ObjectId.isValid(String(td))) tdIds.add(String(td));
        if (cat && ObjectId.isValid(String(cat))) catIds.add(String(cat));
        if (sh && ObjectId.isValid(String(sh))) shIds.add(String(sh));
      }
    }

    const [tdDocs, catDocs, shDocs] = await Promise.all([
      tdIds.size ? db.collection('testdefinitions')
        .find({ _id: { $in: [...tdIds].map(id => new ObjectId(id)) } })
        .project({ name: 1, testType: 1 })
        .toArray() : Promise.resolve([]),
      catIds.size ? db.collection('testcategories')
        .find({ _id: { $in: [...catIds].map(id => new ObjectId(id)) } })
        .project({ name: 1, categoryId: 1 })
        .toArray() : Promise.resolve([]),
      shIds.size ? db.collection('serviceheads')
        .find({ _id: { $in: [...shIds].map(id => new ObjectId(id)) } })
        .project({ testName: 1, price: 1 })
        .toArray() : Promise.resolve([])
    ]);

    const tdMap = new Map(tdDocs.map(d => [String(d._id), d]));
    const catMap = new Map(catDocs.map(d => [String(d._id), d]));
    const shMap = new Map(shDocs.map(d => [String(d._id), d]));

    return reports.map(r => ({
      ...r,
      testResults: (Array.isArray(r?.testResults) ? r.testResults : []).map(t => {
        const out = { ...t };
        const td = tdMap.get(String(t?.testDefinitionId));
        const cat = catMap.get(String(t?.categoryId));
        const sh = shMap.get(String(t?.serviceHeadId));
        if (td) out.testDefinition = { _id: String(td._id), name: td.name, testType: td.testType };
        if (cat) out.categoryObj = { _id: String(cat._id), name: cat.name, categoryId: cat.categoryId };
        if (sh) out.serviceHead = { _id: String(sh._id), testName: sh.testName, price: sh.price };
        return out;
      })
    }));
  } catch (e) {
    console.warn('⚠️ populateTestRefsForReports failed:', e?.message);
    return reports;
  }
}


// ✅ GET ALL PATHOLOGY REPORTS (GROUPED BY RECEIPT NO)
router.get('/', async (req, res) => {
  try {
    console.log('📋 Fetching all pathology reports (paginated, grouped by receipt)...');
    if (!db) return res.status(500).json({ success: false, message: 'Database connection error' });

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const skip = (page - 1) * limit;
    const enrich = String(req.query.enrich || 'false').toLowerCase() === 'true';
    // Optional: enforce OPD/IPD at server-side for correct counts & pagination
    const onlyType = String((req.query.patientType || req.query.type || '')).trim().toUpperCase();
    const wantTypeFilter = (onlyType === 'IPD' || onlyType === 'OPD');

    // Helpers
    const escapeReg = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parseDateAny = (s) => {
      if (!s) return null;
      const str = String(s).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return new Date(str + 'T00:00:00.000Z');
      if (/^\d{2}-\d{2}-\d{4}$/.test(str)) {
        const [dd, mm, yyyy] = str.split('-');
        return new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
      }
      const d = new Date(str);
      return isNaN(d) ? null : d;
    };

    // Build match conditions
    const andClauses = [{ reportType: 'pathology' }];

    // Coarse pre-filter by existing fields (fallback-safe). Final authoritative filter is applied later via typeStages
    if (wantTypeFilter) {
      andClauses.push({
        $or: [
          { patientType: onlyType },
          { 'patientData.patientType': onlyType },
          { 'patientData.type': onlyType },
          { 'patient.type': onlyType },
          { 'patient.mode': onlyType },
          { addressType: onlyType },
        ]
      });
    }

    // Receipt quick filter
    const receiptRaw = (req.query.receipt || req.query.receiptNo || '').toString().trim();
    if (receiptRaw) {
      const candidates = [];
      const asNum = parseInt(receiptRaw, 10);
      if (!Number.isNaN(asNum)) { candidates.push(asNum, String(asNum)); }
      candidates.push(receiptRaw);
      andClauses.push({
        $or: [
          { receiptNo: { $in: candidates } },
          { receiptNumber: { $in: candidates } }
        ]
      });
    }

    // Yearly number filter (prefix match for speed)
    const labYearlyNo = (req.query.labYearlyNo || '').toString().trim();
    if (labYearlyNo) {
      andClauses.push({ labYearlyNo: { $regex: new RegExp('^' + escapeReg(labYearlyNo), 'i') } });
    }

    // Patient name search
    const q = (req.query.q || '').toString().trim();
    const searchType = (req.query.searchType || '').toString().trim();
    if (q && (!searchType || searchType === 'patientName')) {
      // contains match; if you prefer prefix-only, use '^' + escapeReg(q)
      andClauses.push({ 'patientData.fullName': { $regex: new RegExp(escapeReg(q), 'i') } });
    }

    // Date filters – apply on pathologyregistration.registrationDate (joined later)
    const particularDate = req.query.particularDate || req.query.date || '';
    const dateFromRaw = req.query.dateFrom || '';
    const dateToRaw = req.query.dateTo || '';
    const monthRaw = req.query.month || '';

    let from = parseDateAny(dateFromRaw);
    let to = parseDateAny(dateToRaw);

    // We will build a registrationDate match and apply it AFTER $lookup
    let regDateMatch = null;
    if (particularDate) {
      const d = parseDateAny(particularDate);
      if (d) {
        const start = new Date(d); start.setHours(0,0,0,0);
        const end = new Date(d); end.setHours(23,59,59,999);
        regDateMatch = { registrationDate: { $gte: start, $lte: end } };
      }
    } else {
      // If month provided and no explicit from/to, compute current year's month range
      if (monthRaw && !from && !to) {
        const m = parseInt(monthRaw, 10);
        if (!Number.isNaN(m) && m >= 1 && m <= 12) {
          const year = new Date().getFullYear();
          from = new Date(year, m - 1, 1, 0, 0, 0, 0);
          to = new Date(year, m, 0, 23, 59, 59, 999);
        }
      }
      if (from || to) {
        const range = {};
        if (from) range.$gte = from;
        if (to) range.$lte = to;
        regDateMatch = { registrationDate: range };
      }
    }

    const matchStage = andClauses.length > 1 ? { $and: andClauses } : andClauses[0];

    // Aggregation with grouping and projection (join registration for registrationDate)
    const pipelineBase = [
      { $match: matchStage },
      // Join pathologyregistration by receipt number to get registrationDate
      { $lookup: {
          from: 'pathologyregistration',
          let: { r: '$receiptNo' },
          pipeline: [
            { $match: { $expr: { $or: [
              { $eq: ['$receiptNumber', '$$r'] },
              { $eq: ['$receiptNumber', { $convert: { input: '$$r', to: 'int', onError: -1, onNull: -1 } }] }
            ] } } },
            { $project: { registrationDate: 1, receiptNumber: 1 } }
          ],
          as: 'reg'
      }},
      { $addFields: {
          registrationDate: { $ifNull: [ { $arrayElemAt: ['$reg.registrationDate', 0] }, '$createdAt' ] }
      }},
      { $addFields: {
          registrationDateKey: { $dateToString: { format: '%Y-%m-%d', date: '$registrationDate' } }
      }},
      ...(regDateMatch ? [{ $match: regDateMatch }] : []),
      { $sort: { registrationDate: -1, createdAt: -1 } },
      { $group: {
          _id: { $ifNull: ['$receiptNo', '$_id'] },
          firstDoc: { $first: '$$ROOT' },
          testsMerged: { $push: '$testResults' },
          regDateFirst: { $first: '$registrationDate' },
          regDateKeyFirst: { $first: '$registrationDateKey' }
      }},
      { $project: {
          _id: '$firstDoc._id',
          receiptNo: { $ifNull: ['$firstDoc.receiptNo', '$_id'] },
          registrationNo: '$firstDoc.registrationNo',
          labYearlyNo: '$firstDoc.labYearlyNo',
          labDailyNo: '$firstDoc.labDailyNo',
          labDailyNoNum: { $convert: { input: '$firstDoc.labDailyNo', to: 'int', onError: 0, onNull: 0 } },
          patientType: '$firstDoc.patientType',
          patientData: {
            fullName: '$firstDoc.patientData.fullName',
            age: '$firstDoc.patientData.age',
            ageIn: '$firstDoc.patientData.ageIn',
            gender: '$firstDoc.patientData.gender',
            phone: '$firstDoc.patientData.phone'
          },
          department: '$firstDoc.department',
          doctor: '$firstDoc.doctor',
          reportDate: '$firstDoc.reportDate',
          registrationDate: '$regDateFirst',
          registrationDateKey: '$regDateKeyFirst',
          createdAt: '$firstDoc.createdAt',
          testResults: {
            $reduce: {
              input: '$testsMerged',
              initialValue: [],
              in: { $concatArrays: ['$$value', { $ifNull: ['$$this', []] }] }
            }
          }
        }},
        { $sort: { registrationDateKey: -1, labDailyNoNum: 1, createdAt: -1 } }
      ];

      // Compute authoritative patient type using invoice/registration and optionally filter
      const typeStages = [
        { $lookup: {
            from: 'pathologyinvoices',
            let: { r: '$receiptNo' },
            pipeline: [
              { $match: { $expr: { $or: [
                { $eq: ['$receiptNumber', '$$r'] },
                { $eq: ['$receiptNumber', { $convert: { input: '$$r', to: 'int', onError: -1, onNull: -1 } }] }
              ] } } },
              { $project: { mode: 1, addressType: 1, patientType: 1, patient: 1 } }
            ],
            as: 'inv2'
        }}
        ,{ $lookup: {
            from: 'pathologyregistration',
            let: { r: '$receiptNo' },
            pipeline: [
              { $match: { $expr: { $or: [
                { $eq: ['$receiptNumber', '$$r'] },
                { $eq: ['$receiptNumber', { $convert: { input: '$$r', to: 'int', onError: -1, onNull: -1 } }] }
              ] } } },
              { $project: { mode: 1, addressType: 1, patientType: 1, patient: 1 } }
            ],
            as: 'reg2'
        }},
        ,{ $addFields: {
            inv2First: { $arrayElemAt: ['$inv2', 0] },
            reg2First: { $arrayElemAt: ['$reg2', 0] }
        }},
        ,{ $addFields: {
            invType: { $toUpper: { $ifNull: [
              { $ifNull: ['$inv2First.mode', { $ifNull: ['$inv2First.addressType', { $ifNull: ['$inv2First.patientType', { $ifNull: ['$inv2First.patient.mode', '$inv2First.patient.type'] } ] } ] }] },
              ''
            ] } },
            regType: { $toUpper: { $ifNull: [
              { $ifNull: ['$reg2First.mode', { $ifNull: ['$reg2First.addressType', { $ifNull: ['$reg2First.patientType', { $ifNull: ['$reg2First.patient.mode', '$reg2First.patient.type'] } ] } ] }] },
              ''
            ] } }
        }},
        ,{ $addFields: {
            finalType: { $cond: [
              { $in: ['$invType', ['IPD','OPD']] }, '$invType',
              { $cond: [ { $in: ['$regType', ['IPD','OPD']] }, '$regType', { $toUpper: { $ifNull: ['$patientType', ''] } } ] }
            ] }
        }}
        ,...(wantTypeFilter ? [ { $match: { finalType: onlyType } } ] : [])
        ,{ $addFields: {
            patientType: { $cond: [ { $in: ['$finalType', ['IPD','OPD']] }, '$finalType', '$patientType' ] }
        }}
      ];

    const facetPipeline = [
      ...pipelineBase,
      ...typeStages,
      { $facet: {
          data: [{ $skip: skip }, { $limit: limit }],
          count: [{ $count: 'total' }]
      }}
    ];

    let data = [];
    let totalReports = 0;
    try {
      const aggRes = await db.collection('reports').aggregate(facetPipeline, { allowDiskUse: true }).toArray();
      data = (aggRes[0]?.data) || [];
      totalReports = (aggRes[0]?.count?.[0]?.total) || 0;
    } catch (e) {
      console.warn('⚠️ facetPipeline failed; falling back to coarse pipeline:', e?.message);
      const fallbackFacet = [
        ...pipelineBase,
        { $facet: { data: [{ $skip: skip }, { $limit: limit }], count: [{ $count: 'total' }] } }
      ];
      const aggRes2 = await db.collection('reports').aggregate(fallbackFacet, { allowDiskUse: true }).toArray();
      data = (aggRes2[0]?.data) || [];
      totalReports = (aggRes2[0]?.count?.[0]?.total) || 0;
    }

    // 🔄 Optional: Override TYPE from Pathology Invoice/Registration for current page only
    if (enrich) {
      try {
        const receiptNumbers = data
          .map(r => parseInt(String(r.receiptNo)))
          .filter(n => !Number.isNaN(n));
        if (receiptNumbers.length > 0) {
          const invoices = await db.collection('pathologyinvoices')
            .find({ receiptNumber: { $in: receiptNumbers } })
            .project({ receiptNumber: 1, mode: 1, addressType: 1, patientType: 1, patient: 1 })
            .toArray();
          const invoicesTypeMap = new Map(invoices.map(inv => [
            inv.receiptNumber,
            normalizeType(inv?.mode || inv?.addressType || inv?.patientType || inv?.patient?.mode || inv?.patient?.type)
          ]));

          const regs = await db.collection('pathologyregistration')
            .find({ receiptNumber: { $in: receiptNumbers } })
            .project({ receiptNumber: 1, mode: 1, addressType: 1, patientType: 1, patient: 1 })
            .toArray();
          const regsTypeMap = new Map(regs.map(reg => [
            reg.receiptNumber,
            normalizeType(reg?.mode || reg?.addressType || reg?.patientType || reg?.patient?.mode || reg?.patient?.type)
          ]));

          for (let i = 0; i < data.length; i++) {
            const rec = parseInt(String(data[i].receiptNo));
            const invType = invoicesTypeMap.get(rec);
            const regType = regsTypeMap.get(rec);
            const finalType = (invType === 'IPD' || invType === 'OPD') ? invType : ((regType === 'IPD' || regType === 'OPD') ? regType : data[i].patientType);
            if (finalType === 'IPD' || finalType === 'OPD') data[i].patientType = finalType;
          }
        }
      } catch (e) {
        console.warn('⚠️ Failed to enrich types from invoices:', e.message);
      }
    }

    return res.json({
      success: true,
      data,
      pagination: {
        currentPage: page,
        totalPages: Math.max(1, Math.ceil(totalReports / limit)),
        totalReports,
        hasNext: page * limit < totalReports,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('❌ Error fetching pathology reports:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching pathology reports',
      error: error.message
    });
  }
});

// ✅ GET ALL REPORTS BY RECEIPT NO (UNIFIED)
router.get('/by-receipt/:receiptNo', async (req, res) => {
  try {
    const { receiptNo } = req.params;
    console.log(`🔍 Fetching all reports for Receipt No: ${receiptNo}`);

    if (!db) {
      return res.status(500).json({ success: false, message: 'Database connection error' });
    }

    // Find all reports with this receiptNo
    const reports = await db.collection('reports')
      .find({ receiptNo: receiptNo, reportType: 'pathology' })
      .sort({ createdAt: 1 })
      .toArray();

    if (!reports || reports.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No reports found for this receipt number'
      });
    }

    // Merge all tests into a single unified report
    const unifiedReport = { ...reports[0] };
    unifiedReport.testResults = [];

    for (const report of reports) {
      if (Array.isArray(report.testResults)) {
        unifiedReport.testResults.push(...report.testResults);
      }
    }

    // Ensure TYPE is authoritative from the Cash Receipt
    try {
      const t = await typeFromInvoice(receiptNo);
      if (t) unifiedReport.patientType = t;
    } catch {}

    console.log(`✅ Found ${reports.length} reports, unified into 1 with ${unifiedReport.testResults.length} tests`);

    res.json({
      success: true,
      data: unifiedReport,
      originalReportCount: reports.length
    });

  } catch (error) {
    console.error('❌ Error fetching reports by receipt:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching reports',
      error: error.message
    });
  }
});

// 🔎 Quick existence check by receipt number (used to hard-lock cash edits after report)
router.get('/exists', async (req, res) => {
  try {
    const raw = (req.query.receiptNo || req.query.receipt || '').toString().trim();
    if (!raw) return res.json({ success: true, exists: false });
    const asNum = parseInt(raw, 10);
    const candidates = [];
    if (!Number.isNaN(asNum)) candidates.push(asNum, String(asNum));
    candidates.push(raw);
    const query = {
      reportType: 'pathology',
      $or: [
        { receiptNo: { $in: candidates } },
        { receiptNumber: { $in: candidates } }
      ]
    };
    const found = await db.collection('reports').findOne(query, { projection: { _id: 1 } });
    return res.json({ success: true, exists: !!found });
  } catch (e) {
    console.error('❌ Exists check failed:', e);
    return res.status(500).json({ success: false, message: 'Exists check failed', error: e.message });
  }
});

// ⚡ Bulk existence check by receipt numbers with optional year or date range scoping
router.get('/exists-bulk', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ success: false, message: 'Database connection error' });

    // Accept receipts as comma-separated string or array
    let inputs = [];
    const q = req.query;
    if (Array.isArray(q.receipts)) {
      inputs = q.receipts;
    } else if (q.receipts || q.receiptNos || q.receiptNo) {
      const raw = String(q.receipts || q.receiptNos || q.receiptNo);
      inputs = raw.split(',');
    }

    const cleaned = Array.from(new Set((inputs || [])
      .map(v => String(v).trim())
      .filter(Boolean)));

    if (cleaned.length === 0) {
      return res.json({ success: true, existsByReceiptYear: {} });
    }

    // Optional scoping by year or from/to
    let dateFilter = null;
    const year = parseInt(String(q.year || ''), 10);
    if (!Number.isNaN(year)) {
      const start = new Date(year, 0, 1);
      const end = new Date(year + 1, 0, 1);
      dateFilter = { $or: [
        { createdAt: { $gte: start, $lt: end } },
        { reportDate: { $gte: start, $lt: end } }
      ]};
    } else if (q.from || q.to) {
      const from = q.from ? new Date(String(q.from)) : null;
      const to   = q.to ? new Date(String(q.to)) : null;
      if (from || to) {
        const end = to ? new Date(to) : new Date('9999-12-31');
        const start = from ? new Date(from) : new Date('1970-01-01');
        dateFilter = { $or: [
          { createdAt: { $gte: start, $lt: end } },
          { reportDate: { $gte: start, $lt: end } }
        ]};
      }
    }

    // Build query for any form of receipt storage
    const candidates = new Set();
    cleaned.forEach(v => {
      const n = parseInt(v, 10);
      if (!Number.isNaN(n)) { candidates.add(n); candidates.add(String(n)); }
      candidates.add(v);
    });

    const baseQuery = {
      reportType: 'pathology',
      $or: [
        { receiptNo: { $in: Array.from(candidates) } },
        { receiptNumber: { $in: Array.from(candidates) } }
      ]
    };
    const query = dateFilter ? { $and: [baseQuery, dateFilter] } : baseQuery;

    const docs = await db.collection('reports')
      .find(query)
      .project({ receiptNo: 1, receiptNumber: 1, createdAt: 1, reportDate: 1 })
      .toArray();

    // Build map "<receipt>-<year>" => true
    const existsByReceiptYear = {};
    const yearOf = (d) => {
      const dt = d ? new Date(d) : null;
      return dt && !isNaN(dt.getTime()) ? dt.getFullYear() : null;
    };
    docs.forEach(doc => {
      const r = doc.receiptNo ?? doc.receiptNumber;
      const rNum = parseInt(String(r), 10);
      const yearVal = yearOf(doc.reportDate) ?? yearOf(doc.createdAt);
      if (!Number.isNaN(rNum) && yearVal) {
        existsByReceiptYear[`${rNum}-${yearVal}`] = true;
      }
    });

    return res.json({ success: true, existsByReceiptYear });
  } catch (e) {
    console.error('❌ Bulk exists check failed:', e);
    return res.status(500).json({ success: false, message: 'Exists-bulk failed', error: e.message });
  }
});


// ✅ GET PATHOLOGY REPORT BY ID WITH DETAILED TEST RESULTS
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`🔍 Fetching pathology report with ID: ${id}`);

    let report;

    // Try to find by MongoDB ObjectId first
    if (ObjectId.isValid(id)) {
      report = await db.collection('reports').findOne({ _id: new ObjectId(id), reportType: 'pathology' });
    }

    // If not found, try to find by reportId
    if (!report) {
      report = await db.collection('reports').findOne({ reportId: id, reportType: 'pathology' });
    }

    if (report) {
      // 🔄 NEW: If report has receiptNo, fetch and merge all tests for that receipt
      if (report.receiptNo) {
        try {
          const allReportsForReceipt = await db.collection('reports')
            .find({ receiptNo: report.receiptNo, reportType: 'pathology' })
            .sort({ createdAt: 1 })
            .toArray();

          if (allReportsForReceipt.length > 1) {
            console.log(`🔄 Merging ${allReportsForReceipt.length} reports for receipt ${report.receiptNo}`);
            report.testResults = [];
            for (const r of allReportsForReceipt) {
              if (Array.isArray(r.testResults)) {
                report.testResults.push(...r.testResults);
              }
            }
          }
        } catch (e) {
          console.warn('⚠️ Could not merge reports by receipt:', e.message);
        }
      }

      // 🔒 Ensure TYPE is authoritative from the Cash Receipt (Pathology Invoice)
      try {
        const t = await typeFromInvoice(report.receiptNo);
        if (t) report.patientType = t;
      } catch {}

      console.log('✅ Pathology report found:', report.reportId);

      // ✅ Prefer existing structured testResults (tests with parameters)
      const hasStructuredResults = Array.isArray(report.testResults) && report.testResults.some(t => t && Array.isArray(t.parameters) && t.parameters.length);

      // ✅ Build structured tests from pathologyregistration only if needed
      if (!hasStructuredResults && report.receiptNo) {
        try {
          const pathologyRegistration = await db.collection('pathologyregistration').findOne({
            receiptNumber: parseInt(report.receiptNo)
          });

          if (pathologyRegistration && pathologyRegistration.tests) {
            console.log('📋 Found pathology registration with tests:', pathologyRegistration.tests.length);

            const structuredTests = pathologyRegistration.tests.map(test => {
              const rawName = test.name || test.testName || 'Unknown Test';
              const testNameLower = rawName.toLowerCase();

              // Map standardized display names
              const displayName = testNameLower.includes('lipid') ? 'SERUM LIPID PROFILE'
                                  : testNameLower.includes('cholesterol') ? 'SERUM CHOLESTEROL'
                                  : rawName;

              // Build parameters; prefer DB-provided min/max/unit if any
              let sampleResults = [];
              if (testNameLower.includes('lipid') || testNameLower.includes('cholesterol')) {
                sampleResults = [
                  { testName: 'Total Cholesterol', normalValue: '125-200', unit: 'mg/dL' },
                  { testName: 'HDL Cholesterol', normalValue: '> 40', unit: 'mg/dL' },
                  { testName: 'LDL Cholesterol', normalValue: '< 100', unit: 'mg/dL' },
                  { testName: 'Triglycerides (TG)', normalValue: '< 150', unit: 'mg/dL' },
                  { testName: 'VLDL Cholesterol', normalValue: '2-30', unit: 'mg/dL' },
                  { testName: 'Cholesterol/HDL Ratio', normalValue: '< 5.0', unit: 'Ratio' },
                  { testName: 'Non-HDL Cholesterol', normalValue: '< 130', unit: 'mg/dL' }
                ];

                if (testNameLower.includes('cholesterol') && !testNameLower.includes('lipid')) {
                  sampleResults = sampleResults.filter(r => r.testName === 'Total Cholesterol');
                }

              } else if (testNameLower.includes('cbc') || testNameLower.includes('blood count')) {
                sampleResults = [
                  { testName: 'Hemoglobin', normalValue: '13-17', unit: 'g/dL' },
                  { testName: 'Total RBC Count', normalValue: '4.5-5.5', unit: 'million/μL' },
                  { testName: 'Total WBC Count', normalValue: '4000-11000', unit: '/μL' },
                  { testName: 'Platelet Count', normalValue: '150000-450000', unit: '/μL' }
                ];
              } else {
                // Default single test result
                sampleResults = [{
                  testName: rawName,
                  normalValue: test.normalRange || test.normalValue || '-',
                  result: test.result || '',
                  unit: test.unit || '',
                  maxValue: test.maxValue || test.max || '',
                  minValue: test.minValue || test.min || ''
                }];
              }

              // Merge DB-provided values for each parameter name if present on test
              const dbParamMap = {};
              if (Array.isArray(test.parameters)) {
                test.parameters.forEach(p => { if (p?.testName || p?.name) dbParamMap[(p.testName||p.name)] = p; });
              }

              return {
                testName: displayName,
                category: test.category || (testNameLower.includes('lipid') || testNameLower.includes('cholesterol') ? 'BIOCHEMISTRY' : 'GENERAL TESTS'),
                parameters: sampleResults.map(r => {
                  const dbp = dbParamMap[r.testName];
                  const merged = {
                    name: r.testName,
                    testName: r.testName,
                    normalValue: dbp?.normalValue || dbp?.normalRange || r.normalValue,
                    normalRange: dbp?.normalRange || dbp?.normalValue || r.normalValue,
                    result: dbp?.result || r.result || '',
                    unit: dbp?.unit || r.unit || '',
                    // Prefer explicit lower/upper from DB to populate min/max consistently for UI
                    maxValue: (dbp?.upperValue ?? dbp?.maxValue ?? dbp?.max ?? r.maxValue ?? ''),
                    minValue: (dbp?.lowerValue ?? dbp?.minValue ?? dbp?.min ?? r.minValue ?? ''),
                    // Also surface lower/upper for consumers using them directly
                    upperValue: dbp?.upperValue ?? dbp?.maxValue ?? r.upperValue ?? '',
                    lowerValue: dbp?.lowerValue ?? dbp?.minValue ?? r.lowerValue ?? '',
                    status: dbp?.status || test.status || 'pending'
                  };
                  return merged;
                })
              };
            });

            if (structuredTests.length > 0) {
              report.testResults = structuredTests;
            }
          }
        } catch (error) {
          console.log('⚠️ Error fetching detailed test results:', error.message);
        }
      }

      // Optional populate via ?populate=true
      const shouldPopulate = String(req.query.populate || 'false').toLowerCase() === 'true';
      let outReport = report;
      if (shouldPopulate) {
        const arr = await populateTestRefsForReports([report], true);
        outReport = arr && arr[0] ? arr[0] : report;
      }

      res.json({
        success: true,
        data: outReport
      });
    } else {
      console.log('❌ Pathology report not found');
      res.status(404).json({
        success: false,
        message: 'Pathology report not found'
      });
    }

  } catch (error) {
    console.error('❌ Error fetching pathology report:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching pathology report',
      error: error.message
    });
  }
});

// ✅ UPDATE PATHOLOGY REPORT (adds edit history and edited flag)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`🔄 Updating pathology report with ID: ${id}`);

    if (!db) {
      return res.status(500).json({ success: false, message: 'Database connection error' });
    }

    // Helper to safely access nested props using dot-paths
    const getByPath = (obj, path) => path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);

    // Load existing report first (by _id or reportId)
    let existing = null;
    if (ObjectId.isValid(id)) {
      existing = await db.collection('reports').findOne({ _id: new ObjectId(id), reportType: 'pathology' });
    }
    if (!existing) {
      existing = await db.collection('reports').findOne({ reportId: id, reportType: 'pathology' });
    }
    if (!existing) {
      console.log('❌ Pathology report not found for update');
      return res.status(404).json({ success: false, message: 'Pathology report not found' });
    }

    // Build a minimal set of fields we track for edited indicator and history
    const fieldsToTrack = [
      'receiptNo',
      'registrationNo',
      'labYearlyNo',
      'labDailyNo',
      'reportDate',
      'patientData.firstName',
      'patientData.lastName',
      'patientData.fullName',
      'patientData.age',
      'patientData.gender'
    ];

    const body = req.body || {};

    // Compute changes for tracked fields
    const changes = {};
    for (const path of fieldsToTrack) {
      const before = getByPath(existing, path);
      const after = getByPath(body, path);
      if (after !== undefined && before !== after) {
        changes[path] = { before, after };
      }
    }

    // Additionally, track changed test parameter results (lightweight diff)
    try {
      const beforeTests = Array.isArray(existing.testResults) ? existing.testResults : [];
      const afterTests = Array.isArray(body.testResults) ? body.testResults : null;
      if (afterTests) {
        const paramChanges = [];
        const byName = (arr) => {
          const map = new Map();
          arr.forEach(t => map.set(String(t.testName || t.name || ''), t));
          return map;
        };
        const beforeMap = byName(beforeTests);
        const afterMap = byName(afterTests);
        for (const [tName, afterT] of afterMap.entries()) {
          const beforeT = beforeMap.get(tName);
          const beforeParams = beforeT?.parameters || [];
          const afterParams = afterT?.parameters || [];
          const pMap = new Map();
          afterParams.forEach(p => pMap.set(String(p.name), p));
          for (const bp of beforeParams) {
            const ap = pMap.get(String(bp.name));
            if (ap && ap.result !== undefined && bp.result !== ap.result) {
              paramChanges.push({ testName: tName, parameter: bp.name, before: bp.result, after: ap.result });
            }
          }
        }
        if (paramChanges.length > 0) {
          changes['testResults'] = { before: 'see details', after: 'see details', details: paramChanges.slice(0, 50) };
        }
      }
    } catch (e) {
      console.warn('⚠️ Failed computing test result diffs:', e.message);
    }

    const editedBy = body.editedBy || body.updatedBy || 'System';
    const editEntry = Object.keys(changes).length > 0 ? {
      editedAt: new Date(),
      editedBy,
      changes
    } : null;

    // Build final update
    const updateData = {
      ...body,
      // Ensure patientData.fullName is consistent
      patientData: body.patientData ? {
        ...existing.patientData,
        ...body.patientData,
        fullName: (body.patientData.fullName && String(body.patientData.fullName).trim())
          || [body.patientData.firstName, body.patientData.lastName].filter(Boolean).join(' ')
          || existing.patientData?.fullName || ''
      } : existing.patientData,
      updatedAt: new Date(),
      isEdited: editEntry ? true : (existing.isEdited || false),
      lastEditedAt: editEntry ? new Date() : (existing.lastEditedAt || existing.updatedAt || existing.createdAt),
      lastEditedBy: editEntry ? editedBy : (existing.lastEditedBy || existing.createdBy || 'System')
    };

	    // 🔗 Re-enrich update payload to attach IDs/links (patient/department/doctor/tests)
	    try {
	      const enriched = await enrichReportPayload(db, { ...existing, ...updateData });
	      // Preserve immutable fields
	      enriched.createdAt = existing.createdAt;
	      enriched.reportId = existing.reportId || enriched.reportId;
	      // Replace updateData with enriched data
	      updateData = enriched;
	    } catch (e) {
	      console.warn('⚠️ Update enrichment failed:', e?.message);
	    }


    // Perform update with $set and optional $push to editHistory
    const updateOps = editEntry ? {
      $set: updateData,
      $push: { editHistory: editEntry }
    } : { $set: updateData };

    let result;
    if (ObjectId.isValid(id)) {
      result = await db.collection('reports').updateOne(
        { _id: new ObjectId(id), reportType: 'pathology' },
        updateOps
      );
    }
    if (!result || result.matchedCount === 0) {
      result = await db.collection('reports').updateOne(
        { reportId: id, reportType: 'pathology' },
        updateOps
      );
    }

    if (result.matchedCount > 0) {
      console.log('✅ Pathology report updated successfully');
      return res.json({ success: true, message: 'Pathology report updated successfully' });
    } else {
      console.log('❌ Pathology report not found for update (after re-check)');
      return res.status(404).json({ success: false, message: 'Pathology report not found' });
    }
  } catch (error) {
    console.error('❌ Error updating pathology report:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating pathology report',
      error: error.message
    });
  }
});

// ✅ DELETE PATHOLOGY REPORT
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`🗑️ Deleting pathology report with ID: ${id}`);

    let reportToDelete;

    // Find the report first to check if it's the last one
    if (ObjectId.isValid(id)) {
      reportToDelete = await db.collection('reports').findOne({ _id: new ObjectId(id), reportType: 'pathology' });
    }

    // If not found, try to find by reportId
    if (!reportToDelete) {
      reportToDelete = await db.collection('reports').findOne({ reportId: id, reportType: 'pathology' });
    }

    if (!reportToDelete) {
      console.log('❌ Pathology report not found for deletion');
      return res.status(404).json({
        success: false,
        message: 'Pathology report not found'
      });
    }

    // Extract year from report date and check counter
    if (reportToDelete.reportId) {
      // reportId format: REP-2025-001
      const reportIdParts = reportToDelete.reportId.split('-');
      if (reportIdParts.length === 3) {
        const reportYear = parseInt(reportIdParts[1]);
        const reportNumber = parseInt(reportIdParts[2]);
        const counterName = `pathology_report_${reportYear}`;

        // Get current counter value
        const counter = await db.collection('counters').findOne({ name: counterName });

        if (counter) {
          // Check if this is the last report (counter value matches report number)
          if (reportNumber === counter.value) {
            console.log(`🔄 Last report detected! Decrementing counter from ${counter.value} to ${counter.value - 1}`);

            // Decrement counter
            await db.collection('counters').updateOne(
              { name: counterName },
              { $set: { value: Math.max(0, counter.value - 1) } }
            );

            console.log(`✅ Counter decremented successfully to ${counter.value - 1}`);
          } else {
            console.log(`ℹ️ Not the last report. Report: ${reportNumber}, Counter: ${counter.value}. Counter unchanged.`);
          }
        }
      }
    }

    // Now delete the report
    let result;
    if (ObjectId.isValid(id)) {
      result = await db.collection('reports').deleteOne({ _id: new ObjectId(id), reportType: 'pathology' });
    } else {
      result = await db.collection('reports').deleteOne({ reportId: id, reportType: 'pathology' });
    }

    if (result.deletedCount > 0) {
      console.log('✅ Pathology report deleted successfully');
      res.json({
        success: true,
        message: 'Pathology report deleted successfully'
      });
    } else {
      console.log('❌ Pathology report deletion failed');
      res.status(500).json({
        success: false,
        message: 'Failed to delete pathology report'
      });
    }

  } catch (error) {
    console.error('❌ Error deleting pathology report:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting pathology report',
      error: error.message
    });
  }
});


// Admin: Repair existing pathology reports by enriching missing IDs/links
router.post('/admin/repair-links', async (req, res) => {
  // Use module-scoped db (already connected at top of file)
  const limit = Math.min(parseInt(String(req.query.limit || '200')), 2000);
  try {
    if (!db) return res.status(500).json({ success: false, message: 'Database connection error' });
    const query = {
      reportType: 'pathology',
      $or: [
        { patientRef: { $exists: false } },
        { departmentRef: { $exists: false } },
        { doctorRef: { $exists: false } },
        { roomRef: { $exists: false } },
        { 'testResults.testDefinitionId': { $exists: false } },
        { 'testResults.categoryId': { $exists: false } }
      ]
    };

    const cursor = db.collection('reports').find(query).limit(limit);
    let processed = 0; let updated = 0; const errors = [];
    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      try {
        const enriched = await enrichReportPayload(db, doc);
        // Preserve immutable fields
        enriched._id = doc._id;
        enriched.createdAt = doc.createdAt;
        enriched.reportId = doc.reportId;
        const { _id, ...setDoc } = enriched;
        const r = await db.collection('reports').updateOne({ _id: doc._id }, { $set: setDoc });
        updated += r.modifiedCount;
      } catch (e) {
        errors.push({ id: String(doc._id), message: e?.message });
      }
      processed += 1;
    }

    return res.json({ success: true, processed, updated, errorsCount: errors.length, sampleErrors: errors.slice(0, 5) });
  } catch (e) {
    console.error('repair-links failed', e);
    return res.status(500).json({ success: false, message: 'repair-links failed', error: e?.message });
  }
});

module.exports = router;

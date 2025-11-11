const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const { authenticateToken } = require('../middlewares/auth');
const InventoryItem = require('../models/InventoryItem');
const InventoryBatch = require('../models/InventoryBatch');

// Protect all routes
router.use(authenticateToken);

// Helper: compute stock and next expiry via aggregation
async function addStockAndExpiryToItems(items) {
  const itemIds = items.map(i => i._id);
  const agg = await InventoryBatch.aggregate([
    { $match: { item: { $in: itemIds }, remainingQuantity: { $gt: 0 } } },
    { $group: {
        _id: '$item',
        stock: { $sum: '$remainingQuantity' },
        nextExpiry: { $min: '$expiryDate' }
    }}
  ]);
  const map = new Map(agg.map(a => [String(a._id), a]));
  return items.map(i => {
    const extra = map.get(String(i._id));
    return {
      ...i.toObject(),
      stock: extra ? extra.stock : 0,
      nextExpiry: extra ? extra.nextExpiry : null
    };
  });
}

// GET /api/inventory/items - list items with stock and next expiry
router.get('/items', async (req, res) => {
  try {
    const { search = '', type = '', active = 'true' } = req.query;
    const q = {};
    if (search) q.name = { $regex: new RegExp(search, 'i') };
    if (type) q.type = type;
    if (active !== 'all') q.isActive = active === 'true';

    const items = await InventoryItem.find(q).sort({ name: 1 });
    const enriched = await addStockAndExpiryToItems(items);
    res.json({ success: true, items: enriched });
  } catch (e) {
    console.error('GET /inventory/items error', e);
    res.status(500).json({ success: false, message: 'Failed to load items' });
  }
});

// POST /api/inventory/items - create item
router.post('/items', async (req, res) => {
  try {
    const { name, type, category, unit, minStock = 0, description = '', isActive = true } = req.body;
    if (!name || !type) return res.status(400).json({ success: false, message: 'name and type are required' });

    const item = new InventoryItem({ name, type, category, unit, minStock, description, isActive });
    await item.save();
    res.status(201).json({ success: true, item });
  } catch (e) {
    console.error('POST /inventory/items error', e);
    res.status(500).json({ success: false, message: 'Failed to create item' });
  }
});

// PUT /api/inventory/items/:id - update item
router.put('/items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const update = req.body || {};
    const item = await InventoryItem.findByIdAndUpdate(id, update, { new: true });
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    res.json({ success: true, item });
  } catch (e) {
    console.error('PUT /inventory/items/:id error', e);
    res.status(500).json({ success: false, message: 'Failed to update item' });
  }
});

// DELETE /api/inventory/items/:id - soft delete (deactivate)
router.delete('/items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const item = await InventoryItem.findByIdAndUpdate(id, { isActive: false }, { new: true });
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    res.json({ success: true, item });
  } catch (e) {
    console.error('DELETE /inventory/items/:id error', e);
    res.status(500).json({ success: false, message: 'Failed to delete item' });
  }
});

// POST /api/inventory/items/:id/batches - add stock batch
router.post('/items/:id/batches', async (req, res) => {
  try {
    const { id } = req.params;
    const item = await InventoryItem.findById(id);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

    const { batchNo = '', lotNo = '', quantity, unitCost = 0, supplierName = '', receivedDate, expiryDate, notes = '' } = req.body;
    if (quantity === undefined || quantity === null || Number(quantity) < 0) {
      return res.status(400).json({ success: false, message: 'Valid quantity required' });
    }

    const batch = new InventoryBatch({
      item: item._id,
      batchNo,
      lotNo,
      quantity: Number(quantity),
      remainingQuantity: Number(quantity),
      unitCost: Number(unitCost) || 0,
      supplierName,
      receivedDate: receivedDate ? new Date(receivedDate) : new Date(),
      expiryDate: expiryDate ? new Date(expiryDate) : undefined,
      notes
    });
    await batch.save();

    res.status(201).json({ success: true, batch });
  } catch (e) {
    console.error('POST /inventory/items/:id/batches error', e);
    res.status(500).json({ success: false, message: 'Failed to add batch' });
  }
});

// GET /api/inventory/items/:id/batches - list batches
router.get('/items/:id/batches', async (req, res) => {
  try {
    const { id } = req.params;
    const batches = await InventoryBatch.find({ item: id }).sort({ expiryDate: 1, receivedDate: 1 });
    res.json({ success: true, batches });
  } catch (e) {
    console.error('GET /inventory/items/:id/batches error', e);
    res.status(500).json({ success: false, message: 'Failed to load batches' });
  }
});

// POST /api/inventory/consume - consume quantity (FIFO by earliest expiry)
router.post('/consume', async (req, res) => {
  try {
    const { itemId, quantity, batchId } = req.body;
    if (!itemId || !quantity || Number(quantity) <= 0) return res.status(400).json({ success: false, message: 'itemId and positive quantity required' });

    let remaining = Number(quantity);
    const consumption = [];

    if (batchId) {
      const b = await InventoryBatch.findOne({ _id: batchId, item: itemId });
      if (!b) return res.status(404).json({ success: false, message: 'Batch not found' });
      const used = Math.min(b.remainingQuantity, remaining);
      b.remainingQuantity -= used;
      await b.save();
      consumption.push({ batchId: b._id, used });
      remaining -= used;
    }

    while (remaining > 0) {
      const next = await InventoryBatch.findOne({ item: itemId, remainingQuantity: { $gt: 0 } })
        .sort({ expiryDate: 1, receivedDate: 1 });
      if (!next) break;
      const used = Math.min(next.remainingQuantity, remaining);
      next.remainingQuantity -= used;
      await next.save();
      consumption.push({ batchId: next._id, used });
      remaining -= used;
    }

    const totalUsed = consumption.reduce((s, c) => s + c.used, 0);
    res.json({ success: true, used: totalUsed, partial: remaining > 0, details: consumption });
  } catch (e) {
    console.error('POST /inventory/consume error', e);
    res.status(500).json({ success: false, message: 'Failed to consume stock' });
  }
});

// GET /api/inventory/low-stock?threshold=5 - items where stock <= minStock (or threshold)
router.get('/low-stock', async (req, res) => {
  try {
    const threshold = req.query.threshold ? Number(req.query.threshold) : null;

    const items = await InventoryItem.find({ isActive: true });
    const enriched = await addStockAndExpiryToItems(items);

    const low = enriched.filter(i => {
      const min = threshold !== null ? threshold : (i.minStock || 0);
      return (i.stock || 0) <= min;
    });

    res.json({ success: true, items: low });
  } catch (e) {
    console.error('GET /inventory/low-stock error', e);
    res.status(500).json({ success: false, message: 'Failed to load low stock items' });
  }
});

// GET /api/inventory/expiring-soon?days=30 - batches expiring within N days
router.get('/expiring-soon', async (req, res) => {
  try {
    const days = Number(req.query.days || 30);
    const now = new Date();
    const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const batches = await InventoryBatch.find({
      remainingQuantity: { $gt: 0 },
      expiryDate: { $ne: null, $exists: true, $lte: cutoff }
    }).populate('item', 'name type unit minStock').sort({ expiryDate: 1 });

    res.json({ success: true, batches });
  } catch (e) {
    console.error('GET /inventory/expiring-soon error', e);
    res.status(500).json({ success: false, message: 'Failed to load expiring batches' });
  }
});

module.exports = router;


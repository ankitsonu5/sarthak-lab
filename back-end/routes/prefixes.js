const express = require('express');
const router = express.Router();
const Prefix = require('../models/Prefix');

// List for dropdown (active only)
router.get('/list', async (req, res) => {
  try {
    const prefixes = await Prefix.find({ isActive: true }).sort({ name: 1 });
    res.json({ success: true, prefixes });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch prefixes', error: error.message });
  }
});

// Paginated list with optional search
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const search = (req.query.search || '').trim();

    const query = {};
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    const [items, total] = await Promise.all([
      Prefix.find(query).sort({ name: 1 }).skip(skip).limit(limit),
      Prefix.countDocuments(query)
    ]);

    res.json({
      success: true,
      prefixes: items,
      pagination: {
        currentPage: page,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        total
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch prefixes', error: error.message });
  }
});

// Create
router.post('/', async (req, res) => {
  try {
    const { name, gender, isActive = true } = req.body;
    if (!name || !gender) {
      return res.status(400).json({ success: false, message: 'Name and gender are required' });
    }
    const normalizedName = String(name).trim();

    const existing = await Prefix.findOne({ name: new RegExp('^' + normalizedName + '$', 'i') });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Prefix already exists' });
    }

    const created = await Prefix.create({ name: normalizedName, gender, isActive });
    res.status(201).json({ success: true, prefix: created });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create prefix', error: error.message });
  }
});

// Update
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, gender, isActive } = req.body;

    const updated = await Prefix.findByIdAndUpdate(
      id,
      { $set: { name, gender, isActive } },
      { new: true, runValidators: true }
    );

    if (!updated) return res.status(404).json({ success: false, message: 'Prefix not found' });

    res.json({ success: true, prefix: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update prefix', error: error.message });
  }
});

// Delete
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Prefix.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Prefix not found' });
    res.json({ success: true, message: 'Prefix deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete prefix', error: error.message });
  }
});

module.exports = router;


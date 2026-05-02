const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAdmin } = require('../middleware/requireAdmin');

// Default permissions structure
const DEFAULT_ROLES = {
  admin: {
    inventory: true,
    recipes: true,
    add_recipes: true,
    shopping: true,
    booking: true,
    planning: true,
    admin: true
  },
  lead_teacher: {
    inventory: true,
    recipes: true,
    add_recipes: true,
    shopping: true,
    booking: true,
    planning: true,
    admin: false
  },
  teacher: {
    inventory: true,
    recipes: true,
    add_recipes: true,
    shopping: true,
    booking: true,
    planning: false,
    admin: false
  },
  technician: {
    inventory: true,
    recipes: true,
    add_recipes: false,
    shopping: true,
    booking: false,
    planning: false,
    admin: false
  },
  student: {
    inventory: true,
    recipes: true,
    add_recipes: false,
    shopping: false,
    booking: false,
    planning: false,
    admin: false
  },
  public_access: {
    inventory: true,
    recipes: false,
    add_recipes: false,
    shopping: false,
    booking: false,
    planning: false,
    admin: false
  }
};

const ROUTES = ['inventory', 'add_recipes', 'recipes', 'shopping', 'booking', 'planning', 'admin'];

function buildDefaultRolesRows() {
  return Object.entries(DEFAULT_ROLES)
    .map(([role_name, values]) => ({ role_name, ...values }));
}

let schemaAvailable = false;
let schemaReadyPromise = null;
let lastSchemaInitAttempt = 0;
const SCHEMA_INIT_RETRY_MS = 60 * 1000;

async function initializePermissionsSchema() {
  try {
    // Create table once and preserve existing permission rows across restarts.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        id SERIAL PRIMARY KEY,
        role_name VARCHAR(50) UNIQUE NOT NULL,
        recipes BOOLEAN DEFAULT false,
        add_recipes BOOLEAN DEFAULT false,
        inventory BOOLEAN DEFAULT false,
        shopping BOOLEAN DEFAULT false,
        booking BOOLEAN DEFAULT false,
        planning BOOLEAN DEFAULT false,
        admin BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Ensure planning column exists for pre-existing databases.
    await pool.query('ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS planning BOOLEAN DEFAULT false');

    // Ensure all known roles exist without overwriting custom values.
    for (const [roleName, permissions] of Object.entries(DEFAULT_ROLES)) {
      await pool.query(`
        INSERT INTO role_permissions (role_name, recipes, add_recipes, inventory, shopping, booking, planning, admin)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (role_name) DO NOTHING
      `, [
        roleName,
        permissions.recipes,
        permissions.add_recipes,
        permissions.inventory,
        permissions.shopping,
        permissions.booking,
        permissions.planning,
        permissions.admin
      ]);
    }

    schemaAvailable = true;
    console.log('[PERMISSIONS] Schema ready');
    return true;
  } catch (err) {
    schemaAvailable = false;
    console.error('[PERMISSIONS] Schema initialization error:', err);
    return false;
  }
}

async function ensureSchemaReady() {
  if (schemaAvailable) return true;

  const now = Date.now();
  const shouldRetry = !schemaReadyPromise || (now - lastSchemaInitAttempt) > SCHEMA_INIT_RETRY_MS;
  if (shouldRetry) {
    lastSchemaInitAttempt = now;
    schemaReadyPromise = initializePermissionsSchema();
  }

  return schemaReadyPromise;
}

// Kick off initialization without crashing startup if DB is temporarily unavailable.
ensureSchemaReady().catch((err) => {
  console.error('[PERMISSIONS] Unexpected schema initialization error:', err);
});

// GET /api/permissions - Fetch all role permissions
router.get('/all', async (req, res) => {
  try {
    const ready = await ensureSchemaReady();
    if (!ready) {
      return res.json({
        success: true,
        degraded: true,
        warning: 'Permissions database is temporarily unavailable. Showing default permissions.',
        roles: buildDefaultRolesRows(),
        routes: ROUTES
      });
    }

    const result = await pool.query(`
      SELECT role_name, recipes, add_recipes, inventory, shopping, booking, planning, admin
      FROM role_permissions
      ORDER BY CASE 
        WHEN role_name = 'admin' THEN 1
        WHEN role_name = 'lead_teacher' THEN 2
        WHEN role_name = 'teacher' THEN 3
        WHEN role_name = 'technician' THEN 4
        WHEN role_name = 'student' THEN 5
        WHEN role_name = 'public_access' THEN 6
        ELSE 99
      END
    `);

    res.json({ success: true, roles: result.rows, routes: ROUTES });
  } catch (err) {
    console.error('[PERMISSIONS] Error fetching permissions:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/permissions/:roleName - Update permissions for a role
router.put('/:roleName', requireAdmin, async (req, res) => {
  const roleName = req.params.roleName;
  const permissions = req.body;

  if (!DEFAULT_ROLES[roleName]) {
    return res.status(400).json({ success: false, error: 'Invalid role name' });
  }

  try {
    const ready = await ensureSchemaReady();
    if (!ready) {
      return res.status(503).json({
        success: false,
        error: 'Permissions database is temporarily unavailable. Please try again shortly.'
      });
    }
    
    await pool.query(`
      UPDATE role_permissions
      SET recipes = $1, add_recipes = $2, inventory = $3, shopping = $4, booking = $5, planning = $6, admin = $7,
          updated_at = CURRENT_TIMESTAMP
      WHERE role_name = $8
    `, [
      permissions.recipes || false,
      permissions.add_recipes || false,
      permissions.inventory || false,
      permissions.shopping || false,
      permissions.booking || false,
      permissions.planning || false,
      permissions.admin || false,
      roleName
    ]);

    res.json({ success: true, message: `Permissions for ${roleName} updated successfully` });
  } catch (err) {
    console.error('[PERMISSIONS] Error updating permissions:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/permissions/reset - Reset to default permissions
router.post('/reset', requireAdmin, async (req, res) => {
  try {
    const ready = await ensureSchemaReady();
    if (!ready) {
      return res.status(503).json({
        success: false,
        error: 'Permissions database is temporarily unavailable. Please try again shortly.'
      });
    }

    await pool.query('TRUNCATE TABLE role_permissions RESTART IDENTITY');

    for (const [roleName, permissions] of Object.entries(DEFAULT_ROLES)) {
      await pool.query(`
        INSERT INTO role_permissions (role_name, recipes, add_recipes, inventory, shopping, booking, planning, admin)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        roleName,
        permissions.recipes,
        permissions.add_recipes,
        permissions.inventory,
        permissions.shopping,
        permissions.booking,
        permissions.planning,
        permissions.admin
      ]);
    }

    res.json({ success: true, message: 'Permissions reset to defaults' });
  } catch (err) {
    console.error('[PERMISSIONS] Error resetting permissions:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

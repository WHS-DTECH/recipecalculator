
const express = require('express');
const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const sqlite3 = require('sqlite3').verbose();
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const DB_PATH = process.env.DATABASE_PATH || 'database.sqlite';
const db = new sqlite3.Database(DB_PATH);

// Load extracted ingredients utility
const { loadExtractedIngredients } = require('./public/load_extracted_ingredients');
// --- API: Load ExtractedIngredients file for a recipe ---
app.get('/api/extracted-ingredients/:id/load', (req, res) => {
  const recipeId = req.params.id;
  loadExtractedIngredients(recipeId, (err, data) => {
    if (err) {
      return res.status(404).json({ success: false, error: 'ExtractedIngredients file not found', details: err.message });
    }
    res.json({ success: true, recipeId, data });
  });
});

// --- Suggestions API ---
app.get('/api/suggestions', (req, res) => {
  db.all('SELECT * FROM suggestions ORDER BY date DESC, id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});
app.post('/api/suggestions', (req, res) => {
  const { date, recipe_name, suggested_by, email, url, reason } = req.body;
  db.run('INSERT INTO suggestions (date, recipe_name, suggested_by, email, url, reason) VALUES (?, ?, ?, ?, ?, ?)',
    [date, recipe_name, suggested_by, email, url, reason],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, id: this.lastID });
    }
  );
});

// --- Cleanup Instructions API ---
app.post('/api/recipes/cleanup-instructions', (req, res) => {
  db.all('SELECT id, instructions FROM recipes', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    let updated = 0;
    rows.forEach(row => {
      if (!row.instructions) return;
      // Remove <p>, </p>, <br>, <br/>, <br /> and all HTML tags
      let cleaned = row.instructions
        .replace(/<\/?p>/gi, ' ')
        .replace(/<br\s*\/?\s*>/gi, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ') // collapse whitespace
        .trim();
      db.run('UPDATE recipes SET instructions = ? WHERE id = ?', [cleaned, row.id], function(err2) {
        if (!err2) updated++;
      });
    });
    res.json({ success: true, updated });
  });
});


// Set default port if not defined
const PORT = process.env.PORT || 4000;

// RawDataTXT HTML Preview Route (must come BEFORE express.static)
const path = require('path');
// const fs = require('fs'); // Already declared above
app.get('/RawDataTXT/:file', (req, res, next) => {
  const fileName = req.params.file;
  const filePath = path.join(__dirname, 'public', 'RawDataTXT', fileName);
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) return next(); // Pass to 404 handler if not found
    res.send(`<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Raw Data Preview - ${fileName}</title>
        <style>
          body { background: #222; color: #f8f8f2; font-family: 'Fira Mono', 'Consolas', monospace; margin: 0; padding: 0; }
          .container { max-width: 900px; margin: 2rem auto; background: #282a36; border-radius: 8px; box-shadow: 0 2px 12px #0004; padding: 2rem; }
          h2 { color: #50fa7b; margin-top: 0; }
          pre { white-space: pre-wrap; word-break: break-word; font-size: 1.1em; line-height: 1.5; background: #23242b; padding: 1.2em; border-radius: 6px; overflow-x: auto; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>Raw Data Preview: ${fileName}</h2>
          <pre>${data.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</pre>
        </div>
      </body>
      </html>`);
  });
});

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Modular routes setup
const departmentRoutes = require('./routes/department');
const staffUploadRoutes = require('./routes/staff_upload');
const classRoutes = require('./routes/classes');
const recipeRoutes = require('./routes/recipes');
const bookingsRoutes = require('./routes/bookings');
const ingredientsRoutes = require('./routes/ingredients');
const aisleCategoryRoutes = require('./routes/aisle_category');
app.use('/api/aisle_category', aisleCategoryRoutes);

// Mount aisleKeywords router
const aisleKeywordsRoutes = require('./routes/aisleKeywords');
app.use('/api/aisle_keywords', aisleKeywordsRoutes);
const foodBrandsRoutes = require('./routes/food_brands');
app.locals.db = db;
app.use('/api/department', departmentRoutes);
app.use('/api/staff_upload', staffUploadRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/recipes', recipeRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api/ingredients', ingredientsRoutes);
app.use('/api/food_brands', foodBrandsRoutes);

// Centralized DB schema setup (after db is defined)
const initializeDatabase = require('./db_schema');
initializeDatabase(db);

// Ensure bookings table exists
db.run(`CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id TEXT,
  staff_name TEXT,
  class_name TEXT,
  booking_date TEXT,
  period TEXT,
  recipe TEXT,
  recipe_id INTEGER,
  class_size INTEGER
)`);

// Debug log endpoint for frontend JS
app.post('/api/debug-log', (req, res) => {
  const { msg } = req.body;
  console.log('[FRONTEND DEBUG]', msg);
  res.json({ success: true });
});

// --- Title Solution Endpoint (saves to DB) ---
app.post('/api/title-extractor/solution', (req, res) => {
  const { recipeId, solution } = req.body;
  console.log('[DEBUG /api/title-extractor/solution] Called with:', { recipeId, solution });
  if (!recipeId || !solution) {
    console.log('[DEBUG /api/title-extractor/solution] Missing recipeId or solution');
    return res.status(400).json({ error: 'Recipe ID and solution are required.' });
  }
  db.run('UPDATE recipes SET name = ? WHERE id = ?', [solution, recipeId], function(err) {
    if (err) {
      console.error('[DEBUG /api/title-extractor/solution] Failed to save title solution:', err.message);
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      console.log('[DEBUG /api/title-extractor/solution] No recipe found for id:', recipeId);
      return res.status(404).json({ error: 'Recipe not found.' });
    }
    console.log('[DEBUG /api/title-extractor/solution] Successfully updated title for recipe id:', recipeId);
    res.json({ success: true });
  });
});


// --- Transfer Instructions Extracted to Instructions ---
app.post('/api/recipes/:id/transfer-instructions', (req, res) => {
  const { id } = req.params;
  db.get('SELECT instructions_extracted FROM recipes WHERE id = ?', [id], (err, row) => {
    if (err || !row) {
      return res.status(404).json({ success: false, error: 'Recipe not found.' });
    }
    db.run('UPDATE recipes SET instructions = ? WHERE id = ?', [row.instructions_extracted, id], function(err2) {
      if (err2) {
        return res.status(500).json({ success: false, error: err2.message });
      }
      res.json({ success: true });
    });
  });
});


// --- Ingredients Solution Endpoint (saves to DB) ---
app.post('/api/ingredients-extractor/solution', (req, res) => {
  const { recipeId, solution } = req.body;
  console.log('[DEBUG /api/ingredients-extractor/solution] Called with:', { recipeId, solution });
  if (!recipeId || !solution) {
    console.log('[DEBUG /api/ingredients-extractor/solution] Missing recipeId or solution');
    return res.status(400).json({ error: 'Recipe ID and solution are required.' });
  }
  db.run('UPDATE recipes SET ingredients = ? WHERE id = ?', [solution, recipeId], function(err) {
    if (err) {
      console.error('[DEBUG /api/ingredients-extractor/solution] Failed to save ingredients solution:', err.message);
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      console.log('[DEBUG /api/ingredients-extractor/solution] No recipe found for id:', recipeId);
      return res.status(404).json({ error: 'Recipe not found.' });
    }
    console.log('[DEBUG /api/ingredients-extractor/solution] Successfully updated ingredients for recipe id:', recipeId);
    res.json({ success: true });
  });
});


const fetch = require('node-fetch');
// Endpoint to fetch HTML from a URL (server-side, avoids CORS)
app.post('/api/fetch-html', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Missing url' });
  // Set a timeout (in ms)
  const FETCH_TIMEOUT = 7000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!response.ok) {
      return res.status(500).json({
        error: 'This web address does not work with our system. Please try a different recipe website.'
      });
    }
    const html = await response.text();
    res.json({ html });
  } catch (err) {
    clearTimeout(timeout);
    let userMessage = 'This web address does not work with our system. Please try a different recipe website.';
    if (err.name === 'AbortError') {
      userMessage = 'This web address is taking too long to respond and may not work with our system. Please try a different recipe website.';
    }
    res.status(500).json({
      error: userMessage
    });
  }
});


// Delete an upload record by ID
app.delete('/api/uploads/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM uploads WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ success: false, error: 'Failed to delete upload record.' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ success: false, error: 'Upload record not found.' });
    }
    res.json({ success: true });
  });
});



// --- Recipe Search Endpoint ---
// Returns recipes matching a query (by name)
app.get('/api/search/recipes', (req, res) => {
  const q = (req.query.q || '').trim();
  let sql = 'SELECT id, name FROM recipes';
  let params = [];
  if (q) {
    sql += ' WHERE name LIKE ?';
    params = [`%${q}%`];
  }
  sql += ' ORDER BY name COLLATE NOCASE';
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ recipes: rows });
  });
});
// --- Staff Search Endpoint ---
// Returns staff/teachers matching a query (by name or code)
app.get('/api/search/staff', (req, res) => {
  const q = (req.query.q || '').trim();
  // Try to match in both Teacher and Teacher_Name columns (case-insensitive)
  let sql = 'SELECT DISTINCT Teacher, [Teacher Name] as TeacherName FROM kamar_timetable';
  let params = [];
  if (q) {
    sql += ' WHERE Teacher LIKE ? OR [Teacher Name] LIKE ?';
    params = [`%${q}%`, `%${q}%`];
  }
  sql += ' ORDER BY TeacherName COLLATE NOCASE';
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ staff: rows });
  });
});

// --- Class Upload Endpoints ---

// POST /api/class-upload: Upload class CSV data
app.post('/api/class-upload', (req, res) => {
  const { classes } = req.body;
  if (!Array.isArray(classes) || classes.length === 0) {
    return res.status(400).json({ success: false, error: 'No class data provided.' });
  }
  // columns: ttcode, level, name, qualification, department, sub_department, teacher_in_charge, description, star
  const stmt = db.prepare('INSERT INTO class_upload (ttcode, level, name, qualification, department, sub_department, teacher_in_charge, description, star) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  let inserted = 0;
  classes.forEach(row => {
    if (row.length >= 9) {
      stmt.run(row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], err => {
        if (!err) inserted++;
      });
    }
  });
  stmt.finalize(() => {
    res.json({ success: true, inserted });
  });
});

// GET /api/class_upload/all: Fetch all class records
app.get('/api/class_upload/all', (req, res) => {
  db.all('SELECT * FROM class_upload', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: 'Failed to fetch class upload data.' });
    } else {
      res.json({ classes: rows });
    }
  });
});

// DELETE /api/class-upload/all: Delete all class records
app.delete('/api/class-upload/all', (req, res) => {
  db.run('DELETE FROM class_upload', [], function(err) {
    if (err) {
      res.status(500).json({ success: false, error: 'Failed to delete class records.' });
    } else {
      res.json({ success: true });
    }
  });
});


// --- Timetable Table Fetch Endpoint ---
app.get('/api/timetable/all', (req, res) => {
  db.all('SELECT * FROM kamar_timetable', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: 'Failed to fetch timetable data.' });
    } else {
      res.json({ timetable: rows });
    }
  });
});
    // ...existing code...
    db.all("PRAGMA table_info(recipes);", (err, columns) => {
      if (err) {
        console.error('Failed to check recipes table columns:', err.message);
      } else {
        const hasServingSize = columns.some(col => col.name === 'serving_size');
        if (!hasServingSize) {
          db.run("ALTER TABLE recipes ADD COLUMN serving_size TEXT;", (err) => {
            if (err) {
              console.error('Failed to add serving_size column to recipes:', err.message);
            } else {
              console.log('Added serving_size column to recipes table.');
            }
          });
        }
        const hasInstructionsExtracted = columns.some(col => col.name === 'instructions_extracted');
        if (!hasInstructionsExtracted) {
          db.run("ALTER TABLE recipes ADD COLUMN instructions_extracted TEXT;", (err) => {
            if (err) {
              console.error('Failed to add instructions_extracted column to recipes:', err.message);
            } else {
              console.log('Added instructions_extracted column to recipes table.');
            }
          });
        }
      }
    });
    // --- Instructions Solution Endpoint (saves to DB) ---
    app.post('/api/instructions-extractor/solution', (req, res) => {
      const { recipeId, solution } = req.body;
      if (!recipeId || !solution) {
        return res.status(400).json({ error: 'Recipe ID and solution are required.' });
      }
      db.run('UPDATE recipes SET instructions_extracted = ?, instructions = ? WHERE id = ?', [solution, solution, recipeId], function(err) {
        if (err) {
          console.error('Failed to save instructions solution:', err.message);
          return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
          return res.status(404).json({ error: 'Recipe not found.' });
        }
        res.json({ success: true });
      });
    });


    // --- Ingredients Inventory Endpoints ---




        // --- Sync Uploaded Recipes to Recipes Table ---
    app.post('/api/recipes/sync-from-uploads', (req, res) => {
      db.all('SELECT * FROM uploads', [], (err, uploads) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        let inserted = 0, done = 0;
        if (!uploads.length) return res.json({ success: true, inserted: 0 });
        uploads.forEach(upload => {
          db.get('SELECT * FROM recipes WHERE uploaded_recipe_id = ?', [upload.id], (err2, recipe) => {
            if (!recipe) {
              db.run('INSERT INTO recipes (uploaded_recipe_id, name, url) VALUES (?, ?, ?)', [upload.id, upload.recipe_title, upload.source_url], function(err3) {
                inserted++;
                done++;
                if (done === uploads.length) {
                  res.json({ success: true, inserted });
                }
              });
            } else {
              done++;
              if (done === uploads.length) {
                res.json({ success: true, inserted });
              }
            }
          });
        });
      });
    });




    // POST: Sync ingredients_inventory from main ingredients table (with quantity)
    app.post('/api/ingredients-inventory/sync', (req, res) => {
      db.run('DELETE FROM ingredients_inventory', [], function(err) {
        if (err) return res.status(500).json({ success: false, error: err.message });
        db.all('SELECT * FROM ingredients', [], (err2, rows) => {
          if (err2) return res.status(500).json({ success: false, error: err2.message });
          if (!rows.length) return res.json({ success: true, inserted: 0 });
          let done = 0, inserted = 0;
          // Helper to convert unicode and vulgar fractions to float
          function parseFraction(str) {
            const vulgarMap = {
              '¼': 0.25, '½': 0.5, '¾': 0.75,
              '⅐': 1/7, '⅑': 1/9, '⅒': 0.1, '⅓': 1/3, '⅔': 2/3, '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8, '⅙': 1/6, '⅚': 5/6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875
            };
            str = str.trim();
            // Replace vulgar fractions
            str = str.replace(/[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, m => ' ' + vulgarMap[m]);
            // Handle mixed numbers (e.g., 1 1/2)
            let parts = str.split(' ');
            let total = 0;
            for (let part of parts) {
              if (/^\d+$/.test(part)) total += parseInt(part);
              else if (/^\d+\/\d+$/.test(part)) {
                let [n, d] = part.split('/');
                total += parseInt(n) / parseInt(d);
              } else if (!isNaN(parseFloat(part))) {
                total += parseFloat(part);
              }
            }
            return total || null;
          }
          // Accept common units
          const units = [
            'cup', 'cups', 'tbsp', 'tablespoon', 'tablespoons', 'tsp', 'teaspoon', 'teaspoons',
            'g', 'gram', 'grams', 'kg', 'kilogram', 'kilograms', 'ml', 'l', 'litre', 'litres', 'liter', 'liters',
            'oz', 'ounce', 'ounces', 'lb', 'pound', 'pounds', 'pinch', 'dash', 'clove', 'cloves', 'can', 'cans', 'slice', 'slices', 'stick', 'sticks', 'packet', 'packets', 'piece', 'pieces', 'egg', 'eggs', 'drop', 'drops', 'block', 'blocks', 'sheet', 'sheets', 'bunch', 'bunches', 'sprig', 'sprigs', 'head', 'heads', 'filet', 'filets', 'fillet', 'fillets', 'bag', 'bags', 'jar', 'jars', 'bottle', 'bottles', 'container', 'containers', 'box', 'boxes', 'bar', 'bars', 'roll', 'rolls', 'strip', 'strips', 'cm', 'mm', 'inch', 'inches', 'pinches', 'handful', 'handfuls', 'dozen', 'sheet', 'sheets', 'leaf', 'leaves', 'stalk', 'stalks', 'rib', 'ribs', 'segment', 'segments', 'piece', 'pieces', 'cube', 'cubes', 'drop', 'drops', 'sprinkle', 'sprinkles', 'dash', 'dashes', 'splash', 'splashes', 'liter', 'liters', 'milliliter', 'millilitres', 'millilitre', 'millilitres', 'quart', 'quarts', 'pint', 'pints', 'gallon', 'gallons', 'ml', 'l', 'dl', 'cl', 'mg', 'mcg', 'µg', 'kg', 'g', 'lb', 'oz', 'cup', 'cups', 'tbsp', 'tsp', 'teaspoon', 'tablespoon', 'pinch', 'dash', 'drop', 'handful', 'stick', 'slice', 'piece', 'clove', 'can', 'bunch', 'sprig', 'head', 'filet', 'fillet', 'block', 'sheet', 'bag', 'jar', 'bottle', 'container', 'box', 'bar', 'roll', 'strip', 'cm', 'mm', 'inch', 'pinches', 'handfuls', 'dozen', 'leaves', 'stalks', 'ribs', 'segments', 'cubes', 'sprinkles', 'splashes', 'litre', 'litres', 'millilitre', 'millilitres', 'quart', 'quarts', 'pint', 'pints', 'gallon', 'gallons'
          ];
          const unitPattern = units.join('|');
          const regex = new RegExp(`^([\d\s\/\.¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]+)\s*(${unitPattern})\b\s*(.*)$`, 'i');
          rows.forEach(row => {
            let measure_qty = null, measure_unit = null;
            if (row.quantity) {
              const match = row.quantity.match(regex);
              if (match) {
                measure_qty = parseFraction(match[1]);
                measure_unit = match[2];
              }
            }
            db.run('INSERT INTO ingredients_inventory (ingredient_name, recipe_id, quantity, measure_qty, measure_unit) VALUES (?, ?, ?, ?, ?)', [row.name, row.recipe_id, row.quantity, measure_qty, measure_unit], function(err3) {
              done++;
              if (!err3) inserted++;
              if (done === rows.length) {
                res.json({ success: true, inserted });
              }
            });
          });
        });
      });
    });
    // GET all ingredients inventory
    app.get('/api/ingredients-inventory', (req, res) => {
      db.all('SELECT * FROM ingredients_inventory', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      });
    });

    // DELETE all ingredients inventory
    app.delete('/api/ingredients-inventory', (req, res) => {
      db.run('DELETE FROM ingredients_inventory', [], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
      });
    });

    // POST: Reformat/Parse all ingredients (parse quantity into measure_qty and measure_unit, and trim/lowercase name)
    app.post('/api/ingredients-inventory/reformat', (req, res) => {
      db.all('SELECT * FROM ingredients_inventory', [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        let updates = 0;
        let done = 0;
        if (rows.length === 0) return res.json({ success: true });
        rows.forEach(row => {
          // Parse quantity into measure_qty and measure_unit
          let measure_qty = null, measure_unit = null;
          if (row.quantity) {
            const match = row.quantity.match(/([\d.]+)\s*([a-zA-Z]+)\s*(.*)/);
            if (match) {
              measure_qty = parseFloat(match[1]);
              measure_unit = match[2];
            }
          }
          db.run('UPDATE ingredients_inventory SET measure_qty = ?, measure_unit = ? WHERE id = ?', [measure_qty, measure_unit, row.id], function(err2) {
            done++;
            if (!err2) updates++;
            if (done === rows.length) {
              res.json({ success: true, updated: updates });
            }
          });
        });
      });
    });

    // Endpoint to extract raw HTML/text from a given URL
    app.post('/api/extract-raw', async (req, res) => {
      try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'No URL provided.' });

        const response = await fetch(url);
        if (!response.ok) {
          console.error('Failed to fetch URL:', url, 'Status:', response.status, response.statusText);
          return res.status(500).json({ error: 'Failed to fetch URL.', status: response.status, statusText: response.statusText });
        }

        const html = await response.text();
        res.json({ raw: html });
      } catch (err) {
        console.error('Error in /api/extract-raw:', err);
        res.status(500).json({ error: 'Failed to extract data from URL.', details: err.message });
      }
    });

    // Get a single upload by ID
    app.get('/api/uploads/:id', (req, res) => {
      const { id } = req.params;
      db.get('SELECT * FROM uploads WHERE id = ?', [id], (err, row) => {
        if (err || !row) return res.status(404).json({ error: 'Upload not found.' });
        res.json(row);
      });
    });


// Update raw_data for an upload and split ingredient quantities
app.put('/api/uploads/:id/raw', (req, res) => {
  const { id } = req.params;
  const { recipe_id, raw_data } = req.body;
  console.log('[DEBUG /api/uploads/:id/raw] Called with:', { id, recipe_id, raw_data_length: raw_data ? raw_data.length : undefined });
  if (!recipe_id) {
    console.log('[DEBUG /api/uploads/:id/raw] Missing recipe_id');
    return res.json({ success: false, error: 'Missing recipe_id' });
  }
  if (!raw_data) {
    console.log('[DEBUG /api/uploads/:id/raw] Missing raw_data');
    return res.json({ success: false, error: 'Missing raw_data' });
  }
  const fs = require('fs');
  const rawDataDir = path.join(__dirname, 'public', 'RawDataTXT');
  // Ensure directory exists
  if (!fs.existsSync(rawDataDir)) {
    fs.mkdirSync(rawDataDir, { recursive: true });
  }
  const filePath = path.join(rawDataDir, `${id}.txt`);
  console.log('[DEBUG /api/uploads/:id/raw] Attempting to write file to:', filePath);
  db.run('UPDATE uploads SET raw_data = ? WHERE id = ?', [raw_data, id], function(err) {
    if (err) {
      console.log('[DEBUG /api/uploads/:id/raw] Failed to update uploads table:', err.message);
      return res.status(500).json({ success: false, error: 'Failed to update uploads table', details: err.message });
    }
    // Save raw data to file
    fs.writeFile(filePath, raw_data, (fileErr) => {
      if (fileErr) {
        console.log('[DEBUG /api/uploads/:id/raw] Failed to write raw data file:', fileErr.message);
        console.log('[DEBUG /api/uploads/:id/raw] Tried to write to:', filePath);
        return res.json({ success: true, file: false, fileError: fileErr.message, filePath });
      }
      console.log('[DEBUG /api/uploads/:id/raw] Successfully updated uploads table and wrote file for id:', id);
      console.log('[DEBUG /api/uploads/:id/raw] File written to:', filePath);
      // Now split ingredient quantities (existing logic)
      db.all('SELECT id, ingredient_name FROM ingredients_inventory WHERE recipe_id = ?', [recipe_id], (err, rows) => {
        if (err) {
          console.log('[Split Quantity] DB error selecting:', err);
          return res.json({ success: false, error: err.message });
        }
        if (!rows.length) {
          // console.log('[Split Quantity] No ingredients found for recipe_id:', recipe_id);
          return res.json({ success: true, file: true, updated: 0, failed: 0, note: 'No ingredients found.' });
        }
        let done = 0, failed = 0;
        rows.forEach(row => {
          let quantity = '', fooditem = '';
          console.log(`[Split Quantity] Processing row id=${row.id}, ingredient_name='${row.ingredient_name}'`);
          const match = row.ingredient_name.match(/^([\d\s\/\.¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]+\s*(?:cup|cups|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons|g|gram|grams|kg|kilogram|kilograms|ml|l|litre|litres|liter|liters|oz|ounce|ounces|lb|pound|pounds|pinch|dash|clove|cloves|can|cans|slice|slices|stick|sticks|packet|packets|piece|pieces|egg|eggs|drop|drops|block|blocks|sheet|sheets|bunch|bunches|sprig|sprigs|head|heads|filet|filets|fillet|fillets|bag|bags|jar|jars|bottle|bottles|container|containers|box|boxes|bar|bars|roll|rolls|strip|strips|cm|mm|inch|inches|pinches|handful|handfuls|dozen|leaves|stalks|ribs|segments|cubes|sprinkles|splashes|litre|litres|millilitre|millilitres|quart|quarts|pint|pints|gallon|gallons)\b)\s*(.*)$/i);
          if (match) {
            quantity = match[1].trim();
            fooditem = match[2].trim();
            console.log(`[Split Quantity] Regex matched. quantity='${quantity}', fooditem='${fooditem}'`);
          } else {
            fooditem = row.ingredient_name.trim();
            console.log(`[Split Quantity] Regex did not match. fooditem='${fooditem}'`);
          }
          db.run('UPDATE ingredients_inventory SET quantity = ?, fooditem = ? WHERE id = ?', [quantity, fooditem, row.id], function(err2) {
            if (err2) {
              failed++;
              console.log(`[Split Quantity] Failed to update row id=${row.id}:`, err2.message);
            } else {
              done++;
            }
            if (done + failed === rows.length) {
              // All updates attempted
              console.log(`[Split Quantity] Finished. Updated: ${done}, Failed: ${failed}`);
              res.json({ success: failed === 0, file: true, updated: done, failed });
            }
          });
        });
      });
    });
  });
});

    // --- Auto-parse and insert ingredients when recipe is loaded ---
    function parseIngredients(rawText) {
      let lines;
      try {
        lines = JSON.parse(rawText);
        if (!Array.isArray(lines)) throw new Error();
      } catch {
        lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      }
      // Helper to convert unicode and vulgar fractions to float
      function parseFraction(str) {
        const vulgarMap = {
          '¼': 0.25, '½': 0.5, '¾': 0.75,
          '⅐': 1/7, '⅑': 1/9, '⅒': 0.1, '⅓': 1/3, '⅔': 2/3, '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8, '⅙': 1/6, '⅚': 5/6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875
        };
        str = str.trim();
        // Replace vulgar fractions
        str = str.replace(/[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, m => ' ' + vulgarMap[m]);
        // Handle mixed numbers (e.g., 1 1/2)
        let parts = str.split(' ');
        let total = 0;
        for (let part of parts) {
          if (/^\d+$/.test(part)) total += parseInt(part);
          else if (/^\d+\/\d+$/.test(part)) {
            let [n, d] = part.split('/');
            total += parseInt(n) / parseInt(d);
          } else if (!isNaN(parseFloat(part))) {
            total += parseFloat(part);
          }
        }
        return total || null;
      }

      // Accept common units
      const units = [
        'cup', 'cups', 'tbsp', 'tablespoon', 'tablespoons', 'tsp', 'teaspoon', 'teaspoons',
        'g', 'gram', 'grams', 'kg', 'kilogram', 'kilograms', 'ml', 'l', 'litre', 'litres', 'liter', 'liters',
        'oz', 'ounce', 'ounces', 'lb', 'pound', 'pounds', 'pinch', 'dash', 'clove', 'cloves', 'can', 'cans', 'slice', 'slices', 'stick', 'sticks', 'packet', 'packets', 'piece', 'pieces', 'egg', 'eggs', 'drop', 'drops', 'block', 'blocks', 'sheet', 'sheets', 'bunch', 'bunches', 'sprig', 'sprigs', 'head', 'heads', 'filet', 'filets', 'fillet', 'fillets', 'bag', 'bags', 'jar', 'jars', 'bottle', 'bottles', 'container', 'containers', 'box', 'boxes', 'bar', 'bars', 'roll', 'rolls', 'strip', 'strips', 'cm', 'mm', 'inch', 'inches', 'pinches', 'handful', 'handfuls', 'dozen', 'sheet', 'sheets', 'leaf', 'leaves', 'stalk', 'stalks', 'rib', 'ribs', 'segment', 'segments', 'piece', 'pieces', 'cube', 'cubes', 'drop', 'drops', 'sprinkle', 'sprinkles', 'dash', 'dashes', 'splash', 'splashes', 'liter', 'liters', 'milliliter', 'millilitres', 'millilitre', 'millilitres', 'quart', 'quarts', 'pint', 'pints', 'gallon', 'gallons', 'ml', 'l', 'dl', 'cl', 'mg', 'mcg', 'µg', 'kg', 'g', 'lb', 'oz', 'cup', 'cups', 'tbsp', 'tsp', 'teaspoon', 'tablespoon', 'pinch', 'dash', 'drop', 'handful', 'stick', 'slice', 'piece', 'clove', 'can', 'bunch', 'sprig', 'head', 'filet', 'fillet', 'block', 'sheet', 'bag', 'jar', 'bottle', 'container', 'box', 'bar', 'roll', 'strip', 'cm', 'mm', 'inch', 'pinches', 'handfuls', 'dozen', 'leaves', 'stalks', 'ribs', 'segments', 'cubes', 'sprinkles', 'splashes', 'litre', 'litres', 'millilitre', 'millilitres', 'quart', 'quarts', 'pint', 'pints', 'gallon', 'gallons'
      ];
      const unitPattern = units.join('|');
      const regex = new RegExp(`^([\d\s\/\.¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]+)\s*(${unitPattern})\b\s*(.*)$`, 'i');

      return lines.map(line => {
        const match = line.match(regex);
        if (match) {
          const qty = parseFraction(match[1]);
          return {
            quantity: match[1].trim(),
            unit: match[2].trim(),
            name: match[3].trim(),
            measure_qty: qty,
            measure_unit: match[2].trim()
          };
        } else {
          return { quantity: '', unit: '', name: line, measure_qty: null, measure_unit: null };
        }
      });
    }

    // When a recipe is loaded by ID, auto-parse and insert ingredients
    app.get('/api/recipes/:id', (req, res) => {
      const { id } = req.params;
      db.get('SELECT * FROM recipes WHERE id = ?', [id], (err, recipe) => {
        if (err || !recipe) return res.status(404).json({ error: 'Recipe not found.' });
        // Try to get the raw ingredients from the recipe.ingredients field
        let rawIngredients = recipe.ingredients;
        if (!rawIngredients) return res.json(recipe); // nothing to parse
        // Parse and insert into ingredients table
        const parsed = parseIngredients(rawIngredients);
        // Remove old ingredients for this recipe
        db.run('DELETE FROM ingredients WHERE recipe_id = ?', [id], function() {
          // Insert new ones
          let done = 0;
          if (parsed.length === 0) return res.json(recipe);
          parsed.forEach(ing => {
            db.run('INSERT INTO ingredients (recipe_id, name, quantity, unit) VALUES (?, ?, ?, ?)', [id, ing.name, ing.quantity, ing.unit], function() {
              done++;
              if (done === parsed.length) {
                res.json(recipe);
              }
            });
          });
        });
      });
    });

    // ...all other route definitions (recipes, ingredients, classes, uploads, shopping lists, etc.) go here...

    // Example API endpoint
    app.get('/api/status', (req, res) => {
      res.json({ status: 'Backend is running', db: 'SQLite connected' });
    });

    // --- Recipes ---
    app.get('/api/recipes', (req, res) => {
        // Join recipes with uploads to get raw_data preview
        const sql = `
          SELECT recipes.*, uploads.raw_data as upload_raw_data
          FROM recipes
          LEFT JOIN uploads ON recipes.uploaded_recipe_id = uploads.id
        `;
        db.all(sql, [], (err, rows) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json(rows);
        });
    });

    app.post('/api/recipes', (req, res) => {
      const { name, description } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Recipe name is required.' });
      }
      db.run('INSERT INTO recipes (name, description) VALUES (?, ?)', [name, description], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, name, description });
      });
    });

    // Update recipe
    app.put('/api/recipes/:id', (req, res) => {
      const { id } = req.params;
      const { name, description } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Recipe name is required.' });
      }
      db.run('UPDATE recipes SET name = ?, description = ? WHERE id = ?', [name, description, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Recipe not found.' });
        res.json({ id, name, description });
      });
    });

    // Delete recipe
    app.delete('/api/recipes/:id', (req, res) => {
      const { id } = req.params;
      db.run('DELETE FROM recipes WHERE id = ?', [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Recipe not found.' });
        res.json({ success: true });
      });
    });

    // --- Ingredients ---
    app.get('/api/ingredients', (req, res) => {
      db.all('SELECT * FROM ingredients', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      });
    });

    app.post('/api/ingredients', (req, res) => {
  const { recipe_id, name, quantity, unit } = req.body;
  if (!recipe_id || !name) {
    return res.status(400).json({ error: 'Recipe ID and ingredient name are required.' });
  }
  db.run('INSERT INTO ingredients (recipe_id, name, quantity, unit) VALUES (?, ?, ?, ?)', [recipe_id, name, quantity, unit], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, recipe_id, name, quantity, unit });
  });
});

    // Update ingredient
    app.put('/api/ingredients/:id', (req, res) => {
      const { id } = req.params;
      const { recipe_id, name, quantity, unit } = req.body;
      if (!recipe_id || !name) {
        return res.status(400).json({ error: 'Recipe ID and ingredient name are required.' });
      }
      db.run('UPDATE ingredients SET recipe_id = ?, name = ?, quantity = ?, unit = ? WHERE id = ?', [recipe_id, name, quantity, unit, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Ingredient not found.' });
        res.json({ id, recipe_id, name, quantity, unit });
      });
    });

    // Delete ingredient
    app.delete('/api/ingredients/:id', (req, res) => {
      const { id } = req.params;
      db.run('DELETE FROM ingredients WHERE id = ?', [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Ingredient not found.' });
        res.json({ success: true });
      });
    });

    // --- Classes ---
    app.get('/api/classes', (req, res) => {
      db.all('SELECT * FROM classes', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      });
    });

    app.post('/api/classes', (req, res) => {
      const { name, description } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Class name is required.' });
      }
      db.run('INSERT INTO classes (name, description) VALUES (?, ?)', [name, description], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, name, description });
      });
    });

    // Update class
    app.put('/api/classes/:id', (req, res) => {
      const { id } = req.params;
      const { name, description } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Class name is required.' });
      }
      db.run('UPDATE classes SET name = ?, description = ? WHERE id = ?', [name, description, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Class not found.' });
        res.json({ id, name, description });
      });
    });

    // Delete class
    app.delete('/api/classes/:id', (req, res) => {
      const { id } = req.params;
      db.run('DELETE FROM classes WHERE id = ?', [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Class not found.' });
        res.json({ success: true });
      });
    });

    // --- Shopping Lists ---
    app.get('/api/shopping-lists', (req, res) => {
      db.all('SELECT * FROM shopping_lists', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      });
    });

    app.post('/api/shopping-lists', (req, res) => {
      const { name, recipe_ids } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Shopping list name is required.' });
      }
      db.run('INSERT INTO shopping_lists (name, recipe_ids) VALUES (?, ?)', [name, recipe_ids], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, name, recipe_ids });
      });
    });

    // Update shopping list
    app.put('/api/shopping-lists/:id', (req, res) => {
      const { id } = req.params;
      const { name, recipe_ids } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Shopping list name is required.' });
      }
      db.run('UPDATE shopping_lists SET name = ?, recipe_ids = ? WHERE id = ?', [name, recipe_ids, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Shopping list not found.' });
        res.json({ id, name, recipe_ids });
      });
    });

    // Delete shopping list
    app.delete('/api/shopping-lists/:id', (req, res) => {
      const { id } = req.params;
      db.run('DELETE FROM shopping_lists WHERE id = ?', [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Shopping list not found.' });
        res.json({ success: true });
      });
    });

    // --- Serving Size Solution Endpoint (saves to DB) ---
    app.post('/api/serving-size/solution', (req, res) => {
      const { recipeId, solution } = req.body;
      if (!recipeId || !solution) {
        return res.status(400).json({ error: 'Recipe ID and solution are required.' });
      }
      db.run('UPDATE recipes SET serving_size = ? WHERE id = ?', [solution, recipeId], function(err) {
        if (err) {
          console.error('Failed to save serving size solution:', err.message);
          return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
          return res.status(404).json({ error: 'Recipe not found.' });
        }
        res.json({ success: true });
      });
    });

    // --- Uploads ---
    app.get('/api/uploads', (req, res) => {
      db.all('SELECT * FROM uploads', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      });
    });

    // --- Uploads: Create new upload ---
    app.post('/api/uploads', (req, res) => {
      const { recipe_id, recipe_title, upload_type, source_url, uploaded_by, upload_date, raw_data } = req.body;
      db.run(
        'INSERT INTO uploads (recipe_title, upload_type, source_url, uploaded_by, upload_date, raw_data) VALUES (?, ?, ?, ?, ?, ?)',
        [recipe_title, upload_type, source_url, uploaded_by, upload_date, raw_data || null],
        function(err) {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ upload_id: this.lastID });
        }
      );
    });

    // --- Timetable Upload Endpoint ---
    app.post('/api/upload_timetable', (req, res) => {
      const { timetable, headers } = req.body;
      if (!Array.isArray(timetable) || !Array.isArray(headers) || timetable.length === 0) {
        return res.status(400).json({ success: false, error: 'No timetable data provided.' });
      }

      // Map headers to DB columns (handle duplicate/blank columns)
      // The table was created with unique names for duplicate/blank columns, so we must match them
      const dbColumns = [
        "Teacher","Teacher_Name","Form_Class",
        "D1_P1_1","D1_P1_2","D1_P2","D1_I","D1_P3","D1_P4","D1_L","D1_P5","D1_blank_1","D1_blank_2",
        "D2_P1_1","D2_P1_2","D2_P2","D2_I","D2_P3","D2_P4","D2_L","D2_P5","D2_blank_1","D2_blank_2",
        "D3_P1_1","D3_P1_2","D3_P2","D3_I","D3_P3","D3_P4","D3_L","D3_P5","D3_blank_1","D3_blank_2",
        "D4_P1_1","D4_P1_2","D4_P2","D4_I","D4_P3","D4_P4","D4_L","D4_P5","D4_blank_1","D4_blank_2",
        "D5_P1_1","D5_P1_2","D5_P2","D5_I","D5_P3","D5_P4","D5_L","D5_P5","D5_blank_1","D5_blank_2"
      ];

      // Prepare insert statement
      const placeholders = dbColumns.map(() => '?').join(',');
      const insertSQL = `INSERT INTO kamar_timetable (${dbColumns.join(',')}) VALUES (${placeholders})`;

      // Insert each row
      let inserted = 0, failed = 0;
      for (const row of timetable) {
        // Pad or trim row to match dbColumns length
        const values = row.slice(0, dbColumns.length);
        while (values.length < dbColumns.length) values.push("");
        try {
          db.run(insertSQL, values, function(err) {
            if (err) {
              failed++;
            } else {
              inserted++;
            }
          });
        } catch (e) {
          failed++;
        }
      }
      // Wait a moment for all inserts to finish (since db.run is async)
      setTimeout(() => {
        res.json({ success: true, inserted, failed });
      }, 500);
    });

    // Start server only after DB is ready
    // =========================
    // Debug/Utility Endpoints
    // =========================
    // DEBUG: Dump all rows from ingredients_inventory
    app.get('/api/debug/ingredients-inventory', (req, res) => {
      db.all('SELECT * FROM ingredients_inventory', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      });
    });


// =========================
// RawDataTXT HTML Preview Route
// =========================
const fs = require('fs');
app.get('/RawDataTXT/:file', (req, res, next) => {
  const fileName = req.params.file;
  const filePath = path.join(__dirname, 'public', 'RawDataTXT', fileName);
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) return next(); // Pass to 404 handler if not found
    res.send(`<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Raw Data Preview - ${fileName}</title>
        <style>
          body { background: #222; color: #f8f8f2; font-family: 'Fira Mono', 'Consolas', monospace; margin: 0; padding: 0; }
          .container { max-width: 900px; margin: 2rem auto; background: #282a36; border-radius: 8px; box-shadow: 0 2px 12px #0004; padding: 2rem; }
          h2 { color: #50fa7b; margin-top: 0; }
          pre { white-space: pre-wrap; word-break: break-word; font-size: 1.1em; line-height: 1.5; background: #23242b; padding: 1.2em; border-radius: 6px; overflow-x: auto; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>Raw Data Preview: ${fileName}</h2>
          <pre>${data.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</pre>
        </div>
      </body>
      </html>`);
  });
});

// 404 Handler (should be last middleware)
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});


// =========================
// Start Server
// =========================

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

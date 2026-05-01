/**
 * Recipe Matching API Routes
 * Handles recipe matching between planner uploads and stored recipes
 */

const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:password@host:port/db?sslmode=require';
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

const matchEngine = require('../recipeMatchEngine');

/**
 * POST /api/recipe-matching/auto-match
 * Automatically match planner bookings to recipes
 * Body: { bookings: [...] }
 * Returns: { matched: [...], unmatched: [...], summary: {...} }
 */
router.post('/auto-match', async (req, res) => {
  try {
    const { bookings } = req.body;
    if (!Array.isArray(bookings)) {
      return res.status(400).json({ error: 'bookings array required' });
    }

    // Fetch all stored recipes
    const recipesResult = await pool.query('SELECT id, name, url FROM recipes ORDER BY name');
    const storedRecipes = recipesResult.rows;

    // Match bookings
    const { matched, unmatched } = await matchEngine.matchPlannerBookings(bookings, storedRecipes);

    // Update matched bookings in database
    let updateCount = 0;
    for (const booking of matched) {
      if (booking.recipe_id && booking.status === 'auto_matched') {
        try {
          await pool.query(
            'UPDATE bookings SET recipe_id = $1 WHERE id = $2',
            [booking.recipe_id, booking.id]
          );
          updateCount++;
        } catch (err) {
          console.error(`Failed to update booking ${booking.id}:`, err.message);
        }
      }
    }

    return res.json({
      success: true,
      summary: {
        total: bookings.length,
        autoMatched: matched.filter(b => b.status === 'auto_matched').length,
        alreadyLinked: matched.filter(b => b.status === 'already_linked').length,
        needsReview: unmatched.length,
        databaseUpdated: updateCount
      },
      matched: matched.filter(b => b.status === 'auto_matched'),
      unmatched
    });
  } catch (err) {
    console.error('[RECIPE-MATCH] Error during auto-match:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/recipe-matching/suggestions/:bookingId
 * Get recipe suggestions for a specific unmatched booking
 */
router.get('/suggestions/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;

    // Fetch the booking
    const bookingResult = await pool.query('SELECT * FROM bookings WHERE id = $1', [bookingId]);
    if (bookingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = bookingResult.rows[0];

    // Fetch all recipes
    const recipesResult = await pool.query('SELECT id, name, url FROM recipes ORDER BY name');
    const storedRecipes = recipesResult.rows;

    // Find matches
    const matches = await matchEngine.findRecipeMatches(booking, storedRecipes);

    return res.json({
      booking: {
        id: booking.id,
        recipe: booking.recipe,
        recipe_url: booking.recipe_url,
        recipe_id: booking.recipe_id
      },
      suggestions: {
        exactMatch: matches.exactMatch,
        urlMatch: matches.urlMatch,
        fuzzyMatches: matches.fuzzyMatches
      }
    });
  } catch (err) {
    console.error('[RECIPE-MATCH] Error fetching suggestions:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/recipe-matching/link-recipe
 * Manually link a booking to a recipe or mark for new recipe creation
 * Body: { bookingId: number, recipeId?: number, createNew?: boolean }
 */
router.post('/link-recipe', async (req, res) => {
  try {
    const { bookingId, recipeId, createNew } = req.body;

    if (!bookingId) {
      return res.status(400).json({ error: 'bookingId required' });
    }

    if (!recipeId && !createNew) {
      return res.status(400).json({ error: 'recipeId or createNew flag required' });
    }

    if (recipeId) {
      // Verify recipe exists
      const recipeResult = await pool.query('SELECT id FROM recipes WHERE id = $1', [recipeId]);
      if (recipeResult.rows.length === 0) {
        return res.status(404).json({ error: 'Recipe not found' });
      }

      // Update booking
      await pool.query(
        'UPDATE bookings SET recipe_id = $1 WHERE id = $2',
        [recipeId, bookingId]
      );

      return res.json({
        success: true,
        message: 'Booking linked to recipe',
        bookingId,
        recipeId
      });
    }

    if (createNew) {
      // Mark booking for recipe creation (set a flag or note)
      // We'll return the booking data so UI can open Add Recipe with pre-filled URL
      const bookingResult = await pool.query('SELECT * FROM bookings WHERE id = $1', [bookingId]);
      if (bookingResult.rows.length === 0) {
        return res.status(404).json({ error: 'Booking not found' });
      }

      const booking = bookingResult.rows[0];
      return res.json({
        success: true,
        message: 'Ready to create new recipe',
        bookingId,
        prefilledData: {
          name: booking.recipe,
          url: booking.recipe_url
        }
      });
    }
  } catch (err) {
    console.error('[RECIPE-MATCH] Error linking recipe:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/recipe-matching/bulk-link
 * Link multiple bookings to recipes in bulk
 * Body: { links: [{ bookingId: number, recipeId: number }, ...] }
 */
router.post('/bulk-link', async (req, res) => {
  try {
    const { links } = req.body;
    if (!Array.isArray(links)) {
      return res.status(400).json({ error: 'links array required' });
    }

    let successCount = 0;
    let errorCount = 0;

    for (const link of links) {
      const { bookingId, recipeId } = link;
      if (!bookingId || !recipeId) {
        errorCount++;
        continue;
      }

      try {
        await pool.query(
          'UPDATE bookings SET recipe_id = $1 WHERE id = $2',
          [recipeId, bookingId]
        );
        successCount++;
      } catch (err) {
        console.error(`Failed to link booking ${bookingId}:`, err.message);
        errorCount++;
      }
    }

    return res.json({
      success: true,
      summary: {
        processed: links.length,
        succeeded: successCount,
        failed: errorCount
      }
    });
  } catch (err) {
    console.error('[RECIPE-MATCH] Error in bulk-link:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/recipe-matching/unmatched
 * Get all bookings without recipe_id
 * Query: ?limit=50&offset=0
 */
router.get('/unmatched', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const result = await pool.query(
      'SELECT * FROM bookings WHERE recipe_id IS NULL ORDER BY booking_date DESC, period LIMIT $1 OFFSET $2',
      [limit, offset]
    );

    const countResult = await pool.query('SELECT COUNT(*) as count FROM bookings WHERE recipe_id IS NULL');
    const totalUnmatched = parseInt(countResult.rows[0].count);

    // Get recipe suggestions for each
    const recipesResult = await pool.query('SELECT id, name, url FROM recipes ORDER BY name');
    const storedRecipes = recipesResult.rows;

    const bookingsWithSuggestions = await Promise.all(
      result.rows.map(async (booking) => {
        const matches = await matchEngine.findRecipeMatches(booking, storedRecipes);
        return {
          ...booking,
          suggestions: [
            matches.exactMatch,
            matches.urlMatch,
            ...matches.fuzzyMatches
          ].filter(Boolean).slice(0, 3)
        };
      })
    );

    return res.json({
      bookings: bookingsWithSuggestions,
      pagination: {
        limit,
        offset,
        total: totalUnmatched
      }
    });
  } catch (err) {
    console.error('[RECIPE-MATCH] Error fetching unmatched:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;

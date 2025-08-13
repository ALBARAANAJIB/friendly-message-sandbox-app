// backend/utils/userManager.js

const { Pool } = require('pg');

class UserManager {
    constructor(pool) {
        this.pool = pool;
        this.freeLimit = 7; // Default free limit for non-pioneer users
    }

    /**
     * Retrieves an existing user from the database or creates a new one if not found.
     * @param {string} userId - The unique ID of the user.
     * @param {string} email - The user's email address. NEW LINE BABY
     * @param {string} [fullName=null] - The user's full name.
     * @returns {Promise<Object>} The user object from the database.
     */
    async getOrCreateUser(userId, email, fullName = null) {
        try {
            // Using PostgreSQL's "INSERT ... ON CONFLICT" is the most efficient way to
            // create a user if they don't exist, or update their email if they do.
            const upsertQuery = `
                INSERT INTO users (id, email, full_name, daily_summary_count, last_summary_date)
                VALUES ($1, $2, $3, 0, CURRENT_DATE)
                ON CONFLICT (id) DO UPDATE SET
                    email = EXCLUDED.email,
                    full_name = COALESCE(EXCLUDED.full_name, users.full_name), -- <--- UPDATE full_name
                    -- Note: We don't reset their pioneer status or other fields on conflict
                    last_summary_date = users.last_summary_date -- Keep existing date on update
                RETURNING *
            `;


            // Debugging logs: Add these temporarily to confirm the query and params
            console.log('DEBUG: upsertQuery:', upsertQuery);
            console.log('DEBUG: Query parameters:', [userId, email, fullName]);


            // First, try to get the existing user
            const result = await this.pool.query(upsertQuery, [userId, email, fullName]);

            if (result.rows.length > 0) {
             console.log(`✅ User ${userId} (${email}, Full Name: ${result.rows[0].full_name || 'N/A'}) is present/updated.`);
                return result.rows[0];
            } else {
                // This case should theoretically not be hit with RETURNING *, but it's good practice
                throw new Error('Failed to get or create user.');
            }

        } catch (error) {
            console.error(`❌ Error in getOrCreateUser for ${userId}:`, error);
            throw new Error('Database error during user retrieval or creation.');
        }
    }

    /**
     * Records a summary request for a user, handling daily resets and increments.
     * This function should be called AFTER a summary has been successfully generated.
     * @param {string} userId - The unique ID of the user.
     * @param {string} email - The user's email address.
     * @param {string} [fullName=null] - The user's full name.
     * @returns {Promise<number>} The updated daily summary count.
     */


    async recordSummaryRequest(userId, email, fullName = null) {
          try {
            // Ensure the user exists, but we don't need to check dates here anymore.
            await this.getOrCreateUser(userId, email, fullName);

            // The daily reset is now fully handled by `canMakeSummaryRequest`.
            // We can now safely just increment the count.
            const updateResult = await this.pool.query(
                'UPDATE users SET daily_summary_count = daily_summary_count + 1 WHERE id = $1 RETURNING daily_summary_count',
                [userId]
            );


            const newCount = updateResult.rows[0].daily_summary_count;
            console.log(`📊 Updated summary count for ${userId}: ${newCount}`);
            return newCount;

        } catch (error) {
            console.error(`❌ Error recording summary request for user ${userId}:`, error);
            throw new Error('Failed to record summary request.');
        }
    }

    /**
     * Checks if a user is eligible to make a summary request.
     * This function performs the eligibility check WITHOUT modifying the count in the DB.
     * @param {string} userId - The unique ID of the user..
     * @param {string} email - The user's email address. <--- ADDED EMAIL TO SIGNATURE
     * @param {string} [fullName=null] - The user's full name.
     * @param {number} [freeLimit] - Optional: custom free limit for this check. Defaults to this.freeLimit.
     * @returns {Promise<{canProceed: boolean, remaining: number|string, message?: string}>} Eligibility status.
     */
    async canMakeSummaryRequest(userId, email, fullName = null, freeLimit = this.freeLimit) {
        try {
            let user = await this.getOrCreateUser(userId, email, fullName);

            if (user.is_pioneer) {
                console.log(`🌟 Pioneer user ${userId} - unlimited access granted`);
                return { canProceed: true, remaining: 'Unlimited' };
            }

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            let lastSummaryDate = user.last_summary_date ? new Date(user.last_summary_date) : null;
            if (lastSummaryDate) {
                lastSummaryDate.setHours(0, 0, 0, 0);
            }

            // If it's a new day, reset the user's count to 0 in the database *now*.
            if (!lastSummaryDate || lastSummaryDate.getTime() < today.getTime()) {
                console.log(`🔄 Resetting daily count for ${userId} on first check of the new day.`);
                const result = await this.pool.query(
                    'UPDATE users SET daily_summary_count = 0, last_summary_date = CURRENT_DATE WHERE id = $1 RETURNING *',
                    [userId]
                );
                user = result.rows[0]; // Refresh the user variable with the new data (count is now 0)
            }

            // *** THE FIX: Get the count *after* the potential reset. ***
            const currentDailyCount = user.daily_summary_count;
            const remaining = freeLimit - currentDailyCount;

            if (remaining > 0) {
                console.log(`✅ User ${userId} can proceed - ${remaining} requests remaining`);
                return { canProceed: true, remaining: remaining };
            } else {
                console.log(`❌ User ${userId} has reached daily limit (${freeLimit} requests).`);
                // --- ADDED DIAGNOSTIC LOG HERE ---
                const returnObject = { canProceed: false, remaining: 0, message: `Daily summary limit (${freeLimit}) reached for today.` };
                console.log(`DEBUG: canMakeSummaryRequest returning:`, returnObject);
                return returnObject;
                // --- END ADDED DIAGNOSTIC LOG ---
            }
        } catch (error) {
            console.error(`❌ Error checking summary request eligibility for user ${userId}:`, error);
            throw new Error('Failed to check summary eligibility.');
        }
    }

    /**
     * Upgrades a user to pioneer status (sets is_pioneer to TRUE).
     * @param {string} userId - The ID of the user to upgrade.
     * @returns {Promise<Object>} The updated user object.
     */
    async upgradeToPioneer(userId) {
        try {
            const upgradeQuery = `
                UPDATE users
                SET is_pioneer = TRUE
                WHERE id = $1
                RETURNING *
            `;
            const result = await this.pool.query(upgradeQuery, [userId]);
            if (result.rows.length > 0) {
                console.log(`✨ User ${userId} upgraded to Pioneer status.`);
                return result.rows[0];
            } else {
                throw new Error(`User ${userId} not found for pioneer upgrade.`);
            }
        } catch (error) {
            console.error(`❌ Error upgrading user ${userId} to pioneer:`, error);
            throw new Error('Failed to upgrade user to pioneer status.');
        }
    }

    /**
     * Retrieves a user's statistics.
     * @param {string} userId - The unique ID of the user.
     * @param {string} email - The user's email address. <--- ADDED EMAIL TO SIGNATURE
     * @param {string} [fullName=null] - The user's full name.
     * @returns {Promise<Object>} An object containing user stats.
     */
    async getUserStats(userId, email, fullName = null) {
        try {
            const user = await this.getOrCreateUser(userId, email, fullName); // Ensure user exists and get data
            return {
                userId: user.id,
                email: user.email, // Include email in stats
                fullName: user.full_name, // <--- INCLUDE full_name in returned stats
                isPioneer: user.is_pioneer,
                dailyCount: user.daily_summary_count,
                lastSummaryDate: user.last_summary_date,
                registeredAt: user.registered_at
            };

            
        } catch (error) {
            console.error(`❌ Error getting user stats for ${userId}:`, error);
            throw error;
        }
    }
}

module.exports = UserManager;
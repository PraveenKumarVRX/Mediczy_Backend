import express from "express";
import { authUser } from "../middleware/auth.middleware.js";
import FitnessData from "../models/FitnessData.model.intelligent.js";

const router = express.Router();

/**
 * Store Apple Health data from iOS app
 * POST /api/apple-health/sync
 */
router.post("/sync", authUser, async (req, res) => {
  try {
    const userId = req.userId;
    const { healthData, date } = req.body;

    if (!healthData || !date) {
      return res.status(400).json({
        success: false,
        message: "Health data and date are required",
      });
    }

    // Map Apple Health data format to our storage format
    const fitnessRecord = {
      user_id: userId,
      date: new Date(date),
      steps: healthData.stepCount || 0,
      calories: healthData.activeEnergyBurned || 0,
      distance: healthData.distanceWalkingRunning || 0,
      active_minutes: healthData.appleExerciseTime || 0,
      heart_rate_min: healthData.heartRate?.min || null,
      heart_rate_max: healthData.heartRate?.max || null,
      heart_rate_avg: healthData.heartRate?.avg || null,
      sleep_duration: healthData.sleepAnalysis?.duration || null,
      sleep_efficiency: healthData.sleepAnalysis?.efficiency || null,
      weight: healthData.bodyMass || null,
      height: healthData.height || null,
      blood_pressure_systolic: healthData.bloodPressure?.systolic || null,
      blood_pressure_diastolic: healthData.bloodPressure?.diastolic || null,
      blood_glucose: healthData.bloodGlucose || null,
      oxygen_saturation: healthData.oxygenSaturation || null,
      respiratory_rate: healthData.respiratoryRate || null,
      body_temperature: healthData.bodyTemperature || null,
      source: "apple_health",
      raw_data: healthData,
    };

    // Store or update fitness data
    const existingData = await FitnessData.findOne({
      where: {
        user_id: userId,
        date: new Date(date),
      },
    });

    let result;
    if (existingData) {
      // Update existing record
      result = await existingData.update(fitnessRecord);
    } else {
      // Create new record
      result = await FitnessData.create(fitnessRecord);
    }

    res.json({
      success: true,
      message: "Apple Health data synced successfully",
      data: result,
    });
  } catch (error) {
    console.error("Apple Health sync error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to sync Apple Health data",
      error: error.message,
    });
  }
});

/**
 * Batch sync multiple days of Apple Health data
 * POST /api/apple-health/sync-batch
 */
router.post("/sync-batch", authUser, async (req, res) => {
  try {
    const userId = req.userId;
    const { healthDataArray } = req.body;

    if (!healthDataArray || !Array.isArray(healthDataArray)) {
      return res.status(400).json({
        success: false,
        message: "healthDataArray must be an array",
      });
    }

    const results = [];
    const errors = [];

    for (const item of healthDataArray) {
      try {
        const { healthData, date } = item;

        const fitnessRecord = {
          user_id: userId,
          date: new Date(date),
          steps: healthData.stepCount || 0,
          calories: healthData.activeEnergyBurned || 0,
          distance: healthData.distanceWalkingRunning || 0,
          active_minutes: healthData.appleExerciseTime || 0,
          heart_rate_min: healthData.heartRate?.min || null,
          heart_rate_max: healthData.heartRate?.max || null,
          heart_rate_avg: healthData.heartRate?.avg || null,
          sleep_duration: healthData.sleepAnalysis?.duration || null,
          sleep_efficiency: healthData.sleepAnalysis?.efficiency || null,
          weight: healthData.bodyMass || null,
          height: healthData.height || null,
          blood_pressure_systolic: healthData.bloodPressure?.systolic || null,
          blood_pressure_diastolic: healthData.bloodPressure?.diastolic || null,
          blood_glucose: healthData.bloodGlucose || null,
          oxygen_saturation: healthData.oxygenSaturation || null,
          respiratory_rate: healthData.respiratoryRate || null,
          body_temperature: healthData.bodyTemperature || null,
          source: "apple_health",
          raw_data: healthData,
        };

        const existingData = await FitnessData.findOne({
          where: {
            user_id: userId,
            date: new Date(date),
          },
        });

        if (existingData) {
          await existingData.update(fitnessRecord);
        } else {
          await FitnessData.create(fitnessRecord);
        }

        results.push({ date, success: true });
      } catch (error) {
        errors.push({ date: item.date, error: error.message });
      }
    }

    res.json({
      success: true,
      message: `Synced ${results.length} records successfully`,
      synced: results.length,
      failed: errors.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Apple Health batch sync error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to batch sync Apple Health data",
      error: error.message,
    });
  }
});

/**
 * Get Apple Health sync status
 * GET /api/apple-health/status
 */
router.get("/status", authUser, async (req, res) => {
  try {
    const userId = req.userId;

    // Get the most recent Apple Health sync
    const recentSync = await FitnessData.findOne({
      where: {
        user_id: userId,
        source: "apple_health",
      },
      order: [["date", "DESC"]],
    });

    // Count total Apple Health records
    const totalRecords = await FitnessData.count({
      where: {
        user_id: userId,
        source: "apple_health",
      },
    });

    res.json({
      success: true,
      data: {
        isConnected: totalRecords > 0,
        lastSyncDate: recentSync?.date || null,
        totalRecords,
        lastSyncData: recentSync
          ? {
              steps: recentSync.steps,
              calories: recentSync.calories,
              distance: recentSync.distance,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Apple Health status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get Apple Health status",
      error: error.message,
    });
  }
});

/**
 * Get aggregated Apple Health data for a date range
 * GET /api/apple-health/summary
 */
router.get("/summary", authUser, async (req, res) => {
  try {
    const userId = req.userId;
    const { days = 7 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const healthData = await FitnessData.findAll({
      where: {
        user_id: userId,
        source: "apple_health",
        date: {
          [FitnessData.sequelize.Sequelize.Op.gte]: startDate,
        },
      },
      order: [["date", "DESC"]],
    });

    // Calculate summary statistics
    const summary = {
      totalDays: healthData.length,
      averageSteps: 0,
      averageCalories: 0,
      averageDistance: 0,
      averageActiveMinutes: 0,
      totalSteps: 0,
      totalCalories: 0,
      totalDistance: 0,
      totalActiveMinutes: 0,
    };

    if (healthData.length > 0) {
      healthData.forEach((record) => {
        summary.totalSteps += record.steps || 0;
        summary.totalCalories += record.calories || 0;
        summary.totalDistance += record.distance || 0;
        summary.totalActiveMinutes += record.active_minutes || 0;
      });

      summary.averageSteps = Math.round(summary.totalSteps / healthData.length);
      summary.averageCalories = Math.round(
        summary.totalCalories / healthData.length
      );
      summary.averageDistance = parseFloat(
        (summary.totalDistance / healthData.length).toFixed(2)
      );
      summary.averageActiveMinutes = Math.round(
        summary.totalActiveMinutes / healthData.length
      );
    }

    res.json({
      success: true,
      data: {
        summary,
        records: healthData,
      },
    });
  } catch (error) {
    console.error("Apple Health summary error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get Apple Health summary",
      error: error.message,
    });
  }
});

/**
 * Delete Apple Health connection and data
 * DELETE /api/apple-health/disconnect
 */
router.delete("/disconnect", authUser, async (req, res) => {
  try {
    const userId = req.userId;

    // Delete all Apple Health records for user
    const deleted = await FitnessData.destroy({
      where: {
        user_id: userId,
        source: "apple_health",
      },
    });

    res.json({
      success: true,
      message: "Apple Health disconnected successfully",
      recordsDeleted: deleted,
    });
  } catch (error) {
    console.error("Apple Health disconnect error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to disconnect Apple Health",
      error: error.message,
    });
  }
});

export default router;

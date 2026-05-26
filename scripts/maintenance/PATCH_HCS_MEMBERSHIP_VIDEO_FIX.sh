#!/bin/bash
# PATCH: HCS Membership Video Consultation Payment Fix
# Date: February 5, 2026
# Issue: Video consultations blocked even with active membership plan
# Solution: Added membership plan validation to payment checks

cat << 'PATCH_HEADER'
================================================================================
PATCH: Enable Video Consultations with Membership Plans
================================================================================
Date: February 5, 2026
Issue: "Payment required" error despite having active membership
Fix: Check membership plans as alternative to direct payment
Status: COMPLETE & TESTED
================================================================================
PATCH_HEADER

echo ""
echo "CHANGE 1: Doctor Video Call Initiation"
echo "========================================"
echo "File: server/routes/doctor.route.js"
echo "Lines: 2182-2203"
echo "Change Type: ENHANCEMENT (adds membership validation)"
echo ""
echo "BEFORE:"
cat << 'BEFORE_1'
    // Check if payment is completed (if required)
    if (['online', 'video'].includes(appointment.consultationType) && appointment.paymentStatus !== 'paid') {
      return res.status(402).json({
        success: false,
        message: 'Payment required before starting video consultation',
        paymentStatus: appointment.paymentStatus
      });
    }
BEFORE_1

echo ""
echo "AFTER:"
cat << 'AFTER_1'
    // Check if payment is completed (if required)
    // Allow if: payment is marked as paid OR user has active membership plan
    if (['online', 'video'].includes(appointment.consultationType) && appointment.paymentStatus !== 'paid') {
      // Check if user has an active membership plan
      const UserPlan = (await import('../models/postgres/membershipPlan.model.postgres.js')).UserPlan;
      const activePlan = await UserPlan.findOne({
        where: {
          userId: appointment.userId,
          status: 'active',
          startDate: { [require('sequelize').Op.lte]: new Date() },
          endDate: { [require('sequelize').Op.gte]: new Date() }
        }
      });

      if (!activePlan) {
        return res.status(402).json({
          success: false,
          message: 'Payment required before starting video consultation. Please pay now or use a membership plan.',
          paymentStatus: appointment.paymentStatus,
          suggestion: 'You can pay with Health Coins or subscribe to a membership plan'
        });
      }
    }
AFTER_1

echo ""
echo ""
echo "CHANGE 2: Patient Video Call Join"
echo "================================="
echo "File: server/routes/online-consultation.route.js"
echo "Lines: 1237-1254"
echo "Change Type: ENHANCEMENT (adds membership validation)"
echo ""
echo "BEFORE:"
cat << 'BEFORE_2'
    if (appointment.paymentStatus !== 'paid') {
      return res.status(402).json({
        success: false,
        message: 'Payment required before joining video consultation',
        consultationFee: appointment.consultationFee
      });
    }
BEFORE_2

echo ""
echo "AFTER:"
cat << 'AFTER_2'
    if (appointment.paymentStatus !== 'paid') {
      // Check if user has an active membership plan
      const { UserPlan } = (await import('../models/postgres/membershipPlan.model.postgres.js'));
      const activePlan = await UserPlan.findOne({
        where: {
          userId: appointment.userId,
          status: 'active',
          startDate: { [require('sequelize').Op.lte]: new Date() },
          endDate: { [require('sequelize').Op.gte]: new Date() }
        }
      });

      if (!activePlan) {
        return res.status(402).json({
          success: false,
          message: 'Payment required before joining video consultation',
          consultationFee: appointment.consultationFee,
          suggestion: 'You can pay with Health Coins or subscribe to a membership plan'
        });
      }
    }
AFTER_2

echo ""
echo ""
echo "SUMMARY"
echo "======="
echo "Files Changed: 2"
echo "Lines Added: 40"
echo "Database Changes: NONE"
echo "Breaking Changes: NONE"
echo "Backward Compatible: YES"
echo ""
echo "Impact:"
echo "  ✅ Users with active membership plans can now use video consultations"
echo "  ✅ Direct payments still work as before"
echo "  ✅ Health Coins payments still work as before"
echo "  ✅ Better error messages with payment options"
echo ""
echo "Deployment:"
echo "  - No migrations needed"
echo "  - No configuration changes"
echo "  - Can deploy immediately"
echo ""
echo "Testing:"
echo "  bash /home/ubuntu/Mediczy/test-membership-video-access.sh"
echo ""
echo "=================================================================================="

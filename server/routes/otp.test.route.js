import express from 'express';
import twilioOTPService from '../services/twilio-otp.service.js';

const router = express.Router();

/**
 * Twilio OTP Test Routes
 * Testing direct Twilio WhatsApp OTP delivery
 */

/**
 * POST /api/otp/test/whatsapp
 * Send a test WhatsApp OTP to a phone number
 * 
 * Body: {
 *   "phone": "+919884089921",
 *   "otp": "123456",  (optional - will generate if not provided)
 *   "purpose": "login|signup|password_reset"  (optional, default: "login")
 * }
 */
router.post('/test/whatsapp', async (req, res) => {
  try {
    const { phone, otp, purpose = 'login' } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }

    // Generate OTP if not provided
    let otpCode = otp;
    if (!otpCode) {
      otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    }

    console.log(`📱 Testing WhatsApp OTP delivery to: ${phone}`);
    
    // Add timeout wrapper
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('OTP sending timeout')), 20000)
    );

    const result = await Promise.race([
      twilioOTPService.sendWhatsAppOTP({
        phone,
        otp: otpCode,
        name: 'Test User',
        purpose
      }),
      timeoutPromise
    ]);

    return res.json({
      success: result.success,
      message: result.message,
      data: {
        sid: result.sid,
        status: result.status,
        phone: result.phone,
        otp: otpCode,
        deliveredAt: result.deliveredAt,
        error: result.error
      }
    });

  } catch (error) {
    console.error('❌ OTP test error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to send test OTP',
      error: error.message
    });
  }
});

/**
 * GET /api/otp/test/status/:sid
 * Check the delivery status of an OTP message by Twilio SID
 */
router.get('/test/status/:sid', async (req, res) => {
  try {
    const { sid } = req.params;

    if (!sid) {
      return res.status(400).json({
        success: false,
        message: 'Message SID is required'
      });
    }

    const result = await twilioOTPService.getOTPStatus(sid);

    res.json({
      success: result.success,
      data: result,
      message: result.success ? 'Status retrieved successfully' : result.error
    });

  } catch (error) {
    console.error('❌ Status check error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/otp/test/bulk
 * Send WhatsApp OTPs to multiple numbers
 * 
 * Body: {
 *   "recipients": [
 *     { "phone": "+919884089921", "otp": "123456" },
 *     { "phone": "+919373007737", "otp": "654321" }
 *   ]
 * }
 */
router.post('/test/bulk', async (req, res) => {
  try {
    const { recipients } = req.body;

    if (!recipients || !Array.isArray(recipients)) {
      return res.status(400).json({
        success: false,
        message: 'Recipients array is required'
      });
    }

    console.log(`📱 Sending bulk WhatsApp OTPs to ${recipients.length} recipients`);
    
    const results = await twilioOTPService.sendBulkWhatsAppOTPs(
      recipients.map(r => ({
        phone: r.phone,
        otp: r.otp || Math.floor(100000 + Math.random() * 900000).toString(),
        name: 'Test User',
        purpose: 'login'
      }))
    );

    const successCount = results.filter(r => r.success).length;

    res.json({
      success: true,
      message: `Sent to ${successCount}/${recipients.length} recipients`,
      data: {
        total: recipients.length,
        successful: successCount,
        failed: recipients.length - successCount,
        results
      }
    });

  } catch (error) {
    console.error('❌ Bulk send error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;

import dotenv from 'dotenv';
import whatsappProductionService from './services/whatsapp-production.service.js';

dotenv.config();

async function quickTest() {
  console.log('\n🧪 Quick Production WhatsApp Test\n');
  
  try {
    // Check template status
    console.log('📋 Checking template configuration...');
    const status = whatsappProductionService.getTemplateStatus();
    
    console.log('\nTemplate Status:');
    Object.entries(status).forEach(([key, configured]) => {
      console.log(`  ${configured ? '✅' : '❌'} ${key}`);
    });
    
    console.log('\n' + '='.repeat(70));
    console.log('TEST OPTIONS:\n');
    console.log('1. Send OTP (uses approved otp_verification template)');
    console.log('2. Send Appointment Notification (uses notification template)');
    console.log('3. Send Custom Message (session message)\n');
    
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const question = (q) => new Promise(resolve => rl.question(q, resolve));
    
    const choice = await question('Select test (1-3): ');
    
    if (choice === '1') {
      // Test OTP
      const phone = await question('Enter phone number (+91XXXXXXXXXX): ');
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      
      console.log(`\n📤 Sending OTP: ${otp} to ${phone}...`);
      
      const message = await whatsappProductionService.sendOTP({
        to: phone,
        otp: otp
      });
      
      console.log('✅ OTP sent successfully!');
      console.log(`   Message SID: ${message.sid}`);
      console.log(`   Status: ${message.status}`);
      console.log(`   To: ${message.to}`);
      
    } else if (choice === '2') {
      // Test notification (mapped to appointment)
      const phone = await question('Enter phone number (+91XXXXXXXXXX): ');
      const name = await question('Patient name: ');
      const doctor = await question('Doctor name: ');
      const date = await question('Date: ');
      const time = await question('Time: ');
      const location = await question('Location: ');
      
      console.log(`\n📤 Sending appointment confirmation...`);
      
      const message = await whatsappProductionService.sendAppointmentConfirmation({
        to: phone,
        patientName: name,
        doctorName: doctor,
        date: date,
        time: time,
        location: location
      });
      
      console.log('✅ Message sent successfully!');
      console.log(`   Message SID: ${message.sid}`);
      console.log(`   Status: ${message.status}`);
      
    } else if (choice === '3') {
      // Session message
      const phone = await question('Enter phone number (+91XXXXXXXXXX): ');
      const messageText = await question('Message: ');
      
      console.log(`\n📤 Sending message...`);
      console.log('⚠️  Note: This only works within 24hrs of user messaging you first\n');
      
      const message = await whatsappProductionService.sendSessionMessage({
        to: phone,
        body: messageText
      });
      
      console.log('✅ Message sent!');
      console.log(`   Message SID: ${message.sid}`);
      console.log(`   Status: ${message.status}`);
    }
    
    console.log('\n💡 Check message status in Twilio console or wait for delivery confirmation\n');
    
    rl.close();
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.code) {
      console.error(`   Code: ${error.code}`);
    }
    if (error.moreInfo) {
      console.error(`   Info: ${error.moreInfo}`);
    }
  }
}

quickTest();

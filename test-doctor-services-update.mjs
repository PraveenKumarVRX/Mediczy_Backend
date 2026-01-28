import { Doctor } from './server/models/index.js';

async function testUpdate() {
  try {
    console.log('🔍 Finding doctor ID 70...');
    const doctor = await Doctor.findByPk(70);
    
    if (!doctor) {
      console.log('❌ Doctor not found!');
      return;
    }
    
    console.log('✅ Doctor found:', doctor.email);
    console.log('📊 Current values:', {
      offersSecondOpinion: doctor.offersSecondOpinion,
      secondOpinionFee: doctor.secondOpinionFee,
      offersHomeVisits: doctor.offersHomeVisits,
      homeVisitFee: doctor.homeVisitFee,
      homeVisitRadiusKm: doctor.homeVisitRadiusKm
    });
    
    console.log('\n🔧 Updating services...');
    doctor.offersSecondOpinion = true;
    doctor.secondOpinionFee = 500;
    doctor.offersHomeVisits = true;
    doctor.homeVisitFee = 1000;
    doctor.homeVisitRadiusKm = 15;
    
    await doctor.save();
    console.log('✅ Saved!');
    
    console.log('\n🔍 Refetching...');
    const updatedDoctor = await Doctor.findByPk(70);
    console.log('📊 New values:', {
      offersSecondOpinion: updatedDoctor.offersSecondOpinion,
      secondOpinionFee: updatedDoctor.secondOpinionFee,
      offersHomeVisits: updatedDoctor.offersHomeVisits,
      homeVisitFee: updatedDoctor.homeVisitFee,
      homeVisitRadiusKm: updatedDoctor.homeVisitRadiusKm
    });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

testUpdate();

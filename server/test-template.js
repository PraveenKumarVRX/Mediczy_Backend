import { EmailTemplate } from './models/email.model.simple.js';

async function testTemplate() {
  console.log('Testing direct template creation...');
  
  try {
    const template = await EmailTemplate.create({
      name: 'Test Template',
      category: 'welcome', 
      subject: 'Test Subject',
      htmlContent: '<h1>Test</h1>',
      textContent: 'Test content'
    });
    console.log('SUCCESS - Template created:', template.name, template.id);
    
    // Test finding it
    const found = await EmailTemplate.findById(template.id);
    console.log('FOUND:', found ? found.name : 'Not found');
    
    // Test listing all
    const all = await EmailTemplate.find();
    console.log('ALL TEMPLATES:', all.length);
    
  } catch (err) {
    console.error('ERROR:', err.message);
  }
}

testTemplate();
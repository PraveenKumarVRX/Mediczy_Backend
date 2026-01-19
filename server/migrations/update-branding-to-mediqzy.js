/**
 * Update all Mediczy references to Mediqzy in database
 */

export async function up(queryInterface, Sequelize) {
  // Update Welcome New User template
  await queryInterface.sequelize.query(`
    UPDATE email_templates 
    SET 
      subject = 'Welcome to Mediqzy!',
      "htmlContent" = REPLACE("htmlContent", 'Mediczy', 'Mediqzy'),
      "textContent" = REPLACE("textContent", 'Mediczy', 'Mediqzy'),
      "updatedAt" = NOW()
    WHERE name = 'Welcome New User'
  `);

  console.log('✅ Updated email templates branding from Mediczy to Mediqzy');
}

export async function down(queryInterface, Sequelize) {
  // Revert to Mediczy
  await queryInterface.sequelize.query(`
    UPDATE email_templates 
    SET 
      subject = 'Welcome to Mediczy!',
      "htmlContent" = REPLACE("htmlContent", 'Mediqzy', 'Mediczy'),
      "textContent" = REPLACE("textContent", 'Mediqzy', 'Mediczy'),
      "updatedAt" = NOW()
    WHERE name = 'Welcome New User'
  `);

  console.log('🔄 Reverted email templates branding to Mediczy');
}

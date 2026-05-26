export async function up(queryInterface, Sequelize) {
  await queryInterface.createTable('vital_records', {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
    organization_id: { type: Sequelize.INTEGER, allowNull: false },
    admission_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'ip_admissions', key: 'id' } },
    patient_id: { type: Sequelize.INTEGER, allowNull: false },
    recorded_by: { type: Sequelize.INTEGER, allowNull: true },
    recorded_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    source: { type: Sequelize.ENUM('manual','iot_device','wearable','ventilator','monitor'), defaultValue: 'manual' },
    device_id: { type: Sequelize.STRING(100), allowNull: true },
    // Vitals
    temperature: { type: Sequelize.DECIMAL(4,1), allowNull: true },
    pulse: { type: Sequelize.INTEGER, allowNull: true },
    bp_systolic: { type: Sequelize.INTEGER, allowNull: true },
    bp_diastolic: { type: Sequelize.INTEGER, allowNull: true },
    spo2: { type: Sequelize.DECIMAL(4,1), allowNull: true },
    respiratory_rate: { type: Sequelize.INTEGER, allowNull: true },
    gcs_score: { type: Sequelize.INTEGER, allowNull: true },
    pain_score: { type: Sequelize.INTEGER, allowNull: true },
    urine_output_ml: { type: Sequelize.INTEGER, allowNull: true },
    blood_glucose: { type: Sequelize.DECIMAL(5,1), allowNull: true },
    weight_kg: { type: Sequelize.DECIMAL(5,1), allowNull: true },
    // Ventilator params
    fio2: { type: Sequelize.DECIMAL(4,1), allowNull: true },
    peep: { type: Sequelize.DECIMAL(4,1), allowNull: true },
    tidal_volume: { type: Sequelize.INTEGER, allowNull: true },
    // Computed scores
    news2_score: { type: Sequelize.INTEGER, allowNull: true },
    shock_index: { type: Sequelize.DECIMAL(4,2), allowNull: true },
    notes: { type: Sequelize.TEXT, allowNull: true }
  });

  await queryInterface.createTable('early_warning_alerts', {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
    organization_id: { type: Sequelize.INTEGER, allowNull: false },
    admission_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'ip_admissions', key: 'id' } },
    vital_record_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'vital_records', key: 'id' } },
    patient_id: { type: Sequelize.INTEGER, allowNull: false },
    alert_type: { type: Sequelize.ENUM('sepsis','deterioration','fall_risk','respiratory','cardiac','hypoglycemia','pain'), allowNull: false },
    severity: { type: Sequelize.ENUM('low','medium','high','critical'), allowNull: false },
    news2_score: { type: Sequelize.INTEGER, allowNull: true },
    alert_message: { type: Sequelize.TEXT, allowNull: true },
    triggered_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    acknowledged_by: { type: Sequelize.INTEGER, allowNull: true },
    acknowledged_at: { type: Sequelize.DATE, allowNull: true },
    escalated: { type: Sequelize.BOOLEAN, defaultValue: false },
    resolved: { type: Sequelize.BOOLEAN, defaultValue: false }
  });

  await queryInterface.addIndex('vital_records', ['organization_id']);
  await queryInterface.addIndex('vital_records', ['admission_id']);
  await queryInterface.addIndex('vital_records', ['patient_id']);
  await queryInterface.addIndex('vital_records', ['recorded_at']);
  await queryInterface.addIndex('early_warning_alerts', ['admission_id']);
  await queryInterface.addIndex('early_warning_alerts', ['severity']);
  await queryInterface.addIndex('early_warning_alerts', ['resolved']);
  await queryInterface.addIndex('early_warning_alerts', ['triggered_at']);
}

export async function down(queryInterface) {
  await queryInterface.dropTable('early_warning_alerts');
  await queryInterface.dropTable('vital_records');
}

export async function up(queryInterface, Sequelize) {
  await queryInterface.createTable('ot_rooms', {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
    organization_id: { type: Sequelize.INTEGER, allowNull: false },
    name: { type: Sequelize.STRING(50), allowNull: false },
    room_type: {
      type: Sequelize.ENUM('major','minor','emergency','day_care','cath_lab','endo','laser'),
      defaultValue: 'major'
    },
    status: {
      type: Sequelize.ENUM('available','occupied','cleaning','maintenance'),
      defaultValue: 'available'
    },
    default_duration_minutes: { type: Sequelize.INTEGER, defaultValue: 120 },
    active: { type: Sequelize.BOOLEAN, defaultValue: true },
    created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW }
  });

  await queryInterface.createTable('ot_bookings', {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
    organization_id: { type: Sequelize.INTEGER, allowNull: false },
    admission_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'ip_admissions', key: 'id' } },
    patient_id: { type: Sequelize.INTEGER, allowNull: false },
    surgeon_id: { type: Sequelize.INTEGER, allowNull: true },
    anesthetist_id: { type: Sequelize.INTEGER, allowNull: true },
    ot_room_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'ot_rooms', key: 'id' } },
    procedure_code: { type: Sequelize.STRING(20), allowNull: true },
    procedure_name: { type: Sequelize.TEXT, allowNull: false },
    scheduled_start: { type: Sequelize.DATE, allowNull: false },
    scheduled_end: { type: Sequelize.DATE, allowNull: false },
    actual_start: { type: Sequelize.DATE, allowNull: true },
    actual_end: { type: Sequelize.DATE, allowNull: true },
    ot_status: {
      type: Sequelize.ENUM('scheduled','patient_in','prep','incision','closure','completed','cancelled','postponed'),
      defaultValue: 'scheduled'
    },
    booking_type: { type: Sequelize.ENUM('elective','emergency','urgent'), defaultValue: 'elective' },
    implants_required: { type: Sequelize.BOOLEAN, defaultValue: false },
    blood_units_reserved: { type: Sequelize.INTEGER, defaultValue: 0 },
    pre_auth_id: { type: Sequelize.INTEGER, allowNull: true },
    anesthesia_type: { type: Sequelize.STRING(50), allowNull: true },
    operative_notes: { type: Sequelize.TEXT, allowNull: true },
    cancellation_reason: { type: Sequelize.TEXT, allowNull: true },
    notes: { type: Sequelize.TEXT, allowNull: true },
    created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW }
  });

  await queryInterface.createTable('ot_checklists', {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
    ot_booking_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'ot_bookings', key: 'id' } },
    checklist_type: {
      type: Sequelize.ENUM('pre_op_nursing','sign_in','time_out','sign_out'),
      allowNull: false
    },
    checklist_data: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
    is_complete: { type: Sequelize.BOOLEAN, defaultValue: false },
    completed_by: { type: Sequelize.INTEGER, allowNull: true },
    completed_at: { type: Sequelize.DATE, allowNull: true },
    created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW }
  });

  await queryInterface.addIndex('ot_rooms', ['organization_id']);
  await queryInterface.addIndex('ot_bookings', ['organization_id']);
  await queryInterface.addIndex('ot_bookings', ['admission_id']);
  await queryInterface.addIndex('ot_bookings', ['scheduled_start']);
  await queryInterface.addIndex('ot_bookings', ['ot_status']);
  await queryInterface.addIndex('ot_checklists', ['ot_booking_id']);
}

export async function down(queryInterface) {
  await queryInterface.dropTable('ot_checklists');
  await queryInterface.dropTable('ot_bookings');
  await queryInterface.dropTable('ot_rooms');
}

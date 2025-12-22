export async function up(queryInterface, Sequelize) {
  await queryInterface.createTable('Addresses', {
    id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    userId: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    label: {
      type: Sequelize.STRING(50),
      allowNull: false,
      defaultValue: 'home'
    },
    isDefault: {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    },
    placeId: {
      type: Sequelize.STRING(255)
    },
    formattedAddress: {
      type: Sequelize.TEXT,
      allowNull: false
    },
    street: {
      type: Sequelize.STRING(255)
    },
    street2: {
      type: Sequelize.STRING(255)
    },
    city: {
      type: Sequelize.STRING(100)
    },
    state: {
      type: Sequelize.STRING(100)
    },
    zipCode: {
      type: Sequelize.STRING(20)
    },
    country: {
      type: Sequelize.STRING(100)
    },
    countryCode: {
      type: Sequelize.STRING(2)
    },
    latitude: {
      type: Sequelize.DECIMAL(10, 8)
    },
    longitude: {
      type: Sequelize.DECIMAL(11, 8)
    },
    landmark: {
      type: Sequelize.STRING(255)
    },
    deliveryInstructions: {
      type: Sequelize.TEXT
    },
    placeData: {
      type: Sequelize.JSONB
    },
    isActive: {
      type: Sequelize.BOOLEAN,
      defaultValue: true
    },
    createdAt: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.NOW
    },
    updatedAt: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.NOW
    }
  });

  await queryInterface.addIndex('Addresses', ['userId']);
  await queryInterface.addIndex('Addresses', ['placeId']);
  await queryInterface.addIndex('Addresses', ['isDefault']);
  await queryInterface.addIndex('Addresses', ['label']);
}

export async function down(queryInterface, Sequelize) {
  await queryInterface.dropTable('Addresses');
}

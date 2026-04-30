'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('audit_logs', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
      },
      tenant_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'tenants', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      actor_user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      entity_type: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      entity_id: {
        type: Sequelize.STRING(120),
        allowNull: false,
      },
      action: {
        type: Sequelize.STRING(32),
        allowNull: false,
      },
      before_json: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      after_json: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      metadata_json: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    await queryInterface.addIndex('audit_logs', ['tenant_id', 'created_at'], {
      name: 'audit_logs_tenant_created_at_idx',
    });
    await queryInterface.addIndex('audit_logs', ['tenant_id', 'entity_type', 'entity_id'], {
      name: 'audit_logs_tenant_entity_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('audit_logs');
  },
};

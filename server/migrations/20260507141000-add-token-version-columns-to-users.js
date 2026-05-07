'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('users');

    if (!table.token_version) {
      await queryInterface.addColumn('users', 'token_version', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }

    if (!table.password_changed_at) {
      await queryInterface.addColumn('users', 'password_changed_at', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('users');

    if (table.password_changed_at) {
      await queryInterface.removeColumn('users', 'password_changed_at');
    }

    if (table.token_version) {
      await queryInterface.removeColumn('users', 'token_version');
    }
  },
};

'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('students');
    if (table.room_type) {
      await queryInterface.removeColumn('students', 'room_type');
    }
  },

  async down(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('students');
    if (!table.room_type) {
      await queryInterface.addColumn('students', 'room_type', {
        type: Sequelize.STRING(50),
        allowNull: true,
      });
    }
  },
};

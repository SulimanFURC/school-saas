'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS fee_collections_tenant_collection_date_idx
      ON fee_collections (tenant_id, collection_date);
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS fee_collections_tenant_student_collection_date_idx
      ON fee_collections (tenant_id, student_id, collection_date);
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS student_enrollments_tenant_year_status_idx
      ON student_enrollments (tenant_id, academic_year_id, status);
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS student_enrollments_tenant_student_status_idx
      ON student_enrollments (tenant_id, student_id, status);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS fee_collections_tenant_collection_date_idx;
    `);

    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS fee_collections_tenant_student_collection_date_idx;
    `);

    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS student_enrollments_tenant_year_status_idx;
    `);

    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS student_enrollments_tenant_student_status_idx;
    `);
  },
};

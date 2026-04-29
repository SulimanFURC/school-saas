'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE users
      SET role = 'student'
      WHERE role IS NULL OR role NOT IN ('super_admin', 'admin', 'student', 'teacher');
    `);

    await queryInterface.sequelize.query(`
      UPDATE users
      SET status = 'active'
      WHERE status IS NULL OR status NOT IN ('active', 'inactive');
    `);

    await queryInterface.sequelize.query(`
      UPDATE student_enrollments
      SET status = 'active'
      WHERE status IS NULL OR status NOT IN ('active', 'inactive', 'promoted', 'withdrawn');
    `);

    await queryInterface.sequelize.query(`
      UPDATE student_enrollments
      SET promotion_type = 'initial'
      WHERE promotion_type IS NULL OR promotion_type NOT IN ('initial', 'promoted', 'repeated');
    `);

    await queryInterface.sequelize.query(`
      UPDATE fee_collections
      SET status = 'Paid'
      WHERE status IS NULL OR status NOT IN ('Paid', 'Pending', 'Unpaid');
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE users
      ADD CONSTRAINT users_role_check
      CHECK (role IN ('super_admin', 'admin', 'student', 'teacher'));
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE users
      ADD CONSTRAINT users_status_check
      CHECK (status IN ('active', 'inactive'));
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE student_enrollments
      ADD CONSTRAINT student_enrollments_status_check
      CHECK (status IN ('active', 'inactive', 'promoted', 'withdrawn'));
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE student_enrollments
      ADD CONSTRAINT student_enrollments_promotion_type_check
      CHECK (promotion_type IN ('initial', 'promoted', 'repeated'));
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE fee_collections
      ADD CONSTRAINT fee_collections_status_check
      CHECK (status IN ('Paid', 'Pending', 'Unpaid'));
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE fee_collections
      DROP CONSTRAINT IF EXISTS fee_collections_status_check;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE student_enrollments
      DROP CONSTRAINT IF EXISTS student_enrollments_promotion_type_check;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE student_enrollments
      DROP CONSTRAINT IF EXISTS student_enrollments_status_check;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE users
      DROP CONSTRAINT IF EXISTS users_status_check;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE users
      DROP CONSTRAINT IF EXISTS users_role_check;
    `);
  },
};

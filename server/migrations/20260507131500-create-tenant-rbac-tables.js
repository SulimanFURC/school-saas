'use strict';

const { randomUUID } = require('crypto');

const SYSTEM_ROLES = ['admin', 'teacher', 'student', 'accountant', 'transport_manager', 'receptionist'];
const MODULE_KEYS = ['students', 'classes', 'teachers', 'fees', 'expenses', 'exams', 'reports', 'settings', 'attendance', 'transport'];
const ACTIONS = ['create', 'read', 'update', 'delete'];

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('tenant_roles', {
      id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
      tenant_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'tenants', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      name: { type: Sequelize.STRING(80), allowNull: false },
      description: { type: Sequelize.STRING(255), allowNull: true },
      is_system_role: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
    });
    await queryInterface.addIndex('tenant_roles', ['tenant_id', 'name'], {
      unique: true,
      name: 'tenant_roles_tenant_id_name_unique',
    });

    await queryInterface.createTable('tenant_permissions', {
      id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
      module_key: { type: Sequelize.STRING(80), allowNull: false },
      action: { type: Sequelize.STRING(32), allowNull: false },
      code: { type: Sequelize.STRING(140), allowNull: false, unique: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
    });
    await queryInterface.addIndex('tenant_permissions', ['module_key', 'action'], {
      unique: true,
      name: 'tenant_permissions_module_action_unique',
    });

    await queryInterface.createTable('tenant_role_permissions', {
      id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
      tenant_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'tenants', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      role_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'tenant_roles', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      permission_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'tenant_permissions', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
    });
    await queryInterface.addIndex('tenant_role_permissions', ['tenant_id', 'role_id', 'permission_id'], {
      unique: true,
      name: 'tenant_role_permissions_tenant_role_permission_unique',
    });

    await queryInterface.createTable('user_tenant_roles', {
      id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
      tenant_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'tenants', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      role_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'tenant_roles', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
    });
    await queryInterface.addIndex('user_tenant_roles', ['tenant_id', 'user_id'], {
      unique: true,
      name: 'user_tenant_roles_tenant_id_user_id_unique',
    });

    const [tenants] = await queryInterface.sequelize.query('SELECT id FROM tenants');

    const permissionRows = [];
    for (const moduleKey of MODULE_KEYS) {
      for (const action of ACTIONS) {
        permissionRows.push({
          id: randomUUID(),
          module_key: moduleKey,
          action,
          code: `${moduleKey}.${action}`,
          created_at: new Date(),
          updated_at: new Date(),
        });
      }
    }
    if (permissionRows.length > 0) {
      await queryInterface.bulkInsert('tenant_permissions', permissionRows);
    }

    const [permissionTableRows] = await queryInterface.sequelize.query(
      'SELECT id, module_key, action, code FROM tenant_permissions'
    );
    const permissionByCode = new Map(permissionTableRows.map((p) => [p.code, p.id]));

    for (const tenant of tenants) {
      const roleIds = new Map();
      for (const roleName of SYSTEM_ROLES) {
        const id = randomUUID();
        roleIds.set(roleName, id);
      }

      const roleRows = SYSTEM_ROLES.map((name) => ({
        id: roleIds.get(name),
        tenant_id: tenant.id,
        name,
        description: `${name} system role`,
        is_system_role: true,
        created_at: new Date(),
        updated_at: new Date(),
      }));
      await queryInterface.bulkInsert('tenant_roles', roleRows);

      const allCodes = MODULE_KEYS.flatMap((m) => ACTIONS.map((a) => `${m}.${a}`));
      const rolePermissionCodes = {
        admin: allCodes,
        teacher: ['exams.read', 'exams.update', 'settings.read'],
        student: ['exams.read', 'settings.read'],
        accountant: ['fees.create', 'fees.read', 'fees.update', 'expenses.create', 'expenses.read', 'expenses.update', 'reports.read', 'students.read'],
        transport_manager: ['transport.create', 'transport.read', 'transport.update', 'students.read', 'reports.read'],
        receptionist: ['students.create', 'students.read', 'students.update', 'reports.read', 'settings.read'],
      };

      const trpRows = [];
      for (const [roleName, codes] of Object.entries(rolePermissionCodes)) {
        const roleId = roleIds.get(roleName);
        if (!roleId) continue;
        for (const code of codes) {
          const permissionId = permissionByCode.get(code);
          if (!permissionId) continue;
          trpRows.push({
            id: randomUUID(),
            tenant_id: tenant.id,
            role_id: roleId,
            permission_id: permissionId,
            created_at: new Date(),
            updated_at: new Date(),
          });
        }
      }
      if (trpRows.length > 0) {
        await queryInterface.bulkInsert('tenant_role_permissions', trpRows);
      }

      const [users] = await queryInterface.sequelize.query(
        'SELECT id, role FROM users WHERE tenant_id = :tenantId',
        { replacements: { tenantId: tenant.id } }
      );

      const userRoleRows = users
        .map((u) => {
          const normalized = String(u.role || '').toLowerCase();
          const fallbackRole = roleIds.has(normalized) ? normalized : 'student';
          return {
            id: randomUUID(),
            tenant_id: tenant.id,
            user_id: u.id,
            role_id: roleIds.get(fallbackRole),
            created_at: new Date(),
            updated_at: new Date(),
          };
        })
        .filter((x) => !!x.role_id);

      if (userRoleRows.length > 0) {
        await queryInterface.bulkInsert('user_tenant_roles', userRoleRows);
      }
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('user_tenant_roles');
    await queryInterface.dropTable('tenant_role_permissions');
    await queryInterface.dropTable('tenant_permissions');
    await queryInterface.dropTable('tenant_roles');
  },
};


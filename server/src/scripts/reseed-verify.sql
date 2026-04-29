SET lock_timeout = '10s';

-- =====================================================================
-- After Phase 1 (clean): expect 1 user (super_admin), 1 tenant (platform)
-- =====================================================================
-- SELECT COUNT(*) FROM users;
-- Expect: 1
-- SELECT COUNT(*) FROM tenants;
-- Expect: 1
-- SELECT email, role FROM users WHERE role = 'super_admin';
-- Expect: superadmin@platform.com | super_admin

-- =====================================================================
-- After Phase 2: expect 3 tenants (platform, steps-school, tmsc); each school tenant ~11 tenant_modules rows
-- =====================================================================
SELECT id, name, subdomain, status
FROM tenants
ORDER BY subdomain;

SELECT t.subdomain, COUNT(tm.id) AS tenant_module_rows
FROM tenants t
LEFT JOIN tenant_modules tm ON tm.tenant_id = t.id
GROUP BY t.id, t.subdomain
ORDER BY t.subdomain;

-- =====================================================================
-- After Phase 3: steps-school users + fees (tmsc should have zero users)
-- =====================================================================
SELECT role, COUNT(*) AS cnt
FROM users
WHERE tenant_id = (SELECT id FROM tenants WHERE subdomain = 'steps-school')
GROUP BY role
ORDER BY role;

SELECT email, role
FROM users
WHERE tenant_id = (SELECT id FROM tenants WHERE subdomain = 'steps-school')
  AND role <> 'student'
ORDER BY role, email;

SELECT COUNT(*) AS fee_collections_steps
FROM fee_collections
WHERE tenant_id = (SELECT id FROM tenants WHERE subdomain = 'steps-school');

SELECT COUNT(*) AS users_tmsc
FROM users
WHERE tenant_id = (SELECT id FROM tenants WHERE subdomain = 'tmsc');

-- Only one cash register may remain open for a tenant unit or operator.
-- Partial indexes are used because closed and cancelled registers retain history.
CREATE UNIQUE INDEX "CashRegister_one_open_per_unit"
ON "CashRegister" ("tenantId", "unitId")
WHERE "status" = 'OPEN';

CREATE UNIQUE INDEX "CashRegister_one_open_per_operator"
ON "CashRegister" ("tenantId", "openedByUserId")
WHERE "status" = 'OPEN';

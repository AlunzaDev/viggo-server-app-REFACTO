ALTER TABLE inbox_events ADD COLUMN source_position BIGINT;
CREATE TABLE operational_tickets (
 proyecto_id UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
 installation_id TEXT NOT NULL, aggregate_id TEXT NOT NULL,
 occurred_at TIMESTAMPTZ(3) NOT NULL, source_position BIGINT, event_id TEXT NOT NULL, payload JSONB NOT NULL,
 PRIMARY KEY (proyecto_id, installation_id, aggregate_id));
CREATE INDEX operational_tickets_proyecto_id_occurred_at_idx ON operational_tickets(proyecto_id, occurred_at);
CREATE TABLE operational_payments (
 proyecto_id UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
 installation_id TEXT NOT NULL, aggregate_id TEXT NOT NULL,
 occurred_at TIMESTAMPTZ(3) NOT NULL, source_position BIGINT, event_id TEXT NOT NULL, payload JSONB NOT NULL,
 PRIMARY KEY (proyecto_id, installation_id, aggregate_id));
CREATE INDEX operational_payments_proyecto_id_occurred_at_idx ON operational_payments(proyecto_id, occurred_at);
CREATE TABLE operational_cash_payment_sessions (
 proyecto_id UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
 installation_id TEXT NOT NULL, aggregate_id TEXT NOT NULL,
 occurred_at TIMESTAMPTZ(3) NOT NULL, source_position BIGINT, event_id TEXT NOT NULL, payload JSONB NOT NULL,
 PRIMARY KEY (proyecto_id, installation_id, aggregate_id));
CREATE INDEX operational_cash_payment_sessions_proyecto_id_occurred_at_idx ON operational_cash_payment_sessions(proyecto_id, occurred_at);
CREATE TABLE operational_cash_register_shifts (
 proyecto_id UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
 installation_id TEXT NOT NULL, aggregate_id TEXT NOT NULL,
 occurred_at TIMESTAMPTZ(3) NOT NULL, source_position BIGINT, event_id TEXT NOT NULL, payload JSONB NOT NULL,
 PRIMARY KEY (proyecto_id, installation_id, aggregate_id));
CREATE INDEX operational_cash_register_shifts_proyecto_id_occurred_at_idx ON operational_cash_register_shifts(proyecto_id, occurred_at);
CREATE TABLE operational_cash_register_movements (
 proyecto_id UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
 installation_id TEXT NOT NULL, aggregate_id TEXT NOT NULL,
 occurred_at TIMESTAMPTZ(3) NOT NULL, source_position BIGINT, event_id TEXT NOT NULL, payload JSONB NOT NULL,
 PRIMARY KEY (proyecto_id, installation_id, aggregate_id));
CREATE INDEX operational_cash_register_movements_proyecto_id_occurred_at_idx ON operational_cash_register_movements(proyecto_id, occurred_at);
CREATE TABLE operational_cash_register_cuts (
 proyecto_id UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
 installation_id TEXT NOT NULL, aggregate_id TEXT NOT NULL,
 occurred_at TIMESTAMPTZ(3) NOT NULL, source_position BIGINT, event_id TEXT NOT NULL, payload JSONB NOT NULL,
 PRIMARY KEY (proyecto_id, installation_id, aggregate_id));
CREATE INDEX operational_cash_register_cuts_proyecto_id_occurred_at_idx ON operational_cash_register_cuts(proyecto_id, occurred_at);
CREATE TABLE operational_pension_moves (
 proyecto_id UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
 installation_id TEXT NOT NULL, aggregate_id TEXT NOT NULL,
 occurred_at TIMESTAMPTZ(3) NOT NULL, source_position BIGINT, event_id TEXT NOT NULL, payload JSONB NOT NULL,
 PRIMARY KEY (proyecto_id, installation_id, aggregate_id));
CREATE INDEX operational_pension_moves_proyecto_id_occurred_at_idx ON operational_pension_moves(proyecto_id, occurred_at);

ALTER TABLE inbox_events ADD COLUMN last_attempt_at TIMESTAMPTZ(3);

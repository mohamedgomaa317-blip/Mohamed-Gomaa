-- 002: indexes for the hot paths (due reviews, recent attempts, open mistakes)
CREATE INDEX idx_reviews_due        ON reviews(due_at);
CREATE INDEX idx_attempts_created   ON attempts(created_at);
CREATE INDEX idx_attempts_unit      ON attempts(unit_id);
CREATE INDEX idx_attempts_exercise  ON attempts(exercise_id);
CREATE INDEX idx_mistakes_open      ON mistakes(resolved_at);
CREATE INDEX idx_exercises_unit     ON exercises(unit_id);
CREATE INDEX idx_units_level_order  ON units(level, order_index);
CREATE INDEX idx_sessions_started   ON sessions(started_at);

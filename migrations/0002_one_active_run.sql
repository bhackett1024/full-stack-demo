CREATE UNIQUE INDEX runs_one_active_question ON runs(question_id) WHERE status IN ('queued', 'running');

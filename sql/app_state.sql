CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT OR IGNORE INTO app_state (key, value) VALUES
    ('theme', 'dark'),
    ('default_env', ''),
    ('enable_animations', 'true'),
    ('response_history_ttl', '5');

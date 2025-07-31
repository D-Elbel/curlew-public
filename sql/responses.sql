CREATE TABLE IF NOT EXISTS responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status_code INTEGER,
    headers TEXT,
    body TEXT,
    runtime_ms INTEGER,
    request_id INTEGER
);
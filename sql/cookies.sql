CREATE TABLE IF NOT EXISTS cookies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    environment_id TEXT,
    environment_scope TEXT GENERATED ALWAYS AS (COALESCE(environment_id, 'GLOBAL')) STORED,
    domain TEXT NOT NULL,
    path TEXT NOT NULL DEFAULT '/',
    name TEXT NOT NULL,
    value TEXT NOT NULL,
    host_only INTEGER NOT NULL DEFAULT 0,
    http_only INTEGER NOT NULL DEFAULT 0,
    secure INTEGER NOT NULL DEFAULT 0,
    session INTEGER NOT NULL DEFAULT 0,
    same_site TEXT,
    expires_at DATETIME,
    extensions TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_accessed_at DATETIME,
    FOREIGN KEY(environment_id) REFERENCES environments(id),
    UNIQUE(environment_scope, domain, path, name)
);

CREATE INDEX IF NOT EXISTS idx_cookies_domain ON cookies(domain);
CREATE INDEX IF NOT EXISTS idx_cookies_environment ON cookies(environment_id);

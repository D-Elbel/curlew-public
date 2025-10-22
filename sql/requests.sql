CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id TEXT,
    name TEXT,
    description TEXT,
    method TEXT,
    url TEXT,
    headers TEXT,
    body TEXT,
    body_type TEXT,
    auth TEXT,
    body_format TEXT,
    sort_order INTEGER,
    FOREIGN KEY (collection_id) REFERENCES collections (id)
);

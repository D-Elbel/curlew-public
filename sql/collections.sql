CREATE TABLE IF NOT EXISTS collections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    schema TEXT,
    version_major INTEGER,
    version_minor INTEGER,
    version_patch INTEGER,
    version_identifier TEXT,
    parent_collection TEXT
);
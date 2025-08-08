CREATE TABLE IF NOT EXISTS users
(
    id integer not null primary key,
    config TEXT
);

INSERT OR IGNORE INTO users (id, config) VALUES (1, NULL);
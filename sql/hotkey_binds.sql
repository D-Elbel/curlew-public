CREATE TABLE IF NOT EXISTS hotkey_binds (
    Command TEXT NOT NULL PRIMARY KEY,
    Bind TEXT
);

INSERT INTO hotkey_binds (Command, Bind) VALUES ('OPEN_SEARCH_COMMAND', 'ctrl+k'), ('OPEN_TAB_MENU', 'ctrl+tab'),('NEW_ENV', 'ctrl+n+e'),('NEW_REQUEST', 'ctrl+n+r'),('OPEN_ENV', 'ctrl+e') ON CONFLICT(Command) DO NOTHING;

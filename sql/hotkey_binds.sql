CREATE TABLE IF NOT EXISTS hotkey_binds (
    Command TEXT NOT NULL PRIMARY KEY,
    Bind TEXT,
    pretty_name TEXT
);

INSERT INTO hotkey_binds (Command, Bind, pretty_name) VALUES
    ('OPEN_SEARCH_COMMAND', 'ctrl+k', 'Open Search'),
    ('OPEN_TAB_MENU', 'ctrl+tab', 'Open Tab Menu'),
    ('NEW_ENV', 'ctrl+n+e', 'New Environment'),
    ('NEW_REQUEST', 'ctrl+n+r', 'New Request'),
    ('OPEN_ENV', 'ctrl+e', 'Open Environment'),
    ('OPEN_SIDEBAR', 'ctrl+b', 'Toggle Sidebar'),
    ('HANDLE_ENTITY_SAVE', 'ctrl+s', 'Save Entity'),
    ('SEND_REQUEST', 'ctrl+enter', 'Send Request')
ON CONFLICT(Command) DO NOTHING;

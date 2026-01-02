package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"github.com/wailsapp/wails/v3/pkg/application"
)

type UserService struct {
	db        *sql.DB
	app       *application.App
	sqlRunner *SQLRunner
}

type Keybind struct {
	Command    *string `json:"command"`
	Bind       *string `json:"bind"`
	PrettyName *string `json:"prettyName"`
}

func (s *UserService) FetchUserKeybinds() json.RawMessage {
	result, err := s.ensureSQLRunner().QuerySQL(SQLRequest{
		SQL: `SELECT command, bind, pretty_name AS prettyName FROM hotkey_binds`,
	})
	if err != nil {
		fmt.Println("Error fetching keybinds", err)
		return nil
	}

	keybinds := make([]Keybind, 0, len(result.Rows))
	for _, row := range result.Rows {
		keybinds = append(keybinds, Keybind{
			Command:    stringPtrFromAny(row["command"]),
			Bind:       stringPtrFromAny(row["bind"]),
			PrettyName: stringPtrFromAny(row["prettyName"]),
		})
	}

	jsonBytes, err := json.MarshalIndent(keybinds, "", "")
	if err != nil {
		fmt.Println("Error marshalling keybinds", err)
		return nil
	}

	return jsonBytes
}

func (s *UserService) UpdateUserKeybinds(keybinds []Keybind) error {
	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("failed to start keybind update transaction: %w", err)
	}

	stmt, err := tx.Prepare(`
		INSERT INTO hotkey_binds (command, bind, pretty_name)
		VALUES (?, ?, ?)
		ON CONFLICT(command) DO UPDATE SET
			bind = excluded.bind,
			pretty_name = excluded.pretty_name
	`)
	if err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to prepare keybind upsert statement: %w", err)
	}
	defer stmt.Close()

	for _, kb := range keybinds {
		if kb.Command == nil || *kb.Command == "" {
			tx.Rollback()
			return fmt.Errorf("keybind command is required")
		}

		var bindValue interface{}
		if kb.Bind != nil {
			bindValue = *kb.Bind
		}

		var prettyName interface{}
		if kb.PrettyName != nil {
			prettyName = *kb.PrettyName
		}

		if _, err := stmt.Exec(*kb.Command, bindValue, prettyName); err != nil {
			tx.Rollback()
			return fmt.Errorf("failed to upsert keybind %s: %w", *kb.Command, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit keybind updates: %w", err)
	}

	return nil
}

func (s *UserService) ensureSQLRunner() *SQLRunner {
	if s.sqlRunner == nil {
		s.sqlRunner = NewSQLRunner(s.db)
	}
	return s.sqlRunner
}

func stringPtrFromAny(value any) *string {
	if value == nil {
		return nil
	}
	if str, ok := value.(string); ok {
		return &str
	}
	str := fmt.Sprint(value)
	return &str
}

func (s *UserService) ensureHotkeySchema() {
	if s.db == nil {
		return
	}

	hasPretty := false
	rows, err := s.db.Query(`PRAGMA table_info(hotkey_binds)`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var (
				cid       int
				name      string
				ctype     string
				notnull   int
				dfltValue sql.NullString
				pk        int
			)
			if err := rows.Scan(&cid, &name, &ctype, &notnull, &dfltValue, &pk); err != nil {
				continue
			}
			if name == "pretty_name" {
				hasPretty = true
				break
			}
		}
	}

	if !hasPretty {
		if _, err := s.db.Exec(`ALTER TABLE hotkey_binds ADD COLUMN pretty_name TEXT`); err != nil {
			fmt.Println("Failed to add pretty_name to hotkey_binds:", err)
		}
	}

	defaults := []struct {
		command    string
		bind       string
		prettyName string
	}{
		{"OPEN_SEARCH_COMMAND", "ctrl+k", "Open Search"},
		{"OPEN_TAB_MENU", "ctrl+tab", "Open Tab Menu"},
		{"NEW_ENV", "ctrl+n+e", "New Environment"},
		{"NEW_REQUEST", "ctrl+n+r", "New Request"},
		{"OPEN_ENV", "ctrl+e", "Open Environment"},
		{"OPEN_SIDEBAR", "ctrl+b", "Toggle Sidebar"},
		{"HANDLE_ENTITY_SAVE", "ctrl+s", "Save Entity"},
		{"SEND_REQUEST", "ctrl+enter", "Send Request"},
	}

	for _, d := range defaults {
		if _, err := s.db.Exec(
			`INSERT INTO hotkey_binds (command, bind, pretty_name)
             VALUES (?, ?, ?)
             ON CONFLICT(command) DO NOTHING`,
			d.command,
			d.bind,
			d.prettyName,
		); err != nil {
			fmt.Println("Failed to seed hotkey bind", d.command, err)
		}
	}
}

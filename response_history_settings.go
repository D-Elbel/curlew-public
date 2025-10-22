package main

import (
	"database/sql"
	"fmt"
	"strconv"
	"strings"
)

const (
	responseHistoryTTLKey     = "response_history_ttl"
	defaultResponseHistoryTTL = 5
)

func loadResponseHistoryTTL(db *sql.DB) (int, error) {
	if db == nil {
		return defaultResponseHistoryTTL, fmt.Errorf("database not initialized")
	}

	var raw string
	err := db.QueryRow(`SELECT value FROM app_state WHERE key = ?`, responseHistoryTTLKey).Scan(&raw)
	if err == sql.ErrNoRows {
		if err := saveResponseHistoryTTL(db, defaultResponseHistoryTTL); err != nil {
			return defaultResponseHistoryTTL, fmt.Errorf("failed to seed default response history TTL: %w", err)
		}
		return defaultResponseHistoryTTL, nil
	}
	if err != nil {
		return defaultResponseHistoryTTL, err
	}

	val, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || val < 1 {
		if err := saveResponseHistoryTTL(db, defaultResponseHistoryTTL); err != nil {
			return defaultResponseHistoryTTL, fmt.Errorf("failed to repair invalid response history TTL: %w", err)
		}
		return defaultResponseHistoryTTL, nil
	}
	return val, nil
}

func saveResponseHistoryTTL(db *sql.DB, ttl int) error {
	if db == nil {
		return fmt.Errorf("database not initialized")
	}
	if ttl < 1 {
		return fmt.Errorf("response history TTL must be greater than zero")
	}

	_, err := db.Exec(
		`INSERT INTO app_state (key, value)
		 VALUES (?, ?)
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
		responseHistoryTTLKey,
		fmt.Sprintf("%d", ttl),
	)
	if err != nil {
		return fmt.Errorf("failed to persist response history TTL: %w", err)
	}
	return nil
}

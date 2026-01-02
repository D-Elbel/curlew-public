package main

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

type RequestCRUDService struct {
	db        *sql.DB
	app       *application.App
	sqlRunner *SQLRunner
}

type Response struct {
	ID         int        `json:"id"`
	StatusCode int        `json:"statusCode"`
	Headers    string     `json:"headers"`
	Body       string     `json:"body"`
	RuntimeMS  int        `json:"runtimeMS"`
	RequestID  int        `json:"requestID"`
	CreatedAt  *time.Time `json:"createdAt,omitempty"`
}

func (s *RequestCRUDService) Init() {
	s.ensureResponsesSchema()
}

func (s *RequestCRUDService) ensureResponsesSchema() {
	if s.db == nil {
		return
	}

	hasCreatedAt := false
	rows, err := s.db.Query(`PRAGMA table_info(responses)`)
	if err != nil {
		fmt.Println("Failed to inspect responses schema:", err)
	} else {
		defer rows.Close()
		for rows.Next() {
			var cid int
			var name, ctype string
			var notnull int
			var dfltValue sql.NullString
			var pk int
			if err := rows.Scan(&cid, &name, &ctype, &notnull, &dfltValue, &pk); err != nil {
				continue
			}
			if name == "created_at" {
				hasCreatedAt = true
				break
			}
		}
	}

	if !hasCreatedAt {
		if _, err := s.db.Exec(`ALTER TABLE responses ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`); err != nil {
			fmt.Println("Failed to add created_at to responses:", err)
		}
	}

	if _, err := s.db.Exec(
		`INSERT INTO app_state (key, value)
		 VALUES (?, ?)
		 ON CONFLICT(key) DO NOTHING`,
		responseHistoryTTLKey,
		fmt.Sprintf("%d", defaultResponseHistoryTTL),
	); err != nil {
		fmt.Println("Failed to ensure response history TTL setting:", err)
	}
}

func (s *RequestCRUDService) getResponseHistoryLimit() int {
	ttl, err := loadResponseHistoryTTL(s.db)
	if err != nil {
		fmt.Println("Failed to load response history TTL:", err)
		return defaultResponseHistoryTTL
	}
	return ttl
}

func (s *RequestCRUDService) logResponseHistory(requestID int, statusCode int, headers string, body string, runtimeMS int, createdAt *time.Time) {
	if s.db == nil || requestID <= 0 {
		return
	}

	var err error
	if createdAt != nil {
		_, err = s.db.Exec(
			`INSERT INTO responses (status_code, headers, body, runtime_ms, request_id, created_at)
			 VALUES (?, ?, ?, ?, ?, ?)`,
			statusCode,
			headers,
			body,
			runtimeMS,
			requestID,
			createdAt.UTC(),
		)
	} else {
		_, err = s.db.Exec(
			`INSERT INTO responses (status_code, headers, body, runtime_ms, request_id)
			 VALUES (?, ?, ?, ?, ?)`,
			statusCode,
			headers,
			body,
			runtimeMS,
			requestID,
		)
	}
	if err != nil {
		fmt.Println("Failed to record response history:", err)
		return
	}

	limit := s.getResponseHistoryLimit()
	if limit <= 0 {
		return
	}

	_, err = s.db.Exec(
		`DELETE FROM responses
		 WHERE request_id = ?
		   AND id NOT IN (
		       SELECT id FROM responses
		       WHERE request_id = ?
		       ORDER BY COALESCE(created_at, CURRENT_TIMESTAMP) DESC, id DESC
		       LIMIT ?
		   )`,
		requestID,
		requestID,
		limit,
	)
	if err != nil {
		fmt.Println("Failed to enforce response history TTL:", err)
	}
}

func (s *RequestCRUDService) QuerySQL(req SQLRequest) (SQLResponse, error) {
	return s.ensureSQLRunner().QuerySQL(req)
}

func (s *RequestCRUDService) ExecSQL(req SQLRequest) (SQLResponse, error) {
	return s.ensureSQLRunner().ExecSQL(req)
}

func (s *RequestCRUDService) ensureSQLRunner() *SQLRunner {
	if s.sqlRunner == nil {
		s.sqlRunner = NewSQLRunner(s.db)
	}
	return s.sqlRunner
}

func nullStringToPointer(ns sql.NullString) *string {
	if ns.Valid {
		value := ns.String
		return &value
	}
	return nil
}

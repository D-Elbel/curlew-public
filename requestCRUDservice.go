package main

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

type RequestCRUDService struct {
	db  *sql.DB
	app *application.App
}

type Request struct {
	ID             int       `json:"id"`
	CollectionID   *string   `json:"collectionId"`
	CollectionName *string   `json:"collectionName"`
	Name           *string   `json:"name"`
	Description    *string   `json:"description"`
	Method         *string   `json:"method"`
	URL            *string   `json:"url"`
	Headers        *string   `json:"headers"`
	Body           *string   `json:"body"`
	BodyType       *string   `json:"bodyType"`
	BodyFormat     *string   `json:"bodyFormat"`
	Auth           *string   `json:"auth"`
	SortOrder      *int      `json:"sortOrder"`
	Response       *Response `json:"response,omitempty"`
}

type Collection struct {
	ID                 string  `json:"id"`
	Name               string  `json:"name"`
	Description        string  `json:"description"`
	ParentCollectionId *string `json:"parentCollectionId"`
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

type DBTarget string

const (
	DBMain         DBTarget = "main"
	defaultMaxRows          = 200
	maxAllowedRows          = 1000
)

type SQLRequest struct {
	DB       DBTarget        `json:"db"`
	SQL      string          `json:"sql"`
	Params   []any           `json:"params"`
	MaxRows  int             `json:"maxRows"`
	ReadOnly bool            `json:"readOnly"`
	Context  context.Context `json:"-"`
}

type SQLResponse struct {
	Rows         []map[string]any `json:"rows,omitempty"`
	RowsAffected int64            `json:"rowsAffected,omitempty"`
	LastInsertID int64            `json:"lastInsertId,omitempty"`
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
	if s.db == nil {
		return SQLResponse{}, fmt.Errorf("database not initialized")
	}

	normalized := normalizeSQLRequest(req)
	if err := validateSQLRequest(normalized); err != nil {
		return SQLResponse{}, err
	}

	db, err := s.dbHandle(normalized.DB)
	if err != nil {
		return SQLResponse{}, err
	}

	ctx := normalized.Context
	if ctx == nil {
		ctx = context.Background()
	}

	rows, err := db.QueryContext(ctx, normalized.SQL, normalized.Params...)
	if err != nil {
		return SQLResponse{}, err
	}
	defer rows.Close()

	columns, err := rows.Columns()
	if err != nil {
		return SQLResponse{}, err
	}

	var results []map[string]any
	rowLimit := normalized.MaxRows
	index := 0
	for rows.Next() {
		if index >= rowLimit {
			break
		}

		rawValues := make([]any, len(columns))
		dest := make([]any, len(columns))
		for i := range rawValues {
			dest[i] = &rawValues[i]
		}

		if err := rows.Scan(dest...); err != nil {
			return SQLResponse{}, err
		}

		rowMap := make(map[string]any, len(columns))
		for i, col := range columns {
			rowMap[col] = normalizeSQLValue(rawValues[i])
		}
		results = append(results, rowMap)
		index++
	}

	if err := rows.Err(); err != nil {
		return SQLResponse{}, err
	}

	return SQLResponse{
		Rows: results,
	}, nil
}

func (s *RequestCRUDService) ExecSQL(req SQLRequest) (SQLResponse, error) {
	if s.db == nil {
		return SQLResponse{}, fmt.Errorf("database not initialized")
	}

	normalized := normalizeSQLRequest(req)
	normalized.ReadOnly = false

	if err := validateExecRequest(normalized); err != nil {
		return SQLResponse{}, err
	}

	db, err := s.dbHandle(normalized.DB)
	if err != nil {
		return SQLResponse{}, err
	}

	ctx := normalized.Context
	if ctx == nil {
		ctx = context.Background()
	}

	result, err := db.ExecContext(ctx, normalized.SQL, normalized.Params...)
	if err != nil {
		return SQLResponse{}, err
	}

	rowsAffected, _ := result.RowsAffected()
	lastInsertID, _ := result.LastInsertId()

	return SQLResponse{
		RowsAffected: rowsAffected,
		LastInsertID: lastInsertID,
	}, nil
}

func (s *RequestCRUDService) dbHandle(target DBTarget) (*sql.DB, error) {
	switch target {
	case "", DBMain:
		return s.db, nil
	default:
		return nil, fmt.Errorf("unknown database target: %s", target)
	}
}

func normalizeSQLRequest(req SQLRequest) SQLRequest {
	if req.DB == "" {
		req.DB = DBMain
	}
	if req.MaxRows <= 0 {
		req.MaxRows = defaultMaxRows
	}
	if req.MaxRows > maxAllowedRows {
		req.MaxRows = maxAllowedRows
	}
	// QuerySQL is read-only
	req.ReadOnly = true
	return req
}

func validateSQLRequest(req SQLRequest) error {
	sqlText := strings.TrimSpace(req.SQL)
	if sqlText == "" {
		return fmt.Errorf("sql is required")
	}
	if !isSingleStatement(sqlText) {
		return fmt.Errorf("only single statements are allowed")
	}

	if req.ReadOnly {
		trimmed := strings.ToUpper(strings.TrimSpace(sqlText))
		if !(strings.HasPrefix(trimmed, "SELECT") || strings.HasPrefix(trimmed, "WITH")) {
			return fmt.Errorf("only SELECT statements are permitted for QuerySQL")
		}
	}

	return nil
}

func validateExecRequest(req SQLRequest) error {
	sqlText := strings.TrimSpace(req.SQL)
	if sqlText == "" {
		return fmt.Errorf("sql is required")
	}
	if !isSingleStatement(sqlText) {
		return fmt.Errorf("only single statements are allowed")
	}

	trimmed := strings.ToUpper(strings.TrimSpace(sqlText))
	if strings.HasPrefix(trimmed, "SELECT") || strings.HasPrefix(trimmed, "WITH") {
		return fmt.Errorf("ExecSQL only supports write statements")
	}
	return nil
}

func isSingleStatement(sqlText string) bool {
	trimmed := strings.TrimSpace(sqlText)
	if trimmed == "" {
		return false
	}

	semicolonCount := strings.Count(trimmed, ";")
	if semicolonCount == 0 {
		return true
	}
	return semicolonCount == 1 && strings.HasSuffix(trimmed, ";")
}

func normalizeSQLValue(val any) any {
	switch v := val.(type) {
	case nil:
		return nil
	case []byte:
		return string(v)
	case time.Time:
		return v.UTC().Format(time.RFC3339Nano)
	case *time.Time:
		if v == nil {
			return nil
		}
		return v.UTC().Format(time.RFC3339Nano)
	default:
		return v
	}
}

func nullStringToPointer(ns sql.NullString) *string {
	if ns.Valid {
		value := ns.String
		return &value
	}
	return nil
}

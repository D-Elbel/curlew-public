package main

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"
)

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

type SQLRunner struct {
	db *sql.DB
}

func NewSQLRunner(db *sql.DB) *SQLRunner {
	return &SQLRunner{db: db}
}

func (r *SQLRunner) QuerySQL(req SQLRequest) (SQLResponse, error) {
	if r.db == nil {
		return SQLResponse{}, fmt.Errorf("database not initialized")
	}

	normalized := normalizeSQLRequest(req)
	if err := validateSQLRequest(normalized); err != nil {
		return SQLResponse{}, err
	}

	db, err := r.dbHandle(normalized.DB)
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

func (r *SQLRunner) ExecSQL(req SQLRequest) (SQLResponse, error) {
	if r.db == nil {
		return SQLResponse{}, fmt.Errorf("database not initialized")
	}

	normalized := normalizeSQLRequest(req)
	normalized.ReadOnly = false

	if err := validateExecRequest(normalized); err != nil {
		return SQLResponse{}, err
	}

	db, err := r.dbHandle(normalized.DB)
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

func (r *SQLRunner) dbHandle(target DBTarget) (*sql.DB, error) {
	switch target {
	case "", DBMain:
		return r.db, nil
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

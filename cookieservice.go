package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

type CookieService struct {
	db  *sql.DB
	app *application.App
}

type Cookie struct {
	ID             int        `json:"id"`
	EnvironmentID  *string    `json:"environmentId,omitempty"`
	Domain         string     `json:"domain"`
	Path           string     `json:"path"`
	Name           string     `json:"name"`
	Value          string     `json:"value"`
	HostOnly       bool       `json:"hostOnly"`
	HTTPOnly       bool       `json:"httpOnly"`
	Secure         bool       `json:"secure"`
	Session        bool       `json:"session"`
	SameSite       *string    `json:"sameSite,omitempty"`
	ExpiresAt      *time.Time `json:"expiresAt,omitempty"`
	Extensions     []string   `json:"extensions,omitempty"`
	CreatedAt      time.Time  `json:"createdAt"`
	UpdatedAt      time.Time  `json:"updatedAt"`
	LastAccessedAt *time.Time `json:"lastAccessedAt,omitempty"`
}

type CookieInput struct {
	EnvironmentID *string  `json:"environmentId"`
	Domain        string   `json:"domain"`
	Path          string   `json:"path"`
	Name          string   `json:"name"`
	Value         string   `json:"value"`
	HostOnly      bool     `json:"hostOnly"`
	HTTPOnly      bool     `json:"httpOnly"`
	Secure        bool     `json:"secure"`
	Session       bool     `json:"session"`
	SameSite      *string  `json:"sameSite"`
	ExpiresAt     *int64   `json:"expiresAt"`
	Extensions    []string `json:"extensions"`
}

type storedCookie struct {
	EnvironmentID *string
	Domain        string
	Path          string
	Name          string
	Value         string
	HostOnly      bool
	HTTPOnly      bool
	Secure        bool
	Session       bool
	SameSite      sql.NullString
	Expires       sql.NullTime
	Extensions    sql.NullString
}

func (s *CookieService) Init() {
	if s.db == nil {
		return
	}
	if _, err := s.PurgeExpiredCookies(); err != nil {
		fmt.Println("Failed to purge expired cookies:", err)
	}
}

func (s *CookieService) ListCookies(environmentID *string) []Cookie {
	if s.db == nil {
		return []Cookie{}
	}

	normEnv := normalizeEnvironmentID(environmentID)
	var (
		rows *sql.Rows
		err  error
	)

	selectClause := `
		SELECT id, environment_id, domain, path, name, value, host_only, http_only, secure, session, same_site, expires_at, extensions, created_at, updated_at, last_accessed_at
		FROM cookies
	`

	if normEnv != nil {
		rows, err = s.db.Query(
			selectClause+`
			WHERE environment_id = ? OR environment_id IS NULL
			ORDER BY CASE WHEN environment_id IS NULL THEN 0 ELSE 1 END,
			         domain, path, name
		`,
			*normEnv,
		)
	} else {
		rows, err = s.db.Query(
			selectClause + `
			WHERE environment_id IS NULL
			ORDER BY domain, path, name
		`,
		)
	}

	if err != nil {
		fmt.Println("Failed to list cookies:", err)
		return []Cookie{}
	}
	defer rows.Close()

	var cookies []Cookie
	for rows.Next() {
		cookie, scanErr := scanCookie(rows)
		if scanErr != nil {
			fmt.Println("Failed to scan cookie:", scanErr)
			continue
		}
		cookies = append(cookies, cookie)
	}

	return cookies
}

func (s *CookieService) UpsertCookie(input CookieInput) (Cookie, error) {
	if s.db == nil {
		return Cookie{}, fmt.Errorf("database connection is unavailable")
	}

	record, err := buildStoredCookieFromInput(input)
	if err != nil {
		return Cookie{}, err
	}

	return s.upsertCookieRecord(record)
}

func (s *CookieService) UpsertCookies(inputs []CookieInput) ([]Cookie, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database connection is unavailable")
	}

	var (
		results []Cookie
	)

	for _, input := range inputs {
		record, err := buildStoredCookieFromInput(input)
		if err != nil {
			return nil, err
		}
		cookie, err := s.upsertCookieRecord(record)
		if err != nil {
			return nil, err
		}
		results = append(results, cookie)
	}

	return results, nil
}

func (s *CookieService) DeleteCookie(id int) error {
	if s.db == nil {
		return fmt.Errorf("database connection is unavailable")
	}
	_, err := s.db.Exec("DELETE FROM cookies WHERE id = ?", id)
	return err
}

func (s *CookieService) ClearCookiesForDomain(domain string, environmentID *string) error {
	if s.db == nil {
		return fmt.Errorf("database connection is unavailable")
	}
	domain = strings.ToLower(strings.TrimSpace(domain))
	if domain == "" {
		return fmt.Errorf("domain is required")
	}

	normEnv := normalizeEnvironmentID(environmentID)
	query := "DELETE FROM cookies WHERE domain = ? AND "
	args := []interface{}{domain}
	if normEnv != nil {
		query += "environment_id = ?"
		args = append(args, *normEnv)
	} else {
		query += "environment_id IS NULL"
	}

	_, err := s.db.Exec(query, args...)
	return err
}

func (s *CookieService) ClearAllCookies(environmentID *string) error {
	if s.db == nil {
		return fmt.Errorf("database connection is unavailable")
	}
	normEnv := normalizeEnvironmentID(environmentID)

	query := "DELETE FROM cookies WHERE "
	var args []interface{}
	if normEnv != nil {
		query += "environment_id = ?"
		args = append(args, *normEnv)
	} else {
		query += "environment_id IS NULL"
	}

	_, err := s.db.Exec(query, args...)
	return err
}

func (s *CookieService) PurgeExpiredCookies() (int64, error) {
	if s.db == nil {
		return 0, fmt.Errorf("database connection is unavailable")
	}
	result, err := s.db.Exec(`DELETE FROM cookies WHERE session = 0 AND expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP`)
	if err != nil {
		return 0, err
	}
	rows, _ := result.RowsAffected()
	return rows, nil
}

func (s *CookieService) AttachCookiesToRequest(req *http.Request, environmentID *string) error {
	if s.db == nil || req == nil || req.URL == nil {
		return nil
	}

	normEnv := normalizeEnvironmentID(environmentID)
	cookies, err := s.cookiesForURL(req.URL, normEnv)
	if err != nil {
		return err
	}
	if len(cookies) == 0 {
		return nil
	}

	var pairs []string
	for _, cookie := range cookies {
		if cookie.Value == "" {
			continue
		}
		pairs = append(pairs, fmt.Sprintf("%s=%s", cookie.Name, cookie.Value))
	}

	if len(pairs) == 0 {
		return nil
	}

	headerValue := strings.Join(pairs, "; ")
	existing := req.Header.Get("Cookie")
	if existing != "" {
		headerValue = existing + "; " + headerValue
	}
	req.Header.Set("Cookie", headerValue)

	if err := s.touchCookies(cookies); err != nil {
		fmt.Println("Failed to update cookie access time:", err)
	}
	return nil
}

func (s *CookieService) CaptureResponseCookies(reqURL *url.URL, resp *http.Response, environmentID *string) error {
	if s.db == nil || resp == nil {
		return nil
	}
	if reqURL == nil {
		reqURL = resp.Request.URL
	}
	if reqURL == nil {
		return nil
	}

	normEnv := normalizeEnvironmentID(environmentID)
	for _, cookie := range resp.Cookies() {
		if err := s.persistHTTPCookie(reqURL, cookie, normEnv); err != nil {
			fmt.Println("Failed to persist cookie:", err)
		}
	}
	return nil
}

func (s *CookieService) cookiesForURL(target *url.URL, environmentID *string) ([]Cookie, error) {
	if target == nil {
		return nil, nil
	}

	envID := normalizeEnvironmentID(environmentID)

	host := strings.ToLower(target.Hostname())
	if host == "" {
		return nil, nil
	}

	path := target.Path
	if path == "" {
		path = "/"
	}

	isSecure := strings.EqualFold(target.Scheme, "https")

	var (
		args         []interface{}
		scopeClause  string
		selectionSQL strings.Builder
	)

	selectionSQL.WriteString(`
		SELECT id, environment_id, domain, path, name, value, host_only, http_only, secure, session, same_site, expires_at, extensions, created_at, updated_at, last_accessed_at
		FROM cookies
		WHERE 
	`)

	if envID != nil {
		scopeClause = "(environment_id = ? OR environment_id IS NULL)"
		args = append(args, *envID)
	} else {
		scopeClause = "environment_id IS NULL"
	}

	selectionSQL.WriteString(scopeClause)
	selectionSQL.WriteString(" AND (? = domain OR ? LIKE ('%.' || domain))")
	args = append(args, host, host)
	selectionSQL.WriteString(" ORDER BY LENGTH(path) DESC, domain, name")

	rows, err := s.db.Query(selectionSQL.String(), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var (
		validCookies  []Cookie
		expiredCookie []int
	)

	now := time.Now().UTC()
	for rows.Next() {
		cookie, scanErr := scanCookie(rows)
		if scanErr != nil {
			fmt.Println("Failed to scan cookie:", scanErr)
			continue
		}

		if cookie.ExpiresAt != nil && cookie.ExpiresAt.Before(now) && !cookie.Session {
			expiredCookie = append(expiredCookie, cookie.ID)
			continue
		}

		if cookie.Secure && !isSecure {
			continue
		}

		if !pathMatch(cookie.Path, path) {
			continue
		}

		if !domainMatch(cookie.Domain, host, cookie.HostOnly) {
			continue
		}

		validCookies = append(validCookies, cookie)
	}

	if len(expiredCookie) > 0 {
		go s.deleteCookiesByIDs(expiredCookie)
	}

	return validCookies, nil
}

func (s *CookieService) persistHTTPCookie(reqURL *url.URL, httpCookie *http.Cookie, environmentID *string) error {
	if httpCookie == nil || reqURL == nil {
		return nil
	}

	if httpCookie.Name == "" {
		return nil
	}

	envID := normalizeEnvironmentID(environmentID)

	host := strings.ToLower(reqURL.Hostname())
	if host == "" {
		return nil
	}

	domain, hostOnly := resolveCookieDomain(httpCookie.Domain, host)
	path := httpCookie.Path
	if path == "" {
		path = defaultCookiePath(reqURL.Path)
	}
	path = normalizeCookiePath(path)

	expiration := sql.NullTime{}
	session := true
	if httpCookie.MaxAge < 0 {
		return s.deleteCookieRecord(envID, domain, path, httpCookie.Name)
	}

	if httpCookie.MaxAge == 0 {
		return s.deleteCookieRecord(envID, domain, path, httpCookie.Name)
	}

	if httpCookie.MaxAge > 0 {
		expiration = sql.NullTime{Time: time.Now().Add(time.Duration(httpCookie.MaxAge) * time.Second).UTC(), Valid: true}
		session = false
	} else if !httpCookie.Expires.IsZero() {
		if httpCookie.Expires.Before(time.Now()) {
			return s.deleteCookieRecord(envID, domain, path, httpCookie.Name)
		}
		expiration = sql.NullTime{Time: httpCookie.Expires.UTC(), Valid: true}
		session = false
	}

	sameSiteValue := sameSiteToString(httpCookie.SameSite)
	var sameSite sql.NullString
	if sameSiteValue != "" {
		sameSite = sql.NullString{String: sameSiteValue, Valid: true}
	}

	var extensions sql.NullString
	if len(httpCookie.Unparsed) > 0 {
		if encoded, err := json.Marshal(httpCookie.Unparsed); err == nil {
			extensions = sql.NullString{String: string(encoded), Valid: true}
		}
	}

	record := storedCookie{
		EnvironmentID: envID,
		Domain:        domain,
		Path:          path,
		Name:          httpCookie.Name,
		Value:         httpCookie.Value,
		HostOnly:      hostOnly,
		HTTPOnly:      httpCookie.HttpOnly,
		Secure:        httpCookie.Secure,
		Session:       session,
		SameSite:      sameSite,
		Expires:       expiration,
		Extensions:    extensions,
	}

	_, err := s.upsertCookieRecord(record)
	return err
}

func (s *CookieService) deleteCookieRecord(environmentID *string, domain string, path string, name string) error {
	if s.db == nil {
		return fmt.Errorf("database connection is unavailable")
	}
	domain = strings.ToLower(strings.TrimSpace(domain))
	path = normalizeCookiePath(path)
	name = strings.TrimSpace(name)

	var (
		query string
		args  []interface{}
	)

	if environmentID != nil {
		query = "DELETE FROM cookies WHERE environment_id = ? AND domain = ? AND path = ? AND name = ?"
		args = []interface{}{*environmentID, domain, path, name}
	} else {
		query = "DELETE FROM cookies WHERE environment_id IS NULL AND domain = ? AND path = ? AND name = ?"
		args = []interface{}{domain, path, name}
	}

	_, err := s.db.Exec(query, args...)
	return err
}

func (s *CookieService) upsertCookieRecord(record storedCookie) (Cookie, error) {
	var (
		envValue interface{}
	)
	if record.EnvironmentID != nil {
		envValue = *record.EnvironmentID
	}

	var sameSite interface{}
	if record.SameSite.Valid {
		sameSite = record.SameSite.String
	}

	var expires interface{}
	if record.Expires.Valid {
		expires = record.Expires.Time.UTC()
	}

	var extensions interface{}
	if record.Extensions.Valid {
		extensions = record.Extensions.String
	}

	row := s.db.QueryRow(`
		INSERT INTO cookies (environment_id, domain, path, name, value, host_only, http_only, secure, session, same_site, expires_at, extensions)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(environment_scope, domain, path, name) DO UPDATE SET
			environment_id = excluded.environment_id,
			value = excluded.value,
			host_only = excluded.host_only,
			http_only = excluded.http_only,
			secure = excluded.secure,
			session = excluded.session,
			same_site = excluded.same_site,
			expires_at = excluded.expires_at,
			extensions = excluded.extensions,
			updated_at = CURRENT_TIMESTAMP
		RETURNING id, environment_id, domain, path, name, value, host_only, http_only, secure, session, same_site, expires_at, extensions, created_at, updated_at, last_accessed_at
	`,
		envValue,
		record.Domain,
		record.Path,
		record.Name,
		record.Value,
		boolToInt(record.HostOnly),
		boolToInt(record.HTTPOnly),
		boolToInt(record.Secure),
		boolToInt(record.Session),
		sameSite,
		expires,
		extensions,
	)

	return scanCookie(row)
}

func (s *CookieService) touchCookies(cookies []Cookie) error {
	if len(cookies) == 0 || s.db == nil {
		return nil
	}

	var (
		placeholders []string
		args         []interface{}
	)
	for _, cookie := range cookies {
		if cookie.ID <= 0 {
			continue
		}
		placeholders = append(placeholders, "?")
		args = append(args, cookie.ID)
	}

	if len(args) == 0 {
		return nil
	}

	query := fmt.Sprintf("UPDATE cookies SET last_accessed_at = CURRENT_TIMESTAMP WHERE id IN (%s)", strings.Join(placeholders, ","))
	_, err := s.db.Exec(query, args...)
	return err
}

func (s *CookieService) deleteCookiesByIDs(ids []int) {
	if len(ids) == 0 || s.db == nil {
		return
	}

	var (
		placeholders []string
		args         []interface{}
	)

	for _, id := range ids {
		placeholders = append(placeholders, "?")
		args = append(args, id)
	}

	query := fmt.Sprintf("DELETE FROM cookies WHERE id IN (%s)", strings.Join(placeholders, ","))
	if _, err := s.db.Exec(query, args...); err != nil {
		fmt.Println("Failed to delete expired cookies:", err)
	}
}

func buildStoredCookieFromInput(input CookieInput) (storedCookie, error) {
	envID := normalizeEnvironmentID(input.EnvironmentID)
	domain := strings.ToLower(strings.TrimSpace(input.Domain))
	if domain == "" {
		return storedCookie{}, fmt.Errorf("domain is required")
	}

	path := normalizeCookiePath(input.Path)

	name := strings.TrimSpace(input.Name)
	if name == "" {
		return storedCookie{}, fmt.Errorf("name is required")
	}

	value := input.Value

	var expires sql.NullTime
	session := input.Session
	if input.ExpiresAt != nil {
		expires = sql.NullTime{Time: time.Unix(*input.ExpiresAt, 0).UTC(), Valid: true}
		session = false
	}
	if session {
		expires = sql.NullTime{}
	}

	var sameSite sql.NullString
	if normalized := normalizeSameSiteInput(input.SameSite); normalized != "" {
		sameSite = sql.NullString{String: normalized, Valid: true}
	}

	var extensions sql.NullString
	if len(input.Extensions) > 0 {
		if encoded, err := json.Marshal(input.Extensions); err == nil {
			extensions = sql.NullString{String: string(encoded), Valid: true}
		}
	}

	return storedCookie{
		EnvironmentID: envID,
		Domain:        domain,
		Path:          path,
		Name:          name,
		Value:         value,
		HostOnly:      input.HostOnly,
		HTTPOnly:      input.HTTPOnly,
		Secure:        input.Secure,
		Session:       session,
		SameSite:      sameSite,
		Expires:       expires,
		Extensions:    extensions,
	}, nil
}

func scanCookie(scanner interface{ Scan(dest ...any) error }) (Cookie, error) {
	var (
		id             int
		environmentID  sql.NullString
		domain         string
		path           string
		name           string
		value          string
		hostOnly       int
		httpOnly       int
		secure         int
		session        int
		sameSite       sql.NullString
		expiresAt      sql.NullTime
		extensions     sql.NullString
		createdAt      time.Time
		updatedAt      time.Time
		lastAccessedAt sql.NullTime
	)

	if err := scanner.Scan(&id, &environmentID, &domain, &path, &name, &value, &hostOnly, &httpOnly, &secure, &session, &sameSite, &expiresAt, &extensions, &createdAt, &updatedAt, &lastAccessedAt); err != nil {
		return Cookie{}, err
	}

	cookie := Cookie{
		ID:            id,
		EnvironmentID: nullStringPtr(environmentID),
		Domain:        domain,
		Path:          path,
		Name:          name,
		Value:         value,
		HostOnly:      hostOnly == 1,
		HTTPOnly:      httpOnly == 1,
		Secure:        secure == 1,
		Session:       session == 1,
		CreatedAt:     createdAt,
		UpdatedAt:     updatedAt,
	}

	if sameSite.Valid {
		value := sameSite.String
		cookie.SameSite = &value
	}

	if expiresAt.Valid {
		t := expiresAt.Time.UTC()
		cookie.ExpiresAt = &t
	}

	if lastAccessedAt.Valid {
		t := lastAccessedAt.Time.UTC()
		cookie.LastAccessedAt = &t
	}

	if extensions.Valid && extensions.String != "" {
		var parsed []string
		if err := json.Unmarshal([]byte(extensions.String), &parsed); err == nil {
			cookie.Extensions = parsed
		}
	}

	return cookie, nil
}

func normalizeEnvironmentID(environmentID *string) *string {
	if environmentID == nil {
		return nil
	}
	value := strings.TrimSpace(*environmentID)
	if value == "" {
		return nil
	}
	return &value
}

func normalizeCookiePath(path string) string {
	if path == "" {
		return "/"
	}
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	return path
}

func defaultCookiePath(requestPath string) string {
	if requestPath == "" || !strings.HasPrefix(requestPath, "/") {
		return "/"
	}
	if requestPath == "/" {
		return "/"
	}
	lastSlash := strings.LastIndex(requestPath, "/")
	if lastSlash <= 0 {
		return "/"
	}
	return requestPath[:lastSlash]
}

func domainMatch(cookieDomain, host string, hostOnly bool) bool {
	cookieDomain = strings.ToLower(cookieDomain)
	host = strings.ToLower(host)
	if hostOnly {
		return host == cookieDomain
	}
	if host == cookieDomain {
		return true
	}
	return strings.HasSuffix(host, "."+cookieDomain)
}

func resolveCookieDomain(rawDomain string, host string) (string, bool) {
	host = strings.ToLower(host)
	rawDomain = strings.ToLower(strings.TrimSpace(rawDomain))

	if rawDomain == "" {
		return host, true
	}

	domain := strings.TrimPrefix(rawDomain, ".")

	if host != domain && !strings.HasSuffix(host, "."+domain) {
		return host, true
	}

	return domain, false
}

func pathMatch(cookiePath string, requestPath string) bool {
	if cookiePath == "/" {
		return true
	}
	if strings.HasPrefix(requestPath, cookiePath) {
		if len(requestPath) == len(cookiePath) {
			return true
		}
		return requestPath[len(cookiePath)] == '/'
	}
	return false
}

func sameSiteToString(mode http.SameSite) string {
	switch mode {
	case http.SameSiteDefaultMode:
		return "default"
	case http.SameSiteLaxMode:
		return "lax"
	case http.SameSiteStrictMode:
		return "strict"
	case http.SameSiteNoneMode:
		return "none"
	default:
		return ""
	}
}

func normalizeSameSiteInput(mode *string) string {
	if mode == nil {
		return ""
	}
	value := strings.ToLower(strings.TrimSpace(*mode))
	switch value {
	case "default", "lax", "strict", "none":
		return value
	default:
		return ""
	}
}

func boolToInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func nullStringPtr(value sql.NullString) *string {
	if value.Valid {
		result := value.String
		return &result
	}
	return nil
}

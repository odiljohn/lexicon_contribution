package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"image"
	"image/png"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func testApplication(t *testing.T) (*application, http.Handler) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "lexicon.json")
	legacy, err := loadWorkspace(path, true)
	if err != nil {
		t.Fatal(err)
	}
	// Materialize an existing library to exercise migration without overwriting it.
	if err = legacy.save(legacy.data); err != nil {
		t.Fatal(err)
	}
	app, err := newApplication(legacy, path+".accounts.json")
	if err != nil {
		t.Fatal(err)
	}
	return app, app.routes()
}
func send(t *testing.T, h http.Handler, method, path string, body any, cookie *http.Cookie) *httptest.ResponseRecorder {
	t.Helper()
	var buffer bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buffer).Encode(body); err != nil {
			t.Fatal(err)
		}
	}
	r := httptest.NewRequest(method, path, &buffer)
	r.Header.Set("Content-Type", "application/json")
	if cookie != nil {
		r.AddCookie(cookie)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}
func registerAccount(t *testing.T, h http.Handler, name string) (*http.Cookie, profile) {
	t.Helper()
	w := send(t, h, "POST", "/api/register", map[string]string{"username": name, "full_name": strings.ToUpper(name), "email": name + "@example.com", "password": "correct horse notebook"}, nil)
	if w.Code != 201 {
		t.Fatalf("register: %d %s", w.Code, w.Body.String())
	}
	var result struct{ User profile }
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	cookies := w.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatal("missing session cookie")
	}
	return cookies[0], result.User
}
func readWorkspace(t *testing.T, h http.Handler, cookie *http.Cookie) data {
	t.Helper()
	w := send(t, h, "GET", "/api/workspace", nil, cookie)
	if w.Code != 200 {
		t.Fatalf("workspace: %d %s", w.Code, w.Body.String())
	}
	var result data
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	return result
}
func TestAccountsClaimLegacyAndIsolateLibraries(t *testing.T) {
	app, h := testApplication(t)
	before, err := os.ReadFile(app.legacy.path)
	if err != nil {
		t.Fatal(err)
	}
	if w := send(t, h, "GET", "/api/workspace", nil, nil); w.Code != 401 {
		t.Fatal("anonymous library exposed")
	}
	alice, p := registerAccount(t, h, "alice")
	if !alice.HttpOnly || alice.SameSite != http.SameSiteLaxMode || alice.Path != "/" {
		t.Fatal("unsafe session cookie")
	}
	if p.Username != "alice" || p.FullName != "ALICE" || p.Bio != "" {
		t.Fatalf("wrong profile: %+v", p)
	}
	if len(readWorkspace(t, h, alice).Notes) != 6 {
		t.Fatal("legacy library not claimed")
	}
	after, _ := os.ReadFile(app.legacy.path)
	if !bytes.Equal(before, after) {
		t.Fatal("legacy file overwritten by account creation")
	}
	bob, _ := registerAccount(t, h, "bob")
	if len(readWorkspace(t, h, bob).Notes) != 0 {
		t.Fatal("second account inherited private notes")
	}
	if w := send(t, h, "DELETE", "/api/notes/9", nil, bob); w.Code != 404 {
		t.Fatal("cross-account delete allowed")
	}
	w := send(t, h, "POST", "/api/folders", map[string]string{"name": "Bob's folder"}, bob)
	if w.Code != 201 {
		t.Fatal(w.Body.String())
	}
	w = send(t, h, "POST", "/api/notes", map[string]any{"title": "Private word", "folderId": 1, "description": "Bob only"}, bob)
	if w.Code != 201 {
		t.Fatal(w.Body.String())
	}
	if len(readWorkspace(t, h, alice).Notes) != 6 || len(readWorkspace(t, h, bob).Notes) != 1 {
		t.Fatal("libraries mixed")
	}
	raw, err := os.ReadFile(app.path)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(raw, []byte("correct horse notebook")) || bytes.Contains(raw, []byte(alice.Value)) {
		t.Fatal("plaintext password or session persisted")
	}
	info, _ := os.Stat(app.path)
	if info.Mode().Perm() != 0600 {
		t.Fatal("account file is not private")
	}
	restarted, err := newApplication(app.legacy, app.path)
	if err != nil {
		t.Fatal(err)
	}
	if len(readWorkspace(t, restarted.routes(), bob).Notes) != 1 {
		t.Fatal("account/session/workspace did not persist")
	}
	if w := send(t, h, "POST", "/api/logout", nil, alice); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if w := send(t, h, "GET", "/api/workspace", nil, alice); w.Code != 401 {
		t.Fatal("logged-out session remains usable")
	}
}
func TestLoginValidationAndCSRF(t *testing.T) {
	_, h := testApplication(t)
	cookie, _ := registerAccount(t, h, "alice")
	for _, identifier := range []string{"ALICE", "ALICE@example.com"} {
		w := send(t, h, "POST", "/api/login", map[string]string{"identifier": identifier, "password": "correct horse notebook"}, nil)
		if w.Code != 200 {
			t.Fatal(w.Body.String())
		}
		if strings.Contains(w.Body.String(), "password_hash") {
			t.Fatal("password hash exposed")
		}
	}
	for _, identifier := range []string{"alice", "missing"} {
		w := send(t, h, "POST", "/api/login", map[string]string{"identifier": identifier, "password": "wrong"}, nil)
		if w.Code != 401 || !strings.Contains(w.Body.String(), "Incorrect email/username or password") {
			t.Fatal("login leaks account existence")
		}
	}
	w := send(t, h, "POST", "/api/register", map[string]string{"username": "ALICE", "full_name": "Someone", "email": "other@example.com", "password": "another strong password"}, nil)
	if w.Code != 409 {
		t.Fatal("case-insensitive username uniqueness failed")
	}
	w = send(t, h, "POST", "/api/register", map[string]string{"username": "short", "full_name": "Short", "email": "short@example.com", "password": "tiny"}, nil)
	if w.Code != 400 {
		t.Fatal("short password accepted")
	}
	r := httptest.NewRequest("POST", "/api/folders", strings.NewReader(`{"name":"bad"}`))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Origin", "https://attacker.example")
	r.AddCookie(cookie)
	result := httptest.NewRecorder()
	h.ServeHTTP(result, r)
	if result.Code != 403 {
		t.Fatal("cross-origin mutation allowed")
	}
	r = httptest.NewRequest("POST", "/api/logout", nil)
	r.AddCookie(cookie)
	result = httptest.NewRecorder()
	h.ServeHTTP(result, r)
	if result.Code != 415 {
		t.Fatal("form-encoded CSRF accepted")
	}
	w = send(t, h, "GET", "/api/session", nil, nil)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"user":null`) {
		t.Fatal("anonymous session response incorrect")
	}
}
func TestProfileAvatarAndEmailConfirmation(t *testing.T) {
	app, h := testApplication(t)
	cookie, p := registerAccount(t, h, "alice")
	fields := map[string]string{"username": "new_alice", "full_name": "Alice Example", "email": p.Email, "bio": "Learning a word each day.", "avatar": ""}
	w := send(t, h, "PATCH", "/api/profile", fields, cookie)
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	fields["email"] = "updated@example.com"
	w = send(t, h, "PATCH", "/api/profile", fields, cookie)
	if w.Code != 400 {
		t.Fatal("email changed without password")
	}
	fields["current_password"] = "correct horse notebook"
	var picture bytes.Buffer
	if err := png.Encode(&picture, image.NewRGBA(image.Rect(0, 0, 8, 8))); err != nil {
		t.Fatal(err)
	}
	fields["avatar"] = "data:image/png;base64," + base64.StdEncoding.EncodeToString(picture.Bytes())
	w = send(t, h, "PATCH", "/api/profile", fields, cookie)
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	var result struct{ User profile }
	json.Unmarshal(w.Body.Bytes(), &result)
	if result.User.Bio != fields["bio"] || result.User.Email != fields["email"] || !strings.HasPrefix(result.User.Avatar, "data:image/jpeg;base64,") {
		t.Fatal("profile/avatar not saved")
	}
	if app.data.Users[0].Profile.Username != "new_alice" {
		t.Fatal("profile did not persist")
	}
	fields["avatar"] = "data:image/svg+xml;base64,PHN2Zz4="
	w = send(t, h, "PATCH", "/api/profile", fields, cookie)
	if w.Code != 400 {
		t.Fatal("SVG avatar accepted")
	}
	fields["avatar"] = ""
	fields["bio"] = strings.Repeat("a", 161)
	w = send(t, h, "PATCH", "/api/profile", fields, cookie)
	if w.Code != 400 {
		t.Fatal("oversized bio accepted")
	}
	fields["bio"] = ""
	w = send(t, h, "PATCH", "/api/profile", fields, cookie)
	if w.Code != 200 {
		t.Fatal("avatar/bio removal failed")
	}
}
func TestSessionExpiryAndRateLimit(t *testing.T) {
	app, h := testApplication(t)
	cookie, _ := registerAccount(t, h, "alice")
	// Expired cookies cannot authenticate even if the client sends them.
	app.data.Sessions[0].Expires = app.data.Sessions[0].Expires.AddDate(0, -2, 0)
	if w := send(t, h, "GET", "/api/workspace", nil, cookie); w.Code != 401 {
		t.Fatal("expired session accepted")
	}
	r := httptest.NewRequest("POST", "/api/login", nil)
	r.RemoteAddr = "198.51.100.17:1234"
	for i := 0; i < 30; i++ {
		if !app.allowAttempt(r) {
			t.Fatal("rate limit triggered too early")
		}
	}
	if app.allowAttempt(r) {
		t.Fatal("rate limit not enforced")
	}
}

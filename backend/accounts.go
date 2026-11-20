package main

import (
	"bytes"
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/jpeg"
	_ "image/png"
	"io"
	"mime"
	"net"
	"net/http"
	"net/mail"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

type profile struct {
	ID       string `json:"id"`
	Username string `json:"username"`
	FullName string `json:"full_name"`
	Email    string `json:"email"`
	Bio      string `json:"bio"`
	Avatar   string `json:"avatar"`
}
type account struct {
	Profile      profile `json:"profile"`
	PasswordHash string  `json:"password_hash"`
	OwnsLegacy   bool    `json:"owns_legacy,omitempty"`
}
type session struct {
	Hash    string    `json:"hash"`
	UserID  string    `json:"user_id"`
	Expires time.Time `json:"expires"`
}
type accountsData struct {
	Users    []account `json:"users"`
	Sessions []session `json:"sessions"`
}
type attemptWindow struct {
	Count int
	Until time.Time
}
type application struct {
	mu         sync.Mutex
	path       string
	data       accountsData
	legacy     *store
	workspaces map[string]*store
	attempts   map[string]attemptWindow
}

func loadWorkspace(path string, demo bool) (*store, error) {
	s := &store{path: path, data: data{Folders: []Folder{}, Notes: []Note{}, NextID: 1}}
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		if demo {
			s.data = exampleData()
		}
		return s, nil
	}
	if err != nil {
		return nil, err
	}
	if err = json.Unmarshal(raw, &s.data); err != nil {
		return nil, err
	}
	if s.data.Folders == nil {
		s.data.Folders = []Folder{}
	}
	if s.data.Notes == nil {
		s.data.Notes = []Note{}
	}
	return s, nil
}
func newApplication(legacy *store, path string) (*application, error) {
	a := &application{path: path, legacy: legacy, workspaces: map[string]*store{}, attempts: map[string]attemptWindow{}}
	raw, err := os.ReadFile(path)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	if err == nil {
		if err = json.Unmarshal(raw, &a.data); err != nil {
			return nil, err
		}
	}
	for _, user := range a.data.Users {
		if user.OwnsLegacy {
			a.workspaces[user.Profile.ID] = legacy
			continue
		}
		workspace, err := loadWorkspace(a.workspacePath(user.Profile.ID), false)
		if err != nil {
			return nil, err
		}
		a.workspaces[user.Profile.ID] = workspace
	}
	return a, nil
}
func (a *application) workspacePath(id string) string {
	return filepath.Join(a.legacy.path+".workspaces", id+".json")
}
func (a *application) save(next accountsData) error {
	if err := os.MkdirAll(filepath.Dir(a.path), 0700); err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(a.path), ".lexicon-accounts-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	writeErr := json.NewEncoder(file).Encode(next)
	closeErr := file.Close()
	if err = errors.Join(writeErr, closeErr); err != nil {
		return err
	}
	if err = os.Rename(file.Name(), a.path); err != nil {
		return err
	}
	a.data = next
	return nil
}
func randomHex(size int) (string, error) {
	value := make([]byte, size)
	_, err := rand.Read(value)
	return hex.EncodeToString(value), err
}
func passwordHash(password string) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	key, err := pbkdf2.Key(sha256.New, password, salt, 600000, 32)
	return fmt.Sprintf("pbkdf2-sha256$600000$%s$%s", hex.EncodeToString(salt), hex.EncodeToString(key)), err
}
func passwordMatches(password, encoded string) bool {
	parts := strings.Split(encoded, "$")
	salt := make([]byte, 16)
	expected := make([]byte, 32)
	rounds := 600000
	valid := len(parts) == 4 && parts[0] == "pbkdf2-sha256"
	if valid {
		var err error
		salt, err = hex.DecodeString(parts[2])
		if err != nil || len(salt) != 16 {
			valid = false
		}
		expected, err = hex.DecodeString(parts[3])
		if err != nil || len(expected) != 32 {
			valid = false
		}
		rounds, err = strconv.Atoi(parts[1])
		if err != nil || rounds < 600000 || rounds > 2000000 {
			valid = false
			rounds = 600000
		}
	}
	if !valid {
		salt = make([]byte, 16)
		expected = make([]byte, 32)
	}
	key, err := pbkdf2.Key(sha256.New, password, salt, rounds, 32)
	return err == nil && subtle.ConstantTimeCompare(key, expected) == 1 && valid
}
func tokenHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
func (a *application) userLocked(r *http.Request) (account, bool) {
	cookie, err := r.Cookie("lexicon_session")
	if err != nil || len(cookie.Value) != 64 {
		return account{}, false
	}
	hash := tokenHash(cookie.Value)
	for _, session := range a.data.Sessions {
		if session.Hash != hash || !session.Expires.After(time.Now()) {
			continue
		}
		for _, user := range a.data.Users {
			if user.Profile.ID == session.UserID {
				return user, true
			}
		}
	}
	return account{}, false
}
func setSessionCookie(w http.ResponseWriter, r *http.Request, token string, expires time.Time) {
	http.SetCookie(w, &http.Cookie{Name: "lexicon_session", Value: token, Path: "/", HttpOnly: true, Secure: r.TLS != nil || os.Getenv("LEXICON_COOKIE_SECURE") == "true", SameSite: http.SameSiteLaxMode, MaxAge: int(time.Until(expires).Seconds()), Expires: expires})
}
func addSession(next accountsData, userID string) (accountsData, string, error) {
	token, err := randomHex(32)
	if err != nil {
		return next, "", err
	}
	sessions := []session{}
	count := 0
	for i := len(next.Sessions) - 1; i >= 0; i-- {
		item := next.Sessions[i]
		if !item.Expires.After(time.Now()) {
			continue
		}
		if item.UserID == userID {
			count++
			if count >= 10 {
				continue
			}
		}
		sessions = append(sessions, item)
	}
	next.Sessions = append(sessions, session{Hash: tokenHash(token), UserID: userID, Expires: time.Now().Add(30 * 24 * time.Hour)})
	return next, token, nil
}
func decodeAccount(w http.ResponseWriter, r *http.Request, value any) bool {
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 512<<10))
	decoder.DisallowUnknownFields()
	if decoder.Decode(value) != nil || decoder.Decode(new(any)) != io.EOF {
		fail(w, 400, "Send a valid account request.")
		return false
	}
	return true
}

var usernamePattern = regexp.MustCompile(`^[a-z0-9_]{3,32}$`)

func normalizeProfile(p profile) (profile, error) {
	p.Username = strings.ToLower(strings.TrimSpace(p.Username))
	p.FullName = strings.TrimSpace(p.FullName)
	p.Email = strings.ToLower(strings.TrimSpace(p.Email))
	p.Bio = strings.TrimSpace(p.Bio)
	if !usernamePattern.MatchString(p.Username) {
		return p, errors.New("Use 3–32 letters, numbers, or underscores for your username.")
	}
	if p.FullName == "" || utf8.RuneCountInString(p.FullName) > 80 {
		return p, errors.New("Enter your full name, up to 80 characters.")
	}
	address, err := mail.ParseAddress(p.Email)
	_, domain, _ := strings.Cut(p.Email, "@")
	if err != nil || address.Address != p.Email || len(p.Email) > 254 || !strings.Contains(domain, ".") {
		return p, errors.New("Enter a valid email address.")
	}
	if utf8.RuneCountInString(p.Bio) > 160 {
		return p, errors.New("Keep your bio to 160 characters or fewer.")
	}
	return p, nil
}
func normalizeAvatar(value string) (string, error) {
	if value == "" {
		return "", nil
	}
	prefix, encoded, found := strings.Cut(value, ",")
	if !found || (prefix != "data:image/jpeg;base64" && prefix != "data:image/png;base64") || len(encoded) > 350000 {
		return "", errors.New("Choose a JPEG or PNG avatar, up to 256 KB.")
	}
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(raw) > 256<<10 {
		return "", errors.New("Choose a valid JPEG or PNG avatar.")
	}
	config, _, err := image.DecodeConfig(bytes.NewReader(raw))
	if err != nil || config.Width < 1 || config.Height < 1 || config.Width > 1024 || config.Height > 1024 {
		return "", errors.New("Avatar dimensions must be at most 1024 × 1024.")
	}
	picture, _, err := image.Decode(bytes.NewReader(raw))
	if err != nil {
		return "", errors.New("Could not read that avatar.")
	}
	var output bytes.Buffer
	if err = jpeg.Encode(&output, picture, &jpeg.Options{Quality: 85}); err != nil {
		return "", err
	}
	if output.Len() > 256<<10 {
		return "", errors.New("Choose a smaller avatar image.")
	}
	return "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(output.Bytes()), nil
}
func (a *application) allowAttempt(r *http.Request) bool {
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		ip = r.RemoteAddr
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	now := time.Now()
	for key, item := range a.attempts {
		if !item.Until.After(now) {
			delete(a.attempts, key)
		}
	}
	item := a.attempts[ip]
	if item.Until.IsZero() {
		if len(a.attempts) >= 10000 {
			return false
		}
		item.Until = now.Add(15 * time.Minute)
	}
	item.Count++
	a.attempts[ip] = item
	return item.Count <= 30
}
func (a *application) register(w http.ResponseWriter, r *http.Request) {
	if !a.allowAttempt(r) {
		fail(w, 429, "Too many attempts. Try again in 15 minutes.")
		return
	}
	var input struct {
		Username string `json:"username"`
		FullName string `json:"full_name"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decodeAccount(w, r, &input) {
		return
	}
	p, err := normalizeProfile(profile{Username: input.Username, FullName: input.FullName, Email: input.Email})
	if err != nil {
		fail(w, 400, err.Error())
		return
	}
	if utf8.RuneCountInString(input.Password) < 12 || utf8.RuneCountInString(input.Password) > 128 {
		fail(w, 400, "Use a password with 12–128 characters.")
		return
	}
	hash, err := passwordHash(input.Password)
	if err != nil {
		fail(w, 500, "Could not create your account.")
		return
	}
	id, err := randomHex(16)
	if err != nil {
		fail(w, 500, "Could not create your account.")
		return
	}
	p.ID = id
	a.mu.Lock()
	defer a.mu.Unlock()
	for _, user := range a.data.Users {
		if user.Profile.Username == p.Username || user.Profile.Email == p.Email {
			fail(w, 409, "That username or email is already in use.")
			return
		}
	}
	first := len(a.data.Users) == 0
	next := a.data
	next.Users = append(append([]account{}, next.Users...), account{Profile: p, PasswordHash: hash, OwnsLegacy: first})
	next, token, err := addSession(next, p.ID)
	if err != nil {
		fail(w, 500, "Could not create a session.")
		return
	}
	if first {
		a.legacy.mu.Lock()
		_, statErr := os.Stat(a.legacy.path)
		if errors.Is(statErr, os.ErrNotExist) {
			err = a.legacy.save(a.legacy.data)
		} else if statErr != nil {
			err = statErr
		}
		a.legacy.mu.Unlock()
		if err != nil {
			fail(w, 500, "Your existing words could not be saved. Try again.")
			return
		}
	}
	if err = a.save(next); err != nil {
		fail(w, 500, "Your account could not be saved. Try again.")
		return
	}
	imported := 0
	if first {
		a.workspaces[p.ID] = a.legacy
		a.legacy.mu.Lock()
		imported = len(a.legacy.data.Notes)
		a.legacy.mu.Unlock()
	} else {
		a.workspaces[p.ID] = &store{path: a.workspacePath(p.ID), data: data{Folders: []Folder{}, Notes: []Note{}, NextID: 1}}
	}
	setSessionCookie(w, r, token, time.Now().Add(30*24*time.Hour))
	reply(w, 201, map[string]any{"user": p, "imported_words": imported})
}
func (a *application) login(w http.ResponseWriter, r *http.Request) {
	if !a.allowAttempt(r) {
		fail(w, 429, "Too many attempts. Try again in 15 minutes.")
		return
	}
	var input struct {
		Identifier string `json:"identifier"`
		Password   string `json:"password"`
	}
	if !decodeAccount(w, r, &input) {
		return
	}
	identifier := strings.ToLower(strings.TrimSpace(input.Identifier))
	a.mu.Lock()
	var found account
	for _, user := range a.data.Users {
		if user.Profile.Username == identifier || user.Profile.Email == identifier {
			found = user
			break
		}
	}
	a.mu.Unlock()
	if len(input.Password) > 1024 || !passwordMatches(input.Password, found.PasswordHash) {
		fail(w, 401, "Incorrect email/username or password.")
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	next, token, err := addSession(a.data, found.Profile.ID)
	if err != nil {
		fail(w, 500, "Could not create a session.")
		return
	}
	if err = a.save(next); err != nil {
		fail(w, 500, "Could not sign in. Try again.")
		return
	}
	setSessionCookie(w, r, token, time.Now().Add(30*24*time.Hour))
	reply(w, 200, map[string]any{"user": found.Profile})
}
func (a *application) sessionInfo(w http.ResponseWriter, r *http.Request) {
	a.mu.Lock()
	defer a.mu.Unlock()
	user, ok := a.userLocked(r)
	if !ok {
		reply(w, 200, map[string]any{"user": nil})
		return
	}
	reply(w, 200, map[string]any{"user": user.Profile})
}
func (a *application) protect(handler func(http.ResponseWriter, *http.Request, account, *store)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		a.mu.Lock()
		user, ok := a.userLocked(r)
		workspace := a.workspaces[user.Profile.ID]
		a.mu.Unlock()
		if !ok || workspace == nil {
			fail(w, 401, "Please sign in to continue.")
			return
		}
		handler(w, r, user, workspace)
	}
}
func (a *application) logout(w http.ResponseWriter, r *http.Request, _ account, _ *store) {
	cookie, _ := r.Cookie("lexicon_session")
	hash := tokenHash(cookie.Value)
	a.mu.Lock()
	defer a.mu.Unlock()
	next := a.data
	next.Sessions = []session{}
	for _, item := range a.data.Sessions {
		if item.Hash != hash && item.Expires.After(time.Now()) {
			next.Sessions = append(next.Sessions, item)
		}
	}
	if err := a.save(next); err != nil {
		fail(w, 500, "Could not sign out. Try again.")
		return
	}
	http.SetCookie(w, &http.Cookie{Name: "lexicon_session", Value: "", Path: "/", HttpOnly: true, Secure: r.TLS != nil || os.Getenv("LEXICON_COOKIE_SECURE") == "true", SameSite: http.SameSiteLaxMode, MaxAge: -1, Expires: time.Unix(1, 0)})
	reply(w, 200, map[string]any{"user": nil})
}
func (a *application) updateProfile(w http.ResponseWriter, r *http.Request, user account, _ *store) {
	var input struct {
		Username        string `json:"username"`
		FullName        string `json:"full_name"`
		Email           string `json:"email"`
		Bio             string `json:"bio"`
		Avatar          string `json:"avatar"`
		CurrentPassword string `json:"current_password"`
	}
	if !decodeAccount(w, r, &input) {
		return
	}
	p, err := normalizeProfile(profile{ID: user.Profile.ID, Username: input.Username, FullName: input.FullName, Email: input.Email, Bio: input.Bio})
	if err != nil {
		fail(w, 400, err.Error())
		return
	}
	if p.Email != user.Profile.Email && (len(input.CurrentPassword) > 1024 || !passwordMatches(input.CurrentPassword, user.PasswordHash)) {
		fail(w, 400, "Enter your current password to change your email.")
		return
	}
	p.Avatar, err = normalizeAvatar(input.Avatar)
	if err != nil {
		fail(w, 400, err.Error())
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	next := a.data
	next.Users = append([]account{}, next.Users...)
	for index, item := range next.Users {
		if item.Profile.ID != p.ID && (item.Profile.Username == p.Username || item.Profile.Email == p.Email) {
			fail(w, 409, "That username or email is already in use.")
			return
		}
		if item.Profile.ID == p.ID {
			next.Users[index].Profile = p
		}
	}
	if err = a.save(next); err != nil {
		fail(w, 500, "Your profile could not be saved. Try again.")
		return
	}
	reply(w, 200, map[string]any{"user": p})
}
func (a *application) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/session", a.sessionInfo)
	mux.HandleFunc("POST /api/register", a.register)
	mux.HandleFunc("POST /api/login", a.login)
	mux.HandleFunc("POST /api/logout", a.protect(a.logout))
	mux.HandleFunc("GET /api/profile", a.protect(func(w http.ResponseWriter, r *http.Request, u account, _ *store) {
		reply(w, 200, map[string]any{"user": u.Profile})
	}))
	mux.HandleFunc("PATCH /api/profile", a.protect(a.updateProfile))
	mux.HandleFunc("GET /api/workspace", a.protect(func(w http.ResponseWriter, r *http.Request, _ account, s *store) {
		s.mu.Lock()
		defer s.mu.Unlock()
		reply(w, 200, s.data)
	}))
	mux.HandleFunc("POST /api/folders", a.protect(func(w http.ResponseWriter, r *http.Request, _ account, s *store) { s.folders(w, r) }))
	for _, pattern := range []string{"POST /api/notes", "PATCH /api/notes/{id}", "DELETE /api/notes/{id}"} {
		mux.HandleFunc(pattern, a.protect(func(w http.ResponseWriter, r *http.Request, _ account, s *store) { s.notes(w, r) }))
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		if r.Method != "GET" && r.Method != "HEAD" && r.Method != "OPTIONS" {
			origin := r.Header.Get("Origin")
			if r.Header.Get("Sec-Fetch-Site") == "cross-site" {
				fail(w, 403, "Request origin not allowed.")
				return
			}
			if origin != "" {
				source, err := url.Parse(origin)
				if err != nil || (source.Scheme != "http" && source.Scheme != "https") || source.Host != r.Host {
					fail(w, 403, "Request origin not allowed.")
					return
				}
			}
			mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
			if err != nil || mediaType != "application/json" {
				fail(w, 415, "Send JSON requests.")
				return
			}
		}
		mux.ServeHTTP(w, r)
	})
}

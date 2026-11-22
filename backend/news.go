package main

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

// Announcements are a single global feed. Only the account that owns the legacy
// library (OwnsLegacy) may create, edit, or delete posts; every signed-in user
// can read them. Posts are stored next to the accounts file in <base>.news.json.
type announcement struct {
	ID        int       `json:"id"`
	Title     string    `json:"title"`
	Body      string    `json:"body"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type newsData struct {
	Announcements []announcement `json:"announcements"`
	NextID        int            `json:"nextId"`
}

type newsStore struct {
	mu   sync.Mutex
	path string
	data newsData
}

func loadNews(path string) (*newsStore, error) {
	n := &newsStore{path: path, data: newsData{Announcements: []announcement{}, NextID: 1}}
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return n, nil
	}
	if err != nil {
		return nil, err
	}
	if err = json.Unmarshal(raw, &n.data); err != nil {
		return nil, err
	}
	if n.data.Announcements == nil {
		n.data.Announcements = []announcement{}
	}
	if n.data.NextID < 1 {
		n.data.NextID = 1
	}
	return n, nil
}

func (n *newsStore) save(next newsData) error {
	dir := filepath.Dir(n.path)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	file, err := os.CreateTemp(dir, ".lexicon-news-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	writeErr := json.NewEncoder(file).Encode(next)
	closeErr := file.Close()
	if err := errors.Join(writeErr, closeErr); err != nil {
		return err
	}
	if err := os.Rename(file.Name(), n.path); err != nil {
		return err
	}
	n.data = next
	return nil
}

func validPost(w http.ResponseWriter, title, body string) (string, string, bool) {
	title = strings.TrimSpace(title)
	body = strings.TrimSpace(body)
	if title == "" || utf8.RuneCountInString(title) > 120 {
		fail(w, 400, "Enter a title up to 120 characters.")
		return "", "", false
	}
	if utf8.RuneCountInString(body) > 8000 {
		fail(w, 400, "Keep the post to 8,000 characters or fewer.")
		return "", "", false
	}
	return title, body, true
}

// owner wraps a protected handler so only the legacy-library owner may run it.
func (a *application) owner(handler func(http.ResponseWriter, *http.Request, account, *store)) func(http.ResponseWriter, *http.Request, account, *store) {
	return func(w http.ResponseWriter, r *http.Request, user account, s *store) {
		if !user.OwnsLegacy {
			fail(w, 403, "Only the library owner can manage news.")
			return
		}
		handler(w, r, user, s)
	}
}

// replyNews returns the feed plus whether the caller may post. Call with the
// news lock held.
func (a *application) replyNews(w http.ResponseWriter, user account, status int) {
	reply(w, status, map[string]any{"announcements": a.news.data.Announcements, "canPost": user.OwnsLegacy})
}

func (a *application) newsList(w http.ResponseWriter, _ *http.Request, user account, _ *store) {
	a.news.mu.Lock()
	defer a.news.mu.Unlock()
	a.replyNews(w, user, 200)
}

func (a *application) newsCreate(w http.ResponseWriter, r *http.Request, user account, _ *store) {
	var input struct {
		Title string `json:"title"`
		Body  string `json:"body"`
	}
	if !decode(w, r, &input) {
		return
	}
	title, body, ok := validPost(w, input.Title, input.Body)
	if !ok {
		return
	}
	a.news.mu.Lock()
	defer a.news.mu.Unlock()
	next := a.news.data
	now := time.Now().UTC()
	next.Announcements = append([]announcement{{next.NextID, title, body, now, now}}, next.Announcements...)
	next.NextID++
	if err := a.news.save(next); err != nil {
		log.Print(err)
		fail(w, 500, "The post could not be saved.")
		return
	}
	a.replyNews(w, user, 201)
}

func (a *application) newsModify(w http.ResponseWriter, r *http.Request, user account, _ *store) {
	id, _ := strconv.Atoi(r.PathValue("id"))
	a.news.mu.Lock()
	defer a.news.mu.Unlock()
	next := a.news.data
	next.Announcements = append([]announcement{}, next.Announcements...)
	index := -1
	for i, item := range next.Announcements {
		if item.ID == id {
			index = i
			break
		}
	}
	if index == -1 {
		fail(w, 404, "Post not found.")
		return
	}
	if r.Method == http.MethodDelete {
		next.Announcements = append(next.Announcements[:index], next.Announcements[index+1:]...)
		if err := a.news.save(next); err != nil {
			log.Print(err)
			fail(w, 500, "The post could not be removed.")
			return
		}
		a.replyNews(w, user, 200)
		return
	}
	var input struct {
		Title string `json:"title"`
		Body  string `json:"body"`
	}
	if !decode(w, r, &input) {
		return
	}
	title, body, ok := validPost(w, input.Title, input.Body)
	if !ok {
		return
	}
	post := &next.Announcements[index]
	post.Title, post.Body, post.UpdatedAt = title, body, time.Now().UTC()
	if err := a.news.save(next); err != nil {
		log.Print(err)
		fail(w, 500, "The post could not be saved.")
		return
	}
	a.replyNews(w, user, 200)
}

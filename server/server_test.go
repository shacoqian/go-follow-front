package server

import (
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"testing/fstest"
)

func newTestHandler(t *testing.T, backend http.Handler) (http.Handler, *httptest.Server) {
	t.Helper()
	be := httptest.NewServer(backend)
	t.Cleanup(be.Close)
	u, _ := url.Parse(be.URL)
	assets := fstest.MapFS{
		"index.html":           {Data: []byte("<html>index</html>")},
		"assets/app-abc123.js": {Data: []byte("console.log(1)")},
		"favicon.ico":          {Data: []byte("ico")},
	}
	return New(Config{Backend: u, Assets: assets}), be
}

func get(t *testing.T, h http.Handler, path string, hdr map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	req.RemoteAddr = "203.0.113.9:1234"
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w
}

func TestProxyStripsPrefixAndForwardsHeaders(t *testing.T) {
	var gotPath, gotAuth, gotXFF, gotProto string
	h, _ := newTestHandler(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath, gotAuth = r.URL.RequestURI(), r.Header.Get("Authorization")
		gotXFF, gotProto = r.Header.Get("X-Forwarded-For"), r.Header.Get("X-Forwarded-Proto")
		w.WriteHeader(418)
		_, _ = io.WriteString(w, `{"error":"teapot"}`)
	}))
	w := get(t, h, "/api/wallets/3/withdrawals?limit=5", map[string]string{"Authorization": "Bearer tok"})
	if gotPath != "/wallets/3/withdrawals?limit=5" {
		t.Fatalf("path=%q", gotPath)
	}
	if gotAuth != "Bearer tok" || gotXFF != "203.0.113.9" || gotProto != "http" {
		t.Fatalf("headers auth=%q xff=%q proto=%q", gotAuth, gotXFF, gotProto)
	}
	if w.Code != 418 || w.Body.String() != `{"error":"teapot"}` {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}

func TestProxyBackendDown502(t *testing.T) {
	h, be := newTestHandler(t, http.NotFoundHandler())
	be.Close()
	w := get(t, h, "/api/health", nil)
	if w.Code != http.StatusBadGateway || w.Body.String() != `{"error":"后端不可用"}` {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	if ct := w.Header().Get("Content-Type"); ct != "application/json; charset=utf-8" {
		t.Fatalf("content-type=%q", ct)
	}
}

func TestStaticAssetsAreImmutable(t *testing.T) {
	h, _ := newTestHandler(t, http.NotFoundHandler())
	w := get(t, h, "/assets/app-abc123.js", nil)
	if w.Code != 200 || w.Body.String() != "console.log(1)" {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	if cc := w.Header().Get("Cache-Control"); cc != "public, max-age=31536000, immutable" {
		t.Fatalf("cache-control=%q", cc)
	}
}

func TestOtherStaticFileServedWithoutLongCache(t *testing.T) {
	h, _ := newTestHandler(t, http.NotFoundHandler())
	w := get(t, h, "/favicon.ico", nil)
	if w.Code != 200 || w.Body.String() != "ico" {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	if cc := w.Header().Get("Cache-Control"); cc != "" {
		t.Fatalf("cache-control=%q", cc)
	}
}

func TestSPAFallback(t *testing.T) {
	h, _ := newTestHandler(t, http.NotFoundHandler())
	for _, p := range []string{"/", "/wallets", "/admin/users?owner=0xabc", "/assets/missing.js"} {
		w := get(t, h, p, nil)
		if w.Code != 200 || w.Body.String() != "<html>index</html>" {
			t.Fatalf("%s: status=%d body=%s", p, w.Code, w.Body.String())
		}
		if cc := w.Header().Get("Cache-Control"); cc != "no-store" {
			t.Fatalf("%s: cache-control=%q", p, cc)
		}
	}
}

func TestDirectoryPathFallsBackToIndex(t *testing.T) {
	h, _ := newTestHandler(t, http.NotFoundHandler())
	w := get(t, h, "/assets/", nil)
	if w.Code != 200 || w.Body.String() != "<html>index</html>" {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}

func TestProxyBareApiPath(t *testing.T) {
	var gotPath string
	h, _ := newTestHandler(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.RequestURI()
		w.WriteHeader(200)
		_, _ = io.WriteString(w, "ok")
	}))
	w := get(t, h, "/api?x=1", nil)
	if w.Code == http.StatusMovedPermanently {
		t.Fatalf("bare /api should not redirect, got %d", w.Code)
	}
	if gotPath != "/?x=1" {
		t.Fatalf("path=%q", gotPath)
	}
	if w.Body.String() != "ok" {
		t.Fatalf("body=%s", w.Body.String())
	}
}

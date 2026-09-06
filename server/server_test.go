package server

import (
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
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

// 客户端伪造的转发头不能落到后端：限流和审计都按这两个头记录来源 IP。
func TestProxyIgnoresClientForwardingHeaders(t *testing.T) {
	var gotXFF, gotReal string
	h, _ := newTestHandler(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotXFF, gotReal = r.Header.Get("X-Forwarded-For"), r.Header.Get("X-Real-IP")
	}))
	get(t, h, "/api/wallets", map[string]string{"X-Forwarded-For": "1.2.3.4", "X-Real-IP": "9.9.9.9"})
	if gotXFF != "203.0.113.9" {
		t.Fatalf("x-forwarded-for=%q", gotXFF)
	}
	if gotReal != "" {
		t.Fatalf("x-real-ip=%q", gotReal)
	}
}

// 路径里的 %2F 必须原样转给后端，否则会被还原成路径分隔符。
func TestProxyPreservesEscapedPath(t *testing.T) {
	var gotPath string
	h, _ := newTestHandler(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.RequestURI()
	}))
	get(t, h, "/api/x/a%2Fb", nil)
	if gotPath != "/x/a%2Fb" {
		t.Fatalf("path=%q", gotPath)
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

// 裸 /api 的 POST 不能被 301 降级成 GET，请求体也要原样送到后端。
func TestProxyBareApiPathPost(t *testing.T) {
	var gotMethod, gotPath, gotBody string
	h, _ := newTestHandler(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		gotMethod, gotPath, gotBody = r.Method, r.URL.RequestURI(), string(b)
		w.WriteHeader(200)
		_, _ = io.WriteString(w, "ok")
	}))
	req := httptest.NewRequest(http.MethodPost, "/api", strings.NewReader(`{"a":1}`))
	req.RemoteAddr = "203.0.113.9:1234"
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	if w.Code == http.StatusMovedPermanently {
		t.Fatalf("bare /api should not redirect, got %d", w.Code)
	}
	if gotMethod != http.MethodPost || gotPath != "/" || gotBody != `{"a":1}` {
		t.Fatalf("method=%q path=%q body=%q", gotMethod, gotPath, gotBody)
	}
}

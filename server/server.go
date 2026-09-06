// Package server 托管前端构建产物并把 /api 反代到 gofollow。
package server

import (
	"io"
	"io/fs"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"path"
	"strings"
)

type Config struct {
	// Backend 是 gofollow 的地址（如 http://127.0.0.1:8090）。
	Backend *url.URL
	// Assets 是前端产物根（含 index.html）。
	Assets fs.FS
}

// New 返回完整的 HTTP handler：/api/* → 反代；其余 → 静态文件或 index.html。
func New(cfg Config) http.Handler {
	mux := http.NewServeMux()
	mux.Handle("/api/", newProxy(cfg.Backend))
	mux.Handle("/", newSPA(cfg.Assets))
	return mux
}

func newProxy(backend *url.URL) http.Handler {
	p := &httputil.ReverseProxy{
		Rewrite: func(r *httputil.ProxyRequest) {
			r.SetURL(backend)
			r.SetXForwarded()
			// 去掉 /api 前缀：/api/wallets → /wallets；/api → /
			trimmed := strings.TrimPrefix(r.In.URL.Path, "/api")
			if trimmed == "" {
				trimmed = "/"
			}
			r.Out.URL.Path = trimmed
			r.Out.URL.RawPath = ""
			r.Out.Host = backend.Host
		},
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			log.Printf("proxy %s %s: %v", r.Method, r.URL.Path, err)
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			w.WriteHeader(http.StatusBadGateway)
			_, _ = io.WriteString(w, `{"error":"后端不可用"}`)
		},
	}
	return p
}

type spa struct {
	assets fs.FS
	files  http.Handler
}

func newSPA(assets fs.FS) http.Handler {
	return &spa{assets: assets, files: http.FileServer(http.FS(assets))}
}

func (s *spa) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
	if name != "" && name != "index.html" {
		if st, err := fs.Stat(s.assets, name); err == nil && !st.IsDir() {
			if strings.HasPrefix(name, "assets/") {
				// Vite 产物文件名带内容哈希，可以永久缓存。
				w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			}
			s.files.ServeHTTP(w, r)
			return
		}
	}
	// 其余路径都是前端路由：回 index.html，且不缓存，发布新版后浏览器立刻拿到新入口。
	b, err := fs.ReadFile(s.assets, "index.html")
	if err != nil {
		http.Error(w, "index.html 缺失", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(b)
}

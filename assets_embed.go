//go:build embeddist

package gofollowfront

import (
	"embed"
	"io/fs"
)

//go:embed all:web/dist
var dist embed.FS

// Assets 返回打进二进制的前端构建产物（make build 用 -tags embeddist）。
func Assets() (fs.FS, error) { return fs.Sub(dist, "web/dist") }

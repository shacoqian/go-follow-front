//go:build !embeddist

package gofollowfront

import (
	"fmt"
	"io/fs"
	"os"
)

// Assets 在未打包时从磁盘目录读（开发/测试用），目录由 WEB_DIST 指定，默认 web/dist。
func Assets() (fs.FS, error) {
	dir := os.Getenv("WEB_DIST")
	if dir == "" {
		dir = "web/dist"
	}
	if _, err := os.Stat(dir + "/index.html"); err != nil {
		return nil, fmt.Errorf("前端产物不存在（%s/index.html）：先 cd web && npm run build，或用 make build 打包", dir)
	}
	return os.DirFS(dir), nil
}

# 去除 APK 顶部地址栏（Digital Asset Links 验证）

TWA 应用默认会验证 `https://xuyuan-upward.github.io/.well-known/assetlinks.json`。
该文件必须位于**域名根目录**，而 GitHub Pages 项目站点（`/IETL-Daily/`）无法控制根目录，
所以需要再建一个**用户站点仓库**。

## 操作步骤（一次性，约 2 分钟）

1. 在 GitHub 新建仓库，名字必须是：`xuyuan-upward.github.io`（Public）
2. 把本文件夹中的 `.well-known/assetlinks.json` 原样提交到该仓库根目录：
   ```
   xuyuan-upward.github.io/
   └── .well-known/
       └── assetlinks.json
   ```
3. 等 1~2 分钟，访问确认能打开（返回 JSON）：
   https://xuyuan-upward.github.io/.well-known/assetlinks.json
4. 完成。已安装的 APK 会在下次打开时自动完成验证，地址栏消失变全屏。

## 不做的后果

APK 照样能装能用，只是运行时顶部会显示一条浏览器地址栏（Custom Tab 样式），
功能完全不受影响。可以以后再补这一步。

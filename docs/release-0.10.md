# Little Squirrel 0.10 发布说明（候选）

- 版本号：0.10（versionCode 10）
- 日期：2026-11-27
- 包：`apk/LittleSquirrel-0.10-release.apk`（release 签名，3.18 MB）
- 调试包：`apk/PixelUV-debug.apk`（同版本，debug 签名）
- 包名：`com.icanfly.pixeluv`

## 本次交付

- 图库：拖动排序（自定义顺序）、拖入文件夹、卡片右下角 ⋮ 菜单
- 画布：编辑器内修改画布/图像尺寸，画布尺寸支持 3×3 锚点
- 工具：油漆桶当前层/全部图层、取色 1×1/3×3、噪点单色/彩色（受选区限制）
- 选区：矩形/椭圆/套索/多边形/魔棒（合成取样）、布尔、扩展收缩、移动/旋转/翻转/剪切浮动链、系统剪贴板（尽力）
- 设置：网格默认、撤销步数/内存、双指/三指手势、FPS 显示，均可配置
- 性能：魔棒与 PNG 编码进入 Worker；视口渲染；100 步撤销 + 64MB 预算
- 工程：IndexedDB 即时落库 + 1.2s 自动保存；`.uvproj` 导入导出
- 导出：1×/4×，Android 写 `Documents/LittleSquirrel/`

## 已知问题

- 羽化未实现（掩码为 0/1）
- 多边形套索不支持双击闭合/回退点
- 图层无缩略图，组不支持嵌套
- 拖动只有源卡片放大，无跟手浮层
- 系统剪贴板在部分 WebView 可能被拒绝
- FPS 约 42（1024² 连续涂抹），满足 ≥30，未到 60

## 发版前检查

- [ ] 覆盖安装，确认不黑屏、首页只有「示例 01/02/03」
- [ ] 导入 2000×500 图片，比例正确
- [ ] 导出 1×/4×，`adb shell ls /sdcard/Documents/LittleSquirrel`
- [ ] 选区旋转、扩展/收缩、多边形闭合
- [ ] 改画布尺寸四个锚点
- [ ] 系统剪贴板复制/粘贴（Android 13+ 权限提示）
- [ ] force-stop 后重开，自动保存恢复
- [x] release 签名与 versionName 改为 `0.10`
- 签名文件：`C:\development\keystore\little-squirrel-release.jks`，密码信息在同目录外的 `keystore-info.txt`

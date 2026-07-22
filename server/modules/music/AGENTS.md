# server/modules/music 协作说明

本文件适用于 `server/modules/music/` 目录及其子目录。

## 职责范围

- MiniMax 音乐与歌词生成、历史记录和结果持久化
- 当前只使用 MiniMax 音乐/歌词能力，不提供 MiniMax 对话 Provider

## 修改原则

- 保持 `createMusicDeps.js` 只负责依赖裁剪，路由注册与生成、歌词、历史服务分层
- 使用 `MINIMAX_API_KEY`、`MINIMAX_MUSIC_ENDPOINT`、`MINIMAX_LYRICS_ENDPOINT`；不要读取或重新引入 `MINIMAX_CHAT_ENDPOINT`
- 外部音频 URL、生成失败和历史清理需可观测，且不得在日志中输出密钥

## 验证

- 优先运行 `npm run test:music-generation`
- 真实链路测试须由用户显式授权，并且只报告脱敏状态

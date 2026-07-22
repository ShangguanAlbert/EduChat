# python-runner 协作说明

本文件适用于 `python-runner/` 目录及其子目录。

## 职责范围

- 为派协作提供隔离的 Python 执行服务
- Docker 镜像提供受控的标准库与基础数据分析依赖

## 安全与容量约束

- 单个作业最长运行 20 秒；全局并发、队列、内存和 PID 上限由环境变量控制
- Docker 部署必须通过 Redis 协调全局容量；不要绕开 Runner 或将执行逻辑复制进 Node 服务
- `requirements.student.txt` 是受控库清单；学生运行时不得执行 `pip install`、访问宿主机或扩大容器权限

## 变更建议

- 修改 Runner 协议、响应字段或错误语义时同步检查 `server/modules/party-coding/`、前端协作面板和测试
- 修改依赖后重新构建 Runner 镜像，并在 README、`.env.example` 说明资源影响

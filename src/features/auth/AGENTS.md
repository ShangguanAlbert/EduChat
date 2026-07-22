# auth feature 协作说明

本文件适用于 `src/features/auth/` 目录及其子目录。

## 职责范围

- 登录、许可证等公共认证相关页面

## 修改原则

- 保持页面尽量轻量，把认证状态读写、slot 相关逻辑继续放在 `src/app/` 基础设施层
- 路由默认为公开访问；如调整鉴权语义，先检查 `RequireAuth`、`RequireAdminAuth` 与登录跳转逻辑
- 登录相关改动要注意与 `authStorage`、返回跳转和多身份 slot 机制保持一致
- 注册资料须与服务端完整性契约保持一致：`name`、`studentId`、`gender`、`grade`、`className`；有效新注册不应在进入学生中心或聊天后再次要求补填

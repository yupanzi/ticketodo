## [0.1.0](https://github.com/yupanzi/ticketodo/compare/v0.0.0...v0.1.0) (2026-11-04)

### Features

* **audit:** 日志、环境变量、数据库与只追加审计的基础设施 ([8932057](https://github.com/yupanzi/ticketodo/commit/8932057335414dec6d55c111dc3ecaf1307f9d2d))
* **auth:** authentik 登录、会话与登录审计 ([85c69af](https://github.com/yupanzi/ticketodo/commit/85c69afacec1f372fa31c8212fadcc1c09a9f945))
* **item:** ticket / todo、评论、标签、通知与管理后台的 tRPC API ([427e5b0](https://github.com/yupanzi/ticketodo/commit/427e5b07129ae7195d5ea66a94832745332b6d2c))
* **item:** 四象限优先级、状态机、权限矩阵与单号等领域规则 ([524000d](https://github.com/yupanzi/ticketodo/commit/524000d8a484730c31a47c41ea489c27cd28b396))
* **item:** 首页概览计数与「今天到期」筛选 ([77e4784](https://github.com/yupanzi/ticketodo/commit/77e47841d3114f2608f6d60b6714d3b1099effd4))
* **notify:** 到期提醒 CronJob ([ff7e43a](https://github.com/yupanzi/ticketodo/commit/ff7e43a990fe543b16c0921862389fa41d90eed3))
* **ui:** 列表排序、多选筛选与统一的日期组件 ([af848dd](https://github.com/yupanzi/ticketodo/commit/af848dd8dcd438beec9531cb131d5288979efc4c))
* **ui:** 四象限看板（拖拽改优先级）、列表、建单、详情与动态、通知、管理后台 ([c762ed9](https://github.com/yupanzi/ticketodo/commit/c762ed9d7725929b475096a596ad75bb8f1862ed))
* **ui:** 左侧边栏与统一的界面规范 ([c31be58](https://github.com/yupanzi/ticketodo/commit/c31be588cf0878d40b6aa19decc72ad263fb631f))
* **ui:** 描述与评论支持 GFM（任务清单、表格、删除线） ([f83ed3a](https://github.com/yupanzi/ticketodo/commit/f83ed3adbfc9423f0d3fff7cfa499b40f667133f))

### Bug Fixes

* **auth:** OAuth token 一个都不落库 ([d4c7ed2](https://github.com/yupanzi/ticketodo/commit/d4c7ed2c2c9051df330ce41db0d028464931d790))
* next dev 的请求日志整个关掉，改正带正则的配置导致的页面无限重载 ([d0dbecd](https://github.com/yupanzi/ticketodo/commit/d0dbecd31fd81f0d7b727bc185427fa2bf3ba505))

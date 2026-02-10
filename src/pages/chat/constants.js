export const AGENT_META = {
  A: { name: "智能体 A" },
  B: { name: "智能体 B" },
  C: { name: "智能体 C" },
  D: { name: "智能体 D" },
};

export const DEFAULT_SYSTEM_PROMPT = "你是用户的助手";
export const USER_INFO_STORAGE_KEY = "educhat_user_info";
export const USER_INFO_UPDATED_EVENT = "educhat:user-info-updated";

export const DEFAULT_USER_INFO = {
  name: "",
  studentId: "",
  gender: "",
  grade: "",
  className: "",
};

export const GENDER_OPTIONS = ["男", "女"];

export const GRADE_OPTIONS = [
  "7年级",
  "8年级",
  "9年级",
  "高一",
  "高二",
  "高三",
  "大学一年级",
  "大学二年级",
  "大学三年级",
  "大学四年级",
  "硕士研究生",
  "博士研究生",
];

// 对话轮次（按用户提问条数计）达到该值后，提示建议新建会话。
export const CHAT_ROUND_WARNING_THRESHOLD = 20;

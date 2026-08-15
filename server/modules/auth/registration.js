export function resolveRegistrationUsername({
  registrationRole,
  username,
  profile,
} = {}) {
  if (String(registrationRole || "student").trim().toLowerCase() === "student") {
    return String(profile?.studentId || "").trim();
  }
  return String(username || "").trim();
}

export function validateStudentRegistrationProfile(profile = {}) {
  const errors = {};
  const name = String(profile?.name || "").trim();
  const studentId = String(profile?.studentId || "").trim();
  const className = String(profile?.className || "").trim();

  if (!name) {
    errors.name = "请输入姓名";
  } else if (!/^[\u4e00-\u9fa5]+$/.test(name)) {
    errors.name = "姓名仅支持汉字";
  }

  if (!studentId) {
    errors.studentId = "请输入学号";
  } else if (!/^\d{2,20}$/.test(studentId)) {
    errors.studentId = "学号仅支持 2 至 20 位数字";
  }

  if (!className) {
    errors.className = "请输入班级";
  }

  return errors;
}

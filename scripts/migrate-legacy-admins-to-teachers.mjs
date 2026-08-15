import "dotenv/config";
import mongoose from "mongoose";

const taskMongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/educhat";
const PLATFORM_ADMIN_ACCOUNT_TAG = "platform_admin";

await mongoose.connect(taskMongoUri, { serverSelectionTimeoutMS: 8000 });

try {
  const users = mongoose.connection.collection("auth_users");
  const legacyTeachers = await users
    .find(
      {
        role: "admin",
        accountTag: { $ne: PLATFORM_ADMIN_ACCOUNT_TAG },
      },
      { projection: { username: 1 } },
    )
    .toArray();

  if (!legacyTeachers.length) {
    console.log("无需迁移：未发现历史授课教师管理员账号。");
  } else {
    const result = await users.updateMany(
      { _id: { $in: legacyTeachers.map((user) => user._id) } },
      { $set: { role: "teacher", updatedAt: new Date() } },
    );
    console.log(
      JSON.stringify(
        {
          migratedCount: result.modifiedCount,
          usernames: legacyTeachers.map((user) => user.username),
        },
        null,
        2,
      ),
    );
  }
} finally {
  await mongoose.disconnect();
}
